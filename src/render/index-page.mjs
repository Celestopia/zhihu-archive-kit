import fs from "node:fs/promises";
import path from "node:path";
import {
  extractSummary,
  renderCardCss,
  renderCardScript,
  renderContentCard,
  sortTime
} from "./card-template.mjs";
import { escapeAttr, escapeHtml } from "./html-utils.mjs";
import { loadSavedFolder, renderLoadedFolder } from "./render.mjs";
import { createRenderPass } from "./render-cache.mjs";
import { resolveArchiveRoot, defaultEmojiCacheDir } from "../local-data/paths.mjs";
import { loadAppIconDataUri } from "./app-icon.mjs";

const INDEX_FILE = "index.html";
const COLLECTION_METADATA_FILE = "collection.json";
const DEFAULT_COLLECTION_NAME = "默认收藏夹";
const PAGE_SIZE = 20;
const INTERNAL_DIRECTORY_PREFIX = "_";

/**
 * Build a lightweight static navigation page for saved Zhihu content.
 */
export async function renderOutputIndex(rootPath, { emojiCacheDir = defaultEmojiCacheDir() } = {}) {
  const root = await resolveArchiveRoot(rootPath);
  const pass = await createRenderPass(emojiCacheDir);
  const iconHref = await loadAppIconDataUri();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const items = [];
  const collections = [];

  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    if (isInternalDirectoryName(entry.name)) {
      continue;
    }

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

      const saved = await loadSavedFolder(folderPath);
      const { parsed, commentsJson } = saved;
      const summary = parsed.metadata.content_excerpt
        ? { text: parsed.metadata.content_excerpt, truncated: parsed.metadata.content_excerpt.length >= 160 }
        : extractSummary(parsed.body);
      const previewPath = await renderLoadedFolder(saved, pass);
      const type = requireSourceType(parsed.metadata.source_type);

      items.push({
        previewHref: toPosixPath(path.relative(root, previewPath)),
        type,
        collectionName,
        folderName: contentEntry.name,
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
        questionAnswerCount: type === "answer" ? parsed.metadata.question_answer_count : undefined,
        questionFollowerCount: type === "answer" ? parsed.metadata.question_follower_count : undefined,
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
  items.sort((a, b) => {
    return sortTime(b.timeExported) - sortTime(a.timeExported)
      || a.folderName.localeCompare(b.folderName, "zh-Hans-CN");
  });

  const outputPath = path.join(root, INDEX_FILE);
  await fs.writeFile(outputPath, renderIndexDocument({
    items,
    collections,
    iconHref
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

export function compareSortableValues(leftRaw, rightRaw, descending) {
  const parsedLeft = leftRaw === "" ? null : Number(leftRaw);
  const parsedRight = rightRaw === "" ? null : Number(rightRaw);
  const left = Number.isFinite(parsedLeft) ? parsedLeft : null;
  const right = Number.isFinite(parsedRight) ? parsedRight : null;

  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  if (left === right) {
    return 0;
  }
  return descending ? right - left : left - right;
}

function renderIndexDocument({ items, collections, iconHref }) {
  const answerCount = items.filter((item) => item.type === "answer").length;
  const articleCount = items.filter((item) => item.type === "article").length;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/svg+xml" href="${escapeAttr(iconHref)}">
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
      margin: 0;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .collection-nav-head {
      align-items: center;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      margin: 0 0 8px;
    }
    .collection-nav-tools { display: flex; gap: 4px; }
    .collection-nav-icon {
      align-items: center;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      height: 28px;
      justify-content: center;
      justify-self: end;
      line-height: 1;
      width: 28px;
      padding: 0;
    }
    .collection-nav-icon:hover {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .collection-nav [hidden] { display: none !important; }
    .collection-nav :is(button, input):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .collection-editor-rows { display: grid; gap: 8px; max-height: calc(min(70vh, 520px) - 130px); overflow-y: auto; padding: 3px; }
    .collection-editor-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; min-height: 34px; }
    .collection-editor-row input { box-sizing: border-box; width: 100%; min-width: 0; padding: 7px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); font: inherit; font-size: 14px; }
    .collection-editor-row input:hover { border-color: #9fbbe0; }
    .collection-editor-row input[aria-invalid="true"] { border-color: #d92d20; }
    .collection-editor-error { grid-column: 1 / -1; color: #b42318; font-size: 12px; margin: 4px 0 0; overflow-wrap: anywhere; }
    .collection-editor-error:empty, .collection-editor-status:empty { display: none; }
    .collection-editor-status { color: var(--muted); font-size: 12px; margin: 10px 0; }
    .collection-editor-actions { display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--border); margin-top: 12px; padding-top: 12px; }
    .collection-editor-actions button { border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--muted); font: inherit; font-size: 13px; padding: 7px 15px; cursor: pointer; }
    .collection-editor-actions button:hover { background: #f3f6fa; color: var(--text); }
    .collection-editor-actions [data-collection-save] { border-color: var(--accent); background: var(--accent); color: white; }
    .collection-editor-actions [data-collection-save]:hover { background: #075bd2; color: white; }
    .collection-nav button:disabled { opacity: .5; cursor: default; }
    .collection-nav-list {
      display: grid;
      gap: 4px;
      max-height: calc(min(70vh, 520px) - 44px);
      overflow-y: auto;
      padding-right: 2px;
    }
    .collection-nav-list > button {
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
    .collection-nav-list > button:hover,
    .collection-nav-list > button[aria-pressed="true"] {
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
      position: relative;
      padding-right: 74px;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 30px;
      line-height: 1.25;
    }
    .summary {
      display: grid;
      gap: 4px;
      margin: 0;
    }
    .summary-row {
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
    .header-menu-wrap {
      position: absolute;
      right: 24px;
      bottom: 22px;
    }
    .archive-refresh {
      position: absolute;
      top: 22px;
      right: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      padding: 6px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: #8492a6;
      cursor: pointer;
    }
    .archive-refresh:hover { background: var(--accent-soft); color: var(--accent); }
    .archive-refresh:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .archive-refresh:disabled { cursor: wait; color: var(--accent); }
    .archive-refresh svg { width: 22px; height: 22px; }
    .archive-refresh[aria-busy="true"] svg { animation: archive-refresh-spin 1s linear infinite; }
    @keyframes archive-refresh-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) {
      .archive-refresh[aria-busy="true"] svg { animation: none; }
    }
    .archive-notice {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 20;
      width: max-content;
      max-width: min(420px, calc(100vw - 32px));
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border: 1px solid #abefc6;
      border-radius: 8px;
      background: #ecfdf3;
      color: #067647;
      font-size: 14px;
      box-shadow: 0 4px 16px rgba(16, 24, 40, .12);
    }
    .archive-notice[hidden] { display: none; }
    .archive-notice[data-kind="error"] { background: #fef3f2; border-color: #fecdca; color: #b42318; }
    .archive-notice-message { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .archive-notice-close {
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      font-size: 20px;
      padding: 0 6px;
    }
    .header-menu-button {
      align-items: center;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: #8492a6;
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-weight: 700;
      height: 28px;
      justify-content: center;
      min-width: 34px;
      padding: 0 9px;
    }
    .header-menu-button:hover,
    .header-menu-button[aria-expanded="true"] {
      background: #f2f4f7;
      color: var(--accent);
    }
    .header-menu {
      position: absolute;
      right: 0;
      top: 34px;
      z-index: 5;
      width: 178px;
      padding: 6px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 10px 28px rgba(16, 24, 40, .14);
    }
    .header-menu[hidden] {
      display: none;
    }
    .header-menu button {
      display: block;
      width: 100%;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--text);
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      padding: 7px 9px;
      text-align: left;
    }
    .header-menu button:hover {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto auto;
      gap: 12px;
      align-items: center;
      padding: 14px;
      margin-bottom: 14px;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    .search-controls {
      display: flex;
      min-width: 0;
    }
    .search-mode {
      border: 1px solid var(--border);
      border-right: 0;
      border-radius: 6px 0 0 6px;
      background: #fff;
      color: var(--text);
      cursor: pointer;
      font: inherit;
      padding: 8px;
    }
    .search {
      width: 100%;
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: 0;
      font: inherit;
      padding: 8px 10px;
      background: #fff;
    }
    .search-button {
      flex-shrink: 0;
      border: 1px solid var(--accent);
      border-radius: 0 6px 6px 0;
      background: var(--accent-soft);
      color: var(--accent);
      cursor: pointer;
      font: inherit;
      padding: 8px 12px;
    }
    .search-button:hover { background: #dceaff; }
    .search-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .sort-controls {
      align-items: center;
      display: flex;
      gap: 8px;
      white-space: nowrap;
    }
    .sort-controls label {
      color: var(--muted);
    }
    .sort-select,
    .sort-direction {
      border: 1px solid var(--border);
      border-radius: 6px;
      background: #fff;
      color: var(--text);
      font: inherit;
      padding: 6px 10px;
    }
    .sort-direction {
      cursor: pointer;
    }
    .sort-select:hover,
    .sort-direction:hover {
      border-color: var(--accent);
      color: var(--accent);
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
      .sort-controls {
        flex-wrap: wrap;
      }
    }
  </style>
</head>
<body>
  ${renderCollectionNav({ collections, totalCount: items.length })}
  <main>
    <header class="header">
      <h1>知乎保存导航</h1>
      <button class="archive-refresh" type="button" id="archive-refresh" title="刷新归档" aria-label="刷新归档" aria-busy="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 7v5h-5"/><path d="M20 12a8 8 0 1 0-2.34 5.66"/></svg>
      </button>
      <div class="summary">
        <p class="summary-row">
          <span>总数：<strong>${items.length}</strong></span>
          <span>回答：<strong>${answerCount}</strong></span>
          <span>文章：<strong>${articleCount}</strong></span>
        </p>
        <p class="summary-row">
          <span>收藏夹：<strong id="current-collection">所有</strong></span>
          <span>当前显示：<strong id="visible-count">${items.length}</strong></span>
          <span>描述：<strong id="current-collection-description">全部收藏夹内容</strong></span>
        </p>
      </div>
      <div class="header-menu-wrap">
        <button class="header-menu-button" type="button" id="header-menu-button" aria-expanded="false" aria-label="收藏夹操作菜单">...</button>
        <div class="header-menu" id="header-menu" hidden>
          <button type="button" data-edit-action="edit-collection-description">修改收藏夹描述</button>
          <button type="button" data-edit-action="create-collection">新建收藏夹</button>
        </div>
      </div>
    </header>
    <div class="archive-notice" id="archive-notice" hidden>
      <span class="archive-notice-message" id="archive-notice-message" role="status" aria-live="polite" aria-atomic="true"></span>
      <button class="archive-notice-close" id="archive-notice-close" type="button" aria-label="关闭刷新提示">×</button>
    </div>
    <section class="toolbar" aria-label="筛选和排序">
      <div class="search-controls">
        <select id="search-mode" class="search-mode" aria-label="搜索范围">
          <option value="title">标题</option>
          <option value="author">作者</option>
        </select>
        <input id="search" class="search" type="search" placeholder="搜索标题…" aria-label="搜索标题">
        <button id="search-button" class="search-button" type="button">搜索</button>
      </div>
      <div class="sort-controls">
        <label for="sort-field">排序</label>
        <select id="sort-field" class="sort-select">
          <option value="exported" selected>导出时间</option>
          <option value="created">创建时间</option>
          <option value="modified">修改时间</option>
          <option value="upvote">赞同</option>
          <option value="like">喜欢</option>
          <option value="favorite">收藏</option>
          <option value="comment">评论</option>
          <option value="questionAnswers">问题回答数</option>
          <option value="questionFollowers">问题关注数</option>
        </select>
        <button id="sort-direction" class="sort-direction" type="button" aria-pressed="true" aria-label="当前降序，点击切换为升序">↓ 降序</button>
      </div>
      <div class="filters">
        <button type="button" data-filter="all" aria-pressed="true">全部</button>
        <button type="button" data-filter="answer" aria-pressed="false">回答</button>
        <button type="button" data-filter="article" aria-pressed="false">文章</button>
      </div>
    </section>
    <p id="sort-scope" role="status" hidden>当前按问题统计排序，仅显示回答。</p>
    <section class="feed" id="content-list">
      ${items.length ? items.map((item) => renderContentCard(item, { mode: "feed" })).join("") : `<div class="empty">没有找到可渲染的内容文件夹。</div>`}
    </section>
    <nav class="pagination" id="pagination" aria-label="分页"></nav>
  </main>
  <script>
${renderCardScript()}

${compareSortableValues.toString()}

${initializeArchiveRefresh.toString()}

${initializeCollectionEditor.toString()}

    const PAGE_SIZE = ${PAGE_SIZE};
    const searchInput = document.getElementById("search");
    const searchMode = document.getElementById("search-mode");
    const searchButton = document.getElementById("search-button");
    const visibleCount = document.getElementById("visible-count");
    const currentCollection = document.getElementById("current-collection");
    const currentCollectionDescription = document.getElementById("current-collection-description");
    const contentList = document.getElementById("content-list");
    const headerMenuButton = document.getElementById("header-menu-button");
    const headerMenu = document.getElementById("header-menu");
    const pagination = document.getElementById("pagination");
    const sortFieldSelect = document.getElementById("sort-field");
    const sortDirectionButton = document.getElementById("sort-direction");
    const sortScope = document.getElementById("sort-scope");
    const cards = Array.from(document.querySelectorAll(".item"));
    const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
    const collectionButtons = Array.from(document.querySelectorAll("[data-collection-filter]"));
    const sortDataKeys = {
      exported: "sortExported",
      created: "sortCreated",
      modified: "sortModified",
      upvote: "sortUpvote",
      like: "sortLike",
      favorite: "sortFavorite",
      comment: "sortComment",
      questionAnswers: "sortQuestionAnswers",
      questionFollowers: "sortQuestionFollowers"
    };
    let activeFilter = "all";
    let activeCollection = "all";
    let activeSortField = "exported";
    let sortDescending = true;
    let currentPage = 1;
    let appliedSearchMode = "title";
    let appliedSearchQuery = "";

    function applyFilters() {
      const answersOnly = activeSortField === "questionAnswers" || activeSortField === "questionFollowers";
      sortScope.hidden = !answersOnly;
      const matchedCards = cards.filter((card) => {
        const matchesType = activeFilter === "all" || card.dataset.type === activeFilter;
        const matchesCollection = activeCollection === "all" || card.dataset.collection === activeCollection;
        const searchValue = appliedSearchMode === "title" ? card.dataset.searchTitle : card.dataset.searchAuthor;
        const matchesQuery = searchValue.toLowerCase().includes(appliedSearchQuery);
        return matchesType && matchesCollection && matchesQuery && (!answersOnly || card.dataset.type === "answer");
      }).sort(compareCards);

      contentList.append(...matchedCards);

      const totalPages = Math.max(1, Math.ceil(matchedCards.length / PAGE_SIZE));
      if (currentPage > totalPages) {
        currentPage = totalPages;
      }

      const start = (currentPage - 1) * PAGE_SIZE;
      const visibleCards = new Set(matchedCards.slice(start, start + PAGE_SIZE));
      for (const card of cards) {
        card.hidden = !visibleCards.has(card);
        const collectionSource = card.querySelector("[data-collection-source]");
        if (collectionSource) {
          collectionSource.hidden = activeCollection !== "all";
        }
      }

      visibleCount.textContent = String(matchedCards.length);
      currentCollection.textContent = activeCollection === "all" ? "所有" : activeCollection;
      currentCollectionDescription.textContent = activeCollectionDescription();
      syncHeaderMenu();
      renderPagination(totalPages);
    }

    function compareCards(left, right) {
      const primary = compareSortableValues(
        left.dataset[sortDataKeys[activeSortField]],
        right.dataset[sortDataKeys[activeSortField]],
        sortDescending
      );
      if (primary !== 0) {
        return primary;
      }

      const exported = compareSortableValues(left.dataset.sortExported, right.dataset.sortExported, true);
      if (exported !== 0) {
        return exported;
      }

      return (left.dataset.folder || "").localeCompare(right.dataset.folder || "", "zh-Hans-CN");
    }

    function syncSortDirectionButton() {
      sortDirectionButton.textContent = sortDescending ? "↓ 降序" : "↑ 升序";
      sortDirectionButton.setAttribute("aria-pressed", String(sortDescending));
      sortDirectionButton.setAttribute(
        "aria-label",
        sortDescending ? "当前降序，点击切换为升序" : "当前升序，点击切换为降序"
      );
    }

    function activeCollectionDescription() {
      const button = collectionButtons.find((item) => item.dataset.collectionFilter === activeCollection);
      return button?.dataset.collectionDescription || "暂无收藏夹描述";
    }

    function activeCollectionRawDescription() {
      const button = collectionButtons.find((item) => item.dataset.collectionFilter === activeCollection);
      return button?.dataset.collectionRawDescription || "";
    }

    function syncHeaderMenu() {
      const collectionOnly = activeCollection !== "all";
      headerMenu.querySelector('[data-edit-action="edit-collection-description"]').hidden = !collectionOnly;
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

    searchButton.addEventListener("click", () => {
      appliedSearchMode = searchMode.value;
      appliedSearchQuery = searchInput.value.trim().toLowerCase();
      resetToFirstPage();
      applyFilters();
    });
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        searchButton.click();
      }
    });
    searchMode.addEventListener("change", () => {
      const label = searchMode.value === "title" ? "搜索标题" : "搜索作者";
      searchInput.placeholder = label + "…";
      searchInput.setAttribute("aria-label", label);
    });
    sortFieldSelect.addEventListener("change", () => {
      activeSortField = sortFieldSelect.value;
      sortDescending = true;
      syncSortDirectionButton();
      resetToFirstPage();
      applyFilters();
    });
    sortDirectionButton.addEventListener("click", () => {
      sortDescending = !sortDescending;
      syncSortDirectionButton();
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


    document.addEventListener("click", (event) => {
      const headerButton = event.target.closest?.("#header-menu-button");
      if (headerButton) {
        event.preventDefault();
        toggleFloatingMenu(headerMenuButton, headerMenu);
        return;
      }

      const itemButton = event.target.closest?.("[data-item-menu-button]");
      if (itemButton) {
        event.preventDefault();
        const menu = itemButton.closest(".item-menu-wrap").querySelector("[data-item-menu]");
        resetItemMenu(menu);
        toggleFloatingMenu(itemButton, menu);
        return;
      }

      const editButton = event.target.closest?.("[data-edit-action]");
      if (editButton) {
        event.preventDefault();
        handleEditAction(editButton).catch((error) => {
          alert(error.message);
        });
        return;
      }

      if (!event.target.closest?.(".header-menu, .item-menu")) {
        closeFloatingMenus();
      }
    });

    function toggleFloatingMenu(button, menu) {
      const willOpen = menu.hidden;
      closeFloatingMenus();
      menu.hidden = !willOpen;
      button.setAttribute("aria-expanded", String(willOpen));
      if (willOpen && menu === headerMenu) {
        syncHeaderMenu();
      }
    }

    function closeFloatingMenus() {
      headerMenu.hidden = true;
      headerMenuButton.setAttribute("aria-expanded", "false");
      document.querySelectorAll("[data-item-menu]").forEach((menu) => {
        menu.hidden = true;
      });
      document.querySelectorAll("[data-item-menu-button]").forEach((button) => {
        button.setAttribute("aria-expanded", "false");
      });
    }

    function resetItemMenu(menu) {
      menu.classList.remove("item-menu--move");
      menu.innerHTML = '<button type="button" data-edit-action="move-item">移动</button><button type="button" data-edit-action="delete-item">删除</button>';
    }

    async function handleEditAction(button) {
      const action = button.dataset.editAction;
      if (action === "create-collection") {
        await createCollection();
        return;
      }
      if (action === "edit-collection-description") {
        await editCollectionDescription(activeCollection);
        return;
      }
      if (action === "delete-item") {
        await deleteItem(button.closest(".item"));
        return;
      }
      if (action === "move-item") {
        await showMoveTargets(button.closest(".item"), button.closest("[data-item-menu]"));
        return;
      }
      if (action === "move-item-to") {
        await moveItem(button.closest(".item"), button.dataset.targetCollection);
      }
    }

    async function createCollection() {
      const name = prompt("新建收藏夹名称");
      if (name === null) {
        return;
      }
      await apiRequest("/api/collections", {
        method: "POST",
        body: { name, description: "" }
      });
      location.reload();
    }

    async function editCollectionDescription(collectionName, rawDescription = activeCollectionRawDescription()) {
      if (collectionName === "all") {
        alert("请先选择一个具体收藏夹。");
        return;
      }
      const description = prompt("收藏夹描述", rawDescription || "");
      if (description === null) {
        return;
      }
      await apiRequest(\`/api/collections/\${encodeURIComponent(collectionName)}\`, {
        method: "PATCH",
        body: { description }
      });
      location.reload();
    }

    async function deleteItem(card) {
      const title = card.querySelector(".title")?.textContent?.trim() || card.dataset.folder;
      if (!confirm(\`确定永久删除“\${title}”吗？此操作不能撤销。\`)) {
        return;
      }
      await apiRequest(itemApiPath(card), { method: "DELETE" });
      location.reload();
    }

    async function showMoveTargets(card, menu) {
      const result = await apiRequest("/api/collections");
      const targets = result.collections.filter((collection) => collection.name !== card.dataset.collection);
      menu.classList.add("item-menu--move");
      menu.replaceChildren();
      const title = document.createElement("span");
      title.className = "item-menu-title";
      title.textContent = "移动到收藏夹";
      menu.append(title);

      const list = document.createElement("span");
      list.className = "item-menu-scroll";
      menu.append(list);

      if (!targets.length) {
        const empty = document.createElement("span");
        empty.className = "item-menu-title";
        empty.textContent = "没有其它收藏夹";
        list.append(empty);
        return;
      }

      for (const collection of targets) {
        const item = document.createElement("button");
        item.type = "button";
        item.dataset.editAction = "move-item-to";
        item.dataset.targetCollection = collection.name;
        item.textContent = collection.name;
        list.append(item);
      }
    }

    async function moveItem(card, targetCollection) {
      await apiRequest(\`\${itemApiPath(card)}/move\`, {
        method: "POST",
        body: { targetCollection }
      });
      location.reload();
    }

    function itemApiPath(card) {
      return \`/api/items/\${encodeURIComponent(card.dataset.collection)}/\${encodeURIComponent(card.dataset.folder)}\`;
    }

    async function apiRequest(url, options = {}) {
      if (location.protocol === "file:") {
        throw new Error("请通过 npm run render:serve 打开导航页后再使用编辑功能。");
      }

      const response = await fetch(url, {
        method: options.method || "GET",
        headers: options.body ? { "content-type": "application/json" } : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new Error(data.error || "本地编辑操作失败。");
      }
      return data;
    }

    initializeArchiveRefresh(document, window, apiRequest);
    const restoredCollection = window.sessionStorage.getItem("zhmd-selected-collection");
    window.sessionStorage.removeItem("zhmd-selected-collection");
    if (collectionButtons.some(button => button.dataset.collectionFilter === restoredCollection)) {
      activeCollection = restoredCollection;
      collectionButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.collectionFilter === activeCollection)));
    }
    initializeCollectionEditor(document, apiRequest, (oldName, newName) => {
      if (activeCollection === oldName) activeCollection = newName;
    }, () => {
      window.sessionStorage.setItem("zhmd-selected-collection", activeCollection);
      location.reload();
    });
    applyFilters();
  </script>
</body>
</html>
`;
}

export function initializeArchiveRefresh(document, window, apiRequest) {
  const button = document.getElementById("archive-refresh");
  const banner = document.getElementById("archive-notice");
  const message = document.getElementById("archive-notice-message");
  const close = document.getElementById("archive-notice-close");
  const successKey = "zhihu-archive-kit:refresh-success";
  let dismissTimer;

  function dismiss() {
    window.clearTimeout(dismissTimer);
    banner.hidden = true;
    message.textContent = "";
  }

  function showNotice(text, kind) {
    dismiss();
    banner.dataset.kind = kind;
    message.setAttribute("role", kind === "error" ? "alert" : "status");
    message.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
    banner.hidden = false;
    message.textContent = text;
    if (kind === "success") dismissTimer = window.setTimeout(dismiss, 4000);
  }

  close.addEventListener("click", dismiss);
  if (window.location.protocol !== "file:" && window.sessionStorage.getItem(successKey) === "1") {
    window.sessionStorage.removeItem(successKey);
    showNotice("归档已刷新，页面内容已更新。", "success");
  }

  button.addEventListener("click", async () => {
    if (button.disabled) return;
    dismiss();
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.setAttribute("aria-label", "正在刷新归档…");
    button.title = "正在刷新归档…";
    try {
      await apiRequest("/api/refresh", { method: "POST" });
      window.sessionStorage.setItem(successKey, "1");
      window.location.reload();
    } catch (error) {
      showNotice("刷新归档失败：" + error.message, "error");
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
      button.setAttribute("aria-label", "刷新归档");
      button.title = "刷新归档";
    }
  });
}

export function initializeCollectionEditor(document, apiRequest, renamed, reload) {
  const nav = document.querySelector(".collection-nav");
  const edit = document.getElementById("collection-edit");
  const form = document.getElementById("collection-editor");
  const list = nav.querySelector(".collection-nav-list");
  const rows = form.querySelector(".collection-editor-rows");
  const status = form.querySelector(".collection-editor-status");
  const save = form.querySelector("[data-collection-save]");
  const cancel = form.querySelector("[data-collection-cancel]");
  const tools = nav.querySelector(".collection-nav-tools");
  const title = nav.querySelector(".collection-nav-title");
  let drafts = [];
  let applied = false;

  function finish() {
    if (applied) { reload(); return; }
    form.hidden = true;
    list.hidden = false;
    tools.hidden = false;
    title.textContent = "收藏夹";
    edit.setAttribute("aria-expanded", "false");
    edit.focus();
  }

  edit.addEventListener("click", () => {
    rows.replaceChildren();
    drafts = [];
    applied = false;
    status.textContent = "";
    for (const button of list.querySelectorAll("[data-collection-filter]")) {
      const original = button.dataset.collectionFilter;
      const row = document.createElement("div");
      row.className = "collection-editor-row";
      if (original === "all" || original === "默认收藏夹") {
        const label = document.createElement("span");
        label.textContent = original === "all" ? "所有" : original;
        row.append(label);
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.value = original;
        input.setAttribute("aria-label", "收藏夹名称：" + original);
        const error = document.createElement("p");
        error.className = "collection-editor-error";
        error.id = "collection-name-error-" + drafts.length;
        input.setAttribute("aria-describedby", error.id);
        drafts.push({ original, input, error });
        row.append(input);
      }
      const count = button.querySelector(".collection-nav-count").cloneNode(true);
      row.append(count);
      if (drafts.at(-1)?.input === row.firstChild) row.append(drafts.at(-1).error);
      rows.append(row);
    }
    list.hidden = true;
    tools.hidden = true;
    form.hidden = false;
    title.textContent = "编辑收藏夹名称";
    edit.setAttribute("aria-expanded", "true");
    (drafts[0]?.input || cancel).focus();
  });
  cancel.addEventListener("click", finish);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (save.disabled) return;
    let invalid = false;
    for (const draft of drafts) {
      const name = draft.input.value.trim();
      let message = "";
      if (!name || name === "." || name === ".." || name.startsWith("_") || /[<>:"/\\|?*\u0000-\u001f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)) {
        message = "请输入有效的文件夹名称。";
      } else if (["all", "所有", "默认收藏夹"].includes(name) || drafts.some(other => other !== draft && (other.input.value.trim().toLowerCase() === name.toLowerCase() || other.original.toLowerCase() === name.toLowerCase()))) {
        message = "名称已被占用，请使用不同名称。";
      }
      draft.error.textContent = message;
      draft.input.setAttribute("aria-invalid", String(Boolean(message)));
      invalid ||= Boolean(message);
    }
    if (invalid) { drafts.find(draft => draft.error.textContent).input.focus(); return; }
    save.disabled = cancel.disabled = true;
    drafts.forEach(draft => { draft.input.disabled = true; });
    save.textContent = "保存中…";
    status.textContent = "";
    try {
      for (const draft of drafts) {
        const name = draft.input.value.trim();
        if (name === draft.original) continue;
        try {
          await apiRequest("/api/collections/" + encodeURIComponent(draft.original), { method: "PATCH", body: { name } });
        } catch (error) {
          draft.error.textContent = error.message;
          draft.input.setAttribute("aria-invalid", "true");
          status.textContent = applied ? "部分名称已保存，其余修改已保留，可重试或取消剩余修改。" : "保存失败，修改已保留，请重试。";
          return;
        }
        renamed(draft.original, name);
        draft.original = name;
        draft.input.value = name;
        applied = true;
      }
      finish();
    } finally {
      save.disabled = cancel.disabled = false;
      drafts.forEach(draft => { draft.input.disabled = false; });
      save.textContent = "保存";
    }
  });
}

function renderCollectionNav({ collections, totalCount }) {
  return `
  <aside class="collection-nav" aria-label="收藏夹">
    <div class="collection-nav-head">
      <p class="collection-nav-title">收藏夹</p>
      <div class="collection-nav-tools">
        <button class="collection-nav-icon" id="collection-edit" type="button" title="编辑收藏夹名称" aria-label="编辑收藏夹名称" aria-expanded="false"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/></svg></button>
        <button class="collection-nav-icon" type="button" data-edit-action="create-collection" title="新建收藏夹" aria-label="新建收藏夹"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
      </div>
    </div>
    <div class="collection-nav-list">
      <button type="button" data-collection-filter="all" data-collection-description="全部收藏夹内容" data-collection-raw-description="" aria-pressed="true" title="所有">
        <span>所有</span><span class="collection-nav-count">${escapeHtml(totalCount)}</span>
      </button>
      ${collections.map((collection) => `
        <button type="button" data-collection-filter="${escapeAttr(collection.name)}" data-collection-description="${escapeAttr(collectionDescriptionText(collection))}" data-collection-raw-description="${escapeAttr(collection.description.trim())}" aria-pressed="false" title="${escapeAttr(collectionTooltip(collection))}">
          <span>${escapeHtml(collection.name)}</span><span class="collection-nav-count">${escapeHtml(collection.count)}</span>
        </button>
      `).join("")}
    </div>
    <form id="collection-editor" hidden><div class="collection-editor-rows"></div><p class="collection-editor-status" role="status"></p><div class="collection-editor-actions"><button type="button" data-collection-cancel>取消</button><button type="submit" data-collection-save>保存</button></div></form>
  </aside>
  `;
}

function collectionTooltip(collection) {
  return collection.description.trim() || collection.name;
}

function collectionDescriptionText(collection) {
  return collection.description.trim() || "暂无收藏夹描述";
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function isInternalDirectoryName(name) {
  return String(name || "").startsWith(INTERNAL_DIRECTORY_PREFIX);
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
