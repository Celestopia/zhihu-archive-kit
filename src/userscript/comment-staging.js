import { parseCommentContainer } from "../save-core/comments.js";
import { extractAnswerTarget, extractArticleTarget } from "../save-core/target.js";

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

export function mountCommentStaging() {
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

export function getStagedCommentsForTarget(target) {
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
  const parsed = parseCommentContainer(container);
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
      const target = extractAnswerTarget(answerItem);
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
      const target = extractArticleTarget(articleRoot);
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
