import {
  MEDIA_DOWNLOAD_CONCURRENCY,
  MEDIA_DOWNLOAD_TIMEOUT_MS,
  MEDIA_PLACEHOLDER_PREFIX
} from "./constants.js";

/**
 * Media selection and asset download helpers.
 *
 * Markdown rendering registers media URLs first and downloads them later. This
 * keeps DOM parsing synchronous and lets one failed media request fall back to
 * the original remote URL without losing the Markdown body.
 */

export function registerMedia(media, src, kind) {
  const absolute = normalizeMediaUrl(src);
  if (!absolute) {
    return "";
  }

  const placeholder = `${MEDIA_PLACEHOLDER_PREFIX}${media.length}__`;
  media.push({ placeholder, src: absolute, kind });
  return placeholder;
}

export async function downloadMediaAssets(media, options = {}) {
  const replacements = new Map();
  const tasks = [];
  const seenSources = new Set();
  const counters = {
    image: 0,
    gif: 0,
    video: 0,
    media: 0
  };

  for (const item of media) {
    if (!item.src) {
      replacements.set(item.placeholder, "");
      continue;
    }

    if (seenSources.has(item.src)) {
      continue;
    }
    seenSources.add(item.src);

    const kind = counters[item.kind] === undefined ? "media" : item.kind;
    counters[kind] += 1;
    tasks.push({
      src: item.src,
      kind,
      index: counters[kind]
    });
  }

  const sourceResults = await runMediaDownloadQueue(tasks, options);
  const assets = [];

  for (const item of media) {
    if (!item.src) {
      continue;
    }
    const result = sourceResults.get(item.src);
    replacements.set(item.placeholder, result?.localPath || item.src);
  }

  for (const result of sourceResults.values()) {
    if (result.asset) {
      assets.push(result.asset);
    }
  }

  return { replacements, assets };
}

async function runMediaDownloadQueue(tasks, options) {
  const results = new Map();
  const total = tasks.length;
  let nextIndex = 0;
  let completed = 0;
  const concurrency = Math.max(1, Number(options.concurrency || MEDIA_DOWNLOAD_CONCURRENCY));

  async function worker() {
    while (nextIndex < tasks.length) {
      const task = tasks[nextIndex];
      nextIndex += 1;

      try {
        const downloaded = await downloadOneMedia(task.src, task.kind, task.index);
        results.set(task.src, {
          localPath: `./assets/${downloaded.fileName}`,
          asset: downloaded
        });
      } catch (error) {
        console.warn(`[Zhihu Markdown Saver] failed to download ${task.src}:`, error);
        results.set(task.src, {
          localPath: task.src,
          asset: null
        });
      } finally {
        completed += 1;
        options.onProgress?.({ completed, total });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

export async function downloadOneMedia(src, kind, index) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), MEDIA_DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(src, {
      credentials: "omit",
      referrer: location.href,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.arrayBuffer();
    const ext = inferExtension(src, response.headers.get("content-type") || "", kind);
    const fileName = `${kind}-${String(index).padStart(3, "0")}${ext}`;
    return { fileName, data };
  } finally {
    window.clearTimeout(timer);
  }
}

export function selectImageUrl(img) {
  const direct = img.getAttribute("data-actualsrc")
    || img.getAttribute("data-original")
    || img.getAttribute("data-thumbnail")
    || img.getAttribute("src");
  const fromSrcset = parseSrcset(img.getAttribute("srcset"));
  const src = direct || fromSrcset || "";
  return normalizeMediaUrl(src);
}

export function parseSrcset(srcset) {
  if (!srcset) {
    return "";
  }

  const candidates = srcset
    .split(",")
    .map((item) => item.trim().split(/\s+/)[0])
    .filter(Boolean);
  return candidates[candidates.length - 1] || "";
}

export function normalizeMediaUrl(src) {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) {
    return "";
  }

  try {
    return new URL(src, location.href).href;
  } catch {
    return "";
  }
}

export function guessGifUrl(src) {
  return src.replace(/\.(jpg|jpeg|png|webp)(?=($|\?))/i, ".gif");
}

export function inferExtension(src, contentType, kind) {
  const fromUrl = extensionFromUrl(src);
  if (fromUrl) {
    return fromUrl === ".image" ? ".jpg" : fromUrl;
  }

  const normalizedType = contentType.split(";")[0].trim().toLowerCase();
  const byType = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov"
  };

  if (byType[normalizedType]) {
    return byType[normalizedType];
  }

  return kind === "video" ? ".mp4" : ".jpg";
}

export function extensionFromUrl(src) {
  try {
    const url = new URL(src);
    const name = url.pathname.split("/").pop().toLowerCase();
    const match = name.match(/(\.[a-z0-9]{2,5})$/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}
