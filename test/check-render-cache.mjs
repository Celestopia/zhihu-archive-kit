import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderOutputIndex } from "../src/render/index-page.mjs";
import { renderSavedFolder, loadSavedFolder, renderLoadedFolder } from "../src/render/render.mjs";
import { createRenderPass } from "../src/render/render-cache.mjs";
import { resolveZhihuEmojiSources } from "../src/render/zhihu-emoji.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhmd-render-cache-"));
const cache = path.join(root, "_emoji");
const collection = path.join(root, "收藏夹");
const emojiFile = path.join(cache, "zhihu-v2-c71427010ca7866f9b08c37ec20672e0.png");
await fs.mkdir(cache);
await fs.mkdir(collection);
await fs.writeFile(emojiFile, Buffer.from([1, 2, 3]));
await fs.writeFile(path.join(collection, "collection.json"), JSON.stringify({ name: "收藏夹" }));
const markdown = '---\nsource_type: "article"\ntitle: "测试文章"\n---\n\n正文 [赞] $x^2$\n';
async function makeItem(name) {
  const folder = path.join(collection, name);
  await fs.mkdir(folder);
  await fs.writeFile(path.join(folder, "index.md"), markdown);
  await fs.writeFile(path.join(folder, "comments.json"), '{"comments":[]}');
  return folder;
}
const first = await makeItem("article-1");
const second = await makeItem("article-2");
const original = { readFile: fs.readFile, rename: fs.rename, fetch: globalThis.fetch };
let renders = 0, emojiReads = 0, sourceReads = 0;
fs.readFile = async (file, ...args) => {
  if (String(file) === emojiFile) emojiReads++;
  if (String(file).startsWith(collection) && ["index.md", "comments.json"].includes(path.basename(String(file)))) sourceReads++;
  return original.readFile(file, ...args);
};
fs.rename = async (from, to) => {
  if (path.basename(to) === "preview.html") renders++;
  return original.rename(from, to);
};
async function refresh(expected) {
  renders = 0;
  await renderOutputIndex(root, { emojiCacheDir: cache });
  assert.equal(renders, expected);
}
try {
  await refresh(2);
  assert.equal(sourceReads, 4, "load each source exactly once per pass");
  assert.equal(emojiReads, 1, "share emoji reads across items");
  const initial = await fs.readFile(path.join(first, "preview.html"), "utf8");
  await refresh(0);
  assert.equal(await fs.readFile(path.join(first, "preview.html"), "utf8"), initial);

  const source = path.join(first, "index.md");
  const stat = await fs.stat(source);
  await fs.writeFile(source, markdown.replace("正文", "更新"));
  await fs.utimes(source, stat.atime, stat.mtime);
  await refresh(1);
  assert.match(await fs.readFile(path.join(first, "preview.html"), "utf8"), /更新/);
  await fs.writeFile(path.join(second, "comments.json"), '{"comments":[{"author":"作者","content":"新评论"}]}');
  await refresh(1);
  await makeItem("article-3");
  await refresh(1);
  await fs.unlink(path.join(first, "preview.html"));
  await refresh(1);
  await fs.writeFile(path.join(first, "preview.html"), "interrupted output");
  await refresh(1);
  await fs.writeFile(path.join(first, "_preview-cache.json"), "{broken");
  await refresh(1);
  await fs.unlink(path.join(first, "_preview-cache.json"));
  await refresh(1);

  const pass = await createRenderPass(cache);
  renders = 0;
  await renderLoadedFolder(await loadSavedFolder(first), { ...pass, rendererFingerprint: "changed renderer" });
  assert.equal(renders, 1);
  await refresh(1);
  await fs.rename(first, path.join(collection, "article-moved"));
  await refresh(0);
  await fs.mkdir(path.join(root, "空收藏夹"));
  await fs.writeFile(path.join(root, "空收藏夹", "collection.json"), '{"name":"空收藏夹"}');
  await refresh(0);

  // A failed output replacement must not publish a matching cache record.
  await fs.writeFile(path.join(second, "index.md"), markdown + "changed\n");
  fs.rename = async (from, to) => {
    if (to === path.join(second, "preview.html")) throw new Error("simulated write failure");
    return original.rename(from, to);
  };
  await assert.rejects(renderSavedFolder(second, { emojiCacheDir: cache }), /simulated write failure/);
  fs.rename = async (from, to) => {
    if (path.basename(to) === "preview.html") renders++;
    return original.rename(from, to);
  };
  await refresh(1);
  assert.equal((await fs.readdir(second)).some(name => name.endsWith(".tmp")), false);

  await fs.unlink(emojiFile);
  let requests = 0;
  globalThis.fetch = async (_url, { signal }) => {
    requests++;
    assert.ok(signal instanceof AbortSignal);
    throw new Error("offline");
  };
  const resources = new Map();
  assert.equal((await resolveZhihuEmojiSources(["[赞]"], cache, resources)).complete, false);
  await resolveZhihuEmojiSources(["[赞]"], cache, resources);
  assert.equal(requests, 1, "retry a failed resource only on the next pass");
  await resolveZhihuEmojiSources(["[赞]"], cache, new Map());
  assert.equal(requests, 2);

  const offline = await makeItem("article-offline");
  await refresh(1);
  assert.equal(JSON.parse(await fs.readFile(path.join(offline, "_preview-cache.json"), "utf8")).fingerprint, null);
  globalThis.fetch = async () => { requests++; return { ok: true, arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer }; };
  await refresh(1);
  assert.match(await fs.readFile(path.join(offline, "preview.html"), "utf8"), /data:image\/png;base64,BAUG/);
  await refresh(0);
  await fs.unlink(emojiFile);
  globalThis.fetch = async (_url, { signal }) => ({
    ok: true,
    arrayBuffer: () => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    })
  });
  // Keep the process alive while the unref'ed AbortSignal timer bounds a stalled body.
  const keepAlive = setTimeout(() => {}, 10_000);
  try {
    assert.equal((await resolveZhihuEmojiSources(["[赞]"], cache)).complete, false);
    await assert.rejects(fs.access(emojiFile), { code: "ENOENT" });
  } finally {
    clearTimeout(keepAlive);
  }
  console.log("Incremental preview and emoji cache checks passed.");
} finally {
  fs.readFile = original.readFile;
  fs.rename = original.rename;
  globalThis.fetch = original.fetch;
  await fs.rm(root, { recursive: true, force: true });
}
