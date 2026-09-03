import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { extractContentZip } from "../src/local-data/extract-zip.mjs";
import { targetFolderName } from "../src/shared/url.js";

/**
 * Focused checks for Node-side ZIP extraction used by batch folder output.
 */

const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "zhmd-extract-"));

assert.equal(
  targetFolderName({ type: "answer", id: "456", questionId: "123" }),
  "question-123-answer-456"
);
assert.equal(targetFolderName({ type: "article", id: "789" }), "article-789");

const zip = new JSZip();
zip.file("question-123-answer-456/index.md", "# hello\n");
zip.file("question-123-answer-456/comments.json", "{\"comments\":[]}\n");
zip.file("question-123-answer-456/assets/image-001.jpg", Buffer.from([1, 2, 3]));
const buffer = await zip.generateAsync({ type: "nodebuffer" });

const extracted = await extractContentZip(buffer, outputDir);
assert.equal(extracted.folderName, "question-123-answer-456");
assert.equal(await fs.readFile(path.join(extracted.outputPath, "index.md"), "utf8"), "# hello\n");
assert.equal(await fs.readFile(path.join(extracted.outputPath, "comments.json"), "utf8"), "{\"comments\":[]}\n");
assert.deepEqual(
  await fs.readFile(path.join(extracted.outputPath, "assets", "image-001.jpg")),
  Buffer.from([1, 2, 3])
);

await assert.rejects(
  () => extractContentZip(buffer, outputDir),
  /目标文件夹已存在/
);

const unsafeZip = new JSZip();
unsafeZip.file("question-123-answer-456/../evil.txt", "bad");
await assert.rejects(
  async () => extractContentZip(
    await unsafeZip.generateAsync({ type: "nodebuffer" }),
    await fs.mkdtemp(path.join(os.tmpdir(), "zhmd-unsafe-"))
  ),
  /invalid path/
);

const incompleteZip = new JSZip();
incompleteZip.file("article-789/index.md", "# incomplete\n");
await assert.rejects(
  async () => extractContentZip(
    await incompleteZip.generateAsync({ type: "nodebuffer" }),
    await fs.mkdtemp(path.join(os.tmpdir(), "zhmd-incomplete-"))
  ),
  /index\.md and comments\.json/
);

console.log("ZIP extraction checks passed.");
