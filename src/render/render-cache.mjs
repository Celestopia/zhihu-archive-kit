import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { defaultEmojiCacheDir } from "../local-data/paths.mjs";

const CACHE_FILE = "_preview-cache.json";
let rendererFingerprint;
const previewWrites = new Map();

export function hashParts(parts) {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(String(Buffer.byteLength(part)) + ":");
    hash.update(part);
  }
  return hash.digest("hex");
}

async function fingerprintRenderer() {
  const directory = new URL("./", import.meta.url);
  const names = (await fs.readdir(directory)).filter(name => name.endsWith(".mjs")).sort();
  const files = names.map(name => new URL(name, directory));
  files.push(new URL("../../package-lock.json", import.meta.url), new URL("../../assets/zhihu-archive-kit.svg", import.meta.url));
  return hashParts(await Promise.all(files.map(file => fs.readFile(file))));
}

export async function createRenderPass(emojiCacheDir = defaultEmojiCacheDir()) {
  // The fingerprint belongs to the loaded renderer; restart after source updates.
  rendererFingerprint ||= fingerprintRenderer();
  return { rendererFingerprint: await rendererFingerprint, emojiCacheDir, emojiResources: new Map() };
}

export async function hasCurrentPreview(root, fingerprint) {
  try {
    const cached = JSON.parse(await fs.readFile(path.join(root, CACHE_FILE), "utf8"));
    if (!cached || cached.fingerprint !== fingerprint) return false;
    const stat = await fs.stat(path.join(root, "preview.html"));
    return stat.isFile() && stat.size === cached.previewSize && stat.mtimeMs === cached.previewMtimeMs;
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return false;
    throw error;
  }
}

export async function writePreview(root, html, fingerprint) {
  const previous = previewWrites.get(root) || Promise.resolve();
  const write = previous.catch(() => {}).then(() => commitPreview(root, html, fingerprint));
  previewWrites.set(root, write);
  try {
    return await write;
  } finally {
    if (previewWrites.get(root) === write) previewWrites.delete(root);
  }
}

async function commitPreview(root, html, fingerprint) {
  const outputPath = path.join(root, "preview.html");
  await atomicWrite(outputPath, html);
  const stat = await fs.stat(outputPath);
  await atomicWrite(path.join(root, CACHE_FILE), JSON.stringify({
    fingerprint, previewSize: stat.size, previewMtimeMs: stat.mtimeMs
  }) + "\n");
  return outputPath;
}

async function atomicWrite(filePath, content) {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, content, "utf8");
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
