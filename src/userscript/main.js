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
import { changeArchiveRoot, findSavedCollectionsForFolder } from "./directory-save.js";
import { saveArchiveWithButton, saveZipWithButton } from "./single-save.js";
import { createSaveControl, ensureSaveControlStyle, observeSaveControlChanges, repairSaveControl, removeSaveControls, setSavedStatus } from "./ui.js";

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

  observeSaveControlChanges(scheduleInject);

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
    if (!findAnswerContentRoot(answerItem)) {
      continue;
    }

    let target;
    try {
      target = extractAnswerTarget(answerItem);
    } catch {
      continue;
    }

    const host = answerItem.querySelector(".RichContent") || answerItem;
    mountSaveControl({
      scope: answerItem,
      host,
      target,
      buildArtifact: (options) => buildAnswerItemArtifact(answerItem, withCommentProvider(options)),
      buildZip: (options) => buildAnswerItemZip(answerItem, withCommentProvider(options))
    });
  }
}

function injectArticleControl() {
  const target = detectTarget(location.href);
  if (target?.type !== "article") {
    return;
  }

  const articleRoot = findArticleRoot();
  if (!articleRoot) {
    return;
  }
  if (!findArticleContentRoot(articleRoot)) {
    return;
  }

  const articleTarget = extractArticleTarget(articleRoot);
  mountSaveControl({
    scope: articleRoot,
    host: articleRoot,
    target: articleTarget,
    buildArtifact: (options) => buildArticleRootArtifact(articleRoot, withCommentProvider(options)),
    buildZip: (options) => buildArticleRootZip(articleRoot, withCommentProvider(options))
  });
}

function mountSaveControl({ scope, host, target, buildArtifact, buildZip }) {
  const folderName = targetFolderName(target);
  if (repairSaveControl(scope, host, folderName)) {
    return;
  }
  const control = createSaveControl(
    (button) => saveArchiveWithButton(
      button,
      buildArtifact,
      () => refreshSaveStatus(control, folderName)
    ),
    (button) => saveZipWithButton(button, buildZip),
    async () => {
      try {
        await changeArchiveRoot();
        document.querySelectorAll(".zhmd-save-control__collection-menu").forEach((menu) => menu.remove());
        for (const item of document.querySelectorAll("[data-zhmd-folder-name]")) {
          await refreshSaveStatus(item, item.getAttribute("data-zhmd-folder-name"));
        }
      } catch (error) {
        if (error.name !== "AbortError") window.alert(`更改保存文件夹失败：${error.message}`);
      }
    }
  );
  control.setAttribute("data-zhmd-folder-name", folderName);
  host.prepend(control);
  refreshSaveStatus(control, folderName);
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
