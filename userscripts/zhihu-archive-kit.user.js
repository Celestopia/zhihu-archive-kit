// ==UserScript==
// @name         Zhihu Archive Kit
// @namespace    https://github.com/local/zhihu-archive-kit
// @version      0.1.0
// @description  Archive Zhihu answers and articles with Markdown, media, comments, and local HTML views.
// @author       local
// @match        https://www.zhihu.com/question/*
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
      console.warn("[Zhihu Archive Kit] batch client stopped:", error);
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
/* harmony export */   buildAnswerItemArtifact: () => (/* binding */ buildAnswerItemArtifact),
/* harmony export */   buildAnswerItemZip: () => (/* binding */ buildAnswerItemZip),
/* harmony export */   buildArticleRootArtifact: () => (/* binding */ buildArticleRootArtifact),
/* harmony export */   buildArticleRootZip: () => (/* binding */ buildArticleRootZip),
/* harmony export */   buildCurrentPageArtifact: () => (/* binding */ buildCurrentPageArtifact),
/* harmony export */   buildCurrentPageZip: () => (/* binding */ buildCurrentPageZip),
/* harmony export */   buildZipFromArtifact: () => (/* binding */ buildZipFromArtifact),
/* harmony export */   extractCurrentPage: () => (/* binding */ extractCurrentPage),
/* harmony export */   getZipCtor: () => (/* binding */ getZipCtor)
/* harmony export */ });
/* harmony import */ var _dom_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./dom.js */ "./src/save-core/dom.js");
/* harmony import */ var _comments_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./comments.js */ "./src/save-core/comments.js");
/* harmony import */ var _markdown_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./markdown.js */ "./src/save-core/markdown.js");
/* harmony import */ var _media_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./media.js */ "./src/save-core/media.js");
/* harmony import */ var _target_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./target.js */ "./src/save-core/target.js");
/* harmony import */ var _shared_url_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../shared/url.js */ "./src/shared/url.js");







/**
 * Browser-side save core.
 *
 * This module builds a page artifact first, then serializes it as a ZIP when a
 * caller needs archive output.
 */

async function buildCurrentPageArtifact(options = {}) {
  const timeExported = new Date().toISOString();
  options.onProgress?.({ stage: "detect" });
  const target = (0,_target_js__WEBPACK_IMPORTED_MODULE_4__.detectTarget)(options.href || location.href);
  if (!target) {
    throw new Error("Only Zhihu answer/article detail pages are supported.");
  }

  options.onProgress?.({ stage: "expand" });
  await (0,_dom_js__WEBPACK_IMPORTED_MODULE_0__.expandCollapsedContent)(findExpansionScope(target) || document);
  options.onProgress?.({ stage: "extract" });
  const result = extractCurrentPage(target);
  return buildArtifactFromExtracted({ target, result, options, timeExported });
}

async function buildCurrentPageZip(options = {}) {
  return buildZipFromArtifact(await buildCurrentPageArtifact(options), options);
}

async function buildAnswerItemArtifact(answerItem, options = {}) {
  const timeExported = new Date().toISOString();
  options.onProgress?.({ stage: "detect" });
  const target = (0,_target_js__WEBPACK_IMPORTED_MODULE_4__.extractAnswerTarget)(answerItem);

  options.onProgress?.({ stage: "expand" });
  await (0,_dom_js__WEBPACK_IMPORTED_MODULE_0__.expandCollapsedContent)(answerItem);
  options.onProgress?.({ stage: "extract" });
  const root = (0,_target_js__WEBPACK_IMPORTED_MODULE_4__.findAnswerContentRoot)(answerItem);
  if (!root) {
    throw new Error("Cannot find answer content root.");
  }

  const metadata = (0,_target_js__WEBPACK_IMPORTED_MODULE_4__.extractMetadata)({ target, itemRoot: answerItem });
  const result = (0,_markdown_js__WEBPACK_IMPORTED_MODULE_2__.extractPage)({ root, metadata });
  return buildArtifactFromExtracted({ target, result, options, timeExported });
}

async function buildAnswerItemZip(answerItem, options = {}) {
  return buildZipFromArtifact(await buildAnswerItemArtifact(answerItem, options), options);
}

async function buildArticleRootArtifact(articleRoot, options = {}) {
  const timeExported = new Date().toISOString();
  options.onProgress?.({ stage: "detect" });
  const target = (0,_target_js__WEBPACK_IMPORTED_MODULE_4__.extractArticleTarget)(articleRoot);

  options.onProgress?.({ stage: "expand" });
  await (0,_dom_js__WEBPACK_IMPORTED_MODULE_0__.expandCollapsedContent)(articleRoot);
  options.onProgress?.({ stage: "extract" });
  const root = (0,_target_js__WEBPACK_IMPORTED_MODULE_4__.findArticleContentRoot)(articleRoot);
  if (!root) {
    throw new Error("Cannot find article content root.");
  }

  const itemRoot = (0,_target_js__WEBPACK_IMPORTED_MODULE_4__.findItemRoot)(root, "article");
  const metadata = (0,_target_js__WEBPACK_IMPORTED_MODULE_4__.extractMetadata)({ target, itemRoot });
  const result = (0,_markdown_js__WEBPACK_IMPORTED_MODULE_2__.extractPage)({ root, metadata });
  return buildArtifactFromExtracted({ target, result, options, timeExported });
}

async function buildArticleRootZip(articleRoot, options = {}) {
  return buildZipFromArtifact(await buildArticleRootArtifact(articleRoot, options), options);
}

async function buildZipFromArtifact(artifact, options = {}) {
  const ZipCtor = options.ZipCtor || getZipCtor();
  if (!ZipCtor) {
    throw new Error("JSZip is unavailable.");
  }

  const zip = new ZipCtor();
  const folder = zip.folder(artifact.folderName);
  const assetsFolder = folder.folder("assets");

  folder.file("index.md", artifact.indexMarkdown);
  folder.file("comments.json", artifact.commentsJson);
  for (const asset of artifact.assets) {
    assetsFolder.file(asset.fileName, asset.data, { binary: true });
  }
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
    fileName: artifact.fileName,
    folderName: artifact.folderName,
    target: artifact.target,
    metadata: artifact.metadata
  };
}

async function buildArtifactFromExtracted({ target, result, options, timeExported }) {
  const folderName = (0,_shared_url_js__WEBPACK_IMPORTED_MODULE_5__.targetFolderName)(target, result.metadata);
  options.onProgress?.({ stage: "media", completed: 0, total: result.media.length });
  const media = await (0,_media_js__WEBPACK_IMPORTED_MODULE_3__.downloadMediaAssets)(result.media, {
    onProgress: (progress) => options.onProgress?.({ stage: "media", ...progress })
  });
  options.onProgress?.({ stage: "markdown" });
  const metadata = {
    ...result.metadata,
    time_exported: timeExported
  };
  const indexMarkdown = (0,_markdown_js__WEBPACK_IMPORTED_MODULE_2__.applyMediaReplacements)((0,_markdown_js__WEBPACK_IMPORTED_MODULE_2__.renderDocument)(metadata, result.markdown), media.replacements);
  const stagedComments = options.commentsProvider
    ? await options.commentsProvider({ target, metadata })
    : [];
  const commentMedia = await (0,_comments_js__WEBPACK_IMPORTED_MODULE_1__.localizeCommentImages)(stagedComments);
  const commentsJson = (0,_comments_js__WEBPACK_IMPORTED_MODULE_1__.stringifyCommentsPayload)((0,_comments_js__WEBPACK_IMPORTED_MODULE_1__.buildCommentsPayload)({
    target,
    metadata,
    timeExported,
    comments: commentMedia.comments
  }));

  return {
    folderName,
    indexMarkdown,
    commentsJson,
    assets: media.assets.concat(commentMedia.assets),
    fileName: `${folderName}.zip`,
    target,
    metadata
  };
}

function findExpansionScope(target) {
  if (target.type === "answer") {
    return (0,_target_js__WEBPACK_IMPORTED_MODULE_4__.findAnswerItemByTarget)(target);
  }
  return (0,_target_js__WEBPACK_IMPORTED_MODULE_4__.findArticleRoot)();
}

function extractCurrentPage(target) {
  const root = (0,_target_js__WEBPACK_IMPORTED_MODULE_4__.findContentRoot)(target);
  if (!root) {
    throw new Error(`Cannot find ${target.type} content root.`);
  }

  const itemRoot = (0,_target_js__WEBPACK_IMPORTED_MODULE_4__.findItemRoot)(root, target.type);
  const metadata = (0,_target_js__WEBPACK_IMPORTED_MODULE_4__.extractMetadata)({ target, itemRoot });
  return (0,_markdown_js__WEBPACK_IMPORTED_MODULE_2__.extractPage)({ root, itemRoot, metadata });
}

function getZipCtor() {
  return window.JSZip || (typeof JSZip !== "undefined" ? JSZip : null);
}


/***/ },

/***/ "./src/save-core/comments.js"
/*!***********************************!*\
  !*** ./src/save-core/comments.js ***!
  \***********************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   COMMENTS_SCHEMA_VERSION: () => (/* binding */ COMMENTS_SCHEMA_VERSION),
/* harmony export */   buildCommentTree: () => (/* binding */ buildCommentTree),
/* harmony export */   buildCommentsPayload: () => (/* binding */ buildCommentsPayload),
/* harmony export */   localizeCommentImages: () => (/* binding */ localizeCommentImages),
/* harmony export */   parseCommentContainer: () => (/* binding */ parseCommentContainer),
/* harmony export */   parseCommentElement: () => (/* binding */ parseCommentElement),
/* harmony export */   stringifyCommentsPayload: () => (/* binding */ stringifyCommentsPayload)
/* harmony export */ });
/* harmony import */ var _utils_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./utils.js */ "./src/save-core/utils.js");
/* harmony import */ var _media_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./media.js */ "./src/save-core/media.js");



/**
 * Comment parsing helpers for Zhihu-rendered comment DOM.
 *
 * The parser only reads comments that already exist in the browser DOM. It does
 * not request Zhihu APIs, open comment pages, or expand hidden replies.
 */

const COMMENTS_SCHEMA_VERSION = 1;

function parseCommentContainer(container) {
  const elements = Array.from(container.querySelectorAll?.("[data-id]") || [])
    .filter((el) => firstOwnCommentElement(el, ".CommentContent"));

  return elements.map((el) => parseCommentElement(el, container));
}

function parseCommentElement(commentElement, container) {
  const authorLink = findAuthorLink(commentElement);
  const replyToLink = findReplyToLink(commentElement, authorLink);
  const contentRoot = firstOwnCommentElement(commentElement, ".CommentContent");

  return {
    id: commentElement.getAttribute("data-id") || "",
    author: (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.cleanText)(authorLink?.textContent || ""),
    author_url: authorLink ? (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.normalizeLink)(authorLink.getAttribute("href") || authorLink.href) : "",
    content: renderCommentContent(contentRoot),
    time_created: normalizeCommentTime(firstOwnCommentElement(commentElement, ".css-12cl38p")?.textContent || ""),
    like_count: extractCommentLikeCount(commentElement),
    ip_location: (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.cleanText)(firstOwnCommentElement(commentElement, ".css-ntkn7q")?.textContent || ""),
    image_url: extractCommentImageUrl(contentRoot),
    reply_to_author: (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.cleanText)(replyToLink?.textContent || ""),
    reply_to_author_url: replyToLink ? (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.normalizeLink)(replyToLink.getAttribute("href") || replyToLink.href) : "",
    parent_id: findParentCommentId(commentElement, container),
    children: []
  };
}

function buildCommentsPayload({ target, metadata, timeExported, comments }) {
  const flatComments = Array.isArray(comments) ? comments : [];

  return {
    schema_version: COMMENTS_SCHEMA_VERSION,
    target: commentsTarget(target, metadata),
    url: metadata.url || target.url || location.href.split("#")[0].split("?")[0],
    time_exported: timeExported,
    staged_count: flatComments.length,
    comments: buildCommentTree(flatComments)
  };
}

function stringifyCommentsPayload(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

async function localizeCommentImages(comments) {
  const imageUrls = Array.from(new Set(
    comments.map((comment) => comment.image_url).filter(Boolean)
  ));
  const replacements = new Map();
  const assets = [];

  for (let i = 0; i < imageUrls.length; i += 1) {
    const imageUrl = imageUrls[i];
    try {
      const asset = await (0,_media_js__WEBPACK_IMPORTED_MODULE_1__.downloadOneMedia)(imageUrl, "comment-image", i + 1);
      assets.push(asset);
      replacements.set(imageUrl, `./assets/${asset.fileName}`);
    } catch (error) {
      console.warn(`[Zhihu Archive Kit] failed to download comment image ${imageUrl}:`, error);
      replacements.set(imageUrl, imageUrl);
    }
  }

  return {
    comments: comments.map((comment) => ({
      ...comment,
      image_url: comment.image_url ? replacements.get(comment.image_url) : ""
    })),
    assets
  };
}

function buildCommentTree(comments) {
  const byId = new Map();
  const roots = [];

  for (const comment of comments) {
    byId.set(comment.id, {
      ...publicComment(comment),
      children: []
    });
  }

  for (const comment of comments) {
    const current = byId.get(comment.id);
    const parent = comment.parent_id ? byId.get(comment.parent_id) : null;
    if (parent) {
      parent.children.push(current);
    } else {
      roots.push(current);
    }
  }

  return roots;
}

function commentsTarget(target, metadata) {
  if (target.type === "article") {
    return {
      type: "article",
      question_id: "",
      answer_id: "",
      article_id: target.id
    };
  }

  return {
    type: "answer",
    question_id: metadata.question_id || target.questionId || "",
    answer_id: target.id,
    article_id: ""
  };
}

function publicComment(comment) {
  return {
    id: comment.id,
    author: comment.author,
    author_url: comment.author_url,
    content: comment.content,
    time_created: comment.time_created,
    like_count: comment.like_count,
    ip_location: comment.ip_location,
    image_url: comment.image_url,
    reply_to_author: comment.reply_to_author,
    reply_to_author_url: comment.reply_to_author_url
  };
}

function firstOwnCommentElement(commentElement, selector) {
  return ownCommentElements(commentElement, selector)[0] || null;
}

function ownCommentElements(commentElement, selector) {
  return Array.from(commentElement.querySelectorAll(selector))
    .filter((el) => el.closest("[data-id]") === commentElement);
}

function findAuthorLink(commentElement) {
  return ownCommentElements(commentElement, "a[href*='/people/']")
    .find((link) => (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.cleanText)(link.textContent)) || null;
}

function findReplyToLink(commentElement, authorLink) {
  const authorHref = authorLink ? (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.normalizeLink)(authorLink.getAttribute("href") || authorLink.href) : "";

  return ownCommentElements(commentElement, "a[href*='/people/']")
    .filter((link) => (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.cleanText)(link.textContent))
    .find((link) => link !== authorLink && (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.normalizeLink)(link.getAttribute("href") || link.href) !== authorHref) || null;
}

function renderCommentContent(contentRoot) {
  if (!contentRoot) {
    return "";
  }

  return cleanCommentText(renderCommentChildren(contentRoot));
}

function renderCommentChildren(node) {
  let output = "";

  for (const child of Array.from(node.childNodes || [])) {
    output += renderCommentNode(child);
  }

  return output;
}

function renderCommentNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const el = node;
  const tag = el.tagName.toLowerCase();

  if (tag === "br") {
    return "\n";
  }
  if (el.classList.contains("comment_img") || el.classList.contains("comment_sticker")) {
    return "";
  }
  if (tag === "img") {
    return el.getAttribute("alt") || "";
  }
  if (tag === "a") {
    const href = (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.normalizeLink)(el.getAttribute("href") || el.href || "");
    const text = (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.cleanText)(el.textContent || href);
    return href ? `[${text}](${href})` : text;
  }
  if (tag === "p") {
    return `${renderCommentChildren(el)}\n\n`;
  }

  return renderCommentChildren(el);
}

function cleanCommentText(value) {
  return String(value || "")
    .replace(/\u200B/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractCommentImageUrl(contentRoot) {
  const img = contentRoot?.querySelector(".comment_img img[data-original], .comment_img img[src]");
  if (!img) {
    return "";
  }
  return (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.normalizeLink)(img.getAttribute("data-original") || img.getAttribute("src") || "");
}

function extractCommentLikeCount(commentElement) {
  const buttons = [
    ...ownCommentElements(commentElement, ".css-1vd72tl"),
    ...ownCommentElements(commentElement, "button")
  ];
  const seen = new Set();

  for (const button of buttons) {
    if (seen.has(button)) {
      continue;
    }
    seen.add(button);

    const isLikeButton = button.classList.contains("css-1vd72tl")
      || Boolean(button.querySelector("svg[class*='Heart']"))
      || (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.cleanText)(button.textContent).includes("喜欢");
    if (!isLikeButton) {
      continue;
    }

    return (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.parseCount)(button.getAttribute("aria-label") || button.textContent || "") ?? 0;
  }

  return 0;
}

function findParentCommentId(commentElement, container) {
  const nestedParent = commentElement.parentElement?.closest("[data-id]");
  if (nestedParent && nestedParent !== commentElement && container.contains(nestedParent)) {
    return nestedParent.getAttribute("data-id") || "";
  }

  const firstChild = commentElement.firstElementChild;
  if (firstChild?.classList.contains("css-1kwt8l8")) {
    const parent = commentElement.parentElement?.closest("[data-id]");
    return parent?.getAttribute("data-id") || "";
  }

  if (commentElement.closest(".css-16zdamy")) {
    const modalRoot = container.querySelector(".css-tpyajk [data-id]");
    if (modalRoot && modalRoot !== commentElement) {
      return modalRoot.getAttribute("data-id") || "";
    }
  }

  return "";
}

function normalizeCommentTime(value) {
  const text = (0,_utils_js__WEBPACK_IMPORTED_MODULE_0__.cleanText)(value);
  if (!text) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text;
  }
  if (/^\d{2}-\d{2}$/.test(text)) {
    const date = new Date();
    const [month, day] = text.split("-").map((part) => Number(part));
    date.setMonth(month - 1, day);
    date.setHours(0, 0, 0, 0);
    return formatLocalDate(date, false);
  }
  if (text.includes("分钟前")) {
    const date = new Date();
    date.setMinutes(date.getMinutes() - Number.parseInt(text, 10));
    date.setSeconds(0, 0);
    return formatLocalDate(date, true);
  }
  if (text.includes("小时前")) {
    const date = new Date();
    date.setHours(date.getHours() - Number.parseInt(text, 10));
    date.setMinutes(0, 0, 0);
    return formatLocalDate(date, true);
  }
  if (text.includes("昨天")) {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    date.setSeconds(0, 0);
    return formatLocalDate(date, true);
  }
  if (text === "刚刚") {
    const date = new Date();
    date.setSeconds(0, 0);
    return formatLocalDate(date, true);
  }
  return text;
}

function formatLocalDate(date, includeTime) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  if (!includeTime) {
    return `${year}-${month}-${day}`;
  }

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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

async function expandCollapsedContent(scope = document) {
  const labels = ["阅读全文", "展开阅读全文", "继续阅读", "显示全部", "展开全部"];
  const candidates = Array.from(scope.querySelectorAll("button, a"));

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
/* harmony export */   isZhidaEntityLink: () => (/* binding */ isZhidaEntityLink),
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
        const href = (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.normalizeLink)(link.href);
        return isZhidaEntityLink(href) ? text : `[${(0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.escapeLinkText)(text)}](${href})`;
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
  if (!href || isZhidaEntityLink(href)) {
    return text;
  }
  return `[${(0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.escapeLinkText)(text)}](${href})`;
}

function isZhidaEntityLink(href) {
  if (!href.startsWith("https://zhida.zhihu.com/") && !href.startsWith("http://zhida.zhihu.com/")) {
    return false;
  }
  const url = new URL(href);
  return url.pathname === "/search" || url.searchParams.get("zhida_source") === "entity";
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
    ...renderQuestionMetadata(metadata),
    `upvote_count: ${yamlNumber(metadata.upvote_count)}`,
    `comment_count: ${yamlNumber(metadata.comment_count)}`,
    `like_count: ${yamlNumber(metadata.like_count)}`,
    `favorite_count: ${yamlNumber(metadata.favorite_count)}`,
    "---",
    ""
  ].join("\n");

  return `${frontmatter}\n${body.trim()}\n`;
}

function renderQuestionMetadata(metadata) {
  if (!metadata.answer_id && !metadata.question_id) {
    return [];
  }

  return [
    `question_url: ${yamlString(metadata.question_url)}`,
    `question_time_created: ${yamlString(metadata.question_time_created)}`,
    `question_time_modified: ${yamlString(metadata.question_time_modified)}`,
    `question_answer_count: ${yamlNumberOrEmptyString(metadata.question_answer_count)}`,
    `question_comment_count: ${yamlNumberOrEmptyString(metadata.question_comment_count)}`,
    `question_follower_count: ${yamlNumberOrEmptyString(metadata.question_follower_count)}`,
    `question_topic: ${yamlString(metadata.question_topic)}`
  ];
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function yamlNumber(value) {
  return Number.isFinite(value) ? String(value) : "";
}

function yamlNumberOrEmptyString(value) {
  return value === "" ? yamlString("") : yamlNumber(value);
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
/* harmony export */   downloadMediaAssets: () => (/* binding */ downloadMediaAssets),
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
 * Media selection and asset download helpers.
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

async function downloadMediaAssets(media, options = {}) {
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

  const sourceResults = await runMediaDownloadQueue(tasks, options);
  const assets = [];

  for (const item of media) {
    if (!item.src) {
      continue;
    }
    const result = sourceResults.get(item.src);
    replacements.set(item.placeholder, result?.localPath || item.src);
  }

  for (const result of sourceResults.values()) {
    if (result.asset) {
      assets.push(result.asset);
    }
  }

  return { replacements, assets };
}

async function runMediaDownloadQueue(tasks, options) {
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
        const downloaded = await downloadOneMedia(task.src, task.kind, task.index);
        results.set(task.src, {
          localPath: `./assets/${downloaded.fileName}`,
          asset: downloaded
        });
      } catch (error) {
        console.warn(`[Zhihu Archive Kit] failed to download ${task.src}:`, error);
        results.set(task.src, {
          localPath: task.src,
          asset: null
        });
      } finally {
        completed += 1;
        options.onProgress?.({ completed, total });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

async function downloadOneMedia(src, kind, index) {
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
    return { fileName, data };
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
/* harmony export */   extractActionCount: () => (/* binding */ extractActionCount),
/* harmony export */   extractAnswerTarget: () => (/* binding */ extractAnswerTarget),
/* harmony export */   extractArticleTarget: () => (/* binding */ extractArticleTarget),
/* harmony export */   extractAuthorUrl: () => (/* binding */ extractAuthorUrl),
/* harmony export */   extractCount: () => (/* binding */ extractCount),
/* harmony export */   extractMetaContent: () => (/* binding */ extractMetaContent),
/* harmony export */   extractMetaCount: () => (/* binding */ extractMetaCount),
/* harmony export */   extractMetadata: () => (/* binding */ extractMetadata),
/* harmony export */   extractQuestionId: () => (/* binding */ extractQuestionId),
/* harmony export */   extractQuestionMetadata: () => (/* binding */ extractQuestionMetadata),
/* harmony export */   extractTargetIds: () => (/* binding */ extractTargetIds),
/* harmony export */   extractTime: () => (/* binding */ extractTime),
/* harmony export */   findAnswerContentRoot: () => (/* binding */ findAnswerContentRoot),
/* harmony export */   findAnswerItemByTarget: () => (/* binding */ findAnswerItemByTarget),
/* harmony export */   findArticleContentRoot: () => (/* binding */ findArticleContentRoot),
/* harmony export */   findArticleRoot: () => (/* binding */ findArticleRoot),
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
    return findArticleContentRoot(document);
  }

  const item = findAnswerItemByTarget(target);
  return item ? findAnswerContentRoot(item) : null;
}

function findAnswerItemByTarget(target) {
  return Array.from(document.querySelectorAll(".AnswerItem"))
    .find((item) => answerItemMatches(item, target.id)) || null;
}

function findAnswerContentRoot(answerItem) {
  return answerItem.querySelector(".RichContent-inner .RichText")
    || answerItem.querySelector(".RichContent .RichText")
    || answerItem.querySelector(".RichText.ztext")
    || answerItem.querySelector(".RichText");
}

function findArticleContentRoot(articleRoot = document) {
  return articleRoot.querySelector(".Post-content .RichText")
    || articleRoot.querySelector(".Post-RichTextContainer .RichText")
    || articleRoot.querySelector(".Post-RichText")
    || articleRoot.querySelector("article .RichText")
    || articleRoot.querySelector(".RichText");
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

function extractAnswerTarget(answerItem) {
  const metaUrl = answerItem.querySelector?.("meta[itemprop='url']")?.getAttribute("content") || "";
  const metaTarget = (0,_shared_url_js__WEBPACK_IMPORTED_MODULE_0__.detectSupportedTarget)(metaUrl, location.href);
  if (metaTarget?.type === "answer" && metaTarget.questionId) {
    return metaTarget;
  }

  const dataZop = (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.parseJsonAttr)(answerItem.getAttribute?.("data-zop"));
  const attrId = answerIdFromAttributes(answerItem);
  const itemId = String(dataZop?.itemId || attrId || "");
  if (!itemId) {
    throw new Error("Cannot determine the Zhihu answer ID for this card.");
  }

  for (const value of answerTargetUrls(answerItem)) {
    const target = (0,_shared_url_js__WEBPACK_IMPORTED_MODULE_0__.detectSupportedTarget)(value, location.href);
    if (target?.type === "answer" && target.id === itemId && target.questionId) {
      return target;
    }
  }

  throw new Error("Cannot determine the Zhihu question ID for this answer card.");
}

function extractArticleTarget(articleRoot) {
  const candidates = [
    articleRoot.querySelector?.("meta[itemprop='url']")?.getAttribute("content") || "",
    document.querySelector("meta[property='og:url']")?.getAttribute("content") || "",
    document.querySelector("link[rel='canonical']")?.getAttribute("href") || "",
    location.href
  ];

  for (const value of candidates) {
    const target = (0,_shared_url_js__WEBPACK_IMPORTED_MODULE_0__.detectSupportedTarget)(value, location.href);
    if (target?.type === "article") {
      return target;
    }
  }

  throw new Error("Cannot determine the Zhihu article ID for this article.");
}

function findArticleRoot() {
  return document.querySelector(".Post-content")
    || document.querySelector(".Post-RichTextContainer")
    || document.querySelector(".Post-Main")
    || null;
}

function answerTargetUrls(answerItem) {
  return Array.from(answerItem.querySelectorAll?.("a[href*='/question/'][href*='/answer/']") || [])
    .map((link) => link.getAttribute("href") || link.href || "")
    .filter(Boolean);
}

function answerIdFromAttributes(answerItem) {
  const name = answerItem.getAttribute("name") || answerItem.id || "";
  const answerName = name.match(/answer-(\d+)/);
  if (answerName) {
    return answerName[1];
  }

  const numberOnly = name.match(/^(\d+)$/);
  return numberOnly ? numberOnly[1] : "";
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
  const ids = extractTargetIds(target, itemRoot);
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

  const questionMetadata = target.type === "answer" ? extractQuestionMetadata() : {};

  return {
    title,
    url: target.url || location.href.split("#")[0].split("?")[0],
    author,
    author_url: authorUrl,
    time_created: time.created,
    time_modified: time.modified,
    question_id: ids.questionId,
    answer_id: ids.answerId,
    article_id: ids.articleId,
    upvote_count: extractMetaCount(itemRoot, "upvoteCount") ?? extractCount(itemRoot, [
      ".VoteButton--up",
      ".ContentItem-actions .VoteButton",
      "[aria-label^='赞同']"
    ]),
    comment_count: extractMetaCount(itemRoot, "commentCount") ?? extractCount(itemRoot, [
      ".BottomActions-CommentBtn",
      ".ContentItem-action",
      "[aria-label*='评论']"
    ]),
    like_count: extractActionCount(itemRoot, ["喜欢"]),
    favorite_count: extractActionCount(itemRoot, ["收藏"]),
    ...questionMetadata
  };
}

function extractQuestionMetadata() {
  const questionRoot = findQuestionRoot();
  if (!questionRoot) {
    return emptyQuestionMetadata();
  }

  return {
    question_url: extractMetaContent(questionRoot, ["url"]),
    question_time_created: extractMetaContent(questionRoot, ["dateCreated"]),
    question_time_modified: extractMetaContent(questionRoot, ["dateModified"]),
    question_answer_count: extractMetaCount(questionRoot, "answerCount") ?? "",
    question_comment_count: extractMetaCount(questionRoot, "commentCount") ?? "",
    question_follower_count: extractMetaCount(questionRoot, "zhihu:followerCount") ?? "",
    question_topic: extractQuestionTopic(questionRoot)
  };
}

function findQuestionRoot() {
  return document.querySelector(".QuestionPage[itemtype='http://schema.org/Question']")
    || document.querySelector(".QuestionPage[itemprop='mainEntity']")
    || document.querySelector(".QuestionPage")
    || null;
}

function emptyQuestionMetadata() {
  return {
    question_url: "",
    question_time_created: "",
    question_time_modified: "",
    question_answer_count: "",
    question_comment_count: "",
    question_follower_count: "",
    question_topic: ""
  };
}

function extractQuestionTopic(questionRoot) {
  const keywords = extractMetaContent(questionRoot, ["keywords"]);
  if (keywords) {
    return keywords.split(",").map((item) => (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.cleanText)(item)).filter(Boolean).join(", ");
  }

  const data = (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.parseJsonAttr)(questionRoot.querySelector?.("[data-zop-question]")?.getAttribute("data-zop-question"));
  if (!Array.isArray(data?.topics)) {
    return "";
  }

  return data.topics.map((topic) => (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.cleanText)(topic?.name || "")).filter(Boolean).join(", ");
}

function extractTargetIds(target, itemRoot) {
  if (target.type === "article") {
    return {
      questionId: "",
      answerId: "",
      articleId: target.id
    };
  }

  return {
    questionId: extractQuestionId(target, itemRoot),
    answerId: target.id,
    articleId: ""
  };
}

function extractQuestionId(target, itemRoot) {
  if (target.questionId) {
    return target.questionId;
  }

  const candidates = [
    itemRoot.querySelector?.("meta[itemprop='url']")?.getAttribute("content") || "",
    document.querySelector("link[rel='canonical']")?.getAttribute("href") || "",
    document.querySelector("meta[property='og:url']")?.getAttribute("content") || "",
    location.href
  ];

  for (const value of candidates) {
    const match = String(value).match(new RegExp(`/question/(\\d+)/answer/${target.id}(?:$|[/?#])`));
    if (match) {
      return match[1];
    }
  }

  return "";
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

function extractActionCount(itemRoot, labels) {
  const selectors = [
    ".ContentItem-actions button",
    ".ContentItem-actions a",
    ".ContentItem-action",
    ".BottomActions button",
    ".BottomActions a",
    "button",
    "a"
  ];
  const seen = new Set();

  for (const selector of selectors) {
    const elements = Array.from(itemRoot.querySelectorAll?.(selector) || []);
    for (const el of elements) {
      if (seen.has(el)) {
        continue;
      }
      seen.add(el);

      const text = actionText(el);
      if (!labels.some((label) => text.includes(label))) {
        continue;
      }

      const count = (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.parseCount)(text);
      if (Number.isFinite(count)) {
        return count;
      }
    }
  }

  return null;
}

function actionText(el) {
  return (0,_utils_js__WEBPACK_IMPORTED_MODULE_1__.cleanText)([
    el.getAttribute("aria-label") || "",
    el.getAttribute("title") || "",
    el.textContent || ""
  ].filter(Boolean).join(" "));
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
/* harmony export */   targetFolderName: () => (/* binding */ targetFolderName),
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

  const questionAnswerMatch = url.pathname.match(/^\/question\/(\d+)\/answer\/(\d+)/);
  if (questionAnswerMatch && url.hostname === "www.zhihu.com") {
    return {
      type: "answer",
      id: questionAnswerMatch[2],
      questionId: questionAnswerMatch[1],
      url: cleanInputUrl(url)
    };
  }

  const answerMatch = url.pathname.match(/^\/answer\/(\d+)/);
  if (answerMatch && url.hostname === "www.zhihu.com") {
    return {
      type: "answer",
      id: answerMatch[1],
      questionId: "",
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

function targetFolderName(target, metadata = {}) {
  if (target?.type === "article") {
    return `article-${target.id}`;
  }

  if (target?.type === "answer") {
    const questionId = metadata.question_id || target.questionId;
    if (!questionId) {
      throw new Error("Cannot determine the Zhihu question ID for this answer.");
    }
    return `question-${questionId}-answer-${target.id}`;
  }

  throw new Error("Unsupported Zhihu target.");
}


/***/ },

/***/ "./src/userscript/comment-staging.js"
/*!*******************************************!*\
  !*** ./src/userscript/comment-staging.js ***!
  \*******************************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getStagedCommentsForTarget: () => (/* binding */ getStagedCommentsForTarget),
/* harmony export */   mountCommentStaging: () => (/* binding */ mountCommentStaging)
/* harmony export */ });
/* harmony import */ var _save_core_comments_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../save-core/comments.js */ "./src/save-core/comments.js");
/* harmony import */ var _save_core_target_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../save-core/target.js */ "./src/save-core/target.js");



/**
 * Browser-side comment staging.
 *
 * Comments are collected from the currently rendered Zhihu comment DOM and kept
 * in memory until the user saves the matching answer or article.
 */

const COMMENT_TOOLBAR_ATTR = "data-zhmd-comment-toolbar";
const COMMENT_OWNER_KEY_ATTR = "data-zhmd-comment-owner-key";
const COMMENT_OWNER_TYPE_ATTR = "data-zhmd-comment-owner-type";
const COMMENT_OWNER_ID_ATTR = "data-zhmd-comment-owner-id";
const COMMENT_OWNER_QUESTION_ID_ATTR = "data-zhmd-comment-owner-question-id";

const stagedByOwner = new Map();
let pendingOwner = null;
let scheduled = 0;

function mountCommentStaging() {
  ensureCommentStagingStyle();
  scheduleCommentToolbarScan(900);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target) {
      return;
    }

    const owner = findOwnerFromElement(target);
    if (owner) {
      pendingOwner = owner;
    }
    if (shouldRescanAfterClick(target)) {
      window.setTimeout(bindPendingOwnerToModal, 1100);
      scheduleCommentToolbarScan(1300);
    }
  }, true);

  const observer = new MutationObserver(() => scheduleCommentToolbarScan(300));
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function getStagedCommentsForTarget(target) {
  const store = stagedByOwner.get(commentOwnerKey(target));
  if (!store) {
    return [];
  }

  return store.order
    .map((id) => store.comments.get(id))
    .filter(Boolean)
    .map((comment) => ({
      ...comment,
      children: []
    }));
}

function scheduleCommentToolbarScan(delayMs) {
  window.clearTimeout(scheduled);
  scheduled = window.setTimeout(injectCommentToolbars, delayMs);
}

function injectCommentToolbars() {
  bindPendingOwnerToModal();

  for (const container of findCommentContainers()) {
    if (container.querySelector(`[${COMMENT_TOOLBAR_ATTR}]`)) {
      continue;
    }
    if (!container.querySelector("[data-id] .CommentContent")) {
      continue;
    }

    const owner = findOwnerForCommentContainer(container);
    if (!owner) {
      continue;
    }

    applyOwnerAttrs(container, owner);
    const toolbarHost = container.querySelector(".css-1onritu")
      || container.querySelector(".css-14eeh9e")
      || container;
    toolbarHost.append(createCommentToolbar(owner, container));
  }
}

function findCommentContainers() {
  return Array.from(document.querySelectorAll(".Comments-container, .Modal-content .css-tpyajk, .Modal-content"))
    .filter((container) => container.querySelector?.("[data-id] .CommentContent"));
}

function createCommentToolbar(owner, container) {
  const wrap = document.createElement("div");
  wrap.className = "zhmd-comment-toolbar";
  wrap.setAttribute(COMMENT_TOOLBAR_ATTR, "1");

  const stageButton = document.createElement("button");
  stageButton.type = "button";
  stageButton.className = "zhmd-comment-toolbar__button";
  stageButton.textContent = "暂存当前评论";
  stageButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const result = stageVisibleComments(owner, container);
    stageButton.textContent = `已暂存 +${result.added} / 共 ${result.total}`;
    window.setTimeout(() => {
      stageButton.textContent = "暂存当前评论";
    }, 1600);
  });

  const countButton = document.createElement("button");
  countButton.type = "button";
  countButton.className = "zhmd-comment-toolbar__button";
  countButton.textContent = "查看暂存数";
  countButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.alert(`当前内容已暂存 ${stagedCount(owner.key)} 条评论。`);
  });

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "zhmd-comment-toolbar__button zhmd-comment-toolbar__button--danger";
  clearButton.textContent = "清空暂存";
  clearButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    stagedByOwner.delete(owner.key);
    window.alert("已清空当前内容的评论暂存。");
  });

  wrap.append(stageButton, countButton, clearButton);
  return wrap;
}

function stageVisibleComments(owner, container) {
  const parsed = (0,_save_core_comments_js__WEBPACK_IMPORTED_MODULE_0__.parseCommentContainer)(container);
  const store = ensureStore(owner.key);
  let added = 0;

  for (const comment of parsed) {
    if (!comment.id) {
      continue;
    }
    if (!store.comments.has(comment.id)) {
      store.order.push(comment.id);
      added += 1;
    }
    store.comments.set(comment.id, comment);
  }

  return {
    added,
    total: store.order.length
  };
}

function ensureStore(key) {
  if (!stagedByOwner.has(key)) {
    stagedByOwner.set(key, {
      comments: new Map(),
      order: []
    });
  }
  return stagedByOwner.get(key);
}

function stagedCount(key) {
  return stagedByOwner.get(key)?.order.length || 0;
}

function findOwnerForCommentContainer(container) {
  const attrs = ownerFromAttrs(container) || ownerFromAttrs(container.closest(".Modal-content"));
  if (attrs) {
    return attrs;
  }

  const owner = findOwnerFromElement(container);
  if (owner) {
    return owner;
  }

  return container.closest(".Modal-content") ? pendingOwner : null;
}

function findOwnerFromElement(element) {
  const answerItem = element.closest?.(".AnswerItem");
  if (answerItem) {
    try {
      const target = (0,_save_core_target_js__WEBPACK_IMPORTED_MODULE_1__.extractAnswerTarget)(answerItem);
      return {
        key: commentOwnerKey(target),
        target
      };
    } catch {
      return null;
    }
  }

  const articleRoot = element.closest?.(".Post-content, .Post-Main, .Post-RichTextContainer");
  if (articleRoot) {
    try {
      const target = (0,_save_core_target_js__WEBPACK_IMPORTED_MODULE_1__.extractArticleTarget)(articleRoot);
      return {
        key: commentOwnerKey(target),
        target
      };
    } catch {
      return null;
    }
  }

  return null;
}

function bindPendingOwnerToModal() {
  const modal = document.querySelector(".Modal-content");
  if (modal && pendingOwner) {
    applyOwnerAttrs(modal, pendingOwner);
  }
}

function ownerFromAttrs(element) {
  const key = element?.getAttribute?.(COMMENT_OWNER_KEY_ATTR);
  const type = element?.getAttribute?.(COMMENT_OWNER_TYPE_ATTR);
  const id = element?.getAttribute?.(COMMENT_OWNER_ID_ATTR);
  if (!key || !type || !id) {
    return null;
  }

  return {
    key,
    target: {
      type,
      id,
      questionId: element.getAttribute(COMMENT_OWNER_QUESTION_ID_ATTR) || ""
    }
  };
}

function applyOwnerAttrs(element, owner) {
  element.setAttribute(COMMENT_OWNER_KEY_ATTR, owner.key);
  element.setAttribute(COMMENT_OWNER_TYPE_ATTR, owner.target.type);
  element.setAttribute(COMMENT_OWNER_ID_ATTR, owner.target.id);
  element.setAttribute(COMMENT_OWNER_QUESTION_ID_ATTR, owner.target.questionId || "");
}

function shouldRescanAfterClick(target) {
  const text = target.closest("button, .css-wu78cf, .css-1r40vb1, .css-tpyajk .css-1jm49l2")?.textContent || "";
  return /(评论|回复|查看|展开)/.test(text);
}

function commentOwnerKey(target) {
  if (target?.type === "article") {
    return `article:${target.id}`;
  }
  return `answer:${target.questionId || ""}:${target.id}`;
}

function ensureCommentStagingStyle() {
  if (document.getElementById("zhmd-comment-staging-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "zhmd-comment-staging-style";
  style.textContent = `
    .zhmd-comment-toolbar {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-left: 12px;
      vertical-align: middle;
    }
    .zhmd-comment-toolbar__button {
      border: 0;
      border-radius: 4px;
      background: #e8f1ff;
      color: #1677ff;
      cursor: pointer;
      font-size: 13px;
      line-height: 22px;
      padding: 3px 9px;
      white-space: nowrap;
    }
    .zhmd-comment-toolbar__button:hover {
      background: #dceaff;
    }
    .zhmd-comment-toolbar__button--danger {
      color: #b42318;
      background: #fff1f0;
    }
  `;
  document.head.append(style);
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
/* harmony export */   CONTROL_BOUND_ATTR: () => (/* binding */ CONTROL_BOUND_ATTR),
/* harmony export */   CONTROL_CLASS: () => (/* binding */ CONTROL_CLASS),
/* harmony export */   CONTROL_HOST_CLASS: () => (/* binding */ CONTROL_HOST_CLASS),
/* harmony export */   CONTROL_STYLE_ID: () => (/* binding */ CONTROL_STYLE_ID)
/* harmony export */ });
const CONTROL_CLASS = "zhmd-save-control";
const CONTROL_HOST_CLASS = "zhmd-save-control-host";
const CONTROL_STYLE_ID = "zhmd-save-control-style";
const CONTROL_BOUND_ATTR = "data-zhmd-save-bound";
const BATCH_STATUS_ID = "zhmd-batch-status";


/***/ },

/***/ "./src/userscript/directory-save.js"
/*!******************************************!*\
  !*** ./src/userscript/directory-save.js ***!
  \******************************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   COLLECTION_METADATA_FILE: () => (/* binding */ COLLECTION_METADATA_FILE),
/* harmony export */   DEFAULT_COLLECTION_NAME: () => (/* binding */ DEFAULT_COLLECTION_NAME),
/* harmony export */   changeExportRootDirectory: () => (/* binding */ changeExportRootDirectory),
/* harmony export */   createCollection: () => (/* binding */ createCollection),
/* harmony export */   listCollections: () => (/* binding */ listCollections),
/* harmony export */   supportsDirectoryPicker: () => (/* binding */ supportsDirectoryPicker),
/* harmony export */   writeArtifactToCollection: () => (/* binding */ writeArtifactToCollection),
/* harmony export */   writeArtifactToDirectory: () => (/* binding */ writeArtifactToDirectory)
/* harmony export */ });
/**
 * Browser directory persistence for the default single-page save action.
 *
 * Chrome and Edge expose File System Access API handles only after the user
 * chooses a directory. The chosen handle is stored in IndexedDB so later saves
 * can reuse the same export root after a permission check.
 */

const DB_NAME = "zhihu-markdown-saver";
const DB_VERSION = 1;
const STORE_NAME = "settings";
const EXPORT_ROOT_KEY = "export-root-directory";
const DEFAULT_COLLECTION_NAME = "默认收藏夹";
const COLLECTION_METADATA_FILE = "collection.json";

async function writeArtifactToDirectory(artifact) {
  await writeArtifactToCollection(artifact, DEFAULT_COLLECTION_NAME);
}

async function writeArtifactToCollection(artifact, collectionName) {
  if (!supportsDirectoryPicker()) {
    throw new Error("当前浏览器不支持保存到文件夹，请使用 Chrome/Edge，或通过齿轮菜单下载 ZIP。");
  }

  const root = await getExportRootDirectory();
  await ensureDefaultCollection(root);

  const collection = await getCollectionDirectory(root, collectionName);
  if (await directoryExists(collection, artifact.folderName)) {
    throw new Error(`目标文件夹已存在：${collectionName}/${artifact.folderName}`);
  }

  const folder = await collection.getDirectoryHandle(artifact.folderName, { create: true });
  await writeFile(folder, "index.md", artifact.indexMarkdown);
  await writeFile(folder, "comments.json", artifact.commentsJson);

  const assetsFolder = await folder.getDirectoryHandle("assets", { create: true });
  for (const asset of artifact.assets) {
    await writeFile(assetsFolder, asset.fileName, asset.data);
  }
}

async function listCollections() {
  if (!supportsDirectoryPicker()) {
    throw new Error("当前浏览器不支持保存到文件夹，请使用 Chrome/Edge，或通过齿轮菜单下载 ZIP。");
  }

  const root = await getExportRootDirectory();
  await ensureDefaultCollection(root);

  const collections = [];
  for await (const [name, handle] of root.entries()) {
    if (handle.kind !== "directory") {
      continue;
    }
    if (await isContentDirectory(handle)) {
      continue;
    }

    const metadata = await ensureCollectionMetadata(handle, name, "");
    collections.push(metadata);
  }

  return collections.sort((a, b) => {
    if (a.name === DEFAULT_COLLECTION_NAME) {
      return -1;
    }
    if (b.name === DEFAULT_COLLECTION_NAME) {
      return 1;
    }
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}

async function createCollection(name, description) {
  if (!supportsDirectoryPicker()) {
    throw new Error("当前浏览器不支持保存到文件夹。");
  }

  const cleanName = validateCollectionName(name);
  const root = await getExportRootDirectory();
  await ensureDefaultCollection(root);

  if (await directoryExists(root, cleanName)) {
    throw new Error(`收藏夹已存在：${cleanName}`);
  }

  const collection = await root.getDirectoryHandle(cleanName, { create: true });
  return writeCollectionMetadata(collection, {
    schema_version: 1,
    name: cleanName,
    time_created: formatLocalIso(new Date()),
    description: String(description || "")
  });
}

function supportsDirectoryPicker() {
  return typeof window.showDirectoryPicker === "function";
}

async function changeExportRootDirectory() {
  if (!supportsDirectoryPicker()) {
    throw new Error("当前浏览器不支持选择保存目录。");
  }

  const selected = await window.showDirectoryPicker({
    id: "zhihu-markdown-saver",
    mode: "readwrite"
  });
  if (!await ensureReadWritePermission(selected)) {
    throw new Error("未获得目录写入权限。");
  }
  await storeDirectoryHandle(selected);
  await ensureDefaultCollection(selected);
  return selected;
}

async function getExportRootDirectory() {
  const stored = await readStoredDirectoryHandle();
  if (stored && await ensureReadWritePermission(stored)) {
    return stored;
  }

  return changeExportRootDirectory();
}

async function ensureDefaultCollection(root) {
  const collection = await root.getDirectoryHandle(DEFAULT_COLLECTION_NAME, { create: true });
  return ensureCollectionMetadata(collection, DEFAULT_COLLECTION_NAME, "");
}

async function getCollectionDirectory(root, collectionName) {
  const cleanName = validateCollectionName(collectionName);
  try {
    const collection = await root.getDirectoryHandle(cleanName, { create: false });
    if (await isContentDirectory(collection)) {
      throw new Error(`目标不是收藏夹：${cleanName}`);
    }
    await ensureCollectionMetadata(collection, cleanName, "");
    return collection;
  } catch (error) {
    if (error?.name === "NotFoundError") {
      throw new Error(`收藏夹不存在：${cleanName}`);
    }
    throw error;
  }
}

async function ensureCollectionMetadata(collection, name, description) {
  try {
    const handle = await collection.getFileHandle(COLLECTION_METADATA_FILE, { create: false });
    const file = await handle.getFile();
    return JSON.parse(await file.text());
  } catch (error) {
    if (error?.name !== "NotFoundError") {
      throw error;
    }
  }

  return writeCollectionMetadata(collection, {
    schema_version: 1,
    name,
    time_created: formatLocalIso(new Date()),
    description
  });
}

async function writeCollectionMetadata(collection, metadata) {
  await writeFile(collection, COLLECTION_METADATA_FILE, `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}

async function ensureReadWritePermission(handle) {
  const options = { mode: "readwrite" };
  if (await handle.queryPermission(options) === "granted") {
    return true;
  }
  return await handle.requestPermission(options) === "granted";
}

async function directoryExists(parent, name) {
  try {
    await parent.getDirectoryHandle(name, { create: false });
    return true;
  } catch (error) {
    if (error?.name === "NotFoundError") {
      return false;
    }
    throw error;
  }
}

async function isContentDirectory(handle) {
  return await fileExists(handle, "index.md") && await fileExists(handle, "comments.json");
}

async function fileExists(parent, name) {
  try {
    await parent.getFileHandle(name, { create: false });
    return true;
  } catch (error) {
    if (error?.name === "NotFoundError") {
      return false;
    }
    throw error;
  }
}

async function writeFile(directory, fileName, data) {
  const handle = await directory.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }
}

async function readStoredDirectoryHandle() {
  const db = await openDatabase();
  return requestToPromise(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(EXPORT_ROOT_KEY));
}

async function storeDirectoryHandle(handle) {
  const db = await openDatabase();
  await requestToPromise(
    db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(handle, EXPORT_ROOT_KEY)
  );
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function validateCollectionName(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName || cleanName === "." || cleanName === ".." || cleanName.includes("/") || cleanName.includes("\\")) {
    throw new Error("收藏夹名称不能为空，且不能是 .、..，也不能包含 / 或 \\。");
  }
  return cleanName;
}

function formatLocalIso(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absoluteOffset / 60), 2);
  const offsetRestMinutes = pad(absoluteOffset % 60, 2);

  return `${date.getFullYear()}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}T${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}.${pad(date.getMilliseconds(), 3)}${sign}${offsetHours}:${offsetRestMinutes}`;
}

function pad(value, length) {
  return String(value).padStart(length, "0");
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}


/***/ },

/***/ "./src/userscript/single-save.js"
/*!***************************************!*\
  !*** ./src/userscript/single-save.js ***!
  \***************************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   changeDirectoryWithButton: () => (/* binding */ changeDirectoryWithButton),
/* harmony export */   saveArtifactWithButton: () => (/* binding */ saveArtifactWithButton),
/* harmony export */   saveCurrentPage: () => (/* binding */ saveCurrentPage),
/* harmony export */   saveCurrentPageAsZip: () => (/* binding */ saveCurrentPageAsZip),
/* harmony export */   saveZipWithButton: () => (/* binding */ saveZipWithButton)
/* harmony export */ });
/* harmony import */ var _save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../save-core/build-zip.js */ "./src/save-core/build-zip.js");
/* harmony import */ var _constants_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./constants.js */ "./src/userscript/constants.js");
/* harmony import */ var _directory_save_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./directory-save.js */ "./src/userscript/directory-save.js");
/* harmony import */ var _ui_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./ui.js */ "./src/userscript/ui.js");





/**
 * Single-page save actions used by content-bound userscript controls.
 */

async function saveCurrentPage(button) {
  await saveArtifactWithButton(button, _save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_0__.buildCurrentPageArtifact);
}

async function saveCurrentPageAsZip(button) {
  await saveZipWithButton(button, _save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_0__.buildCurrentPageZip);
}

async function changeDirectoryWithButton(button) {
  const originalText = button.textContent;
  button.disabled = true;
  (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, "选择目录...", true);

  try {
    await (0,_directory_save_js__WEBPACK_IMPORTED_MODULE_2__.changeExportRootDirectory)();
    (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, "目录已更改", true);
    resetButtonLater(button, originalText, 1600);
  } catch (error) {
    console.error("[Zhihu Archive Kit] change directory failed:", error);
    button.disabled = false;
    if (error?.name === "AbortError") {
      (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, originalText, true);
      return;
    }
    showUserError(error, "更改保存目录失败");
    (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, "更改失败", false);
    resetButtonLater(button, originalText, 2200);
  }
}

async function saveArtifactWithButton(button, buildArtifact) {
  const originalText = button.textContent;
  button.disabled = true;
  (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, "载入收藏夹...", true);

  try {
    const collections = await (0,_directory_save_js__WEBPACK_IMPORTED_MODULE_2__.listCollections)();
    button.disabled = false;
    (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, originalText, true);
    showCollectionMenu(button, buildArtifact, collections);
  } catch (error) {
    console.error("[Zhihu Archive Kit] collection menu failed:", error);
    button.disabled = false;
    (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, originalText, true);
    if (error?.name === "AbortError") {
      return;
    }
    showUserError(error, "打开收藏夹失败");
  }
}

function showCollectionMenu(button, buildArtifact, collections) {
  const control = button.closest(`.${_constants_js__WEBPACK_IMPORTED_MODULE_1__.CONTROL_CLASS}`);
  if (!control) {
    throw new Error("找不到保存控件。");
  }

  closeCollectionMenu(control);

  const menu = document.createElement("div");
  menu.className = `${_constants_js__WEBPACK_IMPORTED_MODULE_1__.CONTROL_CLASS}__collection-menu`;
  menu.addEventListener("click", (event) => event.stopPropagation());

  const title = document.createElement("div");
  title.className = `${_constants_js__WEBPACK_IMPORTED_MODULE_1__.CONTROL_CLASS}__collection-title`;
  title.textContent = "选择收藏夹";

  const select = document.createElement("select");
  select.className = `${_constants_js__WEBPACK_IMPORTED_MODULE_1__.CONTROL_CLASS}__collection-select`;
  fillCollectionSelect(select, collections);

  const newButton = document.createElement("button");
  newButton.type = "button";
  newButton.className = `${_constants_js__WEBPACK_IMPORTED_MODULE_1__.CONTROL_CLASS}__collection-secondary`;
  newButton.textContent = "新建收藏夹";
  newButton.addEventListener("click", async () => {
    await createCollectionFromPrompt(select);
  });

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = `${_constants_js__WEBPACK_IMPORTED_MODULE_1__.CONTROL_CLASS}__collection-save`;
  saveButton.textContent = "保存";
  saveButton.addEventListener("click", async () => {
    await saveArtifactToSelectedCollection(button, saveButton, buildArtifact, select.value, menu);
  });

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = `${_constants_js__WEBPACK_IMPORTED_MODULE_1__.CONTROL_CLASS}__collection-secondary`;
  cancelButton.textContent = "取消";
  cancelButton.addEventListener("click", () => menu.remove());

  const actions = document.createElement("div");
  actions.className = `${_constants_js__WEBPACK_IMPORTED_MODULE_1__.CONTROL_CLASS}__collection-actions`;
  actions.append(newButton, cancelButton, saveButton);

  menu.append(title, select, actions);
  control.querySelector(`.${_constants_js__WEBPACK_IMPORTED_MODULE_1__.CONTROL_CLASS}__inner`).append(menu);
}

function fillCollectionSelect(select, collections, selectedName = "") {
  select.replaceChildren();

  for (const collection of collections) {
    const option = document.createElement("option");
    option.value = collection.name;
    option.textContent = collection.name;
    if (collection.description) {
      option.title = collection.description;
    }
    select.append(option);
  }

  if (selectedName) {
    select.value = selectedName;
  }
}

async function createCollectionFromPrompt(select) {
  const name = window.prompt("请输入收藏夹名称：", "");
  if (name === null) {
    return;
  }

  const description = window.prompt("请输入收藏夹描述（可留空）：", "");
  try {
    const created = await (0,_directory_save_js__WEBPACK_IMPORTED_MODULE_2__.createCollection)(name, description === null ? "" : description);
    const collections = await (0,_directory_save_js__WEBPACK_IMPORTED_MODULE_2__.listCollections)();
    fillCollectionSelect(select, collections, created.name);
  } catch (error) {
    console.error("[Zhihu Archive Kit] create collection failed:", error);
    showUserError(error, "新建收藏夹失败");
  }
}

async function saveArtifactToSelectedCollection(button, saveButton, buildArtifact, collectionName, menu) {
  const originalText = button.textContent;
  button.disabled = true;
  (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, "保存中...", true);
  saveButton.disabled = true;
  saveButton.textContent = "保存中...";

  try {
    const artifact = await buildArtifact({
      onProgress: (progress) => {
        if (progress.stage === "media") {
          (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, `下载媒体 ${progress.completed}/${progress.total}`, true);
        }
      }
    });
    (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, "写入收藏夹", true);
    await (0,_directory_save_js__WEBPACK_IMPORTED_MODULE_2__.writeArtifactToCollection)(artifact, collectionName);

    menu.remove();
    (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, "保存成功", true);
    resetButtonLater(button, originalText, 1600);
  } catch (error) {
    console.error("[Zhihu Archive Kit] folder save failed:", error);
    button.disabled = false;
    saveButton.disabled = false;
    saveButton.textContent = "保存";
    if (error?.name === "AbortError") {
      (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, originalText, true);
      return;
    }
    showUserError(error, "保存失败");
    (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, "保存失败", false);
    resetButtonLater(button, originalText, 2600);
  }
}

function closeCollectionMenu(control) {
  control.querySelectorAll(`.${_constants_js__WEBPACK_IMPORTED_MODULE_1__.CONTROL_CLASS}__collection-menu`).forEach((item) => item.remove());
}

async function saveZipWithButton(button, buildZip) {
  const saveFile = window.saveAs || (typeof saveAs === "function" ? saveAs : null);
  if (!saveFile) {
    (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, "缺少 FileSaver", false);
    window.alert("下载 ZIP 失败：缺少 FileSaver。");
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, "保存中...", true);

  try {
    const result = await buildZip({
      onProgress: (progress) => {
        if (progress.stage === "media") {
          (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, `下载媒体 ${progress.completed}/${progress.total}`, true);
        } else if (progress.stage === "zip") {
          (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, `生成 ZIP ${progress.percent || 0}%`, true);
        }
      }
    });
    saveFile(result.blob, result.fileName);

    (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, "保存成功", true);
    resetButtonLater(button, originalText, 1600);
  } catch (error) {
    console.error("[Zhihu Archive Kit] ZIP save failed:", error);
    button.disabled = false;
    showUserError(error, "下载 ZIP 失败");
    (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, "保存失败", false);
    resetButtonLater(button, originalText, 2200);
  }
}

function showUserError(error, fallbackMessage) {
  const message = error?.message ? String(error.message) : fallbackMessage;
  window.alert(`${fallbackMessage}：${message}`);
}

function resetButtonLater(button, text, delayMs) {
  window.setTimeout(() => {
    button.disabled = false;
    (0,_ui_js__WEBPACK_IMPORTED_MODULE_3__.setButtonState)(button, text, true);
  }, delayMs);
}


/***/ },

/***/ "./src/userscript/ui.js"
/*!******************************!*\
  !*** ./src/userscript/ui.js ***!
  \******************************/
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createSaveControl: () => (/* binding */ createSaveControl),
/* harmony export */   ensureSaveControlStyle: () => (/* binding */ ensureSaveControlStyle),
/* harmony export */   removeSaveControls: () => (/* binding */ removeSaveControls),
/* harmony export */   setButtonState: () => (/* binding */ setButtonState)
/* harmony export */ });
/* harmony import */ var _constants_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./constants.js */ "./src/userscript/constants.js");


/**
 * UI helpers for content-bound save controls.
 *
 * Controls are inserted into answer/article containers and revealed by CSS when
 * the user hovers over the related content area.
 */

function ensureSaveControlStyle() {
  if (document.getElementById(_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = _constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_STYLE_ID;
  style.textContent = `
    .AnswerItem .RichContent,
    .Post-content,
    .Post-RichTextContainer,
    .Post-Main,
    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_HOST_CLASS} {
      position: relative;
    }

    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS} {
      opacity: 0;
      pointer-events: none;
      position: absolute;
      left: -240px;
      top: -48px;
      bottom: -48px;
      width: 240px;
      min-height: 320px;
      z-index: 2147483646;
      transition: opacity .16s ease;
      user-select: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__inner {
      position: sticky;
      top: 120px;
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin-left: 96px;
      margin-top: 48px;
    }

    .AnswerItem:hover .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS},
    .Post-content:hover .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS},
    .Post-RichTextContainer:hover .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS},
    .Post-Main:hover .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS},
    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_HOST_CLASS}:hover .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS},
    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}:hover {
      opacity: 1;
      pointer-events: auto;
    }

    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS} button {
      border: none;
      border-radius: 6px;
      color: #fff;
      cursor: pointer;
      font-weight: 600;
      box-shadow: 0 6px 20px rgba(0, 0, 0, .14);
    }

    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__primary {
      min-width: 64px;
      height: 38px;
      padding: 0 14px;
      background: #056de8;
      font-size: 14px;
    }

    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__gear {
      width: 30px;
      height: 30px;
      background: rgba(23, 25, 31, .88);
      font-size: 15px;
      line-height: 30px;
    }

    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__menu {
      display: none;
      position: absolute;
      left: 0;
      top: 44px;
      padding: 6px;
      border-radius: 6px;
      background: rgba(23, 25, 31, .96);
      box-shadow: 0 8px 24px rgba(0, 0, 0, .22);
    }

    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}:hover .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__menu {
      display: block;
    }

    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__zip {
      height: 32px;
      padding: 0 12px;
      background: #303846;
      font-size: 13px;
      white-space: nowrap;
    }

    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__directory {
      display: block;
      height: 32px;
      margin-bottom: 6px;
      padding: 0 12px;
      background: #303846;
      font-size: 13px;
      white-space: nowrap;
    }

    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__collection-menu {
      position: absolute;
      left: 0;
      top: 44px;
      width: 188px;
      padding: 8px;
      border-radius: 6px;
      background: rgba(23, 25, 31, .96);
      box-shadow: 0 8px 24px rgba(0, 0, 0, .22);
    }

    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__collection-title {
      margin-bottom: 6px;
      color: rgba(255, 255, 255, .84);
      font-size: 13px;
      font-weight: 600;
    }

    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__collection-select {
      display: block;
      width: 100%;
      height: 32px;
      margin-bottom: 8px;
      border: 1px solid rgba(255, 255, 255, .18);
      border-radius: 5px;
      background: #fff;
      color: #1f2328;
      font-size: 13px;
    }

    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__collection-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__collection-actions button {
      height: 30px;
      padding: 0 8px;
      font-size: 12px;
      white-space: nowrap;
    }

    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__collection-secondary {
      background: #303846;
    }

    .${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__collection-save {
      grid-column: 1 / -1;
      background: #056de8;
    }
  `;
  document.documentElement.append(style);
}

function createSaveControl(onSave, onZip, onChangeDirectory) {
  const wrapper = document.createElement("div");
  wrapper.className = _constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS;

  const inner = document.createElement("div");
  inner.className = `${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__inner`;

  const button = document.createElement("button");
  button.type = "button";
  button.className = `${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__primary`;
  button.textContent = "保存";
  button.title = "选择收藏夹后保存当前知乎回答/文章到本地目录";
  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    await onSave(button);
  });

  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = `${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__gear`;
  gear.textContent = "⚙";
  gear.title = "保存选项";
  gear.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  const menu = document.createElement("div");
  menu.className = `${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__menu`;

  const directoryButton = document.createElement("button");
  directoryButton.type = "button";
  directoryButton.className = `${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__directory`;
  directoryButton.textContent = "更改保存目录";
  directoryButton.title = "重新选择保存到本地的文件夹";
  directoryButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    await onChangeDirectory(directoryButton);
  });

  const zipButton = document.createElement("button");
  zipButton.type = "button";
  zipButton.className = `${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}__zip`;
  zipButton.textContent = "下载为 ZIP";
  zipButton.title = "通过浏览器下载当前内容为 ZIP；下载目录为浏览器默认下载目录";
  zipButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    await onZip(zipButton);
  });

  menu.append(directoryButton, zipButton);
  inner.append(button, gear, menu);
  wrapper.append(inner);
  return wrapper;
}

function setButtonState(button, text, ok) {
  button.textContent = text;
  button.style.background = ok ? "" : "#c02c38";
}

function removeSaveControls() {
  document.querySelectorAll(`.${_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_CLASS}`).forEach((item) => item.remove());
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
/* harmony import */ var _comment_staging_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./comment-staging.js */ "./src/userscript/comment-staging.js");
/* harmony import */ var _single_save_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./single-save.js */ "./src/userscript/single-save.js");
/* harmony import */ var _ui_js__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./ui.js */ "./src/userscript/ui.js");









/**
 * Tampermonkey entry point.
 *
 * The script binds save controls to Zhihu answer cards and article content,
 * converts the related DOM to Markdown, and attaches staged comments.
 */

let scheduled = 0;
let lastHref = "";

boot();

function boot() {
  exposeTestApi();
  (0,_comment_staging_js__WEBPACK_IMPORTED_MODULE_5__.mountCommentStaging)();
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

function exposeTestApi() {
  window.zhihuMarkdownSaverTest = {
    applyMediaReplacements: _save_core_markdown_js__WEBPACK_IMPORTED_MODULE_3__.applyMediaReplacements,
    buildAnswerItemArtifact: _save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_2__.buildAnswerItemArtifact,
    buildAnswerItemZip: _save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_2__.buildAnswerItemZip,
    buildArticleRootArtifact: _save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_2__.buildArticleRootArtifact,
    buildArticleRootZip: _save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_2__.buildArticleRootZip,
    buildCurrentPageArtifact: _save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_2__.buildCurrentPageArtifact,
    buildCurrentPageZip: _save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_2__.buildCurrentPageZip,
    detectTarget: _save_core_target_js__WEBPACK_IMPORTED_MODULE_4__.detectTarget,
    extractCurrentPage: _save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_2__.extractCurrentPage,
    renderDocument: _save_core_markdown_js__WEBPACK_IMPORTED_MODULE_3__.renderDocument
  };
}

function scheduleInject() {
  window.clearTimeout(scheduled);
  scheduled = window.setTimeout(injectControls, 250);
}

function injectControls() {
  if (!isManualSavePage()) {
    (0,_ui_js__WEBPACK_IMPORTED_MODULE_7__.removeSaveControls)();
    return;
  }

  (0,_ui_js__WEBPACK_IMPORTED_MODULE_7__.ensureSaveControlStyle)();
  injectAnswerControls();
  injectArticleControl();
}

function injectAnswerControls() {
  for (const answerItem of Array.from(document.querySelectorAll(".AnswerItem"))) {
    if (answerItem.getAttribute(_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_BOUND_ATTR) === "answer") {
      continue;
    }
    if (!(0,_save_core_target_js__WEBPACK_IMPORTED_MODULE_4__.findAnswerContentRoot)(answerItem)) {
      continue;
    }

    try {
      (0,_save_core_target_js__WEBPACK_IMPORTED_MODULE_4__.extractAnswerTarget)(answerItem);
    } catch {
      continue;
    }

    const host = answerItem.querySelector(".RichContent") || answerItem;
    host.classList.add(_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_HOST_CLASS);
    host.prepend((0,_ui_js__WEBPACK_IMPORTED_MODULE_7__.createSaveControl)(
      (button) => (0,_single_save_js__WEBPACK_IMPORTED_MODULE_6__.saveArtifactWithButton)(
        button,
        (options) => (0,_save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_2__.buildAnswerItemArtifact)(answerItem, withCommentProvider(options))
      ),
      (button) => (0,_single_save_js__WEBPACK_IMPORTED_MODULE_6__.saveZipWithButton)(
        button,
        (options) => (0,_save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_2__.buildAnswerItemZip)(answerItem, withCommentProvider(options))
      ),
      _single_save_js__WEBPACK_IMPORTED_MODULE_6__.changeDirectoryWithButton
    ));
    answerItem.setAttribute(_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_BOUND_ATTR, "answer");
  }
}

function injectArticleControl() {
  const target = (0,_save_core_target_js__WEBPACK_IMPORTED_MODULE_4__.detectTarget)(location.href);
  if (target?.type !== "article") {
    return;
  }

  const articleRoot = (0,_save_core_target_js__WEBPACK_IMPORTED_MODULE_4__.findArticleRoot)();
  if (!articleRoot || articleRoot.getAttribute(_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_BOUND_ATTR) === "article") {
    return;
  }
  if (!(0,_save_core_target_js__WEBPACK_IMPORTED_MODULE_4__.findArticleContentRoot)(articleRoot)) {
    return;
  }

  const articleHost = articleRoot.querySelector(".Post-Row-Content-left");
  if (!articleHost) {
    return;
  }

  articleHost.classList.add(_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_HOST_CLASS);
  articleHost.prepend((0,_ui_js__WEBPACK_IMPORTED_MODULE_7__.createSaveControl)(
    (button) => (0,_single_save_js__WEBPACK_IMPORTED_MODULE_6__.saveArtifactWithButton)(
      button,
      (options) => (0,_save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_2__.buildArticleRootArtifact)(articleRoot, withCommentProvider(options))
    ),
    (button) => (0,_single_save_js__WEBPACK_IMPORTED_MODULE_6__.saveZipWithButton)(
      button,
      (options) => (0,_save_core_build_zip_js__WEBPACK_IMPORTED_MODULE_2__.buildArticleRootZip)(articleRoot, withCommentProvider(options))
    ),
    _single_save_js__WEBPACK_IMPORTED_MODULE_6__.changeDirectoryWithButton
  ));
  articleRoot.setAttribute(_constants_js__WEBPACK_IMPORTED_MODULE_0__.CONTROL_BOUND_ATTR, "article");
}

function withCommentProvider(options) {
  return {
    ...options,
    commentsProvider: ({ target }) => (0,_comment_staging_js__WEBPACK_IMPORTED_MODULE_5__.getStagedCommentsForTarget)(target)
  };
}

function isManualSavePage() {
  const target = (0,_save_core_target_js__WEBPACK_IMPORTED_MODULE_4__.detectTarget)(location.href);
  if (target?.type === "answer" || target?.type === "article") {
    return true;
  }

  try {
    const url = new URL(location.href);
    return url.hostname === "www.zhihu.com" && /^\/question\/\d+/.test(url.pathname);
  } catch {
    return false;
  }
}

})();

/******/ })()
;