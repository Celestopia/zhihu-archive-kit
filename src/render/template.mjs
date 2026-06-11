export function renderHtmlDocument({ title, metadataHtml, bodyHtml, commentsHtml }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title || "知乎内容预览")}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #1f2328;
      --muted: #667085;
      --border: #d8dee8;
      --accent: #1677ff;
      --quote: #eef4ff;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      line-height: 1.7;
    }
    main {
      width: min(920px, calc(100% - 32px));
      margin: 32px auto 56px;
    }
    .doc-header,
    .content,
    .comments {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 24px;
    }
    .doc-header {
      margin-bottom: 16px;
    }
    .doc-title {
      margin: 0 0 14px;
      font-size: 28px;
      line-height: 1.35;
    }
    .meta-list {
      color: var(--muted);
      font-size: 14px;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .meta-list li {
      display: flex;
      gap: 8px;
      padding: 3px 0;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .meta-list strong {
      flex: 0 0 auto;
      color: #53627a;
    }
    .meta-list span {
      min-width: 0;
    }
    .meta-list a {
      color: var(--accent);
      text-decoration: none;
    }
    .content {
      margin-bottom: 18px;
      overflow-wrap: anywhere;
    }
    .content img,
    .comment-image {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
    }
    .content pre {
      overflow-x: auto;
      padding: 14px;
      background: #f2f4f7;
      border-radius: 6px;
    }
    .content code {
      font-family: "Cascadia Code", Consolas, monospace;
    }
    .content blockquote {
      margin-left: 0;
      padding: 8px 14px;
      border-left: 4px solid var(--accent);
      background: var(--quote);
      color: #344054;
    }
    .content table {
      width: 100%;
      border-collapse: collapse;
    }
    .content th,
    .content td {
      border: 1px solid var(--border);
      padding: 6px 8px;
    }
    .comments {
      padding: 0;
      overflow: hidden;
    }
    .comments summary {
      cursor: pointer;
      padding: 18px 24px;
      font-weight: 700;
      user-select: none;
    }
    .comment-tools {
      display: flex;
      gap: 8px;
      padding: 0 24px 16px;
    }
    .comment-tools button {
      border: 1px solid var(--border);
      border-radius: 4px;
      background: #fff;
      color: var(--text);
      cursor: pointer;
      padding: 5px 10px;
    }
    .comment-list {
      padding: 0 24px 24px;
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
    .empty {
      padding: 0 24px 24px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <main>
    <header class="doc-header">
      <h1 class="doc-title">${escapeHtml(title || "知乎内容预览")}</h1>
      <ul class="meta-list">${metadataHtml}</ul>
    </header>
    <article class="content">${bodyHtml}</article>
    <details class="comments">
      <summary>评论区</summary>
      <div class="comment-tools">
        <button type="button" data-action="expand-comments">展开全部</button>
        <button type="button" data-action="collapse-comments">收起全部</button>
      </div>
      ${commentsHtml}
    </details>
  </main>
  <script>
    document.addEventListener("click", (event) => {
      const action = event.target?.getAttribute?.("data-action");
      if (action === "expand-comments") {
        document.querySelectorAll(".comment-replies").forEach((el) => { el.open = true; });
      }
      if (action === "collapse-comments") {
        document.querySelectorAll(".comment-replies").forEach((el) => { el.open = false; });
      }
    });
  </script>
</body>
</html>
`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
