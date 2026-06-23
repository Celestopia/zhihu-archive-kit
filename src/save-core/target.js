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
    return findArticleContentRoot(document);
  }

  const item = findAnswerItemByTarget(target);
  return item ? findAnswerContentRoot(item) : null;
}

export function findAnswerItemByTarget(target) {
  return Array.from(document.querySelectorAll(".AnswerItem"))
    .find((item) => answerItemMatches(item, target.id)) || null;
}

export function findAnswerContentRoot(answerItem) {
  return answerItem.querySelector(".RichContent-inner .RichText")
    || answerItem.querySelector(".RichContent .RichText")
    || answerItem.querySelector(".RichText.ztext")
    || answerItem.querySelector(".RichText");
}

export function findArticleContentRoot(articleRoot = document) {
  return articleRoot.querySelector(".Post-content .RichText")
    || articleRoot.querySelector(".Post-RichTextContainer .RichText")
    || articleRoot.querySelector(".Post-RichText")
    || articleRoot.querySelector("article .RichText")
    || articleRoot.querySelector(".RichText");
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

export function extractAnswerTarget(answerItem) {
  const metaUrl = answerItem.querySelector?.("meta[itemprop='url']")?.getAttribute("content") || "";
  const metaTarget = detectSupportedTarget(metaUrl, location.href);
  if (metaTarget?.type === "answer" && metaTarget.questionId) {
    return metaTarget;
  }

  const dataZop = parseJsonAttr(answerItem.getAttribute?.("data-zop"));
  const attrId = answerIdFromAttributes(answerItem);
  const itemId = String(dataZop?.itemId || attrId || "");
  if (!itemId) {
    throw new Error("Cannot determine the Zhihu answer ID for this card.");
  }

  for (const value of answerTargetUrls(answerItem)) {
    const target = detectSupportedTarget(value, location.href);
    if (target?.type === "answer" && target.id === itemId && target.questionId) {
      return target;
    }
  }

  throw new Error("Cannot determine the Zhihu question ID for this answer card.");
}

export function extractArticleTarget(articleRoot) {
  const candidates = [
    articleRoot.querySelector?.("meta[itemprop='url']")?.getAttribute("content") || "",
    document.querySelector("meta[property='og:url']")?.getAttribute("content") || "",
    document.querySelector("link[rel='canonical']")?.getAttribute("href") || "",
    location.href
  ];

  for (const value of candidates) {
    const target = detectSupportedTarget(value, location.href);
    if (target?.type === "article") {
      return target;
    }
  }

  throw new Error("Cannot determine the Zhihu article ID for this article.");
}

export function findArticleRoot() {
  return document.querySelector(".Post-content")
    || document.querySelector(".Post-RichTextContainer")
    || document.querySelector(".Post-Main")
    || null;
}

function answerTargetUrls(answerItem) {
  return Array.from(answerItem.querySelectorAll?.("a[href*='/question/'][href*='/answer/']") || [])
    .map((link) => link.getAttribute("href") || link.href || "")
    .filter(Boolean);
}

function answerIdFromAttributes(answerItem) {
  const name = answerItem.getAttribute("name") || answerItem.id || "";
  const answerName = name.match(/answer-(\d+)/);
  if (answerName) {
    return answerName[1];
  }

  const numberOnly = name.match(/^(\d+)$/);
  return numberOnly ? numberOnly[1] : "";
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
  const ids = extractTargetIds(target, itemRoot);
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

  const questionMetadata = target.type === "answer" ? extractQuestionMetadata() : {};

  return {
    title,
    url: target.url || location.href.split("#")[0].split("?")[0],
    author,
    author_url: authorUrl,
    time_created: time.created,
    time_modified: time.modified,
    question_id: ids.questionId,
    answer_id: ids.answerId,
    article_id: ids.articleId,
    upvote_count: extractMetaCount(itemRoot, "upvoteCount") ?? extractCount(itemRoot, [
      ".VoteButton--up",
      ".ContentItem-actions .VoteButton",
      "[aria-label^='赞同']"
    ]),
    comment_count: extractMetaCount(itemRoot, "commentCount") ?? extractCount(itemRoot, [
      ".BottomActions-CommentBtn",
      ".ContentItem-action",
      "[aria-label*='评论']"
    ]),
    like_count: extractActionCount(itemRoot, ["喜欢"]),
    favorite_count: extractActionCount(itemRoot, ["收藏"]),
    ...questionMetadata
  };
}

export function extractQuestionMetadata() {
  const questionRoot = findQuestionRoot();
  if (!questionRoot) {
    return emptyQuestionMetadata();
  }

  return {
    question_url: extractMetaContent(questionRoot, ["url"]),
    question_time_created: extractMetaContent(questionRoot, ["dateCreated"]),
    question_time_modified: extractMetaContent(questionRoot, ["dateModified"]),
    question_answer_count: extractMetaCount(questionRoot, "answerCount") ?? "",
    question_comment_count: extractMetaCount(questionRoot, "commentCount") ?? "",
    question_follower_count: extractMetaCount(questionRoot, "zhihu:followerCount") ?? "",
    question_topic: extractQuestionTopic(questionRoot)
  };
}

function findQuestionRoot() {
  return document.querySelector(".QuestionPage[itemtype='http://schema.org/Question']")
    || document.querySelector(".QuestionPage[itemprop='mainEntity']")
    || document.querySelector(".QuestionPage")
    || null;
}

function emptyQuestionMetadata() {
  return {
    question_url: "",
    question_time_created: "",
    question_time_modified: "",
    question_answer_count: "",
    question_comment_count: "",
    question_follower_count: "",
    question_topic: ""
  };
}

function extractQuestionTopic(questionRoot) {
  const keywords = extractMetaContent(questionRoot, ["keywords"]);
  if (keywords) {
    return keywords.split(",").map((item) => cleanText(item)).filter(Boolean).join(", ");
  }

  const data = parseJsonAttr(questionRoot.querySelector?.("[data-zop-question]")?.getAttribute("data-zop-question"));
  if (!Array.isArray(data?.topics)) {
    return "";
  }

  return data.topics.map((topic) => cleanText(topic?.name || "")).filter(Boolean).join(", ");
}

export function extractTargetIds(target, itemRoot) {
  if (target.type === "article") {
    return {
      questionId: "",
      answerId: "",
      articleId: target.id
    };
  }

  return {
    questionId: extractQuestionId(target, itemRoot),
    answerId: target.id,
    articleId: ""
  };
}

export function extractQuestionId(target, itemRoot) {
  if (target.questionId) {
    return target.questionId;
  }

  const candidates = [
    itemRoot.querySelector?.("meta[itemprop='url']")?.getAttribute("content") || "",
    document.querySelector("link[rel='canonical']")?.getAttribute("href") || "",
    document.querySelector("meta[property='og:url']")?.getAttribute("content") || "",
    location.href
  ];

  for (const value of candidates) {
    const match = String(value).match(new RegExp(`/question/(\\d+)/answer/${target.id}(?:$|[/?#])`));
    if (match) {
      return match[1];
    }
  }

  return "";
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

export function extractActionCount(itemRoot, labels) {
  const selectors = [
    ".ContentItem-actions button",
    ".ContentItem-actions a",
    ".ContentItem-action",
    ".BottomActions button",
    ".BottomActions a",
    "button",
    "a"
  ];
  const seen = new Set();

  for (const selector of selectors) {
    const elements = Array.from(itemRoot.querySelectorAll?.(selector) || []);
    for (const el of elements) {
      if (seen.has(el)) {
        continue;
      }
      seen.add(el);

      const text = actionText(el);
      if (!labels.some((label) => text.includes(label))) {
        continue;
      }

      const count = parseCount(text);
      if (Number.isFinite(count)) {
        return count;
      }
    }
  }

  return null;
}

function actionText(el) {
  return cleanText([
    el.getAttribute("aria-label") || "",
    el.getAttribute("title") || "",
    el.textContent || ""
  ].filter(Boolean).join(" "));
}
