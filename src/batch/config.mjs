import fs from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_BATCH_PORT,
  DEFAULT_DELAY_MAX_SECONDS,
  DEFAULT_DELAY_MIN_SECONDS,
  DEFAULT_OUTPUT_DIR
} from "./constants.js";
import { detectSupportedTarget, targetKey } from "../shared/url.js";

/**
 * CLI argument and JSON config parsing for batch mode.
 */

export async function loadBatchConfig(argv, cwd = process.cwd()) {
  const args = parseArgs(argv);
  if (!args.configPath) {
    throw new Error("Usage: npm run batch -- <urls.json> [--browser default|chrome|edge|path] [--port 17891]");
  }

  const rawPath = path.resolve(cwd, args.configPath);
  const json = JSON.parse(await fs.readFile(rawPath, "utf8"));
  if (!json || !Array.isArray(json.urls)) {
    throw new Error("Batch config must be an object with a urls array.");
  }

  const delay = normalizeDelay(json.delay);
  const outputDir = path.resolve(path.dirname(rawPath), json.output_dir || DEFAULT_OUTPUT_DIR);
  const jobs = normalizeJobs(json.urls);

  if (jobs.length === 0) {
    throw new Error("Batch config does not contain any supported Zhihu answer/article URLs.");
  }

  return {
    configPath: rawPath,
    outputDir,
    delay,
    port: positiveInteger(args.port, DEFAULT_BATCH_PORT),
    browser: args.browser || "default",
    jobs
  };
}

export function parseArgs(argv) {
  const parsed = {
    configPath: "",
    browser: "default",
    port: DEFAULT_BATCH_PORT
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--browser") {
      parsed.browser = argv[index + 1] || "default";
      index += 1;
    } else if (arg === "--port") {
      parsed.port = Number(argv[index + 1]);
      index += 1;
    } else if (!parsed.configPath) {
      parsed.configPath = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function normalizeDelay(value) {
  const min = positiveInteger(value?.min_seconds, DEFAULT_DELAY_MIN_SECONDS);
  const max = positiveInteger(value?.max_seconds, DEFAULT_DELAY_MAX_SECONDS);
  return {
    minSeconds: Math.min(min, max),
    maxSeconds: Math.max(min, max)
  };
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeJobs(urls) {
  const seen = new Set();
  const jobs = [];

  for (const input of urls) {
    const target = detectSupportedTarget(String(input || ""));
    const key = targetKey(target);
    if (!target || seen.has(key)) {
      continue;
    }
    seen.add(key);
    jobs.push({
      id: String(jobs.length + 1),
      index: jobs.length + 1,
      url: target.url,
      type: target.type,
      targetId: target.id
    });
  }

  return jobs;
}
