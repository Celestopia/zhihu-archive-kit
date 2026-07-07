import fs from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import { renderContentCard } from "./card-template.mjs";
import { escapeAttr, escapeHtml } from "./html-utils.mjs";
import { renderHtmlDocument } from "./template.mjs";
import {
  createEmojiContext,
  ensureZhihuEmojiAssets,
  renderZhihuEmojiInMarkdown
} from "./zhihu-emoji.mjs";

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
  const type = requireSourceType(parsed.metadata.source_type);
  const comments = commentsJson.comments || [];
  const title = displayTitle(parsed.metadata, type);
  const emojiContext = await createEmojiContext(root);
  const availableEmojiTokens = await ensureZhihuEmojiAssets([
    parsed.body,
    parsed.metadata.question_description || "",
    ...collectCommentMarkdown(comments)
  ], emojiContext);

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
      questionTitle: parsed.metadata.question_title || "",
      questionDescriptionHtml: marked.parseInline(renderMarkdownWithEmoji(parsed.metadata.question_description || "", emojiContext, availableEmojiTokens)),
      questionUrl: parsed.metadata.question_url || "",
      questionTimeCreated: parsed.metadata.question_time_created || "",
      questionTimeModified: parsed.metadata.question_time_modified || "",
      questionAnswerCount: parsed.metadata.question_answer_count ?? "",
      questionCommentCount: parsed.metadata.question_comment_count ?? "",
      questionFollowerCount: parsed.metadata.question_follower_count ?? "",
      questionTopic: parsed.metadata.question_topic || "",
      upvoteCount: parsed.metadata.upvote_count,
      commentCount: parsed.metadata.comment_count,
      likeCount: parsed.metadata.like_count,
      favoriteCount: parsed.metadata.favorite_count,
      bodyHtml: marked.parse(renderMarkdownWithEmoji(parsed.body, emojiContext, availableEmojiTokens)),
      storedCommentCount: countStoredComments(comments),
      commentsHtml: renderComments(comments, emojiContext, availableEmojiTokens)
    }, { mode: "preview" })
  });

  await fs.writeFile(outputPath, html, "utf8");
  return outputPath;
}

function displayTitle(metadata, type) {
  if (type === "answer") {
    return metadata.question_title || metadata.title || "知乎回答";
  }
  return metadata.title || "知乎文章";
}

function requireSourceType(value) {
  if (value === "answer" || value === "article") {
    return value;
  }
  throw new Error("index.md frontmatter must include source_type as answer or article.");
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
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1).replace(/\\"/g, "\"");
    }
  }
  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
}

function renderComments(comments, emojiContext, availableEmojiTokens) {
  if (!comments.length) {
    return `<div class="empty">暂无暂存评论。</div>`;
  }

  return `<div class="comment-list">${comments.map((comment) => renderComment(comment, 0, emojiContext, availableEmojiTokens)).join("")}</div>`;
}

function countStoredComments(comments) {
  return comments.reduce((total, comment) => {
    const children = Array.isArray(comment.children) ? comment.children : [];
    return total + 1 + countStoredComments(children);
  }, 0);
}

function renderComment(comment, level, emojiContext, availableEmojiTokens) {
  const classes = ["comment-card"];
  if (level > 0) {
    classes.push("comment-card--child");
  }

  const author = comment.author_url
    ? `<a href="${escapeAttr(comment.author_url)}">${escapeHtml(comment.author || "匿名用户")}</a>`
    : escapeHtml(comment.author || "匿名用户");
  const replyTo = level > 0 && comment.reply_to_author
    ? ` ${replyIcon()} ${comment.reply_to_author_url
      ? `<a href="${escapeAttr(comment.reply_to_author_url)}">${escapeHtml(comment.reply_to_author)}</a>`
      : escapeHtml(comment.reply_to_author)}`
    : "";
  const children = Array.isArray(comment.children) ? comment.children : [];

  return `
    <section class="${classes.join(" ")}">
      <div class="comment-head">
        <div class="comment-author">${author}${replyTo}</div>
      </div>
      <div class="comment-body">${marked.parse(renderMarkdownWithEmoji(comment.content || "", emojiContext, availableEmojiTokens))}</div>
      ${comment.image_url ? `<img class="comment-image" src="${escapeAttr(comment.image_url)}" alt="评论图片">` : ""}
      <div class="comment-foot">
        <div class="comment-info">${renderCommentInfo(comment)}</div>
        <div class="comment-like">${heartIcon()}<span>${escapeHtml(Number(comment.like_count || 0))}</span></div>
      </div>
      ${children.length ? renderReplies(children, level + 1, emojiContext, availableEmojiTokens) : ""}
    </section>
  `;
}

function renderCommentInfo(comment) {
  return [
    comment.time_created || "",
    comment.ip_location ? `IP ${comment.ip_location}` : ""
  ].filter(Boolean).map(escapeHtml).join(" · ");
}

function heartIcon() {
  return `<svg class="comment-like-icon" width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M16.984 3.324c1.73.315 3.125 1.472 4.04 2.978 1.893 3.116.758 6.989-1.384 9.556a23.241 23.241 0 0 1-3.96 3.737c-.66.486-1.308.895-1.902 1.196-.579.294-1.166.517-1.695.57a.845.845 0 0 1-.145.002c-.529-.038-1.127-.267-1.708-.564a14.407 14.407 0 0 1-1.947-1.232 23.512 23.512 0 0 1-4.081-3.88C2.165 13.207 1.139 9.536 2.85 6.514 3.742 4.94 5.14 3.71 6.896 3.348c1.606-.332 3.363.094 5.103 1.394 1.696-1.267 3.409-1.704 4.985-1.418Z" clip-rule="evenodd"></path></svg>`;
}

function replyIcon() {
  return `<span class="comment-reply-icon" role="img" aria-label="回复" title="回复"></span>`;
}

function renderReplies(children, level, emojiContext, availableEmojiTokens) {
  return `
    <details class="comment-replies">
      <summary>${children.length} 条回复</summary>
      ${children.map((child) => renderComment(child, level, emojiContext, availableEmojiTokens)).join("")}
    </details>
  `;
}

function renderMarkdownWithEmoji(markdown, emojiContext, availableEmojiTokens) {
  return renderZhihuEmojiInMarkdown(markdown, emojiContext, availableEmojiTokens);
}

function collectCommentMarkdown(comments) {
  const values = [];
  for (const comment of comments) {
    values.push(comment.content || "");
    if (Array.isArray(comment.children)) {
      values.push(...collectCommentMarkdown(comment.children));
    }
  }
  return values;
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
