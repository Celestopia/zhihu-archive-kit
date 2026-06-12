import fs from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import { renderContentCard } from "./card-template.mjs";
import { escapeAttr, escapeHtml } from "./html-utils.mjs";
import { renderHtmlDocument } from "./template.mjs";

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
  const type = commentsJson.target?.type === "article" ? "article" : "answer";
  const comments = commentsJson.comments || [];
  const title = parsed.metadata.title || (type === "article" ? "知乎文章" : "知乎回答");

  const html = renderHtmlDocument({
    title,
    cardHtml: renderContentCard({
      type,
      title,
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
      bodyHtml: marked.parse(parsed.body),
      storedCommentCount: countStoredComments(comments),
      commentsHtml: renderComments(comments)
    }, { mode: "preview" })
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

function renderComments(comments) {
  if (!comments.length) {
    return `<div class="empty">暂无暂存评论。</div>`;
  }

  return `<div class="comment-list">${comments.map((comment) => renderComment(comment, 0)).join("")}</div>`;
}

function countStoredComments(comments) {
  return comments.reduce((total, comment) => {
    const children = Array.isArray(comment.children) ? comment.children : [];
    return total + 1 + countStoredComments(children);
  }, 0);
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
