import fs from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import { escapeAttr, escapeHtml, renderHtmlDocument } from "./template.mjs";

const OUTPUT_FILE = "preview.html";

export async function renderSavedFolder(folderPath) {
  const root = path.resolve(folderPath);
  const indexPath = path.join(root, "index.md");
  const commentsPath = path.join(root, "comments.json");
  const outputPath = path.join(root, OUTPUT_FILE);

  await assertFile(indexPath, "index.md");
  await assertFile(commentsPath, "comments.json");

  const indexMarkdown = await fs.readFile(indexPath, "utf8");
  const commentsJson = JSON.parse(await fs.readFile(commentsPath, "utf8"));
  const parsed = parseMarkdownDocument(indexMarkdown);

  const html = renderHtmlDocument({
    title: parsed.metadata.title || commentsJson.target?.type || "",
    metadataHtml: renderMetadata(parsed.metadata),
    bodyHtml: marked.parse(parsed.body),
    commentsHtml: renderComments(commentsJson.comments || [])
  });

  await fs.writeFile(outputPath, html, "utf8");
  return outputPath;
}

export function parseMarkdownDocument(markdown) {
  if (!markdown.startsWith("---\n")) {
    throw new Error("index.md must start with frontmatter.");
  }

  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) {
    throw new Error("index.md frontmatter is not closed.");
  }

  return {
    metadata: parseFrontmatter(markdown.slice(4, end)),
    body: markdown.slice(end + 5).trim()
  };
}

export function parseFrontmatter(value) {
  const metadata = {};

  for (const line of value.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!match) {
      throw new Error(`Invalid frontmatter line: ${line}`);
    }

    metadata[match[1]] = parseFrontmatterValue(match[2]);
  }

  return metadata;
}

function parseFrontmatterValue(value) {
  const trimmed = value.trim();
  if (trimmed === "") {
    return "";
  }
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed.slice(1, -1).replace(/\\"/g, "\"");
  }
  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
}

function renderMetadata(metadata) {
  const items = [
    ["原文", linkValue(metadata.url, metadata.url)],
    ["作者", linkValue(metadata.author, metadata.author_url)],
    ["创建", timeValue(metadata.time_created)],
    ["修改", timeValue(metadata.time_modified)],
    ["导出", timeValue(metadata.time_exported)],
    ["赞同", countValue(metadata.upvote_count)],
    ["评论", countValue(metadata.comment_count)],
    ["喜欢", countValue(metadata.like_count)],
    ["收藏", countValue(metadata.favorite_count)]
  ];

  return items
    .filter(([, value]) => value !== "")
    .map(([label, value]) => `<li><strong>${escapeHtml(label)}：</strong><span>${value}</span></li>`)
    .join("");
}

function linkValue(text, href) {
  if (!text && !href) {
    return "";
  }
  if (!href) {
    return escapeHtml(text);
  }
  return `<a href="${escapeAttr(href)}">${escapeHtml(text || href)}</a>`;
}

function countValue(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return escapeHtml(value);
}

function timeValue(value) {
  if (!value) {
    return "";
  }

  const date = parseTimeValue(value);
  return date ? formatChinaTime(date) : escapeHtml(value);
}

function parseTimeValue(value) {
  const text = String(value).trim();
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
    hour12: false
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

function renderComments(comments) {
  if (!comments.length) {
    return `<div class="empty">暂无暂存评论。</div>`;
  }

  return `<div class="comment-list">${comments.map((comment) => renderComment(comment, 0)).join("")}</div>`;
}

function renderComment(comment, level) {
  const classes = ["comment-card"];
  if (level > 0) {
    classes.push("comment-card--child");
  }

  const author = comment.author_url
    ? `<a href="${escapeAttr(comment.author_url)}">${escapeHtml(comment.author || "匿名用户")}</a>`
    : escapeHtml(comment.author || "匿名用户");
  const replyTo = level > 0 && comment.reply_to_author
    ? ` 回复 ${comment.reply_to_author_url
      ? `<a href="${escapeAttr(comment.reply_to_author_url)}">${escapeHtml(comment.reply_to_author)}</a>`
      : escapeHtml(comment.reply_to_author)}`
    : "";
  const children = Array.isArray(comment.children) ? comment.children : [];

  return `
    <section class="${classes.join(" ")}">
      <div class="comment-head">
        <div class="comment-author">${author}${replyTo}</div>
        <div class="comment-meta">${renderCommentMeta(comment)}</div>
      </div>
      <div class="comment-body">${marked.parse(comment.content || "")}</div>
      ${comment.image_url ? `<img class="comment-image" src="${escapeAttr(comment.image_url)}" alt="评论图片">` : ""}
      ${children.length ? renderReplies(children, level + 1) : ""}
    </section>
  `;
}

function renderCommentMeta(comment) {
  return [
    comment.time_created || "",
    comment.ip_location ? `IP ${comment.ip_location}` : "",
    `${Number(comment.like_count || 0)} 喜欢`
  ].filter(Boolean).map(escapeHtml).join(" · ");
}

function renderReplies(children, level) {
  return `
    <details class="comment-replies">
      <summary>${children.length} 条回复</summary>
      ${children.map((child) => renderComment(child, level)).join("")}
    </details>
  `;
}

async function assertFile(filePath, name) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw new Error(`${name} is not a file.`);
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Missing ${name} in the content folder.`);
    }
    throw error;
  }
}
