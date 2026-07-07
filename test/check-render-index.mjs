import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderOutputIndex } from "../src/render/index-page.mjs";

/**
 * Focused checks for output-level HTML navigation generation.
 */

const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhmd-render-index-"));
const defaultCollectionDir = path.join(root, "默认收藏夹");
const techCollectionDir = path.join(root, "技术收藏");
const emptyCollectionDir = path.join(root, "空收藏夹");
const answerDir = path.join(defaultCollectionDir, "question-123-answer-456");
const articleDir = path.join(techCollectionDir, "article-789");
const rootDirectDir = path.join(root, "question-root-answer-999");
const skippedDir = path.join(root, "not-content");

await fs.mkdir(path.join(answerDir, "assets"), { recursive: true });
await fs.mkdir(path.join(articleDir, "assets"), { recursive: true });
await fs.mkdir(path.join(rootDirectDir, "assets"), { recursive: true });
await fs.mkdir(path.join(root, "_emoji"), { recursive: true });
await fs.mkdir(skippedDir);
await fs.mkdir(emptyCollectionDir);
await fs.writeFile(path.join(root, "_emoji", "zhihu-v2-c71427010ca7866f9b08c37ec20672e0.png"), Buffer.from([7, 8, 9]));
await fs.writeFile(path.join(root, "_emoji", "collection.json"), JSON.stringify({
  schema_version: 1,
  name: "_emoji",
  time_created: "2026-06-12T15:00:00.000+08:00",
  description: ""
}, null, 2));

await writeCollectionMetadata(defaultCollectionDir, {
  schema_version: 1,
  name: "默认收藏夹",
  time_created: "2026-06-12T12:00:00.000+08:00",
  description: ""
});
await writeCollectionMetadata(techCollectionDir, {
  schema_version: 1,
  name: "技术收藏",
  time_created: "2026-06-12T13:00:00.000+08:00",
  description: "技术类内容"
});
await writeCollectionMetadata(emptyCollectionDir, {
  schema_version: 1,
  name: "空收藏夹",
  time_created: "2026-06-12T14:00:00.000+08:00",
  description: ""
});

await fs.writeFile(path.join(skippedDir, "index.md"), "not enough files");

await fs.writeFile(path.join(answerDir, "index.md"), `---
source_type: "answer"
title: "不应作为导航回答标题展示"
url: "https://www.zhihu.com/question/123/answer/456"
author: "回答作者"
author_url: "https://www.zhihu.com/people/answer-author"
time_created: "2026-06-01T00:00:00.000Z"
time_modified: "2026-06-12T16:46:52.000Z"
time_exported: "2026-06-11T16:46:52.000Z"
question_title: "回答所属问题标题"
question_description: "导航页展开后显示的问题描述 [赞]"
question_time_created: "2019-01-21T01:47:26.000Z"
question_url: "https://www.zhihu.com/question/123"
question_time_modified: "2019-02-03T05:53:39.000Z"
question_answer_count: 10467
question_comment_count: 22
question_follower_count: 35855
question_topic: "问题标签导航页不应展示"
upvote_count: 10
comment_count: 2
like_count: 3
favorite_count: 4
content_excerpt: "来自 frontmatter 的固定摘要"
---

## 正文标题

这是一段用于生成摘要的回答正文，包含 [链接](https://example.com)、**加粗文本** 和 [赞]。

这里还有更长的正文内容，用来确保导航页不会把完整正文直接嵌入根目录 index.html。继续补充若干文字让摘要截断发生，导航页应该只保留前面的摘要，不应该内嵌后续完整正文。这里再补充一段测试文字，让正文长度明显超过摘要限制。

FULL_BODY_ONLY_MARKER 只应出现在单篇预览页里。

![正文图](./assets/image-001.jpg)
`);

await fs.writeFile(path.join(answerDir, "comments.json"), JSON.stringify({
  schema_version: 1,
  url: "https://www.zhihu.com/question/123/answer/456",
  time_exported: "2026-06-11T16:46:52.000Z",
  staged_count: 2,
  comments: [
    {
      id: "c1",
      author: "评论者",
      author_url: "",
      content: "COMMENT_ONLY_MARKER 一级评论 [赞]",
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
source_type: "article"
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
  url: "https://zhuanlan.zhihu.com/p/789",
  time_exported: "2026-06-10T00:00:00.000Z",
  staged_count: 0,
  comments: []
}, null, 2));

for (let index = 0; index < 21; index += 1) {
  const id = 2000 + index;
  const extraDir = path.join(defaultCollectionDir, `question-${id}-answer-${id + 1000}`);
  await fs.mkdir(path.join(extraDir, "assets"), { recursive: true });
  await fs.writeFile(path.join(extraDir, "index.md"), `---
source_type: "answer"
title: "分页回答 ${index + 1}"
url: "https://www.zhihu.com/question/${id}/answer/${id + 1000}"
author: "分页作者"
time_exported: "2026-05-${String(index + 1).padStart(2, "0")}T00:00:00.000Z"
upvote_count: ${index}
comment_count: 0
---

分页正文 ${index + 1}。
`);
  await fs.writeFile(path.join(extraDir, "comments.json"), JSON.stringify({
    schema_version: 1,
    url: `https://www.zhihu.com/question/${id}/answer/${id + 1000}`,
    time_exported: "2026-05-01T00:00:00.000Z",
    staged_count: 0,
    comments: []
  }, null, 2));
}

await fs.writeFile(path.join(rootDirectDir, "index.md"), `---
title: "根目录旧内容"
---

ROOT_DIRECT_MARKER
`);
await fs.writeFile(path.join(rootDirectDir, "comments.json"), JSON.stringify({
  schema_version: 1,
  comments: []
}, null, 2));

const outputPath = await renderOutputIndex(root);
assert.equal(outputPath, path.join(root, "index.html"));

const html = await fs.readFile(outputPath, "utf8");
assert.match(html, /知乎保存导航/);
assert.match(html, /总数：<strong>23<\/strong>/);
assert.match(html, /回答：<strong>22<\/strong>/);
assert.match(html, /文章：<strong>1<\/strong>/);
assert.match(html, /<p class="summary-row">\s*<span>总数：<strong>23<\/strong><\/span>\s*<span>回答：<strong>22<\/strong><\/span>\s*<span>文章：<strong>1<\/strong><\/span>\s*<\/p>/);
assert.match(html, /<p class="summary-row">\s*<span>收藏夹：<strong id="current-collection">所有<\/strong><\/span>\s*<span>当前显示：<strong id="visible-count">23<\/strong><\/span>\s*<span>描述：<strong id="current-collection-description">全部收藏夹内容<\/strong><\/span>\s*<\/p>/);
assert.doesNotMatch(html, /生成时间/);
assert.match(html, /id="header-menu-button" aria-expanded="false" aria-label="收藏夹操作菜单">...<\/button>/);
assert.match(html, /data-edit-action="rename-collection">修改收藏夹名称/);
assert.match(html, /data-edit-action="edit-collection-description">修改收藏夹描述/);
assert.match(html, /data-edit-action="create-collection">新建收藏夹/);
assert.match(html, /回答所属问题标题/);
assert.doesNotMatch(html, /不应作为导航回答标题展示/);
assert.match(html, /文章标题/);
assert.match(html, /分页回答 21/);
assert.doesNotMatch(html, /问题标签导航页不应展示/);
assert.doesNotMatch(html, /阅读原问题/);
assert.doesNotMatch(html, /10467/);
assert.doesNotMatch(html, /35855/);
assert.match(html, /回答作者/);
assert.match(html, /文章作者/);
assert.match(html, /创建：2026-06-01 08:00:00/);
assert.match(html, /修改：2026-06-13 00:46:52/);
assert.match(html, /导出：2026-06-12 00:46:52/);
assert.doesNotMatch(html, / 24:46:52/);
assert.match(html, /收藏夹：<strong id="current-collection">所有<\/strong>/);
assert.match(html, /描述：<strong id="current-collection-description">全部收藏夹内容<\/strong>/);
assert.match(html, /<aside class="collection-nav" aria-label="收藏夹">/);
assert.match(html, /<button class="collection-nav-add" type="button" data-edit-action="create-collection" aria-label="新建收藏夹">\+<\/button>/);
assert.match(html, /\.collection-nav-head \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 24px;/);
assert.match(html, /\.collection-nav-title \{[\s\S]*?white-space: nowrap;/);
assert.match(html, /\.collection-nav-add \{[\s\S]*?justify-self: end;/);
assert.match(html, /<div class="collection-context-menu" id="collection-context-menu" hidden>/);
assert.match(html, /\.collection-context-menu \{[\s\S]*?position: fixed;/);
assert.match(html, /left: max\(16px, calc\(\(100vw - 980px\) \/ 2 - 220px\)\);/);
assert.match(html, /max-height: min\(70vh, 520px\);/);
assert.match(html, /\.collection-nav-list \{[\s\S]*?max-height: calc\(min\(70vh, 520px\) - 44px\);[\s\S]*?overflow-y: auto;/);
assert.match(html, /data-collection-filter="all"/);
assert.match(html, /data-collection-filter="all" data-collection-description="全部收藏夹内容" data-collection-raw-description="" aria-pressed="true" title="所有"/);
assert.match(html, /<span>所有<\/span><span class="collection-nav-count">23<\/span>/);
assert.match(html, /data-collection-filter="默认收藏夹"/);
assert.match(html, /data-collection-filter="技术收藏"/);
assert.match(html, /data-collection-filter="空收藏夹"/);
assert.doesNotMatch(html, /data-collection-filter="_emoji"/);
assert.doesNotMatch(html, /<span>_emoji<\/span>/);
assert.match(html, /<span>默认收藏夹<\/span><span class="collection-nav-count">22<\/span>/);
assert.match(html, /<span>技术收藏<\/span><span class="collection-nav-count">1<\/span>/);
assert.match(html, /title="技术类内容"/);
assert.match(html, /data-collection-filter="默认收藏夹" data-collection-description="暂无收藏夹描述" data-collection-raw-description="" aria-pressed="false" title="默认收藏夹"/);
assert.match(html, /data-collection-filter="技术收藏" data-collection-description="技术类内容" data-collection-raw-description="技术类内容" aria-pressed="false" title="技术类内容"/);
assert.match(html, /data-collection-filter="空收藏夹" data-collection-description="暂无收藏夹描述" data-collection-raw-description="" aria-pressed="false" title="空收藏夹"/);
assert.match(html, /data-collection="默认收藏夹"/);
assert.match(html, /data-collection="技术收藏"/);
assert.match(html, /data-folder="question-123-answer-456"/);
assert.match(html, /activeCollection = "all"/);
assert.match(html, /matchesCollection = activeCollection === "all" \|\| card\.dataset\.collection === activeCollection/);
assert.match(html, /currentCollection\.textContent = activeCollection === "all" \? "所有" : activeCollection/);
assert.match(html, /currentCollectionDescription\.textContent = activeCollectionDescription\(\);/);
assert.match(html, /function activeCollectionDescription\(\) \{[\s\S]*?return button\?\.dataset\.collectionDescription \|\| "暂无收藏夹描述";[\s\S]*?\}/);
assert.match(html, /function activeCollectionRawDescription\(\) \{[\s\S]*?return button\?\.dataset\.collectionRawDescription \|\| "";[\s\S]*?\}/);
assert.match(html, /headerMenu\.querySelector\('\[data-edit-action="rename-collection"\]'\)\.hidden = !collectionOnly;/);
assert.match(html, /document\.addEventListener\("contextmenu", \(event\) => \{/);
assert.match(html, /collectionContextMenu\.dataset\.collection = button\.dataset\.collectionFilter;/);
assert.match(html, /function showCollectionContextMenu\(clientX, clientY\)/);
assert.match(html, /const PAGE_SIZE = 20;/);
assert.match(html, /let currentPage = 1;/);
assert.match(html, /<nav class="pagination" id="pagination" aria-label="分页"><\/nav>/);
assert.doesNotMatch(html, /totalPages <= 1/);
assert.match(html, /\.pagination \{[\s\S]*?justify-content: center;/);
assert.match(html, /const totalPages = Math\.max\(1, Math\.ceil\(matchedCards\.length \/ PAGE_SIZE\)\);/);
assert.match(html, /matchedCards\.slice\(start, start \+ PAGE_SIZE\)/);
assert.match(html, /paginationButton\("上一页", currentPage - 1, currentPage === 1\)/);
assert.match(html, /paginationButton\("下一页", currentPage \+ 1, currentPage === totalPages\)/);
assert.match(html, /button\.setAttribute\("aria-current", "page"\)/);
assert.match(html, /items\.push\("ellipsis"\)/);
assert.match(html, /function resetToFirstPage\(\) \{\s*currentPage = 1;\s*\}/);
assert.match(html, /searchInput\.addEventListener\("input", \(\) => \{\s*resetToFirstPage\(\);\s*applyFilters\(\);/);
assert.match(html, /activeFilter = button\.dataset\.filter;[\s\S]*?resetToFirstPage\(\);[\s\S]*?applyFilters\(\);/);
assert.match(html, /activeCollection = button\.dataset\.collectionFilter;[\s\S]*?resetToFirstPage\(\);[\s\S]*?applyFilters\(\);/);
assert.match(html, /applyFilters\(\);\s*<\/script>/);
assert.match(html, /阅读全文/);
assert.match(html, /评论区/);
assert.match(html, /阅读原文/);
assert.doesNotMatch(html, /单页预览/);
assert.match(html, /<a class="title" href="默认收藏夹\/question-123-answer-456\/preview\.html" target="_blank" rel="noopener noreferrer">回答所属问题标题<\/a>/);
assert.match(html, /data-item-menu-button aria-expanded="false" aria-label="内容操作菜单">...<\/button>/);
assert.match(html, /data-edit-action="move-item">移动/);
assert.match(html, /data-edit-action="delete-item">删除/);
assert.match(html, /\.feed \{[\s\S]*?overflow: visible;/);
assert.match(html, /\.item-menu-scroll \{[\s\S]*?max-height: 170px;[\s\S]*?overflow-y: auto;/);
assert.match(html, /menu\.classList\.add\("item-menu--move"\);/);
assert.match(html, /menu\.classList\.remove\("item-menu--move"\);/);
assert.match(html, /apiRequest\("\/api\/collections"/);
assert.match(html, /apiRequest\(itemApiPath\(card\), \{ method: "DELETE" \}\)/);
assert.match(html, /confirm\(`确定永久删除/);
assert.match(html, /item\.dataset\.editAction = "move-item-to";/);
assert.match(html, /\/api\/items\/\$\{encodeURIComponent\(card\.dataset\.collection\)\}\/\$\{encodeURIComponent\(card\.dataset\.folder\)\}/);
assert.match(html, /<button class="top-collapse action-pill" type="button" data-action="toggle-body" data-top-collapse aria-expanded="true" hidden>收起全文<\/button>\s*<a class="source-link action-pill" href="https:\/\/www\.zhihu\.com\/question\/123\/answer\/456" target="_blank" rel="noopener noreferrer">阅读原文<\/a>\s*<span class="type">回答<\/span>/);
assert.match(html, /<div class="meta">\s*<div class="meta-main">\s*<span>作者：<a href="https:\/\/www\.zhihu\.com\/people\/answer-author">回答作者<\/a><\/span>\s*<span>创建：2026-06-01 08:00:00<\/span>\s*<span>修改：2026-06-13 00:46:52<\/span>\s*<\/div>\s*<span class="meta-export">导出：2026-06-12 00:46:52<\/span>\s*<\/div>/);
assert.match(html, /\.meta-export \{[\s\S]*?margin-left: auto;[\s\S]*?text-align: right;/);
assert.match(html, /data-preview-href="默认收藏夹\/question-123-answer-456\/preview\.html"/);
assert.doesNotMatch(html, /data-summary-prefix/);
assert.doesNotMatch(html, /data-summary-truncated/);
assert.match(html, /技术收藏\/article-789\/preview\.html/);
assert.match(html, /来自 frontmatter 的固定摘要/);
assert.doesNotMatch(html, /这是一段用于生成摘要的回答正文，包含 链接 和 加粗文本/);
assert.match(html, /<p class="summary-text" data-summary-row>\s*<span data-summary-copy>来自 frontmatter 的固定摘要/);
assert.match(html, /<button class="read-more" type="button" data-action="toggle-body"/);
assert.match(html, /restoreSummary\(card\);[\s\S]*?collapseComments\(card\);/);
assert.match(html, /function collapseComments\(card\)/);
assert.match(html, /const commentsPanel = card\.querySelector\('\[data-panel="comments"\]'\);/);
assert.match(html, /<div class="expand-panel expand-panel--body" data-panel="body" hidden><\/div>\s*<div class="feed-actions">/);
assert.match(html, /\.action-pill \{[\s\S]*?font-weight: 400;/);
assert.match(html, /赞同 10/);
assert.doesNotMatch(html, /feed-action--vote/);
assert.match(html, /喜欢 3/);
assert.match(html, /收藏 4/);
assert.match(html, /2 条评论/);
assert.match(html, /赞同 10<\/span>\s*<span class="feed-action"><span class="feed-action__icon" aria-hidden="true"><svg width="1\.2em" height="1\.2em" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M16\.984 3\.324/);
assert.match(html, /<span class="feed-action"><span class="feed-action__icon" aria-hidden="true"><svg width="1\.2em" height="1\.2em" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M13\.792 3\.681/);
assert.doesNotMatch(html, /aria-hidden="true">▲<\/span>/);
assert.match(html, /喜欢 3<\/span>\s*<span class="feed-action"><span class="feed-action__icon" aria-hidden="true"><svg width="1\.2em" height="1\.2em" viewBox="0 0 24 24" fill="currentColor"><path d="M10\.424 2\.828/);
assert.match(html, /收藏 4<\/span>\s*<span class="feed-action"><span class="feed-action__icon" aria-hidden="true"><svg width="1\.2em" height="1\.2em" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2\.37/);
assert.match(html, /2 条评论<\/span>\s*<button class="feed-action feed-action--comment action-pill" type="button" data-action="toggle-comments"/);
assert.doesNotMatch(html, /aria-hidden="true">♥<\/span>/);
assert.doesNotMatch(html, /aria-hidden="true">★<\/span>/);
assert.doesNotMatch(html, /aria-hidden="true">●<\/span>/);
assert.doesNotMatch(html, /inline-comment-tools/);
assert.doesNotMatch(html, /feed-actions-spacer/);
assert.doesNotMatch(html, /\.expand-panel \.comments \.comment-tools \{\s*display: none;/);
assert.match(html, /\.comments-header \{\s*align-items: center;[\s\S]*?justify-content: space-between;/);
assert.match(html, /\.comments-count \{[\s\S]*?font-weight: 400;/);
assert.match(html, /fetch\(previewHref\)/);
assert.match(html, /DOMParser/);
assert.match(html, /querySelector\("\[data-card-body\]"\)/);
assert.match(html, /querySelector\("\.question-info"\)/);
assert.match(html, /questionInfo \? rewriteRelativeUrls\(questionInfo\.outerHTML, basePath\) : ""/);
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
assert.doesNotMatch(html, /ROOT_DIRECT_MARKER/);
assert.doesNotMatch(html, /not-content/);

const answerPreview = await fs.readFile(path.join(answerDir, "preview.html"), "utf8");
assert.match(answerPreview, /FULL_BODY_ONLY_MARKER/);
assert.match(answerPreview, /COMMENT_ONLY_MARKER/);
assert.match(answerPreview, /src="\.\.\/\.\.\/_emoji\/zhihu-v2-c71427010ca7866f9b08c37ec20672e0\.png"/);
assert.match(answerPreview, /class="zhihu-emoji"/);
assert.match(answerPreview, /\.\/assets\/image-001\.jpg/);
assert.match(answerPreview, /<section class="feed feed--preview">/);
assert.match(answerPreview, /<h1 class="title">回答所属问题标题<\/h1>/);
assert.match(answerPreview, /<section class="question-info" aria-label="问题信息">/);
assert.match(answerPreview, /阅读原问题/);
assert.match(answerPreview, /href="https:\/\/www\.zhihu\.com\/question\/123"/);
assert.match(answerPreview, /问题标签导航页不应展示/);
assert.match(answerPreview, /<section class="question-description" aria-label="问题描述">/);
assert.match(answerPreview, /<p class="question-description-title">问题描述<\/p>/);
assert.match(answerPreview, /<div class="question-description-body">导航页展开后显示的问题描述 <img class="zhihu-emoji"/);
assert.match(answerPreview, /<div class="expand-panel expand-panel--body" data-panel="body" data-loaded="1">/);
assert.match(answerPreview, /data-card-body/);
assert.match(answerPreview, /<section class="comments" data-comments>/);
assert.match(answerPreview, /<span class="comments-count">（已存 2 条）<\/span>/);
assert.match(answerPreview, /data-action="toggle-comment-replies" aria-expanded="false"><span data-label>展开全部<\/span>/);
assert.doesNotMatch(answerPreview, /data-action="expand-comments"/);
assert.doesNotMatch(answerPreview, /data-action="collapse-comments"/);
assert.doesNotMatch(answerPreview, /<details class="comments">/);
assert.doesNotMatch(answerPreview, /<button class="top-collapse/);
assert.doesNotMatch(answerPreview, /data-item-menu-button/);
assert.doesNotMatch(answerPreview, /data-edit-action="delete-item"/);

const articlePreview = await fs.readFile(path.join(articleDir, "preview.html"), "utf8");
assert.match(articlePreview, /<span class="comments-count">（已存 0 条）<\/span>/);

console.log("HTML navigation checks passed.");

async function writeCollectionMetadata(collectionDir, metadata) {
  await fs.mkdir(collectionDir, { recursive: true });
  await fs.writeFile(path.join(collectionDir, "collection.json"), `${JSON.stringify(metadata, null, 2)}\n`);
}
