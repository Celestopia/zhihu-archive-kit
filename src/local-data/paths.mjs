import path from "node:path";

const APPLICATION_DIRECTORY = "Zhihu Archive Kit";
const DATA_DIRECTORY = "data";
const BATCH_DIRECTORY = "_batch";
const CACHE_DIRECTORY = "cache";
const EMOJI_DIRECTORY = "emoji";

/**
 * Resolve the application-owned archive root.
 */
export function defaultDataRoot(env = process.env) {
  return path.join(defaultApplicationRoot(env), DATA_DIRECTORY);
}

export function defaultBatchOutputDir(env = process.env) {
  return path.join(defaultDataRoot(env), BATCH_DIRECTORY);
}

export function defaultEmojiCacheDir(env = process.env) {
  return path.join(defaultApplicationRoot(env), CACHE_DIRECTORY, EMOJI_DIRECTORY);
}

function defaultApplicationRoot(env) {
  const localAppData = env.LOCALAPPDATA;
  if (typeof localAppData !== "string" || !localAppData.trim()) {
    throw new Error("LOCALAPPDATA is required when no application path is specified.");
  }
  return path.resolve(localAppData, APPLICATION_DIRECTORY);
}
