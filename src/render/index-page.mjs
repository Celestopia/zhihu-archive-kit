import fs from "node:fs/promises";
import path from "node:path";
import {
  extractSummary,
  formatDisplayTime,
  renderCardCss,
  renderCardScript,
  renderContentCard,
  sortTime
} from "./card-template.mjs";
import { escapeAttr, escapeHtml } from "./html-utils.mjs";
import { parseMarkdownDocument, renderSavedFolder } from "./render.mjs";

const INDEX_FILE = "index.html";
const COLLECTION_METADATA_FILE = "collection.json";
const DEFAULT_COLLECTION_NAME = "默认收藏夹";
const PAGE_SIZE = 20;

/**
 * Build a lightweight static navigation page for saved Zhihu content.
 */
export async function renderOutputIndex(rootPath = "output") {
  const root = path.resolve(rootPath);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const items = [];
  const collections = [];

  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const collectionPath = path.join(root, entry.name);
    const metadataPath = path.join(collectionPath, COLLECTION_METADATA_FILE);
    if (!await isFile(metadataPath)) {
      continue;
    }

    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    const collectionName = metadata.name || entry.name;
    const collection = {
      name: collectionName,
      description: metadata.description || "",
      timeCreated: metadata.time_created || "",
      count: 0
    };
    collections.push(collection);

    const contentEntries = await fs.readdir(collectionPath, { withFileTypes: true });
    for (const contentEntry of contentEntries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const folderPath = path.join(collectionPath, contentEntry.name);
      const indexPath = path.join(folderPath, "index.md");
      const commentsPath = path.join(folderPath, "comments.json");

      if (!await isFile(indexPath) || !await isFile(commentsPath)) {
        continue;
      }

      const indexMarkdown = await fs.readFile(indexPath, "utf8");
      const commentsJson = JSON.parse(await fs.readFile(commentsPath, "utf8"));
      const parsed = parseMarkdownDocument(indexMarkdown);
      const summary = parsed.metadata.content_excerpt
        ? { text: parsed.metadata.content_excerpt, truncated: parsed.metadata.content_excerpt.length >= 160 }
        : extractSummary(parsed.body);
      const previewPath = await renderSavedFolder(folderPath);
      const type = requireSourceType(parsed.metadata.source_type);

      items.push({
        previewHref: toPosixPath(path.relative(root, previewPath)),
        type,
        collectionName,
        title: displayTitle(parsed.metadata, type, contentEntry.name),
        url: parsed.metadata.url || commentsJson.url || "",
        author: parsed.metadata.author || "",
        authorUrl: parsed.metadata.author_url || "",
        timeCreated: parsed.metadata.time_created || "",
        timeModified: parsed.metadata.time_modified || "",
        timeExported: parsed.metadata.time_exported || commentsJson.time_exported || "",
        upvoteCount: parsed.metadata.upvote_count,
        commentCount: parsed.metadata.comment_count,
        likeCount: parsed.metadata.like_count,
        favoriteCount: parsed.metadata.favorite_count,
        summaryText: summary.text,
        summaryTruncated: summary.truncated
      });
      collection.count += 1;
    }
  }

  collections.sort((a, b) => {
    if (a.name === DEFAULT_COLLECTION_NAME) {
      return -1;
    }
    if (b.name === DEFAULT_COLLECTION_NAME) {
      return 1;
    }
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
  items.sort((a, b) => sortTime(b.timeExported) - sortTime(a.timeExported));

  const outputPath = path.join(root, INDEX_FILE);
  await fs.writeFile(outputPath, renderIndexDocument({
    items,
    collections,
    generatedAt: new Date()
  }), "utf8");
  return outputPath;
}

function displayTitle(metadata, type, fallback) {
  if (type === "answer") {
    return metadata.question_title || metadata.title || fallback;
  }
  return metadata.title || fallback;
}

function requireSourceType(value) {
  if (value === "answer" || value === "article") {
    return value;
  }
  throw new Error("index.md frontmatter must include source_type as answer or article.");
}

function renderIndexDocument({ items, collections, generatedAt }) {
  const answerCount = items.filter((item) => item.type === "answer").length;
  const articleCount = items.filter((item) => item.type === "article").length;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>知乎保存导航</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f6f9;
      --panel: #ffffff;
      --text: #1f2328;
      --muted: #667085;
      --border: #d8dee8;
      --accent: #1677ff;
      --accent-soft: #edf5ff;
      --danger-soft: #fff1f0;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      line-height: 1.65;
    }
    main {
      width: min(980px, calc(100% - 32px));
      margin: 28px auto 56px;
    }
    .collection-nav {
      position: fixed;
      left: max(16px, calc((100vw - 980px) / 2 - 220px));
      top: 50%;
      transform: translateY(-50%);
      width: 172px;
      max-height: min(70vh, 520px);
      padding: 12px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(16, 24, 40, .08);
      z-index: 2;
    }
    .collection-nav-title {
      color: var(--muted);
      font-size: 13px;
      margin: 0 0 8px;
    }
    .collection-nav-list {
      display: grid;
      gap: 4px;
      max-height: calc(min(70vh, 520px) - 44px);
      overflow-y: auto;
      padding-right: 2px;
    }
    .collection-nav button {
      align-items: center;
      display: flex;
      justify-content: space-between;
      width: 100%;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--text);
      cursor: pointer;
      font: inherit;
      padding: 6px 8px;
      text-align: left;
    }
    .collection-nav button:hover,
    .collection-nav button[aria-pressed="true"] {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .collection-nav-count {
      color: var(--muted);
      font-size: 12px;
      margin-left: 8px;
    }
    .header,
    .toolbar {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .header {
      padding: 22px 24px;
      margin-bottom: 14px;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 30px;
      line-height: 1.25;
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 0;
      color: var(--muted);
      font-size: 14px;
    }
    .summary strong {
      color: var(--text);
    }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 14px;
      margin-bottom: 14px;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    .search {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 6px;
      font: inherit;
      padding: 8px 10px;
      background: #fff;
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .filters button {
      border: 1px solid var(--border);
      border-radius: 6px;
      background: #fff;
      color: var(--text);
      cursor: pointer;
      font: inherit;
      padding: 6px 11px;
      text-decoration: none;
      white-space: nowrap;
    }
    .filters button:hover {
      border-color: var(--accent);
      color: var(--accent);
    }
    .filters button[aria-pressed="true"] {
      border-color: var(--accent);
      background: var(--accent-soft);
      color: var(--accent);
    }
    .pagination {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-top: 14px;
    }
    .pagination[hidden] {
      display: none;
    }
    .pagination button {
      min-width: 34px;
      height: 34px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--panel);
      color: var(--text);
      cursor: pointer;
      font: inherit;
      padding: 0 10px;
    }
    .pagination button:hover:not(:disabled),
    .pagination button[aria-current="page"] {
      border-color: var(--accent);
      background: var(--accent-soft);
      color: var(--accent);
    }
    .pagination button:disabled {
      color: var(--muted);
      cursor: not-allowed;
      opacity: .55;
    }
    .pagination-ellipsis {
      color: var(--muted);
      padding: 0 2px;
    }
    ${renderCardCss()}
    @media (max-width: 1360px) {
      .collection-nav {
        position: static;
        transform: none;
        width: min(980px, calc(100% - 32px));
        max-height: none;
        margin: 28px auto 14px;
      }
      .collection-nav-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        max-height: none;
        overflow-y: visible;
        padding-right: 0;
      }
      .collection-nav button {
        width: auto;
      }
      main {
        margin-top: 0;
      }
    }
    @media (max-width: 720px) {
      .toolbar {
        grid-template-columns: 1fr;
        position: static;
      }
    }
  </style>
</head>
<body>
  ${renderCollectionNav({ collections, totalCount: items.length })}
  <main>
    <header class="header">
      <h1>知乎保存导航</h1>
      <p class="summary">
        <span>总数：<strong>${items.length}</strong></span>
        <span>回答：<strong>${answerCount}</strong></span>
        <span>文章：<strong>${articleCount}</strong></span>
        <span>收藏夹：<strong id="current-collection">所有</strong></span>
        <span>当前显示：<strong id="visible-count">${items.length}</strong></span>
        <span>生成时间：<strong>${escapeHtml(formatDisplayTime(generatedAt))}</strong></span>
      </p>
    </header>
    <section class="toolbar" aria-label="筛选">
      <input id="search" class="search" type="search" placeholder="搜索标题、作者或摘要">
      <div class="filters">
        <button type="button" data-filter="all" aria-pressed="true">全部</button>
        <button type="button" data-filter="answer" aria-pressed="false">回答</button>
        <button type="button" data-filter="article" aria-pressed="false">文章</button>
      </div>
    </section>
    <section class="feed" id="content-list">
      ${items.length ? items.map((item) => renderContentCard(item, { mode: "feed" })).join("") : `<div class="empty">没有找到可渲染的内容文件夹。</div>`}
    </section>
    <nav class="pagination" id="pagination" aria-label="分页"></nav>
  </main>
  <script>
${renderCardScript()}

    const PAGE_SIZE = ${PAGE_SIZE};
    const searchInput = document.getElementById("search");
    const visibleCount = document.getElementById("visible-count");
    const currentCollection = document.getElementById("current-collection");
    const pagination = document.getElementById("pagination");
    const cards = Array.from(document.querySelectorAll(".item"));
    const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
    const collectionButtons = Array.from(document.querySelectorAll("[data-collection-filter]"));
    let activeFilter = "all";
    let activeCollection = "all";
    let currentPage = 1;

    function applyFilters() {
      const query = searchInput.value.trim().toLowerCase();
      const matchedCards = cards.filter((card) => {
        const matchesType = activeFilter === "all" || card.dataset.type === activeFilter;
        const matchesCollection = activeCollection === "all" || card.dataset.collection === activeCollection;
        const matchesQuery = !query || card.textContent.toLowerCase().includes(query);
        return matchesType && matchesCollection && matchesQuery;
      });

      const totalPages = Math.max(1, Math.ceil(matchedCards.length / PAGE_SIZE));
      if (currentPage > totalPages) {
        currentPage = totalPages;
      }

      const start = (currentPage - 1) * PAGE_SIZE;
      const visibleCards = new Set(matchedCards.slice(start, start + PAGE_SIZE));
      for (const card of cards) {
        card.hidden = !visibleCards.has(card);
      }

      visibleCount.textContent = String(matchedCards.length);
      currentCollection.textContent = activeCollection === "all" ? "所有" : activeCollection;
      renderPagination(totalPages);
    }

    function resetToFirstPage() {
      currentPage = 1;
    }

    function renderPagination(totalPages) {
      pagination.replaceChildren();

      pagination.hidden = false;
      pagination.append(
        paginationButton("上一页", currentPage - 1, currentPage === 1),
        ...paginationItems(totalPages).map((item) => item === "ellipsis"
          ? paginationEllipsis()
          : paginationButton(String(item), item, false, item === currentPage)),
        paginationButton("下一页", currentPage + 1, currentPage === totalPages)
      );
    }

    function paginationItems(totalPages) {
      const pages = new Set([1, totalPages]);
      for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
        if (page >= 1 && page <= totalPages) {
          pages.add(page);
        }
      }

      const sorted = Array.from(pages).sort((a, b) => a - b);
      const items = [];
      for (const page of sorted) {
        if (items.length && page - items[items.length - 1] > 1) {
          items.push("ellipsis");
        }
        items.push(page);
      }
      return items;
    }

    function paginationButton(label, page, disabled, current = false) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.disabled = disabled;
      if (current) {
        button.setAttribute("aria-current", "page");
      }
      button.addEventListener("click", () => {
        currentPage = page;
        applyFilters();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      return button;
    }

    function paginationEllipsis() {
      const span = document.createElement("span");
      span.className = "pagination-ellipsis";
      span.textContent = "...";
      return span;
    }

    searchInput.addEventListener("input", () => {
      resetToFirstPage();
      applyFilters();
    });
    for (const button of filterButtons) {
      button.addEventListener("click", () => {
        activeFilter = button.dataset.filter;
        for (const item of filterButtons) {
          item.setAttribute("aria-pressed", String(item === button));
        }
        resetToFirstPage();
        applyFilters();
      });
    }

    for (const button of collectionButtons) {
      button.addEventListener("click", () => {
        activeCollection = button.dataset.collectionFilter;
        for (const item of collectionButtons) {
          item.setAttribute("aria-pressed", String(item === button));
        }
        resetToFirstPage();
        applyFilters();
      });
    }

    applyFilters();
  </script>
</body>
</html>
`;
}

function renderCollectionNav({ collections, totalCount }) {
  return `
  <aside class="collection-nav" aria-label="收藏夹">
    <p class="collection-nav-title">收藏夹</p>
    <div class="collection-nav-list">
      <button type="button" data-collection-filter="all" aria-pressed="true" title="所有">
        <span>所有</span><span class="collection-nav-count">${escapeHtml(totalCount)}</span>
      </button>
      ${collections.map((collection) => `
        <button type="button" data-collection-filter="${escapeAttr(collection.name)}" aria-pressed="false" title="${escapeAttr(collectionTooltip(collection))}">
          <span>${escapeHtml(collection.name)}</span><span class="collection-nav-count">${escapeHtml(collection.count)}</span>
        </button>
      `).join("")}
    </div>
  </aside>`;
}

function collectionTooltip(collection) {
  return collection.description.trim() || collection.name;
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

async function isFile(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
