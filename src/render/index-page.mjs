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
import { escapeHtml } from "./html-utils.mjs";
import { parseMarkdownDocument, renderSavedFolder } from "./render.mjs";

const INDEX_FILE = "index.html";

/**
 * Build a lightweight static navigation page for saved Zhihu content.
 */
export async function renderOutputIndex(rootPath = "output") {
  const root = path.resolve(rootPath);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const items = [];

  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const folderPath = path.join(root, entry.name);
    const indexPath = path.join(folderPath, "index.md");
    const commentsPath = path.join(folderPath, "comments.json");

    if (!await isFile(indexPath) || !await isFile(commentsPath)) {
      continue;
    }

    const indexMarkdown = await fs.readFile(indexPath, "utf8");
    const commentsJson = JSON.parse(await fs.readFile(commentsPath, "utf8"));
    const parsed = parseMarkdownDocument(indexMarkdown);
    const summary = extractSummary(parsed.body);
    const previewPath = await renderSavedFolder(folderPath);
    const type = commentsJson.target?.type === "article" ? "article" : "answer";

    items.push({
      previewHref: toPosixPath(path.relative(root, previewPath)),
      type,
      title: parsed.metadata.title || entry.name,
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
  }

  items.sort((a, b) => sortTime(b.timeExported) - sortTime(a.timeExported));

  const outputPath = path.join(root, INDEX_FILE);
  await fs.writeFile(outputPath, renderIndexDocument({
    items,
    generatedAt: new Date()
  }), "utf8");
  return outputPath;
}

function renderIndexDocument({ items, generatedAt }) {
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
    ${renderCardCss()}
    @media (max-width: 720px) {
      .toolbar {
        grid-template-columns: 1fr;
        position: static;
      }
    }
  </style>
</head>
<body>
  <main>
    <header class="header">
      <h1>知乎保存导航</h1>
      <p class="summary">
        <span>总数：<strong>${items.length}</strong></span>
        <span>回答：<strong>${answerCount}</strong></span>
        <span>文章：<strong>${articleCount}</strong></span>
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
  </main>
  <script>
${renderCardScript()}

    const searchInput = document.getElementById("search");
    const visibleCount = document.getElementById("visible-count");
    const cards = Array.from(document.querySelectorAll(".item"));
    const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
    let activeFilter = "all";

    function applyFilters() {
      const query = searchInput.value.trim().toLowerCase();
      let visible = 0;

      for (const card of cards) {
        const matchesType = activeFilter === "all" || card.dataset.type === activeFilter;
        const matchesQuery = !query || card.textContent.toLowerCase().includes(query);
        const show = matchesType && matchesQuery;
        card.hidden = !show;
        if (show) {
          visible += 1;
        }
      }

      visibleCount.textContent = String(visible);
    }

    searchInput.addEventListener("input", applyFilters);
    for (const button of filterButtons) {
      button.addEventListener("click", () => {
        activeFilter = button.dataset.filter;
        for (const item of filterButtons) {
          item.setAttribute("aria-pressed", String(item === button));
        }
        applyFilters();
      });
    }
  </script>
</body>
</html>
`;
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
