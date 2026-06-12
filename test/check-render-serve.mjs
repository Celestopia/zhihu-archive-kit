import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startRenderServer, stopRenderServer } from "../src/render/serve.mjs";

/**
 * Focused checks for localhost static preview serving.
 */

const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhmd-render-serve-"));
const answerDir = path.join(root, "question-123-answer-456");
await fs.mkdir(path.join(answerDir, "assets"), { recursive: true });

await fs.writeFile(path.join(answerDir, "index.md"), `---
title: "服务测试回答"
url: "https://www.zhihu.com/question/123/answer/456"
author: "作者"
time_exported: "2026-06-11T00:00:00.000Z"
---

服务测试正文。
`);

await fs.writeFile(path.join(answerDir, "comments.json"), JSON.stringify({
  schema_version: 1,
  target: {
    type: "answer",
    question_id: "123",
    answer_id: "456",
    article_id: ""
  },
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

  const previewResponse = await fetch(`${handle.url}question-123-answer-456/preview.html`);
  assert.equal(previewResponse.status, 200);
  assert.match(await previewResponse.text(), /服务测试正文/);

  const missingResponse = await fetch(`${handle.url}missing.html`);
  assert.equal(missingResponse.status, 404);
} finally {
  await stopRenderServer(handle);
}

console.log("HTML navigation server checks passed.");
