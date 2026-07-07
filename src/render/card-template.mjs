import { escapeAttr, escapeHtml } from "./html-utils.mjs";

const SUMMARY_LIMIT = 160;

/**
 * Shared card CSS for the output index and single-content preview pages.
 * Page shells define layout chrome; this module owns content-card structure.
 */
export function renderCardCss() {
  return `
    .feed {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: visible;
    }
    .item {
      padding: 22px 26px;
      border-top: 1px solid var(--border);
    }
    .item:first-child {
      border-top: 0;
    }
    .item[hidden] {
      display: none;
    }
    .item-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 6px;
    }
    .title {
      display: block;
      margin: 0;
      color: var(--text);
      font-size: 22px;
      font-weight: 800;
      line-height: 1.35;
      text-decoration: none;
    }
    a.title:hover {
      color: var(--accent);
    }
    .item-badges {
      flex: 0 0 auto;
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .type {
      border-radius: 999px;
      background: #f2f4f7;
      color: #475467;
      font-size: 13px;
      padding: 2px 8px;
    }
    .source-link,
    .action-pill {
      border: 0;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      font-weight: 400;
      padding: 2px 9px;
      text-decoration: none;
      white-space: nowrap;
    }
    .source-link:hover,
    .action-pill:hover {
      background: #dcecff;
      color: var(--accent);
    }
    .top-collapse[hidden] {
      display: none;
    }
    .meta {
      align-items: baseline;
      color: var(--muted);
      display: flex;
      gap: 8px 14px;
      justify-content: space-between;
      margin: 4px 0;
    }
    .meta-main {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      min-width: 0;
    }
    .meta-export {
      flex: 0 0 auto;
      margin-left: auto;
      text-align: right;
    }
    .meta,
    .meta a {
      font-size: 14px;
    }
    .meta a {
      color: var(--accent);
      text-decoration: none;
    }
    .summary-text {
      margin: 12px 0 14px;
      color: #344054;
      overflow-wrap: anywhere;
    }
    .question-info {
      margin: 12px 0 14px;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #f8fafc;
    }
    .question-info-head {
      align-items: center;
      display: flex;
      gap: 12px;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .question-info-title {
      margin: 0;
      color: var(--text);
      font-weight: 700;
    }
    .question-info-list {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
    }
    .question-info-row {
      display: grid;
      gap: 8px 24px;
      margin-top: 6px;
    }
    .question-info-row:first-child {
      margin-top: 0;
    }
    .question-info-row--time {
      grid-template-columns: repeat(2, minmax(0, max-content));
    }
    .question-info-row--stats {
      grid-template-columns: repeat(4, minmax(0, max-content));
    }
    .question-info-list dt {
      display: inline;
      color: #475467;
      font-weight: 400;
    }
    .question-info-list dd {
      display: inline;
      margin: 0;
    }
    .question-info-item {
      display: inline-flex;
      gap: 4px;
    }
    .question-description {
      margin-top: 12px;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #fff;
      color: var(--muted);
      overflow-wrap: anywhere;
    }
    .question-description-title {
      margin: 0 0 8px;
      color: var(--text);
      font-size: 15px;
      font-weight: 700;
    }
    .question-description-body {
      font-size: 14px;
      white-space: pre-wrap;
    }
    .question-description-body img {
      vertical-align: top;
    }
    .summary-text[hidden],
    .summary-text [hidden],
    .read-more[hidden] {
      display: none;
    }
    .read-more {
      border: 0;
      background: transparent;
      color: var(--accent);
      display: inline;
      font: inherit;
      margin-left: 4px;
      padding: 0;
      vertical-align: baseline;
    }
    .read-more:hover {
      color: #0958d9;
    }
    .feed-actions {
      align-items: center;
      color: var(--muted);
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      font-size: 14px;
      margin: 12px 0 4px;
    }
    .feed-action {
      align-items: center;
      background: transparent;
      border: 0;
      color: #8492a6;
      display: inline-flex;
      gap: 5px;
      padding: 0;
    }
    .feed-action--comment {
      cursor: pointer;
      display: inline-flex;
    }
    .feed-action--comment.action-pill {
      background: var(--accent-soft);
      color: var(--accent);
      padding: 2px 9px;
    }
    .feed-action--comment.action-pill:hover,
    .feed-action--comment[aria-expanded="true"] {
      background: #dcecff;
      color: var(--accent);
    }
    .item-menu-wrap {
      margin-left: auto;
      position: relative;
    }
    .item-menu-button {
      align-items: center;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: #8492a6;
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-weight: 700;
      height: 24px;
      justify-content: center;
      min-width: 30px;
      padding: 0 8px;
    }
    .item-menu-button:hover,
    .item-menu-button[aria-expanded="true"] {
      background: #f2f4f7;
      color: var(--accent);
    }
    .item-menu {
      position: absolute;
      right: 0;
      bottom: 30px;
      z-index: 4;
      min-width: 150px;
      padding: 6px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 10px 28px rgba(16, 24, 40, .14);
    }
    .item-menu--move {
      overflow: visible;
    }
    .item-menu-scroll {
      display: block;
      max-height: 170px;
      overflow-y: auto;
    }
    .item-menu[hidden] {
      display: none;
    }
    .item-menu button,
    .item-menu-title {
      display: block;
      width: 100%;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--text);
      font: inherit;
      font-size: 13px;
      padding: 7px 9px;
      text-align: left;
    }
    .item-menu button {
      cursor: pointer;
    }
    .item-menu button:hover {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .item-menu-title {
      color: var(--muted);
      cursor: default;
    }
    .feed-action__icon {
      font-size: 15px;
      line-height: 1;
    }
    .feed-action__icon svg {
      display: block;
    }
    .expand-panel {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      overflow-wrap: anywhere;
    }
    .expand-panel--body {
      margin-top: -6px;
      padding-top: 0;
      border-top: 0;
    }
    .expand-panel[hidden] {
      display: none;
    }
    .read-more--tail {
      display: inline-block;
      margin-top: 8px;
    }
    .expand-panel img,
    .expand-panel video,
    .comment-image {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
    }
    .expand-panel pre {
      overflow-x: auto;
      padding: 14px;
      background: #f2f4f7;
      border-radius: 6px;
    }
    .expand-panel code {
      font-family: "Cascadia Code", Consolas, monospace;
    }
    .expand-panel blockquote {
      margin-left: 0;
      padding: 8px 14px;
      border-left: 4px solid var(--accent);
      background: #eef4ff;
      color: #344054;
    }
    .expand-panel table {
      width: 100%;
      border-collapse: collapse;
    }
    .expand-panel th,
    .expand-panel td {
      border: 1px solid var(--border);
      padding: 6px 8px;
    }
    .comments {
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    .comments-header {
      align-items: center;
      display: flex;
      gap: 12px;
      justify-content: space-between;
      padding: 16px 20px;
      user-select: none;
    }
    .comments-heading {
      align-items: baseline;
      display: inline-flex;
      gap: 10px;
      min-width: 0;
    }
    .comments-title {
      font-weight: 700;
    }
    .comments-count {
      color: var(--muted);
      font-size: 13px;
      font-weight: 400;
      white-space: nowrap;
    }
    .comment-tools {
      display: flex;
      gap: 8px;
      margin-left: auto;
    }
    .comment-list {
      padding: 0 20px 20px;
    }
    .comment-card {
      border-top: 1px solid var(--border);
      padding: 16px 0;
    }
    .comment-card:first-child {
      border-top: 0;
    }
    .comment-card--child {
      margin-left: 28px;
      padding-left: 16px;
      border-left: 3px solid #e6edf7;
    }
    .comment-head {
      margin-bottom: 4px;
    }
    .comment-author {
      align-items: center;
      display: inline-flex;
      gap: 6px;
      font-weight: 700;
    }
    .comment-author a {
      color: var(--text);
      text-decoration: none;
    }
    .comment-reply-icon {
      border-bottom: 4px solid transparent;
      border-left: 5px solid #8492a6;
      border-top: 4px solid transparent;
      display: inline-block;
      height: 0;
      width: 0;
    }
    .comment-body {
      overflow-wrap: anywhere;
    }
    .comment-body p {
      margin: 4px 0;
    }
    .comment-foot {
      align-items: center;
      color: var(--muted);
      display: flex;
      gap: 12px;
      justify-content: space-between;
      margin-top: 6px;
      font-size: 13px;
    }
    .comment-info {
      min-width: 0;
    }
    .comment-like {
      align-items: center;
      display: inline-flex;
      flex: 0 0 auto;
      gap: 5px;
      white-space: nowrap;
    }
    .comment-like-icon {
      color: #8492a6;
      display: inline-block;
      flex: 0 0 auto;
    }
    .zhihu-emoji {
      width: 1.35em;
      height: 1.35em;
      margin: 0 .08em;
      border-radius: 0;
      object-fit: contain;
      vertical-align: -0.25em;
    }
    .comment-image {
      display: block;
      margin-top: 10px;
      max-height: 480px;
      object-fit: contain;
    }
    .notice {
      border-radius: 6px;
      background: var(--danger-soft);
      color: #b42318;
      padding: 10px 12px;
    }
    .empty {
      color: var(--muted);
      padding: 24px;
      text-align: center;
    }
    @media (max-width: 720px) {
      .item-head {
        display: block;
      }
      .type {
        display: inline-block;
        margin-top: 8px;
      }
      .meta {
        display: block;
      }
      .meta-export {
        display: block;
        margin-left: 0;
        text-align: left;
      }
    }
  `;
}

/**
 * Render a saved content card. Feed mode starts collapsed; preview mode shows
 * the full body immediately but keeps comments behind the same comments button.
 */
export function renderContentCard(item, { mode = "feed" } = {}) {
  const isPreview = mode === "preview";
  const typeLabel = item.type === "article" ? "文章" : "回答";
  const title = item.title || (item.type === "article" ? "知乎文章" : "知乎回答");
  const previewHref = item.previewHref || "";
  const titleHtml = isPreview
    ? `<h1 class="title">${escapeHtml(title)}</h1>`
    : `<a class="title" href="${escapeAttr(previewHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`;
  const previewAttrs = previewHref ? ` data-preview-href="${escapeAttr(previewHref)}"` : "";
  const collectionAttrs = item.collectionName ? ` data-collection="${escapeAttr(item.collectionName)}"` : "";
  const folderAttrs = item.folderName ? ` data-folder="${escapeAttr(item.folderName)}"` : "";
  const summaryText = item.summaryText || "暂无摘要。";

  return `
    <article class="item" data-type="${escapeAttr(item.type)}"${previewAttrs}${collectionAttrs}${folderAttrs}>
      <div class="item-head">
        ${titleHtml}
        <div class="item-badges">
          ${isPreview ? "" : `<button class="top-collapse action-pill" type="button" data-action="toggle-body" data-top-collapse aria-expanded="true" hidden>收起全文</button>`}
          ${item.url ? `<a class="source-link action-pill" href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">阅读原文</a>` : ""}
          <span class="type">${typeLabel}</span>
        </div>
      </div>
      <div class="meta">
        <div class="meta-main">
          ${item.author ? `<span>作者：${authorValue(item)}</span>` : ""}
          ${item.timeCreated ? `<span>创建：${escapeHtml(formatDisplayTime(item.timeCreated))}</span>` : ""}
          ${item.timeModified ? `<span>修改：${escapeHtml(formatDisplayTime(item.timeModified))}</span>` : ""}
        </div>
        ${item.timeExported ? `<span class="meta-export">导出：${escapeHtml(formatDisplayTime(item.timeExported))}</span>` : ""}
      </div>
      ${isPreview ? renderQuestionInfo(item) : ""}
      ${isPreview ? "" : renderSummaryRow(summaryText, item.summaryTruncated)}
      ${isPreview
        ? `<div class="expand-panel expand-panel--body" data-panel="body" data-loaded="1"><div data-card-body>${item.bodyHtml || ""}</div></div>`
        : `<div class="expand-panel expand-panel--body" data-panel="body" hidden></div>`}
      <div class="feed-actions">
        ${feedCountItem("upvote", "赞同", item.upvoteCount)}
        ${feedCountItem("like", "喜欢", item.likeCount)}
        ${feedCountItem("favorite", "收藏", item.favoriteCount)}
        ${feedCountItem("comment", "评论", item.commentCount)}
        <button class="feed-action feed-action--comment action-pill" type="button" data-action="toggle-comments" aria-expanded="false"><span data-label>评论区</span></button>
        ${isPreview ? "" : itemMenuHtml()}
      </div>
      ${isPreview
        ? `<div class="expand-panel" data-panel="comments" data-loaded="1" hidden>${renderCommentsSection({
          storedCommentCount: item.storedCommentCount,
          commentsHtml: item.commentsHtml
        })}</div>`
        : `<div class="expand-panel" data-panel="comments" hidden></div>`}
    </article>
  `;
}

function itemMenuHtml() {
  return `
        <span class="item-menu-wrap">
          <button class="item-menu-button" type="button" data-item-menu-button aria-expanded="false" aria-label="内容操作菜单">...</button>
          <span class="item-menu" data-item-menu hidden>
            <button type="button" data-edit-action="move-item">移动</button>
            <button type="button" data-edit-action="delete-item">删除</button>
          </span>
        </span>`;
}

export function renderCommentsSection({ storedCommentCount = 0, commentsHtml = "" }) {
  return `
    <section class="comments" data-comments>
      <div class="comments-header">
        <span class="comments-heading">
          <span class="comments-title">评论区</span>
          <span class="comments-count">（已存 ${escapeHtml(storedCommentCount)} 条）</span>
        </span>
        <span class="comment-tools">
          <button class="action-pill" type="button" data-action="toggle-comment-replies" aria-expanded="false"><span data-label>展开全部</span></button>
        </span>
      </div>
      ${commentsHtml}
    </section>
  `;
}

function renderQuestionInfo(item) {
  if (item.type !== "answer") {
    return "";
  }

  const rows = [
    questionInfoItem("创建时间", item.questionTimeCreated ? formatDisplayTime(item.questionTimeCreated) : ""),
    questionInfoItem("修改时间", item.questionTimeModified ? formatDisplayTime(item.questionTimeModified) : ""),
    questionInfoItem("回答数", item.questionAnswerCount),
    questionInfoItem("评论数", item.questionCommentCount),
    questionInfoItem("关注数", item.questionFollowerCount),
    questionInfoItem("标签", item.questionTopic)
  ];

  return `
      <section class="question-info" aria-label="问题信息">
        <div class="question-info-head">
          <p class="question-info-title">问题信息</p>
          ${item.questionUrl ? `<a class="source-link action-pill" href="${escapeAttr(item.questionUrl)}" target="_blank" rel="noopener noreferrer">阅读原问题</a>` : ""}
        </div>
        <dl class="question-info-list">
          <div class="question-info-row question-info-row--time">${rows.slice(0, 2).join("")}</div>
          <div class="question-info-row question-info-row--stats">${rows.slice(2).join("")}</div>
        </dl>
        ${questionDescriptionCard(item.questionDescriptionHtml || "")}
      </section>`;
}

function questionInfoItem(label, value) {
  return `<div class="question-info-item"><dt>${escapeHtml(label)}：</dt><dd>${escapeHtml(value ?? "")}</dd></div>`;
}

function questionDescriptionCard(valueHtml) {
  return `
        <section class="question-description" aria-label="问题描述">
          <p class="question-description-title">问题描述</p>
          <div class="question-description-body">${valueHtml}</div>
        </section>`;
}

function renderSummaryRow(summaryText, summaryTruncated) {
  return `
      <p class="summary-text" data-summary-row>
        <span data-summary-copy>${escapeHtml(summaryText)}${summaryTruncated ? `<span data-summary-ellipsis>...</span>` : ""}</span>
        <button class="read-more" type="button" data-action="toggle-body" aria-expanded="false"><span data-label>阅读全文</span> <span aria-hidden="true">⌄</span></button>
      </p>`;
}

function authorValue(item) {
  if (!item.authorUrl) {
    return escapeHtml(item.author);
  }
  return `<a href="${escapeAttr(item.authorUrl)}">${escapeHtml(item.author)}</a>`;
}

function feedCountItem(iconName, label, value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const text = label === "评论" ? `${value} 条评论` : `${label} ${value}`;
  return `<span class="feed-action"><span class="feed-action__icon" aria-hidden="true">${feedIcon(iconName)}</span>${escapeHtml(text)}</span>`;
}

function feedIcon(name) {
  if (name === "like") {
    return `<svg width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M16.984 3.324c1.73.315 3.125 1.472 4.04 2.978 1.893 3.116.758 6.989-1.384 9.556a23.241 23.241 0 0 1-3.96 3.737c-.66.486-1.308.895-1.902 1.196-.579.294-1.166.517-1.695.57a.845.845 0 0 1-.145.002c-.529-.038-1.127-.267-1.708-.564a14.407 14.407 0 0 1-1.947-1.232 23.512 23.512 0 0 1-4.081-3.88C2.165 13.207 1.139 9.536 2.85 6.514 3.742 4.94 5.14 3.71 6.896 3.348c1.606-.332 3.363.094 5.103 1.394 1.696-1.267 3.409-1.704 4.985-1.418Z" clip-rule="evenodd"></path></svg>`;
  }
  if (name === "favorite") {
    return `<svg width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="currentColor"><path d="M10.424 2.828c.7-1.213 2.452-1.213 3.152 0l2.47 4.285c.038.064.1.109.172.124l4.839 1.027c1.37.29 1.912 1.956.974 2.997l-3.312 3.674a.26.26 0 0 0-.065.201l.52 4.92c.146 1.393-1.27 2.422-2.55 1.852l-4.518-2.014a.26.26 0 0 0-.212 0l-4.518 2.014c-1.28.57-2.696-.46-2.55-1.853l.52-4.919a.26.26 0 0 0-.065-.2L1.969 11.26c-.938-1.041-.396-2.707.974-2.997l4.839-1.027a.26.26 0 0 0 .171-.124l2.471-4.285Z"></path></svg>`;
  }
  if (name === "comment") {
    return `<svg width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.37c5.67 0 10.266 4.085 10.267 9.125 0 2.08-.786 3.997-2.105 5.532a1.064 1.064 0 0 0-.247.91l.644 3.056c.24 1.157-.66 1.58-1.444 1.157l-2.925-1.584c-.53-.287-1.153-.338-1.743-.21-.784.172-1.604.265-2.447.265-5.67 0-10.268-4.087-10.268-9.126C1.732 6.455 6.33 2.37 12 2.37Z"></path></svg>`;
  }
  return `<svg width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M13.792 3.681c-.781-1.406-2.803-1.406-3.584 0l-7.79 14.023c-.76 1.367.228 3.046 1.791 3.046h15.582c1.563 0 2.55-1.68 1.791-3.046l-7.79-14.023Z" clip-rule="evenodd"></path></svg>`;
}

/**
 * Shared card behavior. It is embedded in both page types so dynamic content
 * loaded by the index page behaves the same as the standalone preview page.
 */
export function renderCardScript() {
  return `
    const previewCache = new Map();

    async function togglePanel(button, panelName) {
      const card = button.closest(".item");
      const panel = card?.querySelector(\`[data-panel="\${panelName}"]\`);
      if (!card || !panel) {
        return;
      }

      const expanded = button.getAttribute("aria-expanded") === "true";
      if (expanded) {
        panel.hidden = true;
        if (panelName === "body") {
          restoreSummary(card);
          collapseComments(card);
        } else {
          setButtonState(button, "评论区", false);
        }
        return;
      }

      panel.hidden = false;
      if (panelName === "body") {
        prepareSummaryForExpansion(card, button);
      } else {
        setButtonState(button, "收起评论", true);
      }

      if (panel.dataset.loaded === "1") {
        return;
      }

      panel.innerHTML = "<p>正在加载...</p>";
      try {
        const preview = await loadPreview(card.dataset.previewHref);
        if (panelName === "body") {
          panel.innerHTML = \`<div data-card-body>\${preview.bodyHtml}</div>\${bodyCollapseButtonHtml()}\`;
        } else {
          panel.innerHTML = preview.commentsHtml;
        }
        panel.dataset.loaded = "1";
      } catch (error) {
        panel.innerHTML = panelName === "body"
          ? \`<div class="notice">\${escapeHtml(error.message)}</div>\${bodyCollapseButtonHtml()}\`
          : \`<div class="notice">\${escapeHtml(error.message)}</div>\`;
      }
    }

    function setButtonState(button, label, expanded) {
      button.setAttribute("aria-expanded", String(expanded));
      button.querySelector("[data-label]").textContent = label;
    }

    function prepareSummaryForExpansion(card, button) {
      const summaryRow = card.querySelector("[data-summary-row]");
      const topCollapseButton = card.querySelector("[data-top-collapse]");
      if (summaryRow) {
        summaryRow.hidden = true;
      }
      if (topCollapseButton) {
        topCollapseButton.hidden = false;
      }
      button.hidden = true;
      setButtonState(button, "阅读全文", false);
    }

    function restoreSummary(card) {
      const summaryRow = card.querySelector("[data-summary-row]");
      const summaryButton = card.querySelector(".summary-text .read-more");
      const topCollapseButton = card.querySelector("[data-top-collapse]");

      if (summaryRow) {
        summaryRow.hidden = false;
      }
      if (summaryButton) {
        summaryButton.hidden = false;
        setButtonState(summaryButton, "阅读全文", false);
      }
      if (topCollapseButton) {
        topCollapseButton.hidden = true;
      }
    }

    function collapseComments(card) {
      const commentsPanel = card.querySelector('[data-panel="comments"]');
      const commentsButton = card.querySelector('[data-action="toggle-comments"]');
      if (commentsPanel) {
        commentsPanel.hidden = true;
      }
      if (commentsButton) {
        setButtonState(commentsButton, "评论区", false);
      }
    }

    function bodyCollapseButtonHtml() {
      return '<button class="read-more read-more--tail" type="button" data-action="toggle-body" aria-expanded="true"><span data-label>收起</span> <span aria-hidden="true">⌃</span></button>';
    }

    async function loadPreview(previewHref) {
      if (location.protocol === "file:") {
        throw new Error("请通过 npm run render:serve 打开导航页后再展开正文或评论。");
      }
      if (!previewHref) {
        throw new Error("当前卡片没有可加载的预览文件。");
      }
      if (previewCache.has(previewHref)) {
        return previewCache.get(previewHref);
      }

      const response = await fetch(previewHref);
      if (!response.ok) {
        throw new Error(\`无法加载 \${previewHref}。\`);
      }

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const basePath = previewHref.replace(/\\/[^/]*$/, "/");
      const body = doc.querySelector("[data-card-body]");
      const questionInfo = doc.querySelector(".question-info");
      const comments = doc.querySelector("[data-comments]");
      const parsed = {
        bodyHtml: [
          questionInfo ? rewriteRelativeUrls(questionInfo.outerHTML, basePath) : "",
          body ? rewriteRelativeUrls(body.innerHTML, basePath) : "<p>没有找到正文内容。</p>"
        ].filter(Boolean).join(""),
        commentsHtml: comments ? rewriteRelativeUrls(comments.outerHTML, basePath) : "<p>没有找到评论区。</p>"
      };
      previewCache.set(previewHref, parsed);
      return parsed;
    }

    function rewriteRelativeUrls(html, basePath) {
      const template = document.createElement("template");
      template.innerHTML = html;

      for (const el of template.content.querySelectorAll("[src], [href], [poster]")) {
        for (const attr of ["src", "href", "poster"]) {
          const value = el.getAttribute(attr);
          if (value) {
            el.setAttribute(attr, rewriteUrl(value, basePath));
          }
        }
      }

      for (const el of template.content.querySelectorAll("[srcset]")) {
        el.setAttribute("srcset", el.getAttribute("srcset").split(",").map((part) => {
          const pieces = part.trim().split(/\\s+/);
          pieces[0] = rewriteUrl(pieces[0], basePath);
          return pieces.join(" ");
        }).join(", "));
      }

      return template.innerHTML;
    }

    function rewriteUrl(value, basePath) {
      if (/^(https?:|data:|blob:|mailto:|#)/i.test(value) || value.startsWith("/")) {
        return value;
      }
      if (value.startsWith("./")) {
        return basePath + value.slice(2);
      }
      return basePath + value;
    }

    function toggleCommentReplies(button) {
      const comments = button.closest(".comments");
      if (!comments) {
        return;
      }
      const expanded = button.getAttribute("aria-expanded") === "true";
      const nextExpanded = !expanded;
      comments.querySelectorAll(".comment-replies").forEach((el) => { el.open = nextExpanded; });
      button.setAttribute("aria-expanded", String(nextExpanded));
      button.querySelector("[data-label]").textContent = nextExpanded ? "收起全部" : "展开全部";
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"]/g, (ch) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\\"": "&quot;"
      }[ch]));
    }

    document.addEventListener("click", (event) => {
      const actionButton = event.target?.closest?.("[data-action]");
      const action = actionButton?.dataset.action;
      if (!action) {
        return;
      }

      if (action === "toggle-body") {
        event.preventDefault();
        togglePanel(actionButton, "body");
      }
      if (action === "toggle-comments") {
        event.preventDefault();
        togglePanel(actionButton, "comments");
      }
      if (action === "toggle-comment-replies") {
        event.preventDefault();
        event.stopPropagation();
        toggleCommentReplies(actionButton);
      }
    });
  `;
}

export function extractSummary(markdownBody) {
  const text = markdownBody
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    text: text.length > SUMMARY_LIMIT ? text.slice(0, SUMMARY_LIMIT) : text,
    truncated: text.length > SUMMARY_LIMIT
  };
}

export function sortTime(value) {
  const date = parseTimeValue(value);
  return date ? date.getTime() : 0;
}

export function formatDisplayTime(value) {
  const date = value instanceof Date ? value : parseTimeValue(value);
  return date ? formatChinaTime(date) : String(value || "");
}

function parseTimeValue(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T00:00:00+08:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(text)) {
    const date = new Date(`${text.replace(" ", "T")}+08:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatChinaTime(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}
