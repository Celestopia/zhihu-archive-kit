import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { DEFAULT_MAX_CONSECUTIVE_FAILURES, JOB_STATUS } from "./constants.js";
import { formatIsoNow, randomDelaySeconds } from "./time.js";

/**
 * Localhost batch API server.
 *
 * The server only listens on 127.0.0.1. The browser userscript pulls one job at
 * a time and uploads the generated ZIP Blob back here for local disk writes.
 */

export async function createBatchServer(config) {
  const state = createInitialState(config);
  await fs.mkdir(config.outputDir, { recursive: true });
  await writeState(config, state);
  let closeRequested = false;
  let resolveCompleted;
  const completed = new Promise((resolve) => {
    resolveCompleted = resolve;
  });

  const server = http.createServer(async (req, res) => {
    try {
      await routeRequest(req, res, config, state, {
        requestClose(reason) {
          if (closeRequested) {
            return;
          }
          closeRequested = true;
          setTimeout(() => {
            server.close(() => resolveCompleted(reason));
          }, 100);
        }
      });
    } catch (error) {
      console.error("[batch] request failed:", error);
      sendJson(res, 500, { ok: false, error: error.message });
    }
  });

  return {
    state,
    completed,
    listen() {
      return new Promise((resolve) => {
        server.listen(config.port, "127.0.0.1", () => resolve(server));
      });
    },
    close() {
      if (closeRequested) {
        return;
      }
      closeRequested = true;
      server.close(() => resolveCompleted("closed"));
    }
  };
}

function createInitialState(config) {
  return {
    created_at: formatIsoNow(),
    paused: false,
    pause_reason: "",
    consecutive_failures: 0,
    output_dir: config.outputDir,
    delay: config.delay,
    jobs: config.jobs.map((job) => ({
      ...job,
      status: JOB_STATUS.pending,
      started_at: "",
      finished_at: "",
      output_file: "",
      error: ""
    }))
  };
}

async function routeRequest(req, res, config, state, lifecycle) {
  if (handleCors(req, res)) {
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${config.port}`);
  if (req.method === "GET" && url.pathname === "/api/job/current") {
    const response = currentJobResponse(state);
    await writeState(config, state);
    return sendJson(res, 200, response);
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    return sendJson(res, 200, publicState(state));
  }

  const zipMatch = url.pathname.match(/^\/api\/job\/([^/]+)\/zip$/);
  if (req.method === "POST" && zipMatch) {
    return handleZipUpload(req, res, config, state, lifecycle, decodeURIComponent(zipMatch[1]));
  }

  const failMatch = url.pathname.match(/^\/api\/job\/([^/]+)\/fail$/);
  if (req.method === "POST" && failMatch) {
    return handleFailure(req, res, config, state, decodeURIComponent(failMatch[1]));
  }

  sendJson(res, 404, { ok: false, error: "Not found." });
}

function currentJobResponse(state) {
  if (state.paused) {
    return { active: true, paused: true, ...countJobs(state), pause_reason: state.pause_reason };
  }

  const existing = state.jobs.find((job) => job.status === JOB_STATUS.running);
  const job = existing || state.jobs.find((item) => item.status === JOB_STATUS.pending);
  if (!job) {
    return { active: false, done: true, paused: false, ...countJobs(state) };
  }

  if (job.status === JOB_STATUS.pending) {
    job.status = JOB_STATUS.running;
    job.started_at = formatIsoNow();
  }

  return {
    active: true,
    paused: false,
    done: false,
    ...countJobs(state),
    job: publicJob(job)
  };
}

async function handleZipUpload(req, res, config, state, lifecycle, jobId) {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) {
    return sendJson(res, 404, { ok: false, error: "Unknown job." });
  }

  const body = await readRequestBody(req);
  const filename = `${String(job.index).padStart(3, "0")}-${job.type}-${job.targetId}.zip`;
  const outputPath = path.join(config.outputDir, filename);
  await fs.writeFile(outputPath, body);

  job.status = JOB_STATUS.done;
  job.finished_at = formatIsoNow();
  job.output_file = outputPath;
  job.error = "";
  state.consecutive_failures = 0;

  await appendLog(config, { event: "done", job: publicJob(job), output_file: outputPath });
  await writeState(config, state);

  const counts = countJobs(state);
  const done = !state.jobs.some((item) => item.status === JOB_STATUS.pending || item.status === JOB_STATUS.running);
  const delaySeconds = done ? 0 : randomDelaySeconds(config.delay.minSeconds, config.delay.maxSeconds);
  sendJson(res, 200, { ok: true, done, paused: state.paused, delay_seconds: delaySeconds, ...counts });
  if (done) {
    lifecycle.requestClose("completed");
  }
}

async function handleFailure(req, res, config, state, jobId) {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) {
    return sendJson(res, 404, { ok: false, error: "Unknown job." });
  }

  const body = await readJsonBody(req);
  const reason = String(body.reason || "Unknown failure.");
  job.status = JOB_STATUS.failed;
  job.finished_at = formatIsoNow();
  job.error = reason;
  state.consecutive_failures += 1;

  if (state.consecutive_failures >= DEFAULT_MAX_CONSECUTIVE_FAILURES || isRiskReason(reason)) {
    state.paused = true;
    state.pause_reason = reason;
  }

  await appendLog(config, { event: "failed", job: publicJob(job), reason, url: body.url || "" });
  await writeState(config, state);
  sendJson(res, 200, { ok: true, paused: state.paused, pause_reason: state.pause_reason, ...countJobs(state) });
}

function handleCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Zhmd-Filename");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

function publicState(state) {
  return {
    ...countJobs(state),
    paused: state.paused,
    pause_reason: state.pause_reason,
    consecutive_failures: state.consecutive_failures,
    jobs: state.jobs.map(publicJob)
  };
}

function publicJob(job) {
  return {
    id: job.id,
    index: job.index,
    url: job.url,
    type: job.type,
    targetId: job.targetId,
    status: job.status,
    output_file: job.output_file,
    error: job.error
  };
}

function countJobs(state) {
  return {
    total_count: state.jobs.length,
    completed_count: state.jobs.filter((job) => job.status === JOB_STATUS.done).length,
    failed_count: state.jobs.filter((job) => job.status === JOB_STATUS.failed).length,
    pending_count: state.jobs.filter((job) => job.status === JOB_STATUS.pending).length
  };
}

function isRiskReason(reason) {
  return /risk|challenge|403|40362|验证码|安全验证|风控|请求存在异常|暂时限制/i.test(reason);
}

function sendJson(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  const body = await readRequestBody(req);
  if (body.length === 0) {
    return {};
  }
  return JSON.parse(body.toString("utf8"));
}

async function writeState(config, state) {
  await fs.writeFile(
    path.join(config.outputDir, "batch-state.json"),
    JSON.stringify(publicState(state), null, 2),
    "utf8"
  );
}

async function appendLog(config, value) {
  const record = { time: formatIsoNow(), ...value };
  await fs.appendFile(
    path.join(config.outputDir, "batch-log.jsonl"),
    `${JSON.stringify(record)}\n`,
    "utf8"
  );
}
