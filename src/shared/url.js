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

  const answerMatch = url.pathname.match(/\/answer\/(\d+)/);
  if (answerMatch && url.hostname === "www.zhihu.com") {
    return {
      type: "answer",
      id: answerMatch[1],
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

