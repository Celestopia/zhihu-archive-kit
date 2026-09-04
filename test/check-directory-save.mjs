import assert from "node:assert/strict";
import { getArchiveRoot, changeArchiveRoot, listCollections, createCollection, writeArtifactToCollection, findSavedCollectionsForFolder } from "../src/userscript/directory-save.js";

function notFound() { return new DOMException("Not found", "NotFoundError"); }

class Directory {
  kind = "directory";
  permission = "granted";
  grantOnRequest = false;
  requests = 0;
  children = new Map();
  async queryPermission() { return this.permission; }
  async requestPermission() {
    this.requests += 1;
    if (this.grantOnRequest) this.permission = "granted";
    return this.permission;
  }
  async *entries() { yield* this.children.entries(); }
  async *keys() { yield* this.children.keys(); }
  async getDirectoryHandle(name, { create = false } = {}) {
    if (!this.children.has(name)) {
      if (!create) throw notFound();
      this.children.set(name, new Directory());
    }
    const child = this.children.get(name);
    if (child.kind !== "directory") throw new DOMException("Not a directory", "TypeMismatchError");
    return child;
  }
  async getFileHandle(name, { create = false } = {}) {
    if (!this.children.has(name)) {
      if (!create) throw notFound();
      let contents = "";
      this.children.set(name, {
        kind: "file",
        getFile: async () => new Blob([contents]),
        createWritable: async () => {
          let pending;
          return {
            write: async (value) => {
              if (value instanceof Error) throw value;
              pending = value;
            },
            close: async () => { contents = pending; },
            abort: async () => {}
          };
        }
      });
    }
    const child = this.children.get(name);
    if (child.kind !== "file") throw new DOMException("Not a file", "TypeMismatchError");
    return child;
  }
}

let storedRoot;
const db = {
  close() {},
  transaction() {
    const transaction = {
      objectStore() {
        return {
          get() {
            const request = { result: storedRoot };
            queueMicrotask(() => transaction.oncomplete());
            return request;
          },
          put(value) {
            storedRoot = value;
            queueMicrotask(() => transaction.oncomplete());
          }
        };
      }
    };
    return transaction;
  }
};
globalThis.indexedDB = {
  open() {
    const request = { result: db };
    queueMicrotask(() => request.onsuccess());
    return request;
  }
};
const firstRoot = new Directory();
let selectedRoot = firstRoot;
let pickerCalls = 0;
globalThis.window = {
  showDirectoryPicker: async () => { pickerCalls += 1; return selectedRoot; }
};
globalThis.fetch = () => { throw new Error("Browser saving must not contact a server."); };

assert.equal(await getArchiveRoot(), firstRoot);
assert.equal(pickerCalls, 1);
assert.deepEqual((await listCollections(firstRoot)).map((item) => item.name), ["默认收藏夹"]);
await getArchiveRoot();
assert.equal(pickerCalls, 1);
await createCollection(firstRoot, "数学", "笔记");
await assert.rejects(createCollection(firstRoot, "数学", ""), /已存在/);
for (const name of ["../escape", "_internal", "CON", "a:b", "a."]) {
  await assert.rejects(createCollection(firstRoot, name, ""), /名称无效/);
}
const artifact = {
  folderName: "question-123-answer-456",
  indexMarkdown: "Saved body",
  commentsJson: '{"comments":[]}',
  assets: [{ fileName: "image-001.png", data: new Uint8Array([1, 2, 3]) }]
};
await writeArtifactToCollection(firstRoot, artifact, "数学");
const collection = await firstRoot.getDirectoryHandle("数学");
const item = await collection.getDirectoryHandle(artifact.folderName);
assert.equal(await (await (await item.getFileHandle("index.md")).getFile()).text(), "Saved body");
const assets = await item.getDirectoryHandle("assets");
assert.deepEqual(new Uint8Array(await (await (await assets.getFileHandle("image-001.png")).getFile()).arrayBuffer()), new Uint8Array([1, 2, 3]));
await assert.rejects(item.getFileHandle("preview.html"), { name: "NotFoundError" });
assert.deepEqual(await findSavedCollectionsForFolder(artifact.folderName), ["数学"]);
await assert.rejects(writeArtifactToCollection(firstRoot, artifact, "数学"), /已存在/);
await assert.rejects(writeArtifactToCollection(firstRoot, { ...artifact, folderName: "../outside" }, "数学"), /目录名无效/);

firstRoot.permission = "denied";
assert.deepEqual(await findSavedCollectionsForFolder(artifact.folderName), []);
assert.equal(firstRoot.requests, 0);
await assert.rejects(getArchiveRoot(), /未获得目录写入权限/);
assert.equal(firstRoot.requests, 1);
assert.equal(pickerCalls, 1);
firstRoot.permission = "prompt";
firstRoot.grantOnRequest = true;
assert.equal(await getArchiveRoot(), firstRoot);
assert.equal(firstRoot.requests, 2);

await assert.rejects(writeArtifactToCollection(firstRoot, {
  ...artifact,
  folderName: "article-101",
  assets: [{ fileName: "broken.png", data: new Error("Disk write failed") }]
}, "数学"), /Disk write failed/);
assert.deepEqual(await findSavedCollectionsForFolder("article-101"), []);
await assert.rejects(writeArtifactToCollection(firstRoot, { ...artifact, folderName: "article-101" }, "数学"), /已存在/);

selectedRoot = new Directory();
await changeArchiveRoot();
assert.equal(await getArchiveRoot(), selectedRoot);
assert.deepEqual(await findSavedCollectionsForFolder(artifact.folderName), []);
// A captured archive root remains the write destination after changing the selection.
await writeArtifactToCollection(firstRoot, { ...artifact, folderName: "article-789" }, "数学");
await assert.rejects(selectedRoot.getDirectoryHandle("数学"), { name: "NotFoundError" });
window.showDirectoryPicker = async () => { throw new DOMException("Cancelled", "AbortError"); };
await assert.rejects(changeArchiveRoot(), { name: "AbortError" });
assert.equal(await getArchiveRoot(), selectedRoot);
await assert.rejects(selectedRoot.getDirectoryHandle("cache"), { name: "NotFoundError" });
window.showDirectoryPicker = undefined;
await assert.rejects(getArchiveRoot(), /不支持保存到文件夹/);
console.log("Browser-only directory saving checks passed.");
