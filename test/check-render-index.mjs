import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderOutputIndex } from "../src/render/index-page.mjs";

/**
 * Focused checks for output-level HTML navigation generation.
 */

const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhmd-render-index-"));
const answerDir = path.join(root, "question-123-answer-456");
const articleDir = path.join(root, "article-789");
const skippedDir = path.join(root, "not-content");

await fs.mkdir(path.join(answerDir, "assets"), { recursive: true });
await fs.mkdir(path.join(articleDir, "assets"), { recursive: true });
await fs.mkdir(skippedDir);
await fs.writeFile(path.join(skippedDir, "index.md"), "not enough files");

await fs.writeFile(path.join(answerDir, "index.md"), `---
title: "回答标题"
url: "https://www.zhihu.com/question/123/answer/456"
author: "回答作者"
author_url: "https://www.zhihu.com/people/answer-author"
time_created: "2026-06-01T00:00:00.000Z"
time_modified: "2026-06-12T16:46:52.000Z"
time_exported: "2026-06-11T16:46:52.000Z"
upvote_count: 10
comment_count: 2
like_count: 3
favorite_count: 4
---

## 正文标题

这是一段用于生成摘要的回答正文，包含 [链接](https://example.com) 和 **加粗文本**。

这里还有更长的正文内容，用来确保导航页不会把完整正文直接嵌入根目录 index.html。继续补充若干文字让摘要截断发生，导航页应该只保留前面的摘要，不应该内嵌后续完整正文。这里再补充一段测试文字，让正文长度明显超过摘要限制。

FULL_BODY_ONLY_MARKER 只应出现在单篇预览页里。

![正文图](./assets/image-001.jpg)
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
  time_exported: "2026-06-11T16:46:52.000Z",
  staged_count: 2,
  comments: [
    {
      id: "c1",
      author: "评论者",
      author_url: "",
      content: "COMMENT_ONLY_MARKER 一级评论",
      time_created: "2026-06-10",
      like_count: 1,
      ip_location: "北京",
      image_url: "",
      reply_to_author: "",
      reply_to_author_url: "",
      children: [
        {
          id: "c2",
          author: "回复者",
          author_url: "",
          content: "二级回复内容",
          time_created: "2026-06-10",
          like_count: 0,
          ip_location: "上海",
          image_url: "",
          reply_to_author: "评论者",
          reply_to_author_url: "",
          children: []
        }
      ]
    }
  ]
}, null, 2));

await fs.writeFile(path.join(articleDir, "index.md"), `---
title: "文章标题"
url: "https://zhuanlan.zhihu.com/p/789"
author: "文章作者"
time_exported: "2026-06-10T00:00:00.000Z"
upvote_count: 5
comment_count: 1
---

文章正文摘要内容。
`);

await fs.writeFile(path.join(articleDir, "comments.json"), JSON.stringify({
  schema_version: 1,
  target: {
    type: "article",
    question_id: "",
    answer_id: "",
    article_id: "789"
  },
  url: "https://zhuanlan.zhihu.com/p/789",
  time_exported: "2026-06-10T00:00:00.000Z",
  staged_count: 0,
  comments: []
}, null, 2));

const outputPath = await renderOutputIndex(root);
assert.equal(outputPath, path.join(root, "index.html"));

const html = await fs.readFile(outputPath, "utf8");
assert.match(html, /知乎保存导航/);
assert.match(html, /回答标题/);
assert.match(html, /文章标题/);
assert.match(html, /回答作者/);
assert.match(html, /文章作者/);
assert.match(html, /创建：2026-06-01 08:00:00/);
assert.match(html, /修改：2026-06-13 00:46:52/);
assert.match(html, /导出：2026-06-12 00:46:52/);
assert.doesNotMatch(html, / 24:46:52/);
assert.match(html, /阅读全文/);
assert.match(html, /评论区/);
assert.match(html, /阅读原文/);
assert.doesNotMatch(html, /单页预览/);
assert.match(html, /<a class="title" href="question-123-answer-456\/preview\.html" target="_blank" rel="noopener noreferrer">回答标题<\/a>/);
assert.match(html, /<button class="top-collapse action-pill" type="button" data-action="toggle-body" data-top-collapse aria-expanded="true" hidden>收起全文<\/button>\s*<a class="source-link action-pill" href="https:\/\/www\.zhihu\.com\/question\/123\/answer\/456" target="_blank" rel="noopener noreferrer">阅读原文<\/a>\s*<span class="type">回答<\/span>/);
assert.match(html, /<div class="meta">\s*<div class="meta-main">\s*<span>作者：<a href="https:\/\/www\.zhihu\.com\/people\/answer-author">回答作者<\/a><\/span>\s*<span>创建：2026-06-01 08:00:00<\/span>\s*<span>修改：2026-06-13 00:46:52<\/span>\s*<\/div>\s*<span class="meta-export">导出：2026-06-12 00:46:52<\/span>\s*<\/div>/);
assert.match(html, /\.meta-export \{[\s\S]*?margin-left: auto;[\s\S]*?text-align: right;/);
assert.match(html, /data-preview-href="question-123-answer-456\/preview\.html"/);
assert.doesNotMatch(html, /data-summary-prefix/);
assert.doesNotMatch(html, /data-summary-truncated/);
assert.match(html, /article-789\/preview\.html/);
assert.match(html, /这是一段用于生成摘要的回答正文，包含 链接 和 加粗文本/);
assert.match(html, /<p class="summary-text" data-summary-row>\s*<span data-summary-copy>正文标题 这是一段用于生成摘要的回答正文/);
assert.match(html, /data-summary-ellipsis/);
assert.match(html, /<button class="read-more" type="button" data-action="toggle-body"/);
assert.match(html, /<div class="expand-panel expand-panel--body" data-panel="body" hidden><\/div>\s*<div class="feed-actions">/);
assert.match(html, /\.action-pill \{[\s\S]*?font-weight: 400;/);
assert.match(html, /赞同 10/);
assert.doesNotMatch(html, /feed-action--vote/);
assert.match(html, /喜欢 3/);
assert.match(html, /收藏 4/);
assert.match(html, /2 条评论/);
assert.match(html, /赞同 10<\/span>\s*<span class="feed-action"><span class="feed-action__icon" aria-hidden="true">♥<\/span>喜欢 3<\/span>\s*<span class="feed-action"><span class="feed-action__icon" aria-hidden="true">★<\/span>收藏 4<\/span>\s*<span class="feed-action"><span class="feed-action__icon" aria-hidden="true">●<\/span>2 条评论<\/span>\s*<button class="feed-action feed-action--comment action-pill" type="button" data-action="toggle-comments"/);
assert.doesNotMatch(html, /inline-comment-tools/);
assert.doesNotMatch(html, /feed-actions-spacer/);
assert.doesNotMatch(html, /\.expand-panel \.comments \.comment-tools \{\s*display: none;/);
assert.match(html, /\.comments-header \{\s*align-items: center;[\s\S]*?justify-content: space-between;/);
assert.match(html, /\.comments-count \{[\s\S]*?font-weight: 400;/);
assert.match(html, /fetch\(previewHref\)/);
assert.match(html, /DOMParser/);
assert.match(html, /querySelector\("\[data-card-body\]"\)/);
assert.match(html, /querySelector\("\[data-comments\]"\)/);
assert.match(html, /rewriteRelativeUrls/);
assert.doesNotMatch(html, /buildBodyExpansion/);
assert.doesNotMatch(html, /removeTextPrefix/);
assert.match(html, /read-more--tail/);
assert.match(html, /data-top-collapse/);
assert.doesNotMatch(html, /setInlineCommentTools/);
assert.doesNotMatch(html, /setCommentRepliesOpen/);
assert.match(html, /toggleCommentReplies/);
assert.match(html, /toggle-comment-replies/);
assert.match(html, /event\.preventDefault\(\)/);
assert.doesNotMatch(html, /comments\.open = true/);
assert.match(html, /nextExpanded \? "收起全部" : "展开全部"/);
assert.match(html, /npm run render:serve/);
assert.doesNotMatch(html, /FULL_BODY_ONLY_MARKER/);
assert.doesNotMatch(html, /COMMENT_ONLY_MARKER/);
assert.doesNotMatch(html, /not-content/);

const answerPreview = await fs.readFile(path.join(answerDir, "preview.html"), "utf8");
assert.match(answerPreview, /FULL_BODY_ONLY_MARKER/);
assert.match(answerPreview, /COMMENT_ONLY_MARKER/);
assert.match(answerPreview, /\.\/assets\/image-001\.jpg/);
assert.match(answerPreview, /<section class="feed feed--preview">/);
assert.match(answerPreview, /<h1 class="title">回答标题<\/h1>/);
assert.match(answerPreview, /<div class="expand-panel expand-panel--body" data-panel="body" data-loaded="1">/);
assert.match(answerPreview, /data-card-body/);
assert.match(answerPreview, /<section class="comments" data-comments>/);
assert.match(answerPreview, /<span class="comments-count">（已存 2 条）<\/span>/);
assert.match(answerPreview, /data-action="toggle-comment-replies" aria-expanded="false"><span data-label>展开全部<\/span>/);
assert.doesNotMatch(answerPreview, /data-action="expand-comments"/);
assert.doesNotMatch(answerPreview, /data-action="collapse-comments"/);
assert.doesNotMatch(answerPreview, /<details class="comments">/);
assert.doesNotMatch(answerPreview, /<button class="top-collapse/);

const articlePreview = await fs.readFile(path.join(articleDir, "preview.html"), "utf8");
assert.match(articlePreview, /<span class="comments-count">（已存 0 条）<\/span>/);

console.log("HTML navigation checks passed.");
