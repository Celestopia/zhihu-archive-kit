import { BUTTON_ID } from "./constants.js";
import { startBatchClient } from "../batch/client.js";
import { buildCurrentPageZip, extractCurrentPage } from "../save-core/build-zip.js";
import { applyMediaReplacements, renderDocument } from "../save-core/markdown.js";
import { detectTarget, findContentRoot } from "../save-core/target.js";
import { saveCurrentPage } from "./single-save.js";
import { createSaveButton, removeSaveButton } from "./ui.js";

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
  startBatchClient();
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
    applyMediaReplacements,
    buildCurrentPageZip,
    detectTarget,
    extractCurrentPage,
    renderDocument
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
  const target = detectTarget(location.href);
  const existing = document.getElementById(BUTTON_ID);

  if (!target) {
    removeSaveButton();
    return;
  }

  if (!findContentRoot(target)) {
    return;
  }

  if (existing) {
    existing.hidden = false;
    return;
  }

  document.body.append(createSaveButton(saveCurrentPage));
}
