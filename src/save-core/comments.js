import { cleanText, normalizeLink, parseCount } from "./utils.js";
import { downloadOneMedia } from "./media.js";

/**
 * Comment parsing helpers for Zhihu-rendered comment DOM.
 *
 * The parser only reads comments that already exist in the browser DOM. It does
 * not request Zhihu APIs, open comment pages, or expand hidden replies.
 */

export const COMMENTS_SCHEMA_VERSION = 1;

export function parseCommentContainer(container) {
  const elements = Array.from(container.querySelectorAll?.("[data-id]") || [])
    .filter((el) => firstOwnCommentElement(el, ".CommentContent"));

  return elements.map((el) => parseCommentElement(el, container));
}

export function parseCommentElement(commentElement, container) {
  const authorLink = findAuthorLink(commentElement);
  const replyToLink = findReplyToLink(commentElement, authorLink);
  const contentRoot = firstOwnCommentElement(commentElement, ".CommentContent");

  return {
    id: commentElement.getAttribute("data-id") || "",
    author: cleanText(authorLink?.textContent || ""),
    author_url: authorLink ? normalizeLink(authorLink.getAttribute("href") || authorLink.href) : "",
    content: renderCommentContent(contentRoot),
    time_created: normalizeCommentTime(firstOwnCommentElement(commentElement, ".css-12cl38p")?.textContent || ""),
    like_count: extractCommentLikeCount(commentElement),
    ip_location: cleanText(firstOwnCommentElement(commentElement, ".css-ntkn7q")?.textContent || ""),
    image_url: extractCommentImageUrl(contentRoot),
    reply_to_author: cleanText(replyToLink?.textContent || ""),
    reply_to_author_url: replyToLink ? normalizeLink(replyToLink.getAttribute("href") || replyToLink.href) : "",
    parent_id: findParentCommentId(commentElement, container),
    children: []
  };
}

export function buildCommentsPayload({ target, metadata, timeExported, comments }) {
  const flatComments = Array.isArray(comments) ? comments : [];

  return {
    schema_version: COMMENTS_SCHEMA_VERSION,
    target: commentsTarget(target, metadata),
    url: metadata.url || target.url || location.href.split("#")[0].split("?")[0],
    time_exported: timeExported,
    staged_count: flatComments.length,
    comments: buildCommentTree(flatComments)
  };
}

export function stringifyCommentsPayload(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export async function localizeCommentImages(comments) {
  const imageUrls = Array.from(new Set(
    comments.map((comment) => comment.image_url).filter(Boolean)
  ));
  const replacements = new Map();
  const assets = [];

  for (let i = 0; i < imageUrls.length; i += 1) {
    const imageUrl = imageUrls[i];
    try {
      const asset = await downloadOneMedia(imageUrl, "comment-image", i + 1);
      assets.push(asset);
      replacements.set(imageUrl, `./assets/${asset.fileName}`);
    } catch (error) {
      console.warn(`[Zhihu Archive Kit] failed to download comment image ${imageUrl}:`, error);
      replacements.set(imageUrl, imageUrl);
    }
  }

  return {
    comments: comments.map((comment) => ({
      ...comment,
      image_url: comment.image_url ? replacements.get(comment.image_url) : ""
    })),
    assets
  };
}

export function buildCommentTree(comments) {
  const byId = new Map();
  const roots = [];

  for (const comment of comments) {
    byId.set(comment.id, {
      ...publicComment(comment),
      children: []
    });
  }

  for (const comment of comments) {
    const current = byId.get(comment.id);
    const parent = comment.parent_id ? byId.get(comment.parent_id) : null;
    if (parent) {
      parent.children.push(current);
    } else {
      roots.push(current);
    }
  }

  return roots;
}

function commentsTarget(target, metadata) {
  if (target.type === "article") {
    return {
      type: "article",
      question_id: "",
      answer_id: "",
      article_id: target.id
    };
  }

  return {
    type: "answer",
    question_id: metadata.question_id || target.questionId || "",
    answer_id: target.id,
    article_id: ""
  };
}

function publicComment(comment) {
  return {
    id: comment.id,
    author: comment.author,
    author_url: comment.author_url,
    content: comment.content,
    time_created: comment.time_created,
    like_count: comment.like_count,
    ip_location: comment.ip_location,
    image_url: comment.image_url,
    reply_to_author: comment.reply_to_author,
    reply_to_author_url: comment.reply_to_author_url
  };
}

function firstOwnCommentElement(commentElement, selector) {
  return ownCommentElements(commentElement, selector)[0] || null;
}

function ownCommentElements(commentElement, selector) {
  return Array.from(commentElement.querySelectorAll(selector))
    .filter((el) => el.closest("[data-id]") === commentElement);
}

function findAuthorLink(commentElement) {
  return ownCommentElements(commentElement, "a[href*='/people/']")
    .find((link) => cleanText(link.textContent)) || null;
}

function findReplyToLink(commentElement, authorLink) {
  const authorHref = authorLink ? normalizeLink(authorLink.getAttribute("href") || authorLink.href) : "";

  return ownCommentElements(commentElement, "a[href*='/people/']")
    .filter((link) => cleanText(link.textContent))
    .find((link) => link !== authorLink && normalizeLink(link.getAttribute("href") || link.href) !== authorHref) || null;
}

function renderCommentContent(contentRoot) {
  if (!contentRoot) {
    return "";
  }

  return cleanCommentText(renderCommentChildren(contentRoot));
}

function renderCommentChildren(node) {
  let output = "";

  for (const child of Array.from(node.childNodes || [])) {
    output += renderCommentNode(child);
  }

  return output;
}

function renderCommentNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const el = node;
  const tag = el.tagName.toLowerCase();

  if (tag === "br") {
    return "\n";
  }
  if (el.classList.contains("comment_img") || el.classList.contains("comment_sticker")) {
    return "";
  }
  if (tag === "img") {
    return el.getAttribute("alt") || "";
  }
  if (tag === "a") {
    const href = normalizeLink(el.getAttribute("href") || el.href || "");
    const text = cleanText(el.textContent || href);
    return href ? `[${text}](${href})` : text;
  }
  if (tag === "p") {
    return `${renderCommentChildren(el)}\n\n`;
  }

  return renderCommentChildren(el);
}

function cleanCommentText(value) {
  return String(value || "")
    .replace(/\u200B/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractCommentImageUrl(contentRoot) {
  const img = contentRoot?.querySelector(".comment_img img[data-original], .comment_img img[src]");
  if (!img) {
    return "";
  }
  return normalizeLink(img.getAttribute("data-original") || img.getAttribute("src") || "");
}

function extractCommentLikeCount(commentElement) {
  const buttons = [
    ...ownCommentElements(commentElement, ".css-1vd72tl"),
    ...ownCommentElements(commentElement, "button")
  ];
  const seen = new Set();

  for (const button of buttons) {
    if (seen.has(button)) {
      continue;
    }
    seen.add(button);

    const isLikeButton = button.classList.contains("css-1vd72tl")
      || Boolean(button.querySelector("svg[class*='Heart']"))
      || cleanText(button.textContent).includes("喜欢");
    if (!isLikeButton) {
      continue;
    }

    return parseCount(button.getAttribute("aria-label") || button.textContent || "") ?? 0;
  }

  return 0;
}

function findParentCommentId(commentElement, container) {
  const nestedParent = commentElement.parentElement?.closest("[data-id]");
  if (nestedParent && nestedParent !== commentElement && container.contains(nestedParent)) {
    return nestedParent.getAttribute("data-id") || "";
  }

  const firstChild = commentElement.firstElementChild;
  if (firstChild?.classList.contains("css-1kwt8l8")) {
    const parent = commentElement.parentElement?.closest("[data-id]");
    return parent?.getAttribute("data-id") || "";
  }

  if (commentElement.closest(".css-16zdamy")) {
    const modalRoot = container.querySelector(".css-tpyajk [data-id]");
    if (modalRoot && modalRoot !== commentElement) {
      return modalRoot.getAttribute("data-id") || "";
    }
  }

  return "";
}

function normalizeCommentTime(value) {
  const text = cleanText(value);
  if (!text) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text;
  }
  if (/^\d{2}-\d{2}$/.test(text)) {
    const date = new Date();
    const [month, day] = text.split("-").map((part) => Number(part));
    date.setMonth(month - 1, day);
    date.setHours(0, 0, 0, 0);
    return formatLocalDate(date, false);
  }
  if (text.includes("分钟前")) {
    const date = new Date();
    date.setMinutes(date.getMinutes() - Number.parseInt(text, 10));
    date.setSeconds(0, 0);
    return formatLocalDate(date, true);
  }
  if (text.includes("小时前")) {
    const date = new Date();
    date.setHours(date.getHours() - Number.parseInt(text, 10));
    date.setMinutes(0, 0, 0);
    return formatLocalDate(date, true);
  }
  if (text.includes("昨天")) {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    date.setSeconds(0, 0);
    return formatLocalDate(date, true);
  }
  if (text === "刚刚") {
    const date = new Date();
    date.setSeconds(0, 0);
    return formatLocalDate(date, true);
  }
  return text;
}

function formatLocalDate(date, includeTime) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  if (!includeTime) {
    return `${year}-${month}-${day}`;
  }

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
