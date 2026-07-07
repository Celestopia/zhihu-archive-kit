import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EditApiError, handleEditApiRequest } from "../src/render/edit-api.mjs";

/**
 * Focused checks for localhost edit API file mutations.
 */

const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhmd-render-edit-"));
const defaultCollection = path.join(root, "默认收藏夹");
const answerFolder = "question-123-answer-456";
await writeCollection(defaultCollection, {
  schema_version: 1,
  name: "默认收藏夹",
  time_created: "2026-06-12T12:00:00.000+08:00",
  description: ""
});
await writeContent(path.join(defaultCollection, answerFolder));
await fs.mkdir(path.join(root, "_emoji"), { recursive: true });
await fs.writeFile(path.join(root, "_emoji", "collection.json"), "{}\n");

let result = await api("GET", ["collections"]);
assert.equal(result.status, 200);
assert.deepEqual(result.body.collections.map((item) => [item.name, item.count]), [["默认收藏夹", 1]]);

result = await api("POST", ["collections"], { name: "技术收藏", description: "技术类内容" });
assert.equal(result.status, 201);
assert.equal(result.body.collection.name, "技术收藏");
assert.equal(result.body.collection.description, "技术类内容");
assert.equal(await exists(path.join(root, "技术收藏", "collection.json")), true);
const createdMetadata = await readCollectionMetadata(path.join(root, "技术收藏"));

await expectApiError(409, api("POST", ["collections"], { name: "技术收藏", description: "" }));
await expectApiError(400, api("POST", ["collections"], { name: "_internal", description: "" }));

result = await api("PATCH", ["collections", "技术收藏"], { description: "更新后的描述" });
assert.equal(result.status, 200);
let metadata = await readCollectionMetadata(path.join(root, "技术收藏"));
assert.equal(metadata.name, "技术收藏");
assert.equal(metadata.description, "更新后的描述");
assert.equal(metadata.time_created, createdMetadata.time_created);

result = await api("PATCH", ["collections", "技术收藏"], { name: "技术归档" });
assert.equal(result.status, 200);
assert.equal(await exists(path.join(root, "技术收藏")), false);
assert.equal(await exists(path.join(root, "技术归档", "collection.json")), true);
metadata = await readCollectionMetadata(path.join(root, "技术归档"));
assert.equal(metadata.name, "技术归档");
assert.equal(metadata.description, "更新后的描述");
assert.equal(metadata.time_created, createdMetadata.time_created);

await api("POST", ["items", "默认收藏夹", answerFolder, "move"], { targetCollection: "技术归档" });
assert.equal(await exists(path.join(defaultCollection, answerFolder)), false);
assert.equal(await exists(path.join(root, "技术归档", answerFolder)), true);

await writeContent(path.join(defaultCollection, answerFolder));
await expectApiError(409, api("POST", ["items", "技术归档", answerFolder, "move"], { targetCollection: "默认收藏夹" }));
assert.equal(await exists(path.join(root, "技术归档", answerFolder)), true);

await api("DELETE", ["items", "默认收藏夹", answerFolder]);
assert.equal(await exists(path.join(defaultCollection, answerFolder)), false);

await fs.mkdir(path.join(defaultCollection, "not-content"));
await expectApiError(400, api("DELETE", ["items", "默认收藏夹", "not-content"]));
await expectApiError(400, api("DELETE", ["items", "_emoji", answerFolder]));

console.log("HTML edit API checks passed.");

function api(method, segments, body) {
  return handleEditApiRequest({ root, method, segments, body });
}

async function expectApiError(status, promise) {
  await assert.rejects(promise, (error) => {
    assert.equal(error instanceof EditApiError, true);
    assert.equal(error.status, status);
    return true;
  });
}

async function writeCollection(collectionPath, metadata) {
  await fs.mkdir(collectionPath, { recursive: true });
  await fs.writeFile(path.join(collectionPath, "collection.json"), `${JSON.stringify(metadata, null, 2)}\n`);
}

async function writeContent(contentPath) {
  await fs.mkdir(path.join(contentPath, "assets"), { recursive: true });
  await fs.writeFile(path.join(contentPath, "index.md"), `---
source_type: "answer"
title: "测试回答"
url: "https://www.zhihu.com/question/123/answer/456"
---

测试正文。
`);
  await fs.writeFile(path.join(contentPath, "comments.json"), JSON.stringify({
    schema_version: 1,
    comments: []
  }, null, 2));
}

async function readCollectionMetadata(collectionPath) {
  return JSON.parse(await fs.readFile(path.join(collectionPath, "collection.json"), "utf8"));
}

async function exists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
