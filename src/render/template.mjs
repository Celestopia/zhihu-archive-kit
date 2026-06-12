import { renderCardCss, renderCardScript } from "./card-template.mjs";
import { escapeHtml } from "./html-utils.mjs";

export { escapeAttr, escapeHtml } from "./html-utils.mjs";

/**
 * Render the standalone preview page shell. The content itself is a shared
 * card, so preview pages and the navigation page keep the same structure.
 */
export function renderHtmlDocument({ title, cardHtml }) {
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
      line-height: 1.7;
    }
    main {
      width: min(980px, calc(100% - 32px));
      margin: 28px auto 56px;
    }
    ${renderCardCss()}
  </style>
</head>
<body>
  <main>
    <section class="feed feed--preview">
      ${cardHtml}
    </section>
  </main>
  <script>
${renderCardScript()}
  </script>
</body>
</html>
`;
}
