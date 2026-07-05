# 项目说明

本文档面向开发者和 AI Agent，说明 Zhihu Archive Kit 的架构、数据流和关键约束。

Zhihu Archive Kit 由一个 Tampermonkey/油猴脚本和一组本地 CLI 工具组成，用于将知乎回答、知乎专栏文章及其评论归档为本地内容文件夹或 ZIP，并生成 HTML 预览和导航页。

## 目录结构

```text
src/save-core/
  build-zip.js
  comments.js
  constants.js
  dom.js
  markdown.js
  media.js
  target.js
  utils.js

src/userscript/
  comment-staging.js
  constants.js
  directory-save.js
  main.js
  single-save.js
  ui.js

src/batch/
  browser-open.mjs
  cli.mjs
  client.js
  config.mjs
  constants.js
  extract-zip.mjs
  server.mjs
  time.js

src/render/
  cli.mjs
  index-cli.mjs
  index-page.mjs
  render.mjs
  serve-cli.mjs
  serve.mjs
  template.mjs

src/shared/
  url.js

test/
  check-build.mjs
  check-extract.mjs
  check-render.mjs
  check-render-index.mjs
  check-render-serve.mjs

userscripts/
  zhihu-archive-kit.user.js
```

## 架构分层

`src/save-core/` 是浏览器内保存核心。它负责展开正文、定位 DOM、提取元数据、渲染 Markdown、下载媒体，并构造页面保存产物。核心产物结构为：

```js
{
  folderName,
  indexMarkdown,
  commentsJson,
  assets,
  fileName,
  target,
  metadata
}
```

`buildCurrentPageArtifact()` 使用当前 URL 构建产物，供批量模式使用。`buildAnswerItemArtifact()` 和 `buildArticleRootArtifact()` 使用明确传入的 DOM 节点构建产物，供网页端手动保存使用。回答元数据还会合并所属问题的 `question_*` 字段；文章不包含这些字段。对应的 ZIP 函数基于同一产物生成 ZIP Blob。

`src/userscript/` 是油猴脚本入口和单页保存界面。它把保存控件注入到回答卡片或文章正文区域；主按钮默认调用浏览器 File System Access API，把产物写入用户授权目录；齿轮菜单中的“下载为 ZIP”调用 FileSaver 下载 ZIP。评论暂存按钮也在这一层注入，暂存数据只保存在当前页面内存中。

`src/batch/` 包含命令行批量调度、本地 HTTP 服务、浏览器端批量客户端和 ZIP 解压逻辑。批量客户端运行在真实知乎页面中，生成 ZIP 后上传给本地服务。本地服务根据配置保存 ZIP 或解压为文件夹。

`src/render/` 包含静态 HTML 预览、导航页生成器和本地浏览服务。它只读取已保存内容文件夹中的 `index.md`、`comments.json` 和 `assets/`，生成内容目录内的 `preview.html` 或保存根目录下的 `index.html`，不读取知乎页面 DOM。

`src/shared/` 只存放浏览器端和 Node 端都使用的纯工具函数。目前这里包含 URL 识别、清洗和目标文件夹命名逻辑。

## 构建与依赖

Webpack 以 `src/userscript/main.js` 为入口，输出单文件油猴脚本：

```text
userscripts/zhihu-archive-kit.user.js
```

构建产物不压缩，便于在 Tampermonkey 中查看和调试。

油猴脚本通过 Tampermonkey `@require` 加载浏览器端依赖：

```text
https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js
```

Node 端批量解压使用项目依赖 `jszip`。HTML 预览生成器使用项目依赖 `marked` 将 Markdown 转为 HTML。它们安装在项目 `node_modules/` 中，并记录在 `package-lock.json`。

## 目标识别与命名

网页端支持的页面路径包括：

```text
https://www.zhihu.com/question/<question_id>/answer/<answer_id>
https://www.zhihu.com/answer/<answer_id>
https://www.zhihu.com/question/<question_id>
https://zhuanlan.zhihu.com/p/<article_id>
```

回答输出文件夹统一命名为：

```text
question-<question_id>-answer-<answer_id>
```

文章输出文件夹统一命名为：

```text
article-<article_id>
```

如果回答 URL 或页面 DOM 都无法提供 `question_id`，保存流程会报错。这样可以保证回答输出名称始终符合项目约定。

## 单页保存流程

1. `main.js` 监听知乎 SPA 页面变化。
2. 问题页或回答详情页中，脚本扫描 `.AnswerItem`，为每个有效回答卡片注入一次保存控件。
3. 专栏文章页中，脚本为文章正文区域注入一次保存控件。
4. 用户点击某个控件的“保存”后，`single-save.js` 先打开收藏夹选择菜单。
5. `directory-save.js` 检查或请求默认保存目录写入权限，并确保真实目录 `默认收藏夹/collection.json` 存在。
6. 用户选择已有收藏夹，或输入名称和可选描述创建新收藏夹。
7. 用户点击菜单中的“保存”后，`single-save.js` 调用对应的 DOM 驱动 artifact 构建函数。
8. `save-core` 只从绑定的回答卡片或文章区域生成 Markdown、下载媒体并返回保存产物。
9. 如果所选收藏夹中的目标内容文件夹已存在，抛出错误并停止写入。
10. 如果目标内容文件夹不存在，在所选收藏夹内创建文件夹、写入 `index.md`、`comments.json` 和 `assets/`。

网页端目录写入使用 File System Access API。浏览器不会允许脚本通过字符串路径直接写入系统目录，因此保存根目录必须由用户通过目录选择器授权。目录句柄存放在 IndexedDB 中，后续保存会先检查权限再复用。收藏夹是保存根目录下的一级子目录，每个收藏夹目录都包含：

```json
{
  "schema_version": 1,
  "name": "收藏夹名称",
  "time_created": "2026-06-13T12:00:00.000+08:00",
  "description": ""
}
```

`默认收藏夹` 是真实目录名，不是根目录别名。根目录直接内容不属于任何收藏夹。

齿轮菜单中的“下载为 ZIP”流程调用绑定 DOM 对应的 ZIP 构建函数，再通过 FileSaver 交给浏览器下载。

## 评论保存流程

评论保存参考 `others/zhihu-backup-collect` 的暂存机制。脚本不调用知乎评论 API，也不自动翻页或展开回复；它只解析用户已经打开并加载到 DOM 中的评论。

1. `comment-staging.js` 监听评论区、查看全部评论、查看回复和 modal 打开等页面变化。
2. 发现 `.Comments-container` 或 modal 评论容器后，在 `.css-1onritu` 附近注入“暂存当前评论 / 查看暂存数 / 清空暂存”。
3. 用户点击暂存时，`comments.js` 解析当前容器内带 `[data-id]` 和 `.CommentContent` 的评论节点。
4. 暂存区按 `answer:<question_id>:<answer_id>` 或 `article:<article_id>` 隔离，并用 `Map` 按评论 ID 去重。
5. 手动保存回答或文章时，`main.js` 通过 `commentsProvider` 把当前 target 的暂存评论传给保存核心。
6. `build-zip.js` 下载评论图片、替换 `image_url`，并生成固定结构的 `comments.json`；没有暂存评论时 `comments` 为空数组。

`comments.json` 的顶层结构为：

```json
{
  "schema_version": 1,
  "url": "...",
  "time_exported": "...",
  "staged_count": 0,
  "comments": []
}
```

`comments.json` 只保存评论区自身数据，不保存回答或文章的 `target` 身份字段。回答/文章类型、ID 和所属问题信息以 `index.md` frontmatter 为准。单条评论包含 `id`、`author`、`author_url`、`content`、`time_created`、`like_count`、`ip_location`、`image_url`、`reply_to_author`、`reply_to_author_url` 和 `children`。`time_created` 只保留年月日，格式为 `YYYY-MM-DD`；页面中的相对时间会按保存时的本地日期折算。二级评论只出现在父评论的 `children` 中。评论图片下载成功时，`image_url` 指向 `./assets/comment-image-001.ext`；下载失败时保留远程 URL。

## 批量保存流程

1. 用户运行 `npm run batch -- urls.json` 或 `npm run batch -- urls.json --extract`。
2. `config.mjs` 读取 JSON、填充默认值、过滤并去重 URL。
3. `server.mjs` 在 `127.0.0.1` 启动本地 API 服务。
4. `browser-open.mjs` 用默认浏览器或指定浏览器打开第一个任务 URL。
5. 油猴脚本中的 `client.js` 探测本地服务并请求当前任务。
6. 当前页面不匹配任务 URL 时，客户端使用 `location.assign()` 跳转。
7. 当前页面匹配任务 URL 时，客户端调用 `buildCurrentPageZip()`。
8. 客户端通过 `POST /api/job/:id/zip` 上传 ZIP Blob。
9. 服务端保存 ZIP，或在 `--extract` 模式下调用 `extract-zip.mjs` 解压。
10. 服务端写入 `batch-state.json` 和 `batch-log.jsonl`，再返回下一项等待时间。
11. 所有任务完成后，本地服务关闭，CLI 进程退出。

## 批量输出

ZIP 模式输出：

```text
output/
  question-123-answer-456.zip
  article-789.zip
  batch-state.json
  batch-log.jsonl
```

`--extract` 模式输出：

```text
output/
  question-123-answer-456/
    index.md
    comments.json
    assets/
  article-789/
    index.md
    comments.json
    assets/
  batch-state.json
  batch-log.jsonl
```

`--extract` 模式下，如果目标文件夹已经存在，该任务会被标记为失败并写入日志，服务端不会覆盖文件夹，队列会继续处理后续任务。

ZIP 解压只接受单个顶层目录。解压模块会拒绝绝对路径、`..` 路径和解析后逃逸目标目录的条目。

批量模式不自动打开或解析评论区，因此批量产物中的 `comments.json` 使用空评论数组。

## HTML 预览流程

用户运行：

```bash
npm run render -- output/question-123-answer-456
```

`render/cli.mjs` 要求传入一个内容文件夹路径。`render.mjs` 读取 `index.md` 和 `comments.json`，解析 Markdown frontmatter，用 `marked` 渲染正文和评论正文，再由 `template.mjs` 生成单文件 HTML。回答详情预览页会展示 `question_*` 问题元信息；导航页列表保持轻量，不展示这些问题字段。

输出固定为：

```text
preview.html
```

`preview.html` 与 `assets/` 保持同级，因此正文图片、视频和评论图片继续使用项目已有的相对路径。页面使用和导航页相同的内容卡片模板，默认显示完整正文，评论区由卡片底部的“评论区”按钮展开。

## HTML 导航页流程

用户运行：

```bash
npm run render:index
npm run render:index -- output
```

`index-cli.mjs` 默认扫描 `output/`，也可以接收一个保存根目录。`index-page.mjs` 只扫描根目录下带 `collection.json` 的一级收藏夹目录，跳过根目录直存内容和无元数据目录。

每个收藏夹内部的直接子目录如果同时包含 `index.md` 和 `comments.json`，会先通过 `renderSavedFolder()` 生成或刷新 `preview.html`。导航页随后读取 frontmatter、收藏夹元数据和摘要，按 `time_exported` 倒序生成：

```text
index.html
```

导航页只内置标题、摘要、元数据、收藏夹名、原文 URL 和 `preview.html` 相对路径，不内嵌完整正文和评论。新保存内容优先读取 frontmatter 中的 `content_excerpt`；旧内容没有该字段时再从 Markdown 正文生成摘要。左侧悬浮收藏夹菜单来自 `collection.json`，支持“所有”和单个收藏夹筛选；搜索和回答/文章类型筛选继续叠加生效。筛选结果在客户端分页显示，`index-page.mjs` 中的 `PAGE_SIZE = 20` 控制每页数量；切换收藏夹、类型或搜索时回到第一页。卡片元信息行读取作者、创建时间、修改时间和导出时间；导出时间作为右侧独立字段显示。页面通过 `fetch()` 按需读取对应 `preview.html`，用 `DOMParser` 抽取 `[data-card-body]` 或 `[data-comments]`，并把 `./assets/...` 这类相对资源路径改写为内容目录下的路径。正文展开时隐藏摘要行，并在同一位置加载完整正文，避免把引用、链接卡片或段落结构裁剪断开。标题链接在新窗口打开单页预览，右上角“阅读原文”链接在新窗口打开知乎原文。`preview.html` 和导航页卡片共用同一套渲染模板；区别是单篇预览默认显示全文，不显示摘要折叠控件。

推荐通过本地服务打开：

```bash
npm run render:serve
npm run render:serve -- output --port 17892
```

`serve.mjs` 会先刷新导航页，再用 Node 内置 HTTP 服务托管保存根目录。服务只绑定 `127.0.0.1`。分页是导航页里的客户端行为，不新增 HTTP 分页接口。收藏夹内内容的动态加载路径包含收藏夹目录层级，例如 `默认收藏夹/question-xxx-answer-yyy/preview.html`。直接用 `file://` 打开 `index.html` 只能浏览列表，展开正文或评论时会提示使用本地服务。

## localhost API

批量服务只监听 `127.0.0.1`：

```text
GET  /api/job/current
POST /api/job/:id/zip
POST /api/job/:id/fail
GET  /api/state
```

`/api/job/current` 返回当前任务、队列状态和计数。

`/api/job/:id/zip` 接收油猴脚本上传的 ZIP Blob，并按当前输出模式写入磁盘。

`/api/job/:id/fail` 记录浏览器端保存失败原因。连续失败或检测到风控原因时，队列会暂停。

`/api/state` 用于查看当前批量状态。

## Markdown 渲染

Markdown frontmatter 字段为：

```yaml
---
source_type: "answer"
title: "..."
url: "..."
author: "..."
author_url: "..."
time_created: "..."
time_modified: "..."
time_exported: "..."
question_title: "..."
question_description: "..."
question_url: "..."
question_time_created: "..."
question_time_modified: "..."
question_answer_count: 0
question_comment_count: 0
question_follower_count: 0
question_topic: "..."
upvote_count: 0
comment_count: 0
like_count: 0
favorite_count: 0
content_excerpt: "..."
---
```

`source_type` 由保存目标写入，值为 `answer` 或 `article`。回答的 `title` 由 `question_title` 和作者名生成，格式为 `question_title - author的回答`；文章的 `title` 仍是文章标题。`content_excerpt` 由保存核心从 Markdown 正文生成，是本地导航页使用的纯文本摘要。

`target.js` 优先从 `meta[itemprop]` 标签读取元数据。回答页通常使用 `dateCreated`、`dateModified`、`upvoteCount`、`commentCount`；文章页通常使用 `datePublished`、`dateModified`、`commentCount`。回答所属问题的元信息从 `.QuestionPage` 范围内读取 `name`、`url`、`dateCreated`、`dateModified`、`answerCount`、`commentCount`、`zhihu:followerCount` 和 `keywords`，并写入 `question_*` frontmatter 字段；回答预览页和本地导航页中的问题标题读取 `question_title`；`question_description` 由 `.QuestionRichText` 当前渲染内容生成，折叠时保存可见文本，展开时保存完整富文本 Markdown，图片使用 `question-image` 资源前缀；`question_url` 只来自 `meta[itemprop='url']`，缺失时保存为空字符串；`question_topic` 是逗号分隔字符串。

喜欢数和收藏数通常没有对应的 `meta[itemprop]`，项目会在当前回答/文章容器内查找包含“喜欢”或“收藏”的底部操作按钮，并从按钮文本、`aria-label` 或 `title` 中解析数量。

标题层级映射如下：

```text
h1 -> #
h2 -> ##
h3 -> ###
h4 -> ####
h5 -> #####
h6 -> ######
```

正文中的普通链接会渲染为 Markdown 链接。知乎直答实体解释链接会渲染为纯文本；匹配条件是链接指向 `zhida.zhihu.com/search`，或链接参数包含 `zhida_source=entity`。

媒体会先在 Markdown 中登记为占位符。下载成功后替换为 `./assets/...`，下载失败时保留远程 URL。媒体下载采用有限并发，单个媒体请求超时后会回退到远程 URL。

## 反爬虫相关策略

批量模式采用保守调度：

- 严格串行，一次只处理一个 URL。
- 每个任务完成后默认等待 `15-45` 秒。
- 检测到知乎风控、验证码、安全验证或 403 提示时暂停队列。
- 连续失败 3 次后暂停队列。
- 不并发请求，不调用知乎内部 API，不使用代理池、cookie 池或浏览器指纹伪装。

## 常用命令

安装依赖：

```bash
npm install --cache .npm-cache
```

构建油猴脚本：

```bash
npm run build
```

启动批量任务：

```bash
npm run batch -- urls.json
npm run batch -- urls.json --extract
npm run batch -- urls.json --browser chrome
```

渲染保存结果：

```bash
npm run render -- output/question-123-answer-456
```

生成导航页：

```bash
npm run render:index
```

本地浏览导航页：

```bash
npm run render:serve
```

检查源码和构建产物：

```bash
npm run check
```

运行完整检查：

```bash
npm test
```

## 验证范围

自动检查覆盖：

- Webpack 能否成功构建油猴脚本。
- 源码模块和构建产物能否通过 `node --check`。
- 构建后的油猴脚本是否包含预期 metadata、保存入口、评论暂存入口、批量 API 标记和 frontmatter 字段。
- ZIP 解压是否拒绝路径逃逸，并在目标文件夹已存在时失败。
- HTML 预览生成器能否读取保存结果并生成包含正文、评论和图片路径的 `preview.html`。
- HTML 导航页生成器能否扫描保存根目录、刷新预览页、跳过无效目录并生成轻量 `index.html`。
- 本地浏览服务能否只绑定 `127.0.0.1`，并正确返回导航页、单篇预览页和 404。

真实知乎页面中的 DOM、登录状态、媒体 CDN 响应、目录授权和 Tampermonkey 行为需要手动验收。
