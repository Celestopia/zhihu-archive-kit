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
source_type: "answer"
title: "测试回答"
url: "https://www.zhihu.com/question/123/answer/456"
author: "作者 A"
author_url: "https://www.zhihu.com/people/a"
time_created: "2026-06-01T00:00:00.000Z"
time_modified: "2026-06-02T08:30:40.000Z"
time_exported: "2026-06-11T16:46:52.000Z"
question_time_created: "2019-01-21T01:47:26.000Z"
question_url: "https://www.zhihu.com/question/123"
question_time_modified: "2019-02-03T05:53:39.000Z"
question_answer_count: 10467
question_comment_count: 22
question_follower_count: 35855
question_topic: "心理, 人际交往, 尴尬"
upvote_count: 10
comment_count: 2
like_count: 3
favorite_count: 4
content_excerpt: "测试回答摘要"
---

## 正文标题

这里是正文。

![正文图](./assets/image-001.jpg)
`);

await fs.writeFile(path.join(root, "comments.json"), JSON.stringify({
  schema_version: 1,
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
assert.match(html, /<section class="feed feed--preview">/);
assert.match(html, /<h1 class="title">测试回答<\/h1>/);
assert.match(html, /<div class="expand-panel expand-panel--body" data-panel="body" data-loaded="1">/);
assert.match(html, /data-card-body/);
assert.doesNotMatch(html, /<ul class="meta-list">/);
assert.doesNotMatch(html, /meta-grid/);
assert.match(html, /2026-06-01 08:00:00/);
assert.match(html, /2026-06-02 16:30:40/);
assert.match(html, /2026-06-12 00:46:52/);
assert.match(html, /问题信息/);
assert.match(html, /阅读原问题/);
assert.match(html, /href="https:\/\/www\.zhihu\.com\/question\/123"/);
assert.match(html, /question-info-row question-info-row--time/);
assert.match(html, /question-info-row question-info-row--stats/);
assert.match(html, /\.question-info-list dt \{[\s\S]*?font-weight: 400;/);
assert.match(html, /问题创建/);
assert.match(html, /2019-01-21 09:47:26/);
assert.match(html, /问题修改/);
assert.match(html, /2019-02-03 13:53:39/);
assert.match(html, /回答数/);
assert.match(html, /10467/);
assert.match(html, /关注数/);
assert.match(html, /35855/);
assert.match(html, /标签/);
assert.match(html, /心理, 人际交往, 尴尬/);
assert.doesNotMatch(html, / 24:46:52/);
assert.match(html, /正文标题/);
assert.match(html, /评论区/);
assert.match(html, /--accent-soft: #edf5ff/);
assert.match(html, /<section class="comments" data-comments>\s*<div class="comments-header">\s*<span class="comments-heading">\s*<span class="comments-title">评论区<\/span>\s*<span class="comments-count">（已存 2 条）<\/span>\s*<\/span>\s*<span class="comment-tools">/);
assert.match(html, /<button class="action-pill" type="button" data-action="toggle-comment-replies" aria-expanded="false"><span data-label>展开全部<\/span><\/button>/);
assert.doesNotMatch(html, /data-action="expand-comments"/);
assert.doesNotMatch(html, /data-action="collapse-comments"/);
assert.doesNotMatch(html, /<summary>评论区<\/summary>\s*<div class="comment-tools">/);
assert.doesNotMatch(html, /<details class="comments">/);
assert.doesNotMatch(html, /\.comments > summary/);
assert.doesNotMatch(html, /<button class="top-collapse/);
assert.doesNotMatch(html, /<p class="summary-text" data-summary-row>/);
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
assert.match(html, /event\.preventDefault\(\)/);
assert.match(html, /event\.stopPropagation\(\)/);
assert.doesNotMatch(html, /comments\.open = true/);
assert.match(html, /nextExpanded \? "收起全部" : "展开全部"/);

const legacyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "zhmd-render-legacy-"));
await fs.mkdir(path.join(legacyRoot, "assets"));
await fs.writeFile(path.join(legacyRoot, "index.md"), `---
source_type: "answer"
title: "旧回答"
url: "https://www.zhihu.com/question/123/answer/789"
author: "作者 B"
time_exported: "2026-06-11T16:46:52.000Z"
upvote_count: 1
comment_count: 0
---

旧回答正文。
`);
await fs.writeFile(path.join(legacyRoot, "comments.json"), JSON.stringify({
  schema_version: 1,
  url: "https://www.zhihu.com/question/123/answer/789",
  time_exported: "2026-06-11T16:46:52.000Z",
  staged_count: 0,
  comments: []
}, null, 2));

const legacyOutputPath = await renderSavedFolder(legacyRoot);
const legacyHtml = await fs.readFile(legacyOutputPath, "utf8");
assert.match(legacyHtml, /问题信息/);
assert.match(legacyHtml, /问题创建/);
assert.match(legacyHtml, /问题修改/);
assert.match(legacyHtml, /回答数/);
assert.match(legacyHtml, /评论数/);
assert.match(legacyHtml, /关注数/);
assert.match(legacyHtml, /标签/);
assert.doesNotMatch(legacyHtml, /阅读原问题/);

console.log("HTML render checks passed.");
