import { CONTROL_BOUND_ATTR } from "./constants.js";
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
  findAnswerContentRoot,
  findArticleContentRoot,
  findArticleRoot
} from "../save-core/target.js";
import { getStagedCommentsForTarget, mountCommentStaging } from "./comment-staging.js";
import { changeDirectoryWithButton, saveArtifactWithButton, saveZipWithButton } from "./single-save.js";
import { createSaveControl, ensureSaveControlStyle, removeSaveControls } from "./ui.js";

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

    try {
      extractAnswerTarget(answerItem);
    } catch {
      continue;
    }

    const host = answerItem.querySelector(".RichContent") || answerItem;
    host.prepend(createSaveControl(
      (button) => saveArtifactWithButton(
        button,
        (options) => buildAnswerItemArtifact(answerItem, withCommentProvider(options))
      ),
      (button) => saveZipWithButton(
        button,
        (options) => buildAnswerItemZip(answerItem, withCommentProvider(options))
      ),
      changeDirectoryWithButton
    ));
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

  articleRoot.prepend(createSaveControl(
    (button) => saveArtifactWithButton(
      button,
      (options) => buildArticleRootArtifact(articleRoot, withCommentProvider(options))
    ),
    (button) => saveZipWithButton(
      button,
      (options) => buildArticleRootZip(articleRoot, withCommentProvider(options))
    ),
    changeDirectoryWithButton
  ));
  articleRoot.setAttribute(CONTROL_BOUND_ATTR, "article");
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
