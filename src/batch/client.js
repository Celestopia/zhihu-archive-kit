import { buildCurrentPageZip } from "../save-core/build-zip.js";
import { hasRiskOrChallengePage } from "../save-core/dom.js";
import { detectTarget, findContentRoot } from "../save-core/target.js";
import { detectSupportedTarget, targetKey } from "../shared/url.js";
import { BATCH_STATUS_ID } from "../userscript/constants.js";
import { DEFAULT_BATCH_PORT } from "./constants.js";
import { delay } from "./time.js";

/**
 * Browser-side batch client bundled into the Tampermonkey script.
 *
 * It stays dormant when the local batch server is not running. When a server is
 * available, it follows the server queue, saves the current Zhihu page, and
 * uploads the generated ZIP Blob back to localhost.
 */

const PORT_STORAGE_KEY = "zhmd_batch_port";
const PARAM_PORT = "zhmd_batch_port";
const CONTENT_WAIT_TIMEOUT_MS = 30_000;
let running = false;

export function startBatchClient() {
  rememberPortFromUrl();
  window.setTimeout(() => {
    void runBatchLoop();
  }, 1000);
}

async function runBatchLoop() {
  if (running) {
    return;
  }

  running = true;
  try {
    const state = await getCurrentJob();
    if (!state?.active || state.paused || !state.job) {
      if (state?.paused) {
        renderBatchStatus({
          tone: "warn",
          title: "批量任务已暂停",
          detail: state.pause_reason || "等待人工处理"
        });
      } else {
        renderBatchStatus(null);
      }
      return;
    }

    const context = createStatusContext(state);
    renderBatchStatus({
      ...context,
      stage: "准备处理",
      detail: formatJobLabel(state.job)
    });

    if (!currentPageMatchesJob(state.job)) {
      renderBatchStatus({
        ...context,
        stage: "打开页面",
        detail: formatJobLabel(state.job)
      });
      location.assign(withBatchPort(state.job.url));
      return;
    }

    if (hasRiskOrChallengePage()) {
      await reportFailure(state.job.id, "Detected Zhihu risk-control or challenge page.");
      renderBatchStatus({
        ...context,
        tone: "warn",
        stage: "已暂停",
        detail: "检测到风控页面"
      });
      return;
    }

    let done;
    try {
      const target = detectTarget(location.href);
      renderBatchStatus({
        ...context,
        stage: "等待正文",
        detail: formatJobLabel(state.job)
      });
      await waitForContentRoot(target);
      const result = await buildCurrentPageZip({
        onProgress: (progress) => {
          if (progress.stage === "media") {
            renderBatchStatus({
              ...context,
              stage: "下载媒体",
              detail: `${progress.completed}/${progress.total}`,
              subProgress: progress.total > 0 ? progress.completed / progress.total : 1
            });
          } else if (progress.stage === "zip") {
            renderBatchStatus({
              ...context,
              stage: "生成 ZIP",
              detail: `${progress.percent || 0}%`,
              subProgress: Math.max(0, Math.min(1, Number(progress.percent || 0) / 100))
            });
          }
        }
      });
      renderBatchStatus({
        ...context,
        stage: "上传 ZIP",
        detail: result.fileName
      });
      done = await uploadZip(state.job.id, result.blob, result.fileName);
    } catch (error) {
      await reportFailure(state.job.id, error.message);
      renderBatchStatus({
        ...context,
        tone: "error",
        stage: "任务失败",
        detail: error.message
      });
      return;
    }

    if (done.saved === false) {
      renderBatchStatus({
        ...context,
        completedCount: done.completed_count,
        failedCount: done.failed_count,
        pendingCount: done.pending_count,
        tone: "warn",
        stage: "保存失败",
        detail: done.error || "本地输出失败"
      });
    }
    if (done.paused) {
      renderBatchStatus({
        ...context,
        tone: "warn",
        stage: "已暂停",
        detail: "本地队列暂停"
      });
      return;
    }
    if (done.done) {
      renderBatchStatus({
        ...context,
        completedCount: done.completed_count,
        failedCount: done.failed_count,
        pendingCount: done.pending_count,
        tone: "done",
        stage: "全部完成",
        detail: `${done.completed_count}/${done.total_count}`
      });
      return;
    }

    const waitSeconds = Number(done.delay_seconds || state.delay_seconds || 0);
    await waitWithCountdown({
      ...context,
      completedCount: done.completed_count,
      failedCount: done.failed_count,
      pendingCount: done.pending_count
    }, waitSeconds);
    running = false;
    await runBatchLoop();
  } catch (error) {
    if (error) {
      console.warn("[Zhihu Markdown Saver] batch client stopped:", error);
    }
    renderBatchStatus(null);
  } finally {
    running = false;
  }
}

async function getCurrentJob() {
  return requestJson("/api/job/current", { method: "GET", silent: true });
}

async function uploadZip(jobId, blob, fileName) {
  const response = await fetch(`${baseUrl()}/api/job/${encodeURIComponent(jobId)}/zip`, {
    method: "POST",
    headers: {
      "Content-Type": "application/zip",
      "X-Zhmd-Filename": fileName
    },
    body: blob
  });
  if (!response.ok) {
    throw new Error(`ZIP upload failed: HTTP ${response.status}`);
  }
  return response.json();
}

async function reportFailure(jobId, reason) {
  return requestJson(`/api/job/${encodeURIComponent(jobId)}/fail`, {
    method: "POST",
    body: { reason, url: location.href }
  });
}

async function requestJson(path, options = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), options.silent ? 1000 : 10_000);

  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } catch (error) {
    if (options.silent) {
      return null;
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function waitForContentRoot(target) {
  const start = Date.now();
  while (Date.now() - start < CONTENT_WAIT_TIMEOUT_MS) {
    if (target && findContentRoot(target)) {
      return;
    }
    if (hasRiskOrChallengePage()) {
      throw new Error("Detected Zhihu risk-control or challenge page.");
    }
    await delay(500);
  }
  throw new Error("Timed out waiting for Zhihu content root.");
}

function currentPageMatchesJob(job) {
  const current = detectSupportedTarget(location.href, location.href);
  const expected = detectSupportedTarget(job.url, location.href);
  return targetKey(current) === targetKey(expected);
}

function baseUrl() {
  return `http://127.0.0.1:${getBatchPort()}`;
}

function getBatchPort() {
  const stored = window.localStorage.getItem(PORT_STORAGE_KEY);
  const parsed = Number(stored);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_BATCH_PORT;
}

function rememberPortFromUrl() {
  const port = new URL(location.href).searchParams.get(PARAM_PORT);
  const parsed = Number(port);
  if (Number.isInteger(parsed) && parsed > 0) {
    window.localStorage.setItem(PORT_STORAGE_KEY, String(parsed));
  }
}

function withBatchPort(url) {
  const target = new URL(url);
  const port = getBatchPort();
  if (port !== DEFAULT_BATCH_PORT) {
    target.searchParams.set(PARAM_PORT, String(port));
  }
  return target.href;
}

async function waitWithCountdown(context, waitSeconds) {
  for (let remaining = waitSeconds; remaining > 0; remaining -= 1) {
    renderBatchStatus({
      ...context,
      stage: "等待下一项",
      detail: `${remaining} 秒后继续`,
      subProgress: waitSeconds > 0 ? (waitSeconds - remaining) / waitSeconds : 1
    });
    await delay(1000);
  }
}

function createStatusContext(state) {
  return {
    title: "知乎 Markdown 批量保存",
    currentIndex: state.completed_count + state.failed_count + 1,
    totalCount: state.total_count,
    completedCount: state.completed_count,
    failedCount: state.failed_count,
    pendingCount: state.pending_count,
    job: state.job
  };
}

function formatJobLabel(job) {
  const label = job.type === "article" ? "文章" : "回答";
  return `${label} ${job.targetId}`;
}

function renderBatchStatus(state) {
  let el = document.getElementById(BATCH_STATUS_ID);
  if (!state) {
    el?.remove();
    return;
  }

  if (!el) {
    el = document.createElement("div");
    el.id = BATCH_STATUS_ID;
    el.style.position = "fixed";
    el.style.right = "72px";
    el.style.bottom = "58px";
    el.style.zIndex = "2147483647";
    el.style.width = "286px";
    el.style.padding = "12px 13px";
    el.style.borderRadius = "6px";
    el.style.background = "rgba(23, 25, 31, .94)";
    el.style.color = "#fff";
    el.style.fontSize = "12px";
    el.style.lineHeight = "1.45";
    el.style.boxShadow = "0 8px 24px rgba(0, 0, 0, .22)";
    el.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    document.body.append(el);
  }

  const total = Math.max(1, Number(state.totalCount || 1));
  const completed = Math.max(0, Number(state.completedCount || 0));
  const failed = Math.max(0, Number(state.failedCount || 0));
  const current = Math.max(1, Math.min(total, Number(state.currentIndex || completed + failed + 1)));
  const overallPercent = Math.max(0, Math.min(100, Math.round(((completed + failed) / total) * 100)));
  const subPercent = state.subProgress === undefined
    ? null
    : Math.max(0, Math.min(100, Math.round(Number(state.subProgress) * 100)));
  const toneColor = state.tone === "error"
    ? "#e5484d"
    : state.tone === "warn"
      ? "#f5a524"
      : state.tone === "done"
        ? "#2fb344"
        : "#1677ff";

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
      <div style="font-weight:700;font-size:13px;">${escapeHtml(state.title || "批量任务")}</div>
      <div style="color:#c9d1d9;font-variant-numeric:tabular-nums;">${current}/${total}</div>
    </div>
    <div style="height:5px;background:rgba(255,255,255,.16);border-radius:999px;overflow:hidden;margin-bottom:8px;">
      <div style="width:${overallPercent}%;height:100%;background:${toneColor};"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px;color:#d6deea;">
      <div>完成 ${completed}</div>
      <div>失败 ${failed}</div>
      <div>待处理 ${Math.max(0, Number(state.pendingCount || 0))}</div>
    </div>
    <div style="font-size:13px;font-weight:650;margin-bottom:3px;">${escapeHtml(state.stage || "")}</div>
    <div style="color:#d6deea;word-break:break-all;">${escapeHtml(state.detail || "")}</div>
    ${subPercent === null ? "" : `
      <div style="height:4px;background:rgba(255,255,255,.13);border-radius:999px;overflow:hidden;margin-top:9px;">
        <div style="width:${subPercent}%;height:100%;background:#8ec5ff;"></div>
      </div>
    `}
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
