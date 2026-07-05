import { CONTROL_BOUND_ATTR, CONTROL_HOST_CLASS } from "./constants.js";
import { startBatchClient } from "../batch/client.js";
import {
  buildAnswerItemArtifact,
  buildAnswerItemZip,
  buildArticleRootArtifact,
  buildArticleRootZip,
  buildCurrentPageArtifact,
  buildCurrentPageZip,
  extractCurrentPage
} from "../save-core/build-zip.js";
import { applyMediaReplacements, renderDocument } from "../save-core/markdown.js";
import {
  detectTarget,
  extractAnswerTarget,
  extractArticleTarget,
  findAnswerContentRoot,
  findArticleContentRoot,
  findArticleRoot
} from "../save-core/target.js";
import { targetFolderName } from "../shared/url.js";
import { getStagedCommentsForTarget, mountCommentStaging } from "./comment-staging.js";
import { findSavedCollectionsForFolder } from "./directory-save.js";
import { changeDirectoryWithButton, saveArtifactWithButton, saveZipWithButton } from "./single-save.js";
import { createSaveControl, ensureSaveControlStyle, removeSaveControls, setSavedStatus } from "./ui.js";

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
  mountCommentStaging();
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

function exposeTestApi() {
  window.zhihuMarkdownSaverTest = {
    applyMediaReplacements,
    buildAnswerItemArtifact,
    buildAnswerItemZip,
    buildArticleRootArtifact,
    buildArticleRootZip,
    buildCurrentPageArtifact,
    buildCurrentPageZip,
    detectTarget,
    extractCurrentPage,
    renderDocument
  };
}

function scheduleInject() {
  window.clearTimeout(scheduled);
  scheduled = window.setTimeout(injectControls, 250);
}

function injectControls() {
  if (!isManualSavePage()) {
    removeSaveControls();
    return;
  }

  ensureSaveControlStyle();
  injectAnswerControls();
  injectArticleControl();
}

function injectAnswerControls() {
  for (const answerItem of Array.from(document.querySelectorAll(".AnswerItem"))) {
    if (answerItem.getAttribute(CONTROL_BOUND_ATTR) === "answer") {
      continue;
    }
    if (!findAnswerContentRoot(answerItem)) {
      continue;
    }

    let target;
    try {
      target = extractAnswerTarget(answerItem);
    } catch {
      continue;
    }

    const folderName = targetFolderName(target);
    const host = answerItem.querySelector(".RichContent") || answerItem;
    host.classList.add(CONTROL_HOST_CLASS);
    const control = createSaveControl(
      (button) => saveArtifactWithButton(
        button,
        (options) => buildAnswerItemArtifact(answerItem, withCommentProvider(options)),
        () => refreshSaveStatus(control, folderName)
      ),
      (button) => saveZipWithButton(
        button,
        (options) => buildAnswerItemZip(answerItem, withCommentProvider(options))
      ),
      (button) => changeDirectoryWithButton(button, () => refreshAllSaveStatuses())
    );
    control.setAttribute("data-zhmd-folder-name", folderName);
    host.prepend(control);
    refreshSaveStatus(control, folderName);
    answerItem.setAttribute(CONTROL_BOUND_ATTR, "answer");
  }
}

function injectArticleControl() {
  const target = detectTarget(location.href);
  if (target?.type !== "article") {
    return;
  }

  const articleRoot = findArticleRoot();
  if (!articleRoot || articleRoot.getAttribute(CONTROL_BOUND_ATTR) === "article") {
    return;
  }
  if (!findArticleContentRoot(articleRoot)) {
    return;
  }

  const articleHost = articleRoot.querySelector(".Post-Row-Content-left");
  if (!articleHost) {
    return;
  }

  const articleTarget = extractArticleTarget(articleRoot);
  const folderName = targetFolderName(articleTarget);
  articleHost.classList.add(CONTROL_HOST_CLASS);
  const control = createSaveControl(
    (button) => saveArtifactWithButton(
      button,
      (options) => buildArticleRootArtifact(articleRoot, withCommentProvider(options)),
      () => refreshSaveStatus(control, folderName)
    ),
    (button) => saveZipWithButton(
      button,
      (options) => buildArticleRootZip(articleRoot, withCommentProvider(options))
    ),
    (button) => changeDirectoryWithButton(button, () => refreshAllSaveStatuses())
  );
  control.setAttribute("data-zhmd-folder-name", folderName);
  articleHost.prepend(control);
  refreshSaveStatus(control, folderName);
  articleRoot.setAttribute(CONTROL_BOUND_ATTR, "article");
}

async function refreshSaveStatus(control, folderName) {
  const button = control.querySelector(".zhmd-save-control__primary");
  if (!button || button.disabled) {
    return;
  }

  try {
    const collectionNames = await findSavedCollectionsForFolder(folderName);
    setSavedStatus(button, collectionNames);
  } catch (error) {
    console.warn("[Zhihu Archive Kit] saved status check failed:", error);
  }
}

async function refreshAllSaveStatuses() {
  await Promise.all(Array.from(document.querySelectorAll("[data-zhmd-folder-name]"))
    .map((control) => refreshSaveStatus(control, control.getAttribute("data-zhmd-folder-name") || "")));
}

function withCommentProvider(options) {
  return {
    ...options,
    commentsProvider: ({ target }) => getStagedCommentsForTarget(target)
  };
}

function isManualSavePage() {
  const target = detectTarget(location.href);
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
