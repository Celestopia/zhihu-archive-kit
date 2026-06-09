/**
 * DOM-oriented utility helpers used by the browser save core.
 */

export function cleanText(value) {
  return String(value ?? "").replace(/\u200B/g, "").replace(/\s+/g, " ").trim();
}

export function escapeLinkText(value) {
  return String(value).replace(/]/g, "\\]");
}

export function parseJsonAttr(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function pickText(selectors, scope = document, attr = null) {
  for (const selector of selectors) {
    const el = scope.querySelector(selector);
    if (!el) {
      continue;
    }

    const value = attr && el.getAttribute(attr) ? el.getAttribute(attr) : el.textContent;
    if (cleanText(value)) {
      return value;
    }
  }
  return "";
}

export function normalizeLink(href) {
  if (!href) {
    return "";
  }

  try {
    const url = new URL(href, location.href);
    if (url.hostname === "link.zhihu.com") {
      const targetUrl = url.searchParams.get("target");
      return targetUrl ? decodeURIComponent(targetUrl) : url.href;
    }
    if (url.href.includes("#") && url.origin === location.origin && url.pathname === location.pathname) {
      return `#${url.hash.slice(1)}`;
    }
    return url.href;
  } catch {
    return href;
  }
}

export function cleanTime(value) {
  return cleanText(value)
    .replace(/^(发布于|编辑于|更新于|最后编辑于)\s*/, "")
    .replace(/^创建于\s*/, "");
}

export function parseCount(value) {
  const text = cleanText(value).replace(/,/g, "");
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const number = Number(match[1]);
  if (!Number.isFinite(number)) {
    return null;
  }

  if (text.includes("万")) {
    return Math.round(number * 10_000);
  }
  if (text.includes("千")) {
    return Math.round(number * 1_000);
  }
  return Math.round(number);
}

