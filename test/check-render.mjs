import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderSavedFolder } from "../src/render/render.mjs";

/**
 * Focused checks for static HTML preview generation.
 */

const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhmd-render-"));
const assetsDir = path.join(root, "assets");
await fs.mkdir(assetsDir);
await fs.writeFile(path.join(assetsDir, "comment-image-001.png"), Buffer.from([1, 2, 3]));

await fs.writeFile(path.join(root, "index.md"), `---
title: "测试回答"
url: "https://www.zhihu.com/question/123/answer/456"
author: "作者 A"
author_url: "https://www.zhihu.com/people/a"
time_created: "2026-06-01T00:00:00.000Z"
time_modified: "2026-06-02T08:30:40.000Z"
time_exported: "2026-06-11T00:00:00.000Z"
upvote_count: 10
comment_count: 2
like_count: 3
favorite_count: 4
---

## 正文标题

这里是正文。

![正文图](./assets/image-001.jpg)
`);

await fs.writeFile(path.join(root, "comments.json"), JSON.stringify({
  schema_version: 1,
  target: {
    type: "answer",
    question_id: "123",
    answer_id: "456",
    article_id: ""
  },
  url: "https://www.zhihu.com/question/123/answer/456",
  time_exported: "2026-06-11T00:00:00.000Z",
  staged_count: 2,
  comments: [
    {
      id: "c1",
      author: "评论者",
      author_url: "https://www.zhihu.com/people/commenter",
      content: "一级评论 [链接](https://example.com)",
      time_created: "2026-06-10",
      like_count: 5,
      ip_location: "北京",
      image_url: "./assets/comment-image-001.png",
      reply_to_author: "错误回复对象",
      reply_to_author_url: "https://www.zhihu.com/people/wrong",
      children: [
        {
          id: "c2",
          author: "回复者",
          author_url: "",
          content: "二级评论",
          time_created: "2026-06-10 12:00:00",
          like_count: 1,
          ip_location: "上海",
          image_url: "",
          reply_to_author: "评论者",
          reply_to_author_url: "https://www.zhihu.com/people/commenter",
          children: []
        }
      ]
    }
  ]
}, null, 2));

const outputPath = await renderSavedFolder(root);
assert.equal(outputPath, path.join(root, "preview.html"));

const html = await fs.readFile(outputPath, "utf8");
assert.match(html, /测试回答/);
assert.match(html, /<ul class="meta-list">/);
assert.doesNotMatch(html, /meta-grid/);
assert.match(html, /2026-06-01 08:00:00/);
assert.match(html, /2026-06-02 16:30:40/);
assert.match(html, /2026-06-11 08:00:00/);
assert.match(html, /正文标题/);
assert.match(html, /评论区/);
assert.match(html, /一级评论/);
assert.match(html, /二级评论/);
assert.match(html, /评论者/);
assert.match(html, /回复者/);
assert.match(html, /回复 <a href="https:\/\/www\.zhihu\.com\/people\/commenter">评论者<\/a>/);
assert.doesNotMatch(html, /错误回复对象/);
assert.match(html, /IP 北京/);
assert.match(html, /comment-image-001\.png/);
assert.match(html, /<details class="comment-replies">\s*<summary>1 条回复<\/summary>/);
assert.doesNotMatch(html, /<details class="comment-replies" open>/);

console.log("HTML render checks passed.");
