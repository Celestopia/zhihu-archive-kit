import { detectSupportedTarget } from "../shared/url.js";
import { cleanText, cleanTime, normalizeLink, parseCount, parseJsonAttr, pickText } from "./utils.js";

/**
 * Target detection and DOM lookup for supported Zhihu detail pages.
 */

export function detectTarget(input) {
  return detectSupportedTarget(input, location.href);
}

export function findContentRoot(target) {
  if (target.type === "article") {
    return document.querySelector(".Post-content .RichText")
      || document.querySelector(".Post-RichTextContainer .RichText")
      || document.querySelector(".Post-RichText")
      || document.querySelector("article .RichText");
  }

  const answerItems = Array.from(document.querySelectorAll(".AnswerItem"));
  const matched = answerItems.find((item) => answerItemMatches(item, target.id));
  const item = matched || answerItems[0] || document;

  return item.querySelector(".RichContent-inner .RichText")
    || item.querySelector(".RichContent .RichText")
    || item.querySelector(".RichText.ztext")
    || item.querySelector(".RichText");
}

export function answerItemMatches(item, id) {
  const name = item.getAttribute("name") || item.id || "";
  if (name.includes(`answer-${id}`) || name === id) {
    return true;
  }

  const dataZop = parseJsonAttr(item.getAttribute("data-zop"));
  if (String(dataZop?.itemId || "") === String(id)) {
    return true;
  }

  const urlMeta = item.querySelector("meta[itemprop='url']");
  const url = urlMeta?.getAttribute("content") || "";
  return url.includes(`/answer/${id}`);
}

export function findItemRoot(contentRoot, type) {
  if (type === "article") {
    return contentRoot.closest(".Post-Main")
      || contentRoot.closest(".Post-content")
      || document;
  }

  return contentRoot.closest(".AnswerItem")
    || contentRoot.closest(".ContentItem")
    || document;
}

export function extractMetadata({ target, itemRoot }) {
  const dataZop = parseJsonAttr(itemRoot.getAttribute?.("data-zop"));
  const title = cleanText(
    target.type === "article"
      ? pickText([
        ".Post-Title",
        "h1.Post-Title",
        "meta[property='og:title']",
        "meta[name='title']"
      ], document, "content")
      : dataZop?.title
        || pickText([
          ".QuestionHeader-title",
          ".QuestionPage meta[itemprop='name']",
          "meta[itemprop='name']",
          "meta[property='og:title']"
        ], document, "content")
  ) || document.title || "";

  const author = cleanText(
    target.type === "article"
      ? pickText([
        ".Post-Author .UserLink-link",
        ".Post-Author .AuthorInfo-name",
        ".AuthorInfo-name .UserLink-link",
        ".UserLink-link"
      ], itemRoot)
      : pickText([
        ".AuthorInfo-name .UserLink-link",
        ".AuthorInfo-content .UserLink-link",
        ".UserLink.AuthorInfo-name",
        ".UserLink-link"
      ], itemRoot)
  ) || dataZop?.authorName || "";

  const authorUrl = extractAuthorUrl(itemRoot);
  const time = extractTime(itemRoot);

  return {
    title,
    url: target.url || location.href.split("#")[0].split("?")[0],
    author,
    author_url: authorUrl,
    time_created: time.created,
    time_modified: time.modified,
    upvote_count: extractMetaCount(itemRoot, "upvoteCount") ?? extractCount(itemRoot, [
      ".VoteButton--up",
      ".ContentItem-actions .VoteButton",
      "[aria-label^='赞同']"
    ]),
    comment_count: extractMetaCount(itemRoot, "commentCount") ?? extractCount(itemRoot, [
      ".BottomActions-CommentBtn",
      ".ContentItem-action",
      "[aria-label*='评论']"
    ])
  };
}

export function extractTime(itemRoot) {
  const metaCreated = extractMetaContent(itemRoot, ["dateCreated", "datePublished"]);
  const metaModified = extractMetaContent(itemRoot, ["dateModified"]);
  if (metaCreated || metaModified) {
    return {
      created: metaCreated || metaModified || "",
      modified: metaModified || metaCreated || ""
    };
  }

  const el = itemRoot.querySelector?.(".ContentItem-time") || document.querySelector(".ContentItem-time");
  if (!el) {
    return { created: "", modified: "" };
  }

  const tooltip = el.querySelector("[data-tooltip]")?.getAttribute("data-tooltip")
    || el.getAttribute("data-tooltip")
    || "";
  const text = el.textContent || "";
  const created = cleanTime(tooltip) || cleanTime(text);
  const modified = cleanTime(text) || created;
  return { created, modified };
}

export function extractAuthorUrl(itemRoot) {
  const authorRoot = itemRoot.querySelector?.("[itemprop='author']");
  const metaUrl = authorRoot?.querySelector("meta[itemprop='url']")?.getAttribute("content");
  if (metaUrl) {
    return normalizeLink(metaUrl);
  }

  const link = authorRoot?.querySelector("a.UserLink-link[href]")
    || itemRoot.querySelector?.(".Post-Author a.UserLink-link[href]")
    || itemRoot.querySelector?.(".AuthorInfo-name a.UserLink-link[href]")
    || itemRoot.querySelector?.(".AuthorInfo-content a.UserLink-link[href]")
    || itemRoot.querySelector?.("a.UserLink-link[href]");

  return link ? normalizeLink(link.getAttribute("href") || link.href) : "";
}

export function extractMetaContent(itemRoot, itemprops) {
  for (const itemprop of itemprops) {
    const value = itemRoot.querySelector?.(`meta[itemprop='${itemprop}']`)?.getAttribute("content");
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }
  return "";
}

export function extractMetaCount(itemRoot, itemprop) {
  const value = extractMetaContent(itemRoot, [itemprop]);
  if (!value) {
    return null;
  }

  const count = Number(value);
  return Number.isFinite(count) ? count : parseCount(value);
}

export function extractCount(itemRoot, selectors) {
  for (const selector of selectors) {
    const elements = Array.from(itemRoot.querySelectorAll?.(selector) || []);
    for (const el of elements) {
      const value = parseCount(el.getAttribute("aria-label") || el.textContent || "");
      if (Number.isFinite(value)) {
        return value;
      }
    }
  }
  return null;
}

