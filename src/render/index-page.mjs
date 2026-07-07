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
import { parseMarkdownDocument, renderSavedFolder } from "./render.mjs";

const INDEX_FILE = "index.html";
const COLLECTION_METADATA_FILE = "collection.json";
const DEFAULT_COLLECTION_NAME = "默认收藏夹";
const PAGE_SIZE = 20;
const INTERNAL_DIRECTORY_PREFIX = "_";

/**
 * Build a lightweight static navigation page for saved Zhihu content.
 */
export async function renderOutputIndex(rootPath = "output") {
  const root = path.resolve(rootPath);
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
    collections
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

function renderIndexDocument({ items, collections }) {
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
      margin: 0;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .collection-nav-head {
      align-items: center;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 24px;
      gap: 8px;
      margin: 0 0 8px;
    }
    .collection-nav-add {
      align-items: center;
      border: 0;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      height: 24px;
      justify-content: center;
      justify-self: end;
      line-height: 1;
      width: 24px;
    }
    .collection-nav-add:hover {
      background: #dcecff;
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
    .collection-context-menu {
      position: fixed;
      z-index: 6;
      width: 178px;
      padding: 6px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 10px 28px rgba(16, 24, 40, .14);
    }
    .collection-context-menu[hidden] {
      display: none;
    }
    .collection-context-menu button {
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
    .collection-context-menu button:hover {
      background: var(--accent-soft);
      color: var(--accent);
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
          <button type="button" data-edit-action="rename-collection">修改收藏夹名称</button>
          <button type="button" data-edit-action="edit-collection-description">修改收藏夹描述</button>
          <button type="button" data-edit-action="create-collection">新建收藏夹</button>
        </div>
      </div>
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
    const currentCollectionDescription = document.getElementById("current-collection-description");
    const headerMenuButton = document.getElementById("header-menu-button");
    const headerMenu = document.getElementById("header-menu");
    const collectionContextMenu = document.getElementById("collection-context-menu");
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
      currentCollectionDescription.textContent = activeCollectionDescription();
      syncHeaderMenu();
      renderPagination(totalPages);
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
      headerMenu.querySelector('[data-edit-action="rename-collection"]').hidden = !collectionOnly;
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

    document.addEventListener("contextmenu", (event) => {
      const button = event.target.closest?.("[data-collection-filter]");
      if (!button || button.dataset.collectionFilter === "all") {
        return;
      }

      event.preventDefault();
      closeFloatingMenus();
      collectionContextMenu.dataset.collection = button.dataset.collectionFilter;
      collectionContextMenu.dataset.rawDescription = button.dataset.collectionRawDescription || "";
      showCollectionContextMenu(event.clientX, event.clientY);
    });

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

      if (!event.target.closest?.(".header-menu, .item-menu, .collection-context-menu")) {
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
      collectionContextMenu.hidden = true;
    }

    function resetItemMenu(menu) {
      menu.classList.remove("item-menu--move");
      menu.innerHTML = '<button type="button" data-edit-action="move-item">移动</button><button type="button" data-edit-action="delete-item">删除</button>';
    }

    function showCollectionContextMenu(clientX, clientY) {
      collectionContextMenu.hidden = false;
      collectionContextMenu.style.left = "0px";
      collectionContextMenu.style.top = "0px";
      const rect = collectionContextMenu.getBoundingClientRect();
      const left = Math.max(8, Math.min(clientX, window.innerWidth - rect.width - 8));
      const top = Math.max(8, Math.min(clientY, window.innerHeight - rect.height - 8));
      collectionContextMenu.style.left = \`\${left}px\`;
      collectionContextMenu.style.top = \`\${top}px\`;
    }

    async function handleEditAction(button) {
      const action = button.dataset.editAction;
      if (action === "create-collection") {
        await createCollection();
        return;
      }
      if (action === "rename-collection") {
        await renameCollection(button.closest("#collection-context-menu")?.dataset.collection || activeCollection);
        return;
      }
      if (action === "edit-collection-description") {
        await editCollectionDescription(
          button.closest("#collection-context-menu")?.dataset.collection || activeCollection,
          button.closest("#collection-context-menu")?.dataset.rawDescription
        );
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
      const description = prompt("收藏夹描述（可留空）", "");
      if (description === null) {
        return;
      }
      await apiRequest("/api/collections", {
        method: "POST",
        body: { name, description }
      });
      location.reload();
    }

    async function renameCollection(collectionName) {
      if (collectionName === "all") {
        alert("请先选择一个具体收藏夹。");
        return;
      }
      const name = prompt("新的收藏夹名称", collectionName);
      if (name === null) {
        return;
      }
      await apiRequest(\`/api/collections/\${encodeURIComponent(collectionName)}\`, {
        method: "PATCH",
        body: { name }
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

    applyFilters();
  </script>
</body>
</html>
`;
}

function renderCollectionNav({ collections, totalCount }) {
  return `
  <aside class="collection-nav" aria-label="收藏夹">
    <div class="collection-nav-head">
      <p class="collection-nav-title">收藏夹</p>
      <button class="collection-nav-add" type="button" data-edit-action="create-collection" aria-label="新建收藏夹">+</button>
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
  </aside>
  <div class="collection-context-menu" id="collection-context-menu" hidden>
    <button type="button" data-edit-action="rename-collection">修改收藏夹名称</button>
    <button type="button" data-edit-action="edit-collection-description">修改收藏夹描述</button>
  </div>`;
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
