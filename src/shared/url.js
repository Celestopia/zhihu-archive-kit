/**
 * URL helpers shared by the Node batch server and the browser userscript.
 *
 * These functions intentionally avoid DOM and `location` dependencies. Callers
 * pass a base URL when they want to support relative input.
 */

export function detectSupportedTarget(input, baseHref = "https://www.zhihu.com/") {
  let url;
  try {
    url = new URL(input, baseHref);
  } catch {
    return null;
  }

  const questionAnswerMatch = url.pathname.match(/^\/question\/(\d+)\/answer\/(\d+)/);
  if (questionAnswerMatch && url.hostname === "www.zhihu.com") {
    return {
      type: "answer",
      id: questionAnswerMatch[2],
      questionId: questionAnswerMatch[1],
      url: cleanInputUrl(url)
    };
  }

  const answerMatch = url.pathname.match(/^\/answer\/(\d+)/);
  if (answerMatch && url.hostname === "www.zhihu.com") {
    return {
      type: "answer",
      id: answerMatch[1],
      questionId: "",
      url: cleanInputUrl(url)
    };
  }

  const articleMatch = url.pathname.match(/^\/p\/(\d+)/);
  if (articleMatch && url.hostname === "zhuanlan.zhihu.com") {
    return {
      type: "article",
      id: articleMatch[1],
      url: cleanInputUrl(url)
    };
  }

  return null;
}

export function cleanInputUrl(url) {
  const clean = new URL(url.href);
  clean.hash = "";
  clean.search = "";
  return clean.href;
}

export function targetKey(target) {
  return target ? `${target.type}-${target.id}` : "";
}

export function normalizeSupportedUrl(input, baseHref) {
  const target = detectSupportedTarget(input, baseHref);
  return target ? target.url : "";
}

export function targetFolderName(target, metadata = {}) {
  if (target?.type === "article") {
    return `article-${target.id}`;
  }

  if (target?.type === "answer") {
    const questionId = metadata.question_id || target.questionId;
    if (!questionId) {
      throw new Error("Cannot determine the Zhihu question ID for this answer.");
    }
    return `question-${questionId}-answer-${target.id}`;
  }

  throw new Error("Unsupported Zhihu target.");
}
