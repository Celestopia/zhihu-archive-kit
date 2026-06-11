# 知乎页面 DOM 结构说明

本文档面向本项目开发者，说明知乎问题-回答界面和专栏文章界面的 DOM 结构。重点不是完整复刻知乎页面，而是说明本项目保存逻辑依赖哪些 DOM 锚点、这些锚点用于什么、缺失时会产生什么影响。

知乎前端 DOM 不是公开稳定接口，类名和层级可能变化。项目实现应优先依赖语义更强的结构，例如 `meta[itemprop]`、`data-zop`、URL、回答卡片根节点和正文 `.RichText`，避免依赖过深的视觉层级。

## 总体依赖关系

本项目的保存流程依赖四类 DOM 信息：

```text
页面或卡片身份信息 -> 正文根节点 -> 元数据 -> 富文本内容
```

对应到代码：

- 身份识别：`src/shared/url.js`、`src/save-core/target.js`
- DOM 定位：`src/save-core/target.js`
- 元数据提取：`src/save-core/target.js`
- 正文解析：`src/save-core/markdown.js`
- 评论解析：`src/save-core/comments.js`
- 保存按钮注入：`src/userscript/main.js`、`src/userscript/ui.js`

最重要的稳定锚点如下：

```text
.AnswerItem
.RichContent
.RichContent-inner
.RichText
.Post-content
.Post-RichTextContainer
.Post-Main
meta[itemprop='url']
meta[itemprop='dateCreated']
meta[itemprop='datePublished']
meta[itemprop='dateModified']
meta[itemprop='upvoteCount']
meta[itemprop='commentCount']
[itemprop='author']
data-zop
```

## 问题-回答界面

问题页和回答详情页的核心差别是 URL 与页面中回答数量：

- `https://www.zhihu.com/question/<question_id>`：问题页，页面中会出现多个回答卡片。
- `https://www.zhihu.com/question/<question_id>/answer/<answer_id>`：回答详情页，页面中通常有目标回答，也可能继续加载其它回答。
- `https://www.zhihu.com/answer/<answer_id>`：独立回答 URL，页面 DOM 中仍需要找到对应回答卡片和问题 ID。

由于问题页 URL 只包含问题 ID，不包含当前用户正在看的回答 ID，本项目的手动保存按钮必须绑定到具体 `.AnswerItem`，不能只根据当前 URL 决定保存对象。

### 问题标题区域

问题标题通常可以从这些位置读取：

```text
.QuestionHeader-title
.QuestionPage meta[itemprop='name']
meta[itemprop='name']
meta[property='og:title']
```

本项目用途：

- 作为回答 Markdown frontmatter 的 `title`。
- 当回答卡片 `data-zop.title` 存在时，优先使用卡片数据中的标题。

代码依赖：

```text
src/save-core/target.js -> extractMetadata()
```

### 回答卡片根节点

回答的主要容器是：

```text
.AnswerItem
```

这是本项目手动保存按钮绑定的核心单位。每个 `.AnswerItem` 对应一个回答卡片，按钮注入时会扫描页面中的所有 `.AnswerItem`，并为每个可识别的卡片注入一次保存控件。

典型结构可抽象为：

```html
<div class="AnswerItem ContentItem" data-zop="...">
  <meta itemprop="url" content="https://www.zhihu.com/question/123/answer/456">
  <meta itemprop="dateCreated" content="...">
  <meta itemprop="dateModified" content="...">
  <meta itemprop="upvoteCount" content="...">
  <meta itemprop="commentCount" content="...">

  <div class="AuthorInfo">...</div>

  <div class="RichContent">
    <div class="RichContent-inner">
      <span class="RichText ztext">...</span>
    </div>
    <div class="ContentItem-actions">...</div>
  </div>
</div>
```

本项目用途：

- 判断一个 DOM 区块是否是回答。
- 手动保存时只解析当前 `.AnswerItem` 内的正文和元数据。
- 给每个回答卡片注入独立保存按钮。
- 在保存前只展开当前回答卡片内的“阅读全文”按钮。

代码依赖：

```text
src/userscript/main.js -> injectAnswerControls()
src/save-core/target.js -> findAnswerItemByTarget()
src/save-core/target.js -> extractAnswerTarget()
src/save-core/build-zip.js -> buildAnswerItemArtifact()
```

### 回答 ID 与问题 ID

回答保存必须得到两个 ID：

```text
question_id
answer_id
```

输出文件夹命名依赖它们：

```text
question-<question_id>-answer-<answer_id>
```

项目优先从回答卡片内的语义 URL 提取：

```html
<meta itemprop="url" content="https://www.zhihu.com/question/123/answer/456">
```

如果 `meta[itemprop='url']` 不可用，项目会尝试：

```text
data-zop.itemId
.AnswerItem 的 name 或 id
卡片内部指向 /question/<id>/answer/<id> 的链接
```

重要约束：

- 手动保存回答卡片时，如果无法从该卡片确定 `question_id` 和 `answer_id`，保存应报错或不注入按钮。
- 不应使用当前页面 URL 猜测当前卡片的回答 ID。
- 不应从卡片正文中任意外链推断回答身份，避免把引用链接误认为当前回答。

代码依赖：

```text
src/save-core/target.js -> extractAnswerTarget()
src/save-core/target.js -> answerItemMatches()
src/save-core/target.js -> extractQuestionId()
src/shared/url.js -> detectSupportedTarget()
src/shared/url.js -> targetFolderName()
```

### 回答正文根节点

回答正文的核心根节点是 `.RichText`，通常位于 `.RichContent` 内：

```text
.AnswerItem .RichContent-inner .RichText
.AnswerItem .RichContent .RichText
.AnswerItem .RichText.ztext
.AnswerItem .RichText
```

项目按上述顺序查找。找到的 `.RichText` 是 Markdown 解析入口，只解析它的子节点，不解析评论区。

代码依赖：

```text
src/save-core/target.js -> findAnswerContentRoot()
src/save-core/markdown.js -> extractPage()
```

如果 `.RichText` 缺失：

- 对该回答卡片不注入保存按钮，或保存时报错。
- 批量保存时会等待正文出现，超时后上报失败。

### 回答展开按钮

长回答可能被折叠，折叠按钮通常是 `button` 或 `a`，文本可能包含：

```text
阅读全文
展开阅读全文
继续阅读
显示全部
展开全部
```

本项目不会依赖固定类名，而是在当前保存 scope 内搜索按钮或链接文本。

手动保存回答时，scope 是当前 `.AnswerItem`。这样可以避免误展开页面里的其它回答。

代码依赖：

```text
src/save-core/dom.js -> expandCollapsedContent(scope)
src/save-core/build-zip.js -> buildAnswerItemArtifact()
```

### 回答作者信息

作者信息优先从语义区域和作者链接提取：

```text
[itemprop='author']
[itemprop='author'] meta[itemprop='url']
a.UserLink-link[href]
.AuthorInfo-name .UserLink-link
.AuthorInfo-content .UserLink-link
.UserLink.AuthorInfo-name
```

项目输出字段：

```yaml
author: "..."
author_url: "..."
```

如果链接缺失，`author_url` 为空字符串。匿名用户或特殊账号可能没有普通用户主页链接。

代码依赖：

```text
src/save-core/target.js -> extractMetadata()
src/save-core/target.js -> extractAuthorUrl()
```

### 回答时间、赞同数、评论数、喜欢数、收藏数

项目优先从卡片内的 `meta[itemprop]` 读取：

```html
<meta itemprop="dateCreated" content="2022-11-29T16:15:53.000Z">
<meta itemprop="dateModified" content="2022-11-30T14:36:29.000Z">
<meta itemprop="upvoteCount" content="816">
<meta itemprop="commentCount" content="12">
```

项目输出字段：

```yaml
time_created: "..."
time_modified: "..."
upvote_count: 0
comment_count: 0
like_count: 0
favorite_count: 0
```

如果时间 meta 缺失，会尝试读取：

```text
.ContentItem-time
[data-tooltip]
```

如果赞同数或评论数 meta 缺失，会尝试读取：

```text
.VoteButton--up
.ContentItem-actions .VoteButton
[aria-label^='赞同']
.BottomActions-CommentBtn
.ContentItem-action
[aria-label*='评论']
```

这些 UI 文本 fallback 不如 `meta[itemprop]` 稳定，因此应视为次选。

喜欢数和收藏数通常没有对应的 `meta[itemprop]`。项目会在当前 `.AnswerItem` 内查找包含“喜欢”或“收藏”的操作按钮或链接，并从 `aria-label`、`title` 和按钮文本中解析数量：

```text
.ContentItem-actions button
.ContentItem-actions a
.ContentItem-action
.BottomActions button
.BottomActions a
button
a
```

如果按钮只有“喜欢”或“收藏”文案而没有数字，项目会把对应字段留空。

代码依赖：

```text
src/save-core/target.js -> extractTime()
src/save-core/target.js -> extractMetaCount()
src/save-core/target.js -> extractCount()
src/save-core/target.js -> extractActionCount()
```

### 回答操作栏

回答操作栏通常在：

```text
.ContentItem-actions
```

本项目不保存操作栏内容。它只把操作栏作为赞同数、评论数、喜欢数和收藏数的来源。

### 评论区

评论区常见容器包括：

```text
.Comments-container
```

本项目不会把评论区渲染进 `index.md`，而是由用户手动暂存已加载的评论 DOM，并在保存时写入 `comments.json`。

评论区顶部工具栏常见位置：

```text
.Comments-container .css-1onritu
```

项目会在这里注入“暂存当前评论 / 查看暂存数 / 清空暂存”。如果评论进入弹窗，项目会在 `.Modal-content` 内查找评论容器并复用同一套暂存逻辑。

一级评论节点使用带 `data-id` 的元素，且内部包含：

```text
[data-id]
.CommentContent
```

已确认的评论字段来源：

```text
评论 ID        -> [data-id]
评论正文       -> .CommentContent
作者名称       -> .css-10u695f 或评论节点内第一个有文本的 a[href*='/people/']
作者主页       -> 作者链接 href
发布时间       -> .css-12cl38p
IP 属地        -> .css-ntkn7q
点赞数         -> .css-1vd72tl 或带 Heart 图标的按钮
评论图片       -> .comment_img img[data-original]
贴纸表情       -> img.sticker 的 alt
查看全部评论   -> .css-wu78cf
```

评论正文解析规则：

- `br` 转换为换行；
- `p` 保留为段落文本；
- 普通链接转换为 Markdown 链接；
- `img.sticker` 使用 `alt` 文本；
- `.comment_img` 不写入正文，图片下载成功后 `image_url` 指向 `./assets/comment-image-001.ext`，下载失败时保留远程 URL。

二级评论优先通过嵌套的 `[data-id]` 关系判断父评论；弹窗回复结构按参考项目的 `.css-1kwt8l8`、`.css-16zdamy` 和 `.css-tpyajk` 逻辑处理。导出时一级评论位于 `comments[]`，二级评论位于父评论的 `children[]`。

代码依赖：

```text
src/save-core/comments.js -> parseCommentContainer()
src/save-core/comments.js -> parseCommentElement()
src/save-core/comments.js -> localizeCommentImages()
src/save-core/comments.js -> buildCommentsPayload()
src/userscript/comment-staging.js -> mountCommentStaging()
```

## 专栏文章界面

专栏文章 URL 形如：

```text
https://zhuanlan.zhihu.com/p/<article_id>
```

文章页通常只有一个主要正文区域。本项目也使用内容绑定按钮：鼠标悬浮文章正文区域时，左侧显示保存控件。

### 文章根节点

文章页主要容器通常是：

```text
.Post-Main
.Post-content
.Post-RichTextContainer
```

项目注入按钮时优先绑定：

```text
.Post-content
.Post-RichTextContainer
.Post-Main
```

代码依赖：

```text
src/save-core/target.js -> findArticleRoot()
src/userscript/main.js -> injectArticleControl()
```

### 文章 ID

文章 ID 优先从 URL 或页面语义链接中提取：

```text
location.href
meta[property='og:url']
link[rel='canonical']
meta[itemprop='url']
```

目标 URL 应能解析为：

```text
https://zhuanlan.zhihu.com/p/<article_id>
```

输出文件夹命名：

```text
article-<article_id>
```

代码依赖：

```text
src/save-core/target.js -> extractArticleTarget()
src/shared/url.js -> detectSupportedTarget()
src/shared/url.js -> targetFolderName()
```

### 文章标题

文章标题通常位于：

```text
.Post-Title
h1.Post-Title
meta[property='og:title']
meta[name='title']
```

项目输出字段：

```yaml
title: "..."
```

代码依赖：

```text
src/save-core/target.js -> extractMetadata()
```

### 文章正文根节点

文章正文的 Markdown 解析入口仍是 `.RichText`，常见位置：

```text
.Post-content .RichText
.Post-RichTextContainer .RichText
.Post-RichText
article .RichText
.RichText
```

项目按上述顺序查找正文根节点。

代码依赖：

```text
src/save-core/target.js -> findArticleContentRoot()
src/save-core/markdown.js -> extractPage()
```

### 文章作者信息

作者区域常见选择器：

```text
.Post-Author .UserLink-link
.Post-Author .AuthorInfo-name
.AuthorInfo-name .UserLink-link
.UserLink-link
[itemprop='author']
[itemprop='author'] meta[itemprop='url']
```

项目输出：

```yaml
author: "..."
author_url: "..."
```

代码依赖：

```text
src/save-core/target.js -> extractMetadata()
src/save-core/target.js -> extractAuthorUrl()
```

### 文章时间、赞同数、评论数、喜欢数、收藏数

文章页也优先读取 `meta[itemprop]`：

```text
meta[itemprop='datePublished']
meta[itemprop='dateCreated']
meta[itemprop='dateModified']
meta[itemprop='commentCount']
```

赞同数和评论数的 UI fallback 与回答类似：

```text
.ContentItem-actions .VoteButton
.BottomActions-CommentBtn
.ContentItem-action
```

喜欢数和收藏数同样从文章根节点范围内的底部操作按钮解析。解析逻辑要求按钮文本、`aria-label` 或 `title` 中包含“喜欢”或“收藏”，并且其中存在可解析的数字。

代码依赖：

```text
src/save-core/target.js -> extractTime()
src/save-core/target.js -> extractMetaCount()
src/save-core/target.js -> extractCount()
src/save-core/target.js -> extractActionCount()
```

## 富文本正文结构

无论回答还是文章，正文解析入口都是 `.RichText`。项目只遍历 `.RichText` 的直接子节点，并递归处理部分块级容器。

### 块级元素

项目支持的主要块级结构：

```text
h1
h2
h3
h4
h5
h6
p
blockquote
figure
ul
ol
hr
table
pre
div.highlight
.RichText-LinkCardContainer
video
```

标题映射：

```text
h1 -> #
h2 -> ##
h3 -> ###
h4 -> ####
h5 -> #####
h6 -> ######
```

代码依赖：

```text
src/save-core/markdown.js -> renderBlock()
```

### 行内元素

项目支持的主要行内结构：

```text
strong / b
em / i
br
code
a
span.ztext-math
img
```

代码依赖：

```text
src/save-core/markdown.js -> renderRich()
src/save-core/markdown.js -> renderInlineLink()
src/save-core/markdown.js -> isZhidaEntityLink()
```

普通 `a[href]` 会转换为 Markdown 链接。知乎直答实体解释链接只保留可见文本，不保留链接地址。判断条件是链接指向 `zhida.zhihu.com/search`，或链接参数包含 `zhida_source=entity`。

### 图片

图片通常位于正文中的 `img` 或 `figure img`。项目按顺序选择图片 URL：

```text
data-actualsrc
data-original
data-thumbnail
src
srcset
```

如果图片被识别为 GIF，会尝试把静态图片 URL 推断为 `.gif`。

代码依赖：

```text
src/save-core/markdown.js -> renderImage()
src/save-core/media.js -> selectImageUrl()
src/save-core/media.js -> guessGifUrl()
```

### 视频

视频通常来自：

```text
video[src]
video source[src]
```

项目会渲染为 HTML：

```html
<video src="./assets/video-001.mp4" controls></video>
```

如果视频下载失败，则保留远程 URL。

代码依赖：

```text
src/save-core/markdown.js -> renderVideo()
src/save-core/media.js -> downloadMediaAssets()
```

### 代码块

代码块常见结构：

```text
pre
pre > code
div.highlight
```

语言名从 `code.className` 中的 `language-*` 或 `lang-*` 提取。

代码依赖：

```text
src/save-core/markdown.js -> renderCodeBlock()
```

### 链接卡片

知乎正文中的链接卡片可能使用：

```text
.RichText-LinkCardContainer
```

项目会尝试读取其中的 `a[href]`，并转换为普通 Markdown 链接。知乎直答实体解释链接只保留可见文本。

代码依赖：

```text
src/save-core/markdown.js -> renderBlock()
```

## 保存按钮注入结构

本项目注入的按钮不是知乎原生 DOM。它使用以下类名：

```text
.zhmd-save-control
.zhmd-save-control__inner
.zhmd-save-control__primary
.zhmd-save-control__gear
.zhmd-save-control__menu
.zhmd-save-control__zip
```

注入位置：

- 回答：插入到 `.AnswerItem` 内的 `.RichContent` 前部。
- 文章：插入到 `.Post-content`、`.Post-RichTextContainer` 或 `.Post-Main` 前部。

重复注入控制：

```text
data-zhmd-save-bound="answer"
data-zhmd-save-bound="article"
```

显示逻辑：

```text
.AnswerItem:hover .zhmd-save-control
.Post-content:hover .zhmd-save-control
.Post-RichTextContainer:hover .zhmd-save-control
.zhmd-save-control:hover
```

按钮位于内容左侧，内部使用 sticky 定位，使长回答滚动时按钮仍可见。

代码依赖：

```text
src/userscript/main.js -> injectAnswerControls()
src/userscript/main.js -> injectArticleControl()
src/userscript/ui.js -> createSaveControl()
src/userscript/ui.js -> ensureSaveControlStyle()
```

## 批量保存与手动保存的 DOM 差异

手动保存：

- 入口是用户点击的具体卡片按钮。
- 依赖传入的 `.AnswerItem` 或文章 DOM。
- 不根据当前 URL 决定回答对象。

批量保存：

- 入口是本地服务下发的 URL 任务。
- 依赖 URL 中的 `answer_id` 或 `article_id`。
- 在页面中查找匹配的 `.AnswerItem` 或文章正文。

因此，卡片按钮逻辑和批量保存逻辑共享正文解析与媒体下载，但目标定位方式不同。

## 调试建议

如果保存按钮没有出现，优先检查：

```js
document.querySelectorAll(".AnswerItem").length
document.querySelector(".Post-content, .Post-RichTextContainer, .Post-Main")
```

如果回答卡片按钮没有出现，检查当前卡片是否能提取身份：

```js
const item = document.querySelector(".AnswerItem");
item?.querySelector("meta[itemprop='url']")?.content;
item?.getAttribute("data-zop");
item?.querySelector(".RichContent-inner .RichText, .RichContent .RichText, .RichText.ztext, .RichText");
```

如果正文保存为空，检查：

```js
document.querySelector(".RichText")?.children.length
```

如果元数据缺失，检查：

```js
document.querySelector("meta[itemprop='dateCreated'], meta[itemprop='datePublished']");
document.querySelector("meta[itemprop='dateModified']");
document.querySelector("meta[itemprop='upvoteCount']");
document.querySelector("meta[itemprop='commentCount']");
document.querySelector("[itemprop='author']");
```

如果实际知乎 DOM 与本文档不同，应优先补充一段最小 DOM 示例，包含：

- `.AnswerItem` 或文章根节点；
- `meta[itemprop='url']`；
- `data-zop`；
- 作者区域；
- 时间、赞同数、评论数、喜欢数、收藏数；
- `.RichText` 正文区域。
