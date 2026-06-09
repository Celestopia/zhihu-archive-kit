// ==UserScript==
// @name         Zhihu Markdown Saver
// @namespace    https://github.com/local/zhihu-markdown-downloader
// @version      0.1.0
// @description  Save Zhihu answers and Zhuanlan articles as Markdown ZIP files.
// @author       local
// @match        https://www.zhihu.com/question/*/answer/*
// @match        https://www.zhihu.com/answer/*
// @match        https://zhuanlan.zhihu.com/p/*
// @icon         https://static.zhihu.com/heifetz/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
// @require      https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js
// @grant        none
// ==/UserScript==
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/batch/client.js"
/*!*****************************!*\
  !*** ./src/batch/client.js ***!
  \*****************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   startBatchClient: () => (/* binding */ startBatchClient)
/* harmony export */ });
/* harmony import */ var _save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../save-core/build-zip.js */ "./src/save-core/build-zip.js");
/* harmony import */ var _save_core_dom_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../save-core/dom.js */ "./src/save-core/dom.js");
/* harmony import */ var _save_core_target_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../save-core/target.js */ "./src/save-core/target.js");
/* harmony import */ var _shared_url_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../shared/url.js */ "./src/shared/url.js");
/* harmony import */ var _userscript_constants_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../userscript/constants.js */ "./src/userscript/constants.js");
/* harmony import */ var _constants_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./constants.js */ "./src/batch/constants.js");
/* harmony import */ var _time_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./time.js */ "./src/batch/time.js");








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

function startBatchClient() {
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

    if ((0,_save_core_dom_js__WEBPACK_IMPORTED_MODULE_1__.hasRiskOrChallengePage)()) {
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
      const target = (0,_save_core_target_js__WEBPACK_IMPORTED_MODULE_2__.detectTarget)(location.href);
      renderBatchStatus({
        ...context,
        stage: "等待正文",
        detail: formatJobLabel(state.job)
      });
      await waitForContentRoot(target);
      const result = await (0,_save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_0__.buildCurrentPageZip)({
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
    if (target && (0,_save_core_target_js__WEBPACK_IMPORTED_MODULE_2__.findContentRoot)(target)) {
      return;
    }
    if ((0,_save_core_dom_js__WEBPACK_IMPORTED_MODULE_1__.hasRiskOrChallengePage)()) {
      throw new Error("Detected Zhihu risk-control or challenge page.");
    }
    await (0,_time_js__WEBPACK_IMPORTED_MODULE_6__.delay)(500);
  }
  throw new Error("Timed out waiting for Zhihu content root.");
}

function currentPageMatchesJob(job) {
  const current = (0,_shared_url_js__WEBPACK_IMPORTED_MODULE_3__.detectSupportedTarget)(location.href, location.href);
  const expected = (0,_shared_url_js__WEBPACK_IMPORTED_MODULE_3__.detectSupportedTarget)(job.url, location.href);
  return (0,_shared_url_js__WEBPACK_IMPORTED_MODULE_3__.targetKey)(current) === (0,_shared_url_js__WEBPACK_IMPORTED_MODULE_3__.targetKey)(expected);
}

function baseUrl() {
  return `http://127.0.0.1:${getBatchPort()}`;
}

function getBatchPort() {
  const stored = window.localStorage.getItem(PORT_STORAGE_KEY);
  const parsed = Number(stored);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : _constants_js__WEBPACK_IMPORTED_MODULE_5__.DEFAULT_BATCH_PORT;
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
  if (port !== _constants_js__WEBPACK_IMPORTED_MODULE_5__.DEFAULT_BATCH_PORT) {
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
    await (0,_time_js__WEBPACK_IMPORTED_MODULE_6__.delay)(1000);
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
  let el = document.getElementById(_userscript_constants_js__WEBPACK_IMPORTED_MODULE_4__.BATCH_STATUS_ID);
  if (!state) {
    el?.remove();
    return;
  }

  if (!el) {
    el = document.createElement("div");
    el.id = _userscript_constants_js__WEBPACK_IMPORTED_MODULE_4__.BATCH_STATUS_ID;
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


/***/ },

/***/ "./src/batch/constants.js"
/*!********************************!*\
  !*** ./src/batch/constants.js ***!
  \********************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   BATCH_HOST: () => (/* binding */ BATCH_HOST),
/* harmony export */   DEFAULT_BATCH_PORT: () => (/* binding */ DEFAULT_BATCH_PORT),
/* harmony export */   DEFAULT_DELAY_MAX_SECONDS: () => (/* binding */ DEFAULT_DELAY_MAX_SECONDS),
/* harmony export */   DEFAULT_DELAY_MIN_SECONDS: () => (/* binding */ DEFAULT_DELAY_MIN_SECONDS),
/* harmony export */   DEFAULT_MAX_CONSECUTIVE_FAILURES: () => (/* binding */ DEFAULT_MAX_CONSECUTIVE_FAILURES),
/* harmony export */   DEFAULT_OUTPUT_DIR: () => (/* binding */ DEFAULT_OUTPUT_DIR),
/* harmony export */   JOB_STATUS: () => (/* binding */ JOB_STATUS)
/* harmony export */ });
/**
 * Batch-mode constants shared by the Node server and browser batch client.
 */

const DEFAULT_BATCH_PORT = 17891;
const DEFAULT_OUTPUT_DIR = "output";
const DEFAULT_DELAY_MIN_SECONDS = 15;
const DEFAULT_DELAY_MAX_SECONDS = 45;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;

const BATCH_HOST = "127.0.0.1";

const JOB_STATUS = {
  pending: "pending",
  running: "running",
  done: "done",
  failed: "failed",
  skipped: "skipped"
};


/***/ },

/***/ "./src/batch/time.js"
/*!***************************!*\
  !*** ./src/batch/time.js ***!
  \***************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   delay: () => (/* binding */ delay),
/* harmony export */   formatIsoNow: () => (/* binding */ formatIsoNow),
/* harmony export */   randomDelaySeconds: () => (/* binding */ randomDelaySeconds)
/* harmony export */ });
/**
 * Time helpers used by batch scheduling and the browser batch client.
 */

function randomDelaySeconds(minSeconds, maxSeconds) {
  const min = Math.max(0, Number(minSeconds) || 0);
  const max = Math.max(min, Number(maxSeconds) || min);
  return Math.floor(min + Math.random() * (max - min + 1));
}

function formatIsoNow() {
  return new Date().toISOString();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}



/***/ },

/***/ "./src/save-core/build-zip.js"
/*!************************************!*\
  !*** ./src/save-core/build-zip.js ***!
  \************************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   buildCurrentPageZip: () => (/* binding */ buildCurrentPageZip),
/* harmony export */   extractCurrentPage: () => (/* binding */ extractCurrentPage),
/* harmony export */   getZipCtor: () => (/* binding */ getZipCtor)
/* harmony export */ });
/* harmony import */ var _dom_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./dom.js */ "./src/save-core/dom.js");
/* harmony import */ var _markdown_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./markdown.js */ "./src/save-core/markdown.js");
/* harmony import */ var _media_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./media.js */ "./src/save-core/media.js");
/* harmony import */ var _target_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./target.js */ "./src/save-core/target.js");





/**
 * Browser-side save core.
 *
 * This module only builds the ZIP Blob for the current Zhihu page. It does not
 * know whether the caller will download the Blob with FileSaver or upload it to
 * a local batch server.
 */

async function buildCurrentPageZip(options = {}) {
  const timeExported = new Date().toISOString();
  options.onProgress?.({ stage: "detect" });
  const target = (0,_target_js__WEBPACK_IMPORTED_MODULE_3__.detectTarget)(options.href || location.href);
  if (!target) {
    throw new Error("Only Zhihu answer/article detail pages are supported.");
  }

  const ZipCtor = options.ZipCtor || getZipCtor();
  if (!ZipCtor) {
    throw new Error("JSZip is unavailable.");
  }

  options.onProgress?.({ stage: "expand" });
  await (0,_dom_js__WEBPACK_IMPORTED_MODULE_0__.expandCollapsedContent)();
  options.onProgress?.({ stage: "extract" });
  const result = extractCurrentPage(target);
  const folderName = `${target.type}-${target.id}`;
  const zip = new ZipCtor();
  const folder = zip.folder(folderName);
  const assetsFolder = folder.folder("assets");
  options.onProgress?.({ stage: "media", completed: 0, total: result.media.length });
  const replacements = await (0,_media_js__WEBPACK_IMPORTED_MODULE_2__.downloadMediaToZip)(result.media, assetsFolder, {
    onProgress: (progress) => options.onProgress?.({ stage: "media", ...progress })
  });
  options.onProgress?.({ stage: "markdown" });
  const metadata = {
    ...result.metadata,
    time_exported: timeExported
  };
  const markdown = (0,_markdown_js__WEBPACK_IMPORTED_MODULE_1__.applyMediaReplacements)((0,_markdown_js__WEBPACK_IMPORTED_MODULE_1__.renderDocument)(metadata, result.markdown), replacements);

  folder.file("index.md", markdown);
  options.onProgress?.({ stage: "zip", percent: 0 });
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "STORE",
    streamFiles: true
  }, (metadata) => {
    options.onProgress?.({
      stage: "zip",
      percent: Math.floor(metadata.percent || 0),
      currentFile: metadata.currentFile || ""
    });
  });

  return {
    blob,
    fileName: `${folderName}.zip`,
    folderName,
    target,
    metadata
  };
}

function extractCurrentPage(target) {
  const root = (0,_target_js__WEBPACK_IMPORTED_MODULE_3__.findContentRoot)(target);
  if (!root) {
    throw new Error(`Cannot find ${target.type} content root.`);
  }

  const itemRoot = (0,_target_js__WEBPACK_IMPORTED_MODULE_3__.findItemRoot)(root, target.type);
  const metadata = (0,_target_js__WEBPACK_IMPORTED_MODULE_3__.extractMetadata)({ target, itemRoot });
  return (0,_markdown_js__WEBPACK_IMPORTED_MODULE_1__.extractPage)({ root, itemRoot, metadata });
}

function getZipCtor() {
  return window.JSZip || (typeof JSZip !== "undefined" ? JSZip : null);
}


/***/ },

/***/ "./src/save-core/constants.js"
/*!************************************!*\
  !*** ./src/save-core/constants.js ***!
  \************************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   MEDIA_DOWNLOAD_CONCURRENCY: () => (/* binding */ MEDIA_DOWNLOAD_CONCURRENCY),
/* harmony export */   MEDIA_DOWNLOAD_TIMEOUT_MS: () => (/* binding */ MEDIA_DOWNLOAD_TIMEOUT_MS),
/* harmony export */   MEDIA_PLACEHOLDER_PREFIX: () => (/* binding */ MEDIA_PLACEHOLDER_PREFIX)
/* harmony export */ });
/**
 * Constants used by the browser-side save core.
 */

const MEDIA_PLACEHOLDER_PREFIX = "__ZHMD_MEDIA_";
const MEDIA_DOWNLOAD_TIMEOUT_MS = 15_000;
const MEDIA_DOWNLOAD_CONCURRENCY = 4;


/***/ },

/***/ "./src/save-core/dom.js"
/*!******************************!*\
  !*** ./src/save-core/dom.js ***!
  \******************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   expandCollapsedContent: () => (/* binding */ expandCollapsedContent),
/* harmony export */   hasRiskOrChallengePage: () => (/* binding */ hasRiskOrChallengePage)
/* harmony export */ });
/**
 * Browser DOM helpers used before extracting Zhihu rich text.
 */

async function expandCollapsedContent() {
  const labels = ["阅读全文", "展开阅读全文", "继续阅读", "显示全部", "展开全部"];
  const candidates = Array.from(document.querySelectorAll("button, a"));

  for (const el of candidates) {
    const text = (el.textContent || "").replace(/\s+/g, "");
    if (labels.some((label) => text.includes(label))) {
      el.click();
    }
  }

  await delay(600);
}

function hasRiskOrChallengePage() {
  const text = `${document.title || ""}\n${document.body?.innerText || ""}`;
  return /请求存在异常|暂时限制|验证码|安全验证|账号安全|40362/.test(text);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}


/***/ },

/***/ "./src/save-core/markdown.js"
/*!***********************************!*\
  !*** ./src/save-core/markdown.js ***!
  \***********************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   applyMediaReplacements: () => (/* binding */ applyMediaReplacements),
/* harmony export */   compactTableCell: () => (/* binding */ compactTableCell),
/* harmony export */   extractPage: () => (/* binding */ extractPage),
/* harmony export */   parseBlocks: () => (/* binding */ parseBlocks),
/* harmony export */   renderBlock: () => (/* binding */ renderBlock),
/* harmony export */   renderCodeBlock: () => (/* binding */ renderCodeBlock),
/* harmony export */   renderDocument: () => (/* binding */ renderDocument),
/* harmony export */   renderFigure: () => (/* binding */ renderFigure),
/* harmony export */   renderImage: () => (/* binding */ renderImage),
/* harmony export */   renderInlineCode: () => (/* binding */ renderInlineCode),
/* harmony export */   renderInlineLink: () => (/* binding */ renderInlineLink),
/* harmony export */   renderList: () => (/* binding */ renderList),
/* harmony export */   renderListItem: () => (/* binding */ renderListItem),
/* harmony export */   renderMath: () => (/* binding */ renderMath),
/* harmony export */   renderRich: () => (/* binding */ renderRich),
/* harmony export */   renderTable: () => (/* binding */ renderTable),
/* harmony export */   renderVideo: () => (/* binding */ renderVideo),
/* harmony export */   yamlNumber: () => (/* binding */ yamlNumber),
/* harmony export */   yamlString: () => (/* binding */ yamlString)
/* harmony export */ });
/* harmony import */ var _media_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./media.js */ "./src/save-core/media.js");
/* harmony import */ var _utils_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./utils.js */ "./src/save-core/utils.js");



/**
 * DOM-to-Markdown renderer for Zhihu rich text.
 *
 * The renderer parses the browser DOM that Zhihu already rendered, then
 * serializes supported rich-text structures to Markdown. Comments are never
 * parsed here.
 */

function extractPage({ root, metadata }) {
  const media = [];
  const blocks = parseBlocks(root, media);

  return {
    metadata,
    markdown: blocks.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim(),
    media
  };
}

function parseBlocks(container, media) {
  const blocks = [];

  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const rendered = renderBlock(node, media);
    if (Array.isArray(rendered)) {
      blocks.push(...rendered.filter(Boolean));
    } else if (rendered) {
      blocks.push(rendered);
    }
  }

  return blocks;
}

function renderBlock(node, media) {
  const tag = node.tagName.toLowerCase();

  // Heading levels map directly to Markdown heading depth.
  if (tag === "h1") {
    return `# ${renderRich(node, media).trim()}`;
  }
  if (tag === "h2") {
    return `## ${renderRich(node, media).trim()}`;
  }
  if (tag === "h3") {
    return `### ${renderRich(node, media).trim()}`;
  }
  if (tag === "h4") {
    return `#### ${renderRich(node, media).trim()}`;
  }
  if (tag === "h5") {
    return `##### ${renderRich(node, media).trim()}`;
  }
  if (tag === "h6") {
    return `###### ${renderRich(node, media).trim()}`;
  }

  if (tag === "p") {
    return renderRich(node, media).trim();
  }
  if (tag === "blockquote") {
    const quoteBlocks = parseBlocks(node, media);
    const text = quoteBlocks.length > 0 ? quoteBlocks.join("\n\n") : renderRich(node, media).trim();
    return text.split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
  }
  if (tag === "figure") {
    return renderFigure(node, media);
  }
  if (tag === "ul" || tag === "ol") {
    return renderList(node, tag === "ol", media);
  }
  if (tag === "hr") {
    return "---";
  }
  if (tag === "table") {
    return renderTable(node, media);
  }
  if (tag === "pre") {
    return renderCodeBlock(node);
  }

  if (tag === "div") {
    if (node.classList.contains("highlight") || node.querySelector(":scope > pre")) {
      return renderCodeBlock(node);
    }

    if (node.classList.contains("RichText-LinkCardContainer")) {
      const link = node.querySelector("a[href]");
      if (link) {
        const text = (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.cleanText)(link.getAttribute("data-text") || link.textContent || link.href);
        return `[${(0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.escapeLinkText)(text)}](${(0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.normalizeLink)(link.href)})`;
      }
    }

    const video = node.querySelector("video[src], video source[src]");
    if (video) {
      return renderVideo(video, media);
    }

    const nested = parseBlocks(node, media);
    if (nested.length > 0) {
      return nested;
    }
  }

  const video = node.querySelector?.("video[src], video source[src]");
  if (video) {
    return renderVideo(video, media);
  }

  return renderRich(node, media).trim();
}

function renderRich(node, media) {
  let output = "";

  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      output += child.textContent || "";
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const el = child;
    const tag = el.tagName.toLowerCase();

    if (tag === "b" || tag === "strong") {
      output += `**${renderRich(el, media)}**`;
    } else if (tag === "i" || tag === "em") {
      output += `*${renderRich(el, media)}*`;
    } else if (tag === "br") {
      output += "\n";
    } else if (tag === "code") {
      output += renderInlineCode(el.textContent || "");
    } else if (tag === "a") {
      output += renderInlineLink(el);
    } else if (tag === "span" && el.classList.contains("ztext-math")) {
      output += renderMath(el);
    } else if (tag === "img") {
      output += renderImage(el, media);
    } else {
      output += renderRich(el, media);
    }
  }

  return output;
}

function renderInlineCode(text) {
  const value = text.replace(/\s+/g, " ").trim();
  if (value.includes("`")) {
    return `\`\` ${value} \`\``;
  }
  return `\`${value}\``;
}

function renderInlineLink(el) {
  const href = (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.normalizeLink)(el.href || el.getAttribute("href") || "");
  const text = (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.cleanText)(el.textContent || href);
  if (!href) {
    return text;
  }
  return `[${(0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.escapeLinkText)(text)}](${href})`;
}

function renderMath(el) {
  const tex = el.getAttribute("data-tex") || el.textContent || "";
  return `$${tex}$`;
}

function renderFigure(figure, media) {
  const img = figure.querySelector("img");
  return img ? renderImage(img, media) : "";
}

function renderImage(img, media) {
  let src = (0,_media_js__WEBPACK_IMPORTED_MODULE_0__.selectImageUrl)(img);
  if (!src) {
    return "";
  }

  const isGif = img.classList.contains("ztext-gif") || /gif/i.test(img.getAttribute("data-thumbnail") || "");
  if (isGif) {
    src = (0,_media_js__WEBPACK_IMPORTED_MODULE_0__.guessGifUrl)(src);
  }

  const placeholder = (0,_media_js__WEBPACK_IMPORTED_MODULE_0__.registerMedia)(media, src, isGif ? "gif" : "image");
  const alt = (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.escapeLinkText)((0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.cleanText)(img.getAttribute("alt") || ""));
  return `![${alt}](${placeholder})`;
}

function renderVideo(video, media) {
  const src = (0,_media_js__WEBPACK_IMPORTED_MODULE_0__.normalizeMediaUrl)(
    video.getAttribute("src")
    || video.querySelector?.("source[src]")?.getAttribute("src")
    || ""
  );
  if (!src) {
    return "";
  }

  const placeholder = (0,_media_js__WEBPACK_IMPORTED_MODULE_0__.registerMedia)(media, src, "video");
  return `<video src="${placeholder}" controls></video>`;
}

function renderCodeBlock(node) {
  const code = node.querySelector("pre > code") || node.querySelector("code");
  const pre = node.querySelector("pre") || node;
  const className = code?.className || "";
  const language = (className.match(/(?:language|lang)-([a-zA-Z0-9_-]+)/) || [])[1] || "";
  const content = (code?.textContent || pre.textContent || "").replace(/\n+$/g, "");
  const fence = content.includes("```") ? "````" : "```";
  return `${fence}${language}\n${content}\n${fence}`;
}

function renderList(list, ordered, media) {
  const items = Array.from(list.children).filter((child) => child.tagName.toLowerCase() === "li");
  return items.map((item, index) => {
    const marker = ordered ? `${index + 1}.` : "-";
    const text = renderListItem(item, media);
    return `${marker} ${text}`;
  }).join("\n");
}

function renderListItem(item, media) {
  const blockChildren = Array.from(item.children).filter((child) => {
    const tag = child.tagName.toLowerCase();
    return ["p", "blockquote", "pre", "div", "figure", "table"].includes(tag);
  });

  if (blockChildren.length === 0) {
    return renderRich(item, media).trim().replace(/\n+/g, "\n  ");
  }

  return blockChildren.map((child) => {
    if (child.tagName.toLowerCase() === "p") {
      return renderRich(child, media).trim();
    }
    return renderBlock(child, media);
  }).filter(Boolean).join("\n  ");
}

function renderTable(table, media) {
  const rows = Array.from(table.rows).map((row) => {
    return Array.from(row.cells).map((cell) => compactTableCell(renderRich(cell, media)));
  });

  if (rows.length === 0) {
    return "";
  }

  const colCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => {
    const copy = row.slice();
    while (copy.length < colCount) {
      copy.push("");
    }
    return copy;
  });
  const header = normalizedRows[0];
  const separator = header.map(() => "---");
  const body = normalizedRows.slice(1);
  return [header, separator, ...body]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
}

function compactTableCell(value) {
  return (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.cleanText)(value).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function renderDocument(metadata, body) {
  const frontmatter = [
    "---",
    `title: ${yamlString(metadata.title)}`,
    `url: ${yamlString(metadata.url)}`,
    `author: ${yamlString(metadata.author)}`,
    `author_url: ${yamlString(metadata.author_url)}`,
    `time_created: ${yamlString(metadata.time_created)}`,
    `time_modified: ${yamlString(metadata.time_modified)}`,
    `time_exported: ${yamlString(metadata.time_exported)}`,
    `upvote_count: ${yamlNumber(metadata.upvote_count)}`,
    `comment_count: ${yamlNumber(metadata.comment_count)}`,
    "---",
    ""
  ].join("\n");

  return `${frontmatter}\n${body.trim()}\n`;
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function yamlNumber(value) {
  return Number.isFinite(value) ? String(value) : "";
}

function applyMediaReplacements(markdown, replacements) {
  let output = markdown;
  for (const [placeholder, value] of replacements) {
    output = output.split(placeholder).join(value);
  }
  return output;
}


/***/ },

/***/ "./src/save-core/media.js"
/*!********************************!*\
  !*** ./src/save-core/media.js ***!
  \********************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   downloadMediaToZip: () => (/* binding */ downloadMediaToZip),
/* harmony export */   downloadOneMedia: () => (/* binding */ downloadOneMedia),
/* harmony export */   extensionFromUrl: () => (/* binding */ extensionFromUrl),
/* harmony export */   guessGifUrl: () => (/* binding */ guessGifUrl),
/* harmony export */   inferExtension: () => (/* binding */ inferExtension),
/* harmony export */   normalizeMediaUrl: () => (/* binding */ normalizeMediaUrl),
/* harmony export */   parseSrcset: () => (/* binding */ parseSrcset),
/* harmony export */   registerMedia: () => (/* binding */ registerMedia),
/* harmony export */   selectImageUrl: () => (/* binding */ selectImageUrl)
/* harmony export */ });
/* harmony import */ var _constants_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./constants.js */ "./src/save-core/constants.js");


/**
 * Media selection and ZIP download helpers.
 *
 * Markdown rendering registers media URLs first and downloads them later. This
 * keeps DOM parsing synchronous and lets one failed media request fall back to
 * the original remote URL without losing the Markdown body.
 */

function registerMedia(media, src, kind) {
  const absolute = normalizeMediaUrl(src);
  if (!absolute) {
    return "";
  }

  const placeholder = `${_constants_js__WEBPACK_IMPORTED_MODULE_0__.MEDIA_PLACEHOLDER_PREFIX}${media.length}__`;
  media.push({ placeholder, src: absolute, kind });
  return placeholder;
}

async function downloadMediaToZip(media, assetsFolder, options = {}) {
  const replacements = new Map();
  const tasks = [];
  const seenSources = new Set();
  const counters = {
    image: 0,
    gif: 0,
    video: 0,
    media: 0
  };

  for (const item of media) {
    if (!item.src) {
      replacements.set(item.placeholder, "");
      continue;
    }

    if (seenSources.has(item.src)) {
      continue;
    }
    seenSources.add(item.src);

    const kind = counters[item.kind] === undefined ? "media" : item.kind;
    counters[kind] += 1;
    tasks.push({
      src: item.src,
      kind,
      index: counters[kind]
    });
  }

  const sourceResults = await runMediaDownloadQueue(tasks, assetsFolder, options);

  for (const item of media) {
    if (!item.src) {
      continue;
    }
    replacements.set(item.placeholder, sourceResults.get(item.src) || item.src);
  }

  return replacements;
}

async function runMediaDownloadQueue(tasks, assetsFolder, options) {
  const results = new Map();
  const total = tasks.length;
  let nextIndex = 0;
  let completed = 0;
  const concurrency = Math.max(1, Number(options.concurrency || _constants_js__WEBPACK_IMPORTED_MODULE_0__.MEDIA_DOWNLOAD_CONCURRENCY));

  async function worker() {
    while (nextIndex < tasks.length) {
      const task = tasks[nextIndex];
      nextIndex += 1;

      try {
        const downloaded = await downloadOneMedia(task.src, task.kind, task.index, assetsFolder);
        results.set(task.src, `./assets/${downloaded.fileName}`);
      } catch (error) {
        console.warn(`[Zhihu Markdown Saver] failed to download ${task.src}:`, error);
        results.set(task.src, task.src);
      } finally {
        completed += 1;
        options.onProgress?.({ completed, total });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

async function downloadOneMedia(src, kind, index, assetsFolder) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), _constants_js__WEBPACK_IMPORTED_MODULE_0__.MEDIA_DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(src, {
      credentials: "omit",
      referrer: location.href,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.arrayBuffer();
    const ext = inferExtension(src, response.headers.get("content-type") || "", kind);
    const fileName = `${kind}-${String(index).padStart(3, "0")}${ext}`;
    assetsFolder.file(fileName, data, { binary: true });
    return { fileName };
  } finally {
    window.clearTimeout(timer);
  }
}

function selectImageUrl(img) {
  const direct = img.getAttribute("data-actualsrc")
    || img.getAttribute("data-original")
    || img.getAttribute("data-thumbnail")
    || img.getAttribute("src");
  const fromSrcset = parseSrcset(img.getAttribute("srcset"));
  const src = direct || fromSrcset || "";
  return normalizeMediaUrl(src);
}

function parseSrcset(srcset) {
  if (!srcset) {
    return "";
  }

  const candidates = srcset
    .split(",")
    .map((item) => item.trim().split(/\s+/)[0])
    .filter(Boolean);
  return candidates[candidates.length - 1] || "";
}

function normalizeMediaUrl(src) {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) {
    return "";
  }

  try {
    return new URL(src, location.href).href;
  } catch {
    return "";
  }
}

function guessGifUrl(src) {
  return src.replace(/\.(jpg|jpeg|png|webp)(?=($|\?))/i, ".gif");
}

function inferExtension(src, contentType, kind) {
  const fromUrl = extensionFromUrl(src);
  if (fromUrl) {
    return fromUrl === ".image" ? ".jpg" : fromUrl;
  }

  const normalizedType = contentType.split(";")[0].trim().toLowerCase();
  const byType = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov"
  };

  if (byType[normalizedType]) {
    return byType[normalizedType];
  }

  return kind === "video" ? ".mp4" : ".jpg";
}

function extensionFromUrl(src) {
  try {
    const url = new URL(src);
    const name = url.pathname.split("/").pop().toLowerCase();
    const match = name.match(/(\.[a-z0-9]{2,5})$/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}


/***/ },

/***/ "./src/save-core/target.js"
/*!*********************************!*\
  !*** ./src/save-core/target.js ***!
  \*********************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   answerItemMatches: () => (/* binding */ answerItemMatches),
/* harmony export */   detectTarget: () => (/* binding */ detectTarget),
/* harmony export */   extractAuthorUrl: () => (/* binding */ extractAuthorUrl),
/* harmony export */   extractCount: () => (/* binding */ extractCount),
/* harmony export */   extractMetaContent: () => (/* binding */ extractMetaContent),
/* harmony export */   extractMetaCount: () => (/* binding */ extractMetaCount),
/* harmony export */   extractMetadata: () => (/* binding */ extractMetadata),
/* harmony export */   extractTime: () => (/* binding */ extractTime),
/* harmony export */   findContentRoot: () => (/* binding */ findContentRoot),
/* harmony export */   findItemRoot: () => (/* binding */ findItemRoot)
/* harmony export */ });
/* harmony import */ var _shared_url_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../shared/url.js */ "./src/shared/url.js");
/* harmony import */ var _utils_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./utils.js */ "./src/save-core/utils.js");



/**
 * Target detection and DOM lookup for supported Zhihu detail pages.
 */

function detectTarget(input) {
  return (0,_shared_url_js__WEBPACK_IMPORTED_MODULE_0__.detectSupportedTarget)(input, location.href);
}

function findContentRoot(target) {
  if (target.type === "article") {
    return document.querySelector(".Post-content .RichText")
      || document.querySelector(".Post-RichTextContainer .RichText")
      || document.querySelector(".Post-RichText")
      || document.querySelector("article .RichText");
  }

  const answerItems = Array.from(document.querySelectorAll(".AnswerItem"));
  const matched = answerItems.find((item) => answerItemMatches(item, target.id));
  const item = matched || answerItems[0] || document;

  return item.querySelector(".RichContent-inner .RichText")
    || item.querySelector(".RichContent .RichText")
    || item.querySelector(".RichText.ztext")
    || item.querySelector(".RichText");
}

function answerItemMatches(item, id) {
  const name = item.getAttribute("name") || item.id || "";
  if (name.includes(`answer-${id}`) || name === id) {
    return true;
  }

  const dataZop = (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.parseJsonAttr)(item.getAttribute("data-zop"));
  if (String(dataZop?.itemId || "") === String(id)) {
    return true;
  }

  const urlMeta = item.querySelector("meta[itemprop='url']");
  const url = urlMeta?.getAttribute("content") || "";
  return url.includes(`/answer/${id}`);
}

function findItemRoot(contentRoot, type) {
  if (type === "article") {
    return contentRoot.closest(".Post-Main")
      || contentRoot.closest(".Post-content")
      || document;
  }

  return contentRoot.closest(".AnswerItem")
    || contentRoot.closest(".ContentItem")
    || document;
}

function extractMetadata({ target, itemRoot }) {
  const dataZop = (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.parseJsonAttr)(itemRoot.getAttribute?.("data-zop"));
  const title = (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.cleanText)(
    target.type === "article"
      ? (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.pickText)([
        ".Post-Title",
        "h1.Post-Title",
        "meta[property='og:title']",
        "meta[name='title']"
      ], document, "content")
      : dataZop?.title
        || (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.pickText)([
          ".QuestionHeader-title",
          ".QuestionPage meta[itemprop='name']",
          "meta[itemprop='name']",
          "meta[property='og:title']"
        ], document, "content")
  ) || document.title || "";

  const author = (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.cleanText)(
    target.type === "article"
      ? (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.pickText)([
        ".Post-Author .UserLink-link",
        ".Post-Author .AuthorInfo-name",
        ".AuthorInfo-name .UserLink-link",
        ".UserLink-link"
      ], itemRoot)
      : (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.pickText)([
        ".AuthorInfo-name .UserLink-link",
        ".AuthorInfo-content .UserLink-link",
        ".UserLink.AuthorInfo-name",
        ".UserLink-link"
      ], itemRoot)
  ) || dataZop?.authorName || "";

  const authorUrl = extractAuthorUrl(itemRoot);
  const time = extractTime(itemRoot);

  return {
    title,
    url: target.url || location.href.split("#")[0].split("?")[0],
    author,
    author_url: authorUrl,
    time_created: time.created,
    time_modified: time.modified,
    upvote_count: extractMetaCount(itemRoot, "upvoteCount") ?? extractCount(itemRoot, [
      ".VoteButton--up",
      ".ContentItem-actions .VoteButton",
      "[aria-label^='赞同']"
    ]),
    comment_count: extractMetaCount(itemRoot, "commentCount") ?? extractCount(itemRoot, [
      ".BottomActions-CommentBtn",
      ".ContentItem-action",
      "[aria-label*='评论']"
    ])
  };
}

function extractTime(itemRoot) {
  const metaCreated = extractMetaContent(itemRoot, ["dateCreated", "datePublished"]);
  const metaModified = extractMetaContent(itemRoot, ["dateModified"]);
  if (metaCreated || metaModified) {
    return {
      created: metaCreated || metaModified || "",
      modified: metaModified || metaCreated || ""
    };
  }

  const el = itemRoot.querySelector?.(".ContentItem-time") || document.querySelector(".ContentItem-time");
  if (!el) {
    return { created: "", modified: "" };
  }

  const tooltip = el.querySelector("[data-tooltip]")?.getAttribute("data-tooltip")
    || el.getAttribute("data-tooltip")
    || "";
  const text = el.textContent || "";
  const created = (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.cleanTime)(tooltip) || (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.cleanTime)(text);
  const modified = (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.cleanTime)(text) || created;
  return { created, modified };
}

function extractAuthorUrl(itemRoot) {
  const authorRoot = itemRoot.querySelector?.("[itemprop='author']");
  const metaUrl = authorRoot?.querySelector("meta[itemprop='url']")?.getAttribute("content");
  if (metaUrl) {
    return (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.normalizeLink)(metaUrl);
  }

  const link = authorRoot?.querySelector("a.UserLink-link[href]")
    || itemRoot.querySelector?.(".Post-Author a.UserLink-link[href]")
    || itemRoot.querySelector?.(".AuthorInfo-name a.UserLink-link[href]")
    || itemRoot.querySelector?.(".AuthorInfo-content a.UserLink-link[href]")
    || itemRoot.querySelector?.("a.UserLink-link[href]");

  return link ? (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.normalizeLink)(link.getAttribute("href") || link.href) : "";
}

function extractMetaContent(itemRoot, itemprops) {
  for (const itemprop of itemprops) {
    const value = itemRoot.querySelector?.(`meta[itemprop='${itemprop}']`)?.getAttribute("content");
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }
  return "";
}

function extractMetaCount(itemRoot, itemprop) {
  const value = extractMetaContent(itemRoot, [itemprop]);
  if (!value) {
    return null;
  }

  const count = Number(value);
  return Number.isFinite(count) ? count : (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.parseCount)(value);
}

function extractCount(itemRoot, selectors) {
  for (const selector of selectors) {
    const elements = Array.from(itemRoot.querySelectorAll?.(selector) || []);
    for (const el of elements) {
      const value = (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.parseCount)(el.getAttribute("aria-label") || el.textContent || "");
      if (Number.isFinite(value)) {
        return value;
      }
    }
  }
  return null;
}



/***/ },

/***/ "./src/save-core/utils.js"
/*!********************************!*\
  !*** ./src/save-core/utils.js ***!
  \********************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   cleanText: () => (/* binding */ cleanText),
/* harmony export */   cleanTime: () => (/* binding */ cleanTime),
/* harmony export */   escapeLinkText: () => (/* binding */ escapeLinkText),
/* harmony export */   normalizeLink: () => (/* binding */ normalizeLink),
/* harmony export */   parseCount: () => (/* binding */ parseCount),
/* harmony export */   parseJsonAttr: () => (/* binding */ parseJsonAttr),
/* harmony export */   pickText: () => (/* binding */ pickText)
/* harmony export */ });
/**
 * DOM-oriented utility helpers used by the browser save core.
 */

function cleanText(value) {
  return String(value ?? "").replace(/\u200B/g, "").replace(/\s+/g, " ").trim();
}

function escapeLinkText(value) {
  return String(value).replace(/]/g, "\\]");
}

function parseJsonAttr(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function pickText(selectors, scope = document, attr = null) {
  for (const selector of selectors) {
    const el = scope.querySelector(selector);
    if (!el) {
      continue;
    }

    const value = attr && el.getAttribute(attr) ? el.getAttribute(attr) : el.textContent;
    if (cleanText(value)) {
      return value;
    }
  }
  return "";
}

function normalizeLink(href) {
  if (!href) {
    return "";
  }

  try {
    const url = new URL(href, location.href);
    if (url.hostname === "link.zhihu.com") {
      const targetUrl = url.searchParams.get("target");
      return targetUrl ? decodeURIComponent(targetUrl) : url.href;
    }
    if (url.href.includes("#") && url.origin === location.origin && url.pathname === location.pathname) {
      return `#${url.hash.slice(1)}`;
    }
    return url.href;
  } catch {
    return href;
  }
}

function cleanTime(value) {
  return cleanText(value)
    .replace(/^(发布于|编辑于|更新于|最后编辑于)\s*/, "")
    .replace(/^创建于\s*/, "");
}

function parseCount(value) {
  const text = cleanText(value).replace(/,/g, "");
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const number = Number(match[1]);
  if (!Number.isFinite(number)) {
    return null;
  }

  if (text.includes("万")) {
    return Math.round(number * 10_000);
  }
  if (text.includes("千")) {
    return Math.round(number * 1_000);
  }
  return Math.round(number);
}



/***/ },

/***/ "./src/shared/url.js"
/*!***************************!*\
  !*** ./src/shared/url.js ***!
  \***************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   cleanInputUrl: () => (/* binding */ cleanInputUrl),
/* harmony export */   detectSupportedTarget: () => (/* binding */ detectSupportedTarget),
/* harmony export */   normalizeSupportedUrl: () => (/* binding */ normalizeSupportedUrl),
/* harmony export */   targetKey: () => (/* binding */ targetKey)
/* harmony export */ });
/**
 * URL helpers shared by the Node batch server and the browser userscript.
 *
 * These functions intentionally avoid DOM and `location` dependencies. Callers
 * pass a base URL when they want to support relative input.
 */

function detectSupportedTarget(input, baseHref = "https://www.zhihu.com/") {
  let url;
  try {
    url = new URL(input, baseHref);
  } catch {
    return null;
  }

  const answerMatch = url.pathname.match(/\/answer\/(\d+)/);
  if (answerMatch && url.hostname === "www.zhihu.com") {
    return {
      type: "answer",
      id: answerMatch[1],
      url: cleanInputUrl(url)
    };
  }

  const articleMatch = url.pathname.match(/^\/p\/(\d+)/);
  if (articleMatch && url.hostname === "zhuanlan.zhihu.com") {
    return {
      type: "article",
      id: articleMatch[1],
      url: cleanInputUrl(url)
    };
  }

  return null;
}

function cleanInputUrl(url) {
  const clean = new URL(url.href);
  clean.hash = "";
  clean.search = "";
  return clean.href;
}

function targetKey(target) {
  return target ? `${target.type}-${target.id}` : "";
}

function normalizeSupportedUrl(input, baseHref) {
  const target = detectSupportedTarget(input, baseHref);
  return target ? target.url : "";
}



/***/ },

/***/ "./src/userscript/constants.js"
/*!*************************************!*\
  !*** ./src/userscript/constants.js ***!
  \*************************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   BATCH_STATUS_ID: () => (/* binding */ BATCH_STATUS_ID),
/* harmony export */   BUTTON_ID: () => (/* binding */ BUTTON_ID)
/* harmony export */ });
const BUTTON_ID = "zhmd-save-zip-button";
const BATCH_STATUS_ID = "zhmd-batch-status";


/***/ },

/***/ "./src/userscript/single-save.js"
/*!***************************************!*\
  !*** ./src/userscript/single-save.js ***!
  \***************************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   saveCurrentPage: () => (/* binding */ saveCurrentPage)
/* harmony export */ });
/* harmony import */ var _save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../save-core/build-zip.js */ "./src/save-core/build-zip.js");
/* harmony import */ var _ui_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./ui.js */ "./src/userscript/ui.js");



/**
 * Single-page save entry used by the visible userscript button.
 */

async function saveCurrentPage(button) {
  const saveFile = window.saveAs || (typeof saveAs === "function" ? saveAs : null);
  if (!saveFile) {
    (0,_ui_js__WEBPACK_IMPORTED_MODULE_1__.setButtonState)(button, "缺少 FileSaver", false);
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  (0,_ui_js__WEBPACK_IMPORTED_MODULE_1__.setButtonState)(button, "保存中...", true);

  try {
    const result = await (0,_save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_0__.buildCurrentPageZip)({
      onProgress: (progress) => {
        if (progress.stage === "media") {
          (0,_ui_js__WEBPACK_IMPORTED_MODULE_1__.setButtonState)(button, `下载媒体 ${progress.completed}/${progress.total}`, true);
        } else if (progress.stage === "zip") {
          (0,_ui_js__WEBPACK_IMPORTED_MODULE_1__.setButtonState)(button, `生成 ZIP ${progress.percent || 0}%`, true);
        }
      }
    });
    saveFile(result.blob, result.fileName);

    (0,_ui_js__WEBPACK_IMPORTED_MODULE_1__.setButtonState)(button, "保存成功", true);
    window.setTimeout(() => {
      button.disabled = false;
      (0,_ui_js__WEBPACK_IMPORTED_MODULE_1__.setButtonState)(button, originalText, true);
    }, 1600);
  } catch (error) {
    console.error("[Zhihu Markdown Saver] save failed:", error);
    button.disabled = false;
    (0,_ui_js__WEBPACK_IMPORTED_MODULE_1__.setButtonState)(button, "保存失败", false);
    window.setTimeout(() => {
      (0,_ui_js__WEBPACK_IMPORTED_MODULE_1__.setButtonState)(button, originalText, true);
    }, 2200);
  }
}


/***/ },

/***/ "./src/userscript/ui.js"
/*!******************************!*\
  !*** ./src/userscript/ui.js ***!
  \******************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createSaveButton: () => (/* binding */ createSaveButton),
/* harmony export */   removeSaveButton: () => (/* binding */ removeSaveButton),
/* harmony export */   setButtonState: () => (/* binding */ setButtonState)
/* harmony export */ });
/* harmony import */ var _constants_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./constants.js */ "./src/userscript/constants.js");


/**
 * UI helpers for the floating save button.
 *
 * The UI is intentionally small because the userscript is a utility overlay on
 * top of Zhihu pages. All save orchestration stays in `save.js`.
 */

/**
 * Creates the fixed "Save as ZIP" button.
 */
function createSaveButton(onClick) {
  const button = document.createElement("button");
  button.id = _constants_js__WEBPACK_IMPORTED_MODULE_0__.BUTTON_ID;
  button.type = "button";
  button.textContent = "保存为 ZIP";
  button.title = "保存当前知乎回答/文章为 Markdown ZIP";
  button.style.position = "fixed";
  button.style.right = "72px";
  button.style.bottom = "12px";
  button.style.zIndex = "2147483647";
  button.style.height = "38px";
  button.style.padding = "0 14px";
  button.style.border = "none";
  button.style.borderRadius = "6px";
  button.style.background = "#056de8";
  button.style.color = "#fff";
  button.style.fontSize = "14px";
  button.style.fontWeight = "600";
  button.style.boxShadow = "0 6px 20px rgba(0, 0, 0, .18)";
  button.style.cursor = "pointer";

  button.addEventListener("click", async () => {
    await onClick(button);
  });

  return button;
}

/**
 * Updates the floating button text and color.
 */
function setButtonState(button, text, ok) {
  button.textContent = text;
  button.style.background = ok ? "#056de8" : "#c02c38";
}

/**
 * Removes the injected button when navigating away from supported pages.
 */
function removeSaveButton() {
  document.getElementById(_constants_js__WEBPACK_IMPORTED_MODULE_0__.BUTTON_ID)?.remove();
}


/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		if (!(moduleId in __webpack_modules__)) {
/******/ 			delete __webpack_module_cache__[moduleId];
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!********************************!*\
  !*** ./src/userscript/main.js ***!
  \********************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _constants_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./constants.js */ "./src/userscript/constants.js");
/* harmony import */ var _batch_client_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../batch/client.js */ "./src/batch/client.js");
/* harmony import */ var _save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../save-core/build-zip.js */ "./src/save-core/build-zip.js");
/* harmony import */ var _save_core_markdown_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../save-core/markdown.js */ "./src/save-core/markdown.js");
/* harmony import */ var _save_core_target_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../save-core/target.js */ "./src/save-core/target.js");
/* harmony import */ var _single_save_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./single-save.js */ "./src/userscript/single-save.js");
/* harmony import */ var _ui_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./ui.js */ "./src/userscript/ui.js");








/**
 * Tampermonkey entry point.
 *
 * The script reads Zhihu's rendered DOM, converts supported answer/article rich
 * text to Markdown, downloads media into a ZIP, and ignores comments entirely.
 */

let scheduled = 0;
let lastHref = "";

boot();

/**
 * Starts the userscript and keeps the save button in sync with Zhihu's SPA.
 */
function boot() {
  exposeTestApi();
  (0,_batch_client_js__WEBPACK_IMPORTED_MODULE_1__.startBatchClient)();
  scheduleInject();

  const observer = new MutationObserver(scheduleInject);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.setInterval(() => {
    if (lastHref !== location.href) {
      lastHref = location.href;
      scheduleInject();
    }
  }, 800);
}

/**
 * Exposes selected pure functions for optional browser-console diagnostics.
 */
function exposeTestApi() {
  window.zhihuMarkdownSaverTest = {
    applyMediaReplacements: _save_core_markdown_js__WEBPACK_IMPORTED_MODULE_3__.applyMediaReplacements,
    buildCurrentPageZip: _save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_2__.buildCurrentPageZip,
    detectTarget: _save_core_target_js__WEBPACK_IMPORTED_MODULE_4__.detectTarget,
    extractCurrentPage: _save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_2__.extractCurrentPage,
    renderDocument: _save_core_markdown_js__WEBPACK_IMPORTED_MODULE_3__.renderDocument
  };
}

/**
 * Debounces button injection after DOM mutations.
 */
function scheduleInject() {
  window.clearTimeout(scheduled);
  scheduled = window.setTimeout(injectButton, 250);
}

/**
 * Injects the fixed save button on supported detail pages.
 */
function injectButton() {
  const target = (0,_save_core_target_js__WEBPACK_IMPORTED_MODULE_4__.detectTarget)(location.href);
  const existing = document.getElementById(_constants_js__WEBPACK_IMPORTED_MODULE_0__.BUTTON_ID);

  if (!target) {
    (0,_ui_js__WEBPACK_IMPORTED_MODULE_6__.removeSaveButton)();
    return;
  }

  if (!(0,_save_core_target_js__WEBPACK_IMPORTED_MODULE_4__.findContentRoot)(target)) {
    return;
  }

  if (existing) {
    existing.hidden = false;
    return;
  }

  document.body.append((0,_ui_js__WEBPACK_IMPORTED_MODULE_6__.createSaveButton)(_single_save_js__WEBPACK_IMPORTED_MODULE_5__.saveCurrentPage));
}

})();

/******/ })()
;