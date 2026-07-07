import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startRenderServer, stopRenderServer } from "../src/render/serve.mjs";

/**
 * Focused checks for localhost static preview serving.
 */

const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhmd-render-serve-"));
const collectionDir = path.join(root, "默认收藏夹");
const answerDir = path.join(collectionDir, "question-123-answer-456");
await fs.mkdir(path.join(answerDir, "assets"), { recursive: true });
await fs.writeFile(path.join(collectionDir, "collection.json"), JSON.stringify({
  schema_version: 1,
  name: "默认收藏夹",
  time_created: "2026-06-12T12:00:00.000+08:00",
  description: ""
}, null, 2));

await fs.writeFile(path.join(answerDir, "index.md"), `---
source_type: "answer"
title: "服务测试回答"
url: "https://www.zhihu.com/question/123/answer/456"
author: "作者"
time_exported: "2026-06-11T00:00:00.000Z"
---

服务测试正文。
`);

await fs.writeFile(path.join(answerDir, "comments.json"), JSON.stringify({
  schema_version: 1,
  url: "https://www.zhihu.com/question/123/answer/456",
  time_exported: "2026-06-11T00:00:00.000Z",
  staged_count: 0,
  comments: []
}, null, 2));

const handle = await startRenderServer({ rootPath: root, port: 0 });

try {
  assert.equal(handle.server.address().address, "127.0.0.1");

  const indexResponse = await fetch(handle.url);
  assert.equal(indexResponse.status, 200);
  assert.match(indexResponse.headers.get("content-type"), /text\/html/);
  assert.match(await indexResponse.text(), /服务测试回答/);

  const previewResponse = await fetch(`${handle.url}${encodeURI("默认收藏夹/question-123-answer-456/preview.html")}`);
  assert.equal(previewResponse.status, 200);
  assert.match(await previewResponse.text(), /服务测试正文/);

  const missingResponse = await fetch(`${handle.url}missing.html`);
  assert.equal(missingResponse.status, 404);

  const collectionsResponse = await fetch(`${handle.url}api/collections`);
  assert.equal(collectionsResponse.status, 200);
  assert.deepEqual((await collectionsResponse.json()).collections.map((item) => item.name), ["默认收藏夹"]);

  const createResponse = await fetch(`${handle.url}api/collections`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "服务收藏夹", description: "由 API 创建" })
  });
  assert.equal(createResponse.status, 201);
  assert.equal(await fileExists(path.join(root, "服务收藏夹", "collection.json")), true);

  const refreshedIndexResponse = await fetch(handle.url);
  assert.equal(refreshedIndexResponse.status, 200);
  assert.match(await refreshedIndexResponse.text(), /服务收藏夹/);
} finally {
  await stopRenderServer(handle);
}

console.log("HTML navigation server checks passed.");

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
