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
      overflow: hidden;
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
    .feed-action__icon {
      font-size: 15px;
      line-height: 1;
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
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
    }
    .comment-author {
      font-weight: 700;
    }
    .comment-author a {
      color: var(--text);
      text-decoration: none;
    }
    .comment-meta {
      color: var(--muted);
      font-size: 13px;
    }
    .comment-body {
      overflow-wrap: anywhere;
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
  const summaryText = item.summaryText || "暂无摘要。";

  return `
    <article class="item" data-type="${escapeAttr(item.type)}"${previewAttrs}${collectionAttrs}>
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
      ${isPreview ? "" : renderSummaryRow(summaryText, item.summaryTruncated)}
      ${isPreview
        ? `<div class="expand-panel expand-panel--body" data-panel="body" data-loaded="1"><div data-card-body>${item.bodyHtml || ""}</div></div>`
        : `<div class="expand-panel expand-panel--body" data-panel="body" hidden></div>`}
      <div class="feed-actions">
        ${feedCountItem("▲", "赞同", item.upvoteCount)}
        ${feedCountItem("♥", "喜欢", item.likeCount)}
        ${feedCountItem("★", "收藏", item.favoriteCount)}
        ${feedCountItem("●", "评论", item.commentCount)}
        <button class="feed-action feed-action--comment action-pill" type="button" data-action="toggle-comments" aria-expanded="false"><span data-label>评论区</span></button>
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

function feedCountItem(icon, label, value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const text = label === "评论" ? `${value} 条评论` : `${label} ${value}`;
  return `<span class="feed-action"><span class="feed-action__icon" aria-hidden="true">${escapeHtml(icon)}</span>${escapeHtml(text)}</span>`;
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
      const comments = doc.querySelector("[data-comments]");
      const parsed = {
        bodyHtml: body ? rewriteRelativeUrls(body.innerHTML, basePath) : "<p>没有找到正文内容。</p>",
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
