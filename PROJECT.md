# 项目说明

> 本文档面向开发者和 AI Agent，用于说明当前项目架构和关键运行逻辑。

本项目构建一个 Tampermonkey/油猴脚本和一个本地批量调度 CLI，用于将知乎回答详情页和知乎专栏文章页保存为 Markdown ZIP 文件。

内容提取和 ZIP 生成运行在真实浏览器的知乎页面中；批量模式下，本地 CLI 负责读取 URL、调度队列、接收 ZIP 并写入磁盘。

## 目录结构

```text
src/save-core/
  build-zip.js
  constants.js
  dom.js
  markdown.js
  media.js
  target.js
  utils.js

src/userscript/
  constants.js
  main.js
  single-save.js
  ui.js

src/batch/
  browser-open.mjs
  cli.mjs
  client.js
  constants.js
  config.mjs
  server.mjs
  time.js

src/shared/
  url.js

test/
  check-build.mjs

userscripts/
  zhihu-markdown-saver.user.js
```

## 架构分层

`src/save-core/` 是浏览器内保存核心。它负责从当前知乎页面 DOM 中提取正文和元数据，转换 Markdown，下载媒体文件，生成 ZIP Blob。它不处理按钮、不调用 FileSaver，也不和 localhost 队列通信。

`src/userscript/` 是油猴脚本入口和单页保存功能。它负责监听页面变化、注入“保存为 ZIP”按钮、处理按钮状态，并启动浏览器端批量客户端。

`src/batch/` 包含两部分：Node CLI 和浏览器端批量客户端。Node CLI 读取 JSON 配置、启动本地 HTTP 服务、可选打开浏览器、维护队列状态并保存 ZIP。浏览器端批量客户端被打包进油猴脚本，在知乎页面中向 localhost 请求任务并上传 ZIP。批量专用的默认配置、队列状态和调度时间工具也放在这个目录下。

`src/shared/` 只存放真正同时服务单页保存和批量保存的纯工具函数。目前这里保留 URL 识别和清洗逻辑，因为 `save-core` 和 `batch` 都需要使用同一套支持范围判断。

## 构建方式

Webpack 以 `src/userscript/main.js` 作为入口文件，构建产物写入：

```text
userscripts/zhihu-markdown-saver.user.js
```

构建产物不做压缩，方便在 Tampermonkey 中查看和调试。

Tampermonkey metadata 由 `webpack.config.cjs` 注入。当前脚本匹配：

```text
https://www.zhihu.com/question/*/answer/*
https://www.zhihu.com/answer/*
https://zhuanlan.zhihu.com/p/*
```

脚本通过 `@require` 加载：

```text
https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js
```

脚本使用页面上下文运行，因此 metadata 包含：

```text
@grant none
```

批量模式访问 localhost 时使用普通 `fetch`，本地服务负责返回 CORS 头。

## 单页保存流程

1. `main.js` 判断当前 URL 是否属于支持范围。
2. 脚本等待回答或文章正文节点出现在 DOM 中。
3. `ui.js` 注入固定位置的“保存为 ZIP”按钮。
4. 用户点击按钮后，`single-save.js` 调用 `buildCurrentPageZip()`。
5. `save-core` 展开正文、提取 DOM、转换 Markdown、下载媒体并生成 ZIP Blob。
6. `single-save.js` 使用 FileSaver 将 ZIP 交给浏览器下载。

## 批量保存流程

1. 用户运行 `npm run batch -- urls.json`。
2. `config.mjs` 读取 JSON、填充默认值、去重并过滤 URL。
3. `server.mjs` 在 `127.0.0.1` 启动本地 API 服务。
4. `browser-open.mjs` 用默认浏览器或指定浏览器打开第一个任务 URL。
5. 油猴脚本中的 `client.js` 探测本地服务。
6. 客户端通过 `GET /api/job/current` 获取任务。
7. 当前页面不匹配任务 URL 时，客户端使用 `location.assign()` 跳转。
8. 当前页面匹配任务 URL 时，客户端调用 `buildCurrentPageZip()` 生成 ZIP Blob。
9. 客户端通过 `POST /api/job/:id/zip` 上传 ZIP。
10. 服务端写入 ZIP、状态文件和日志，然后返回下一次访问前的随机等待时间。
11. 所有任务完成后，服务端关闭 localhost 服务，CLI 进程退出。

## localhost API

批量服务只监听 `127.0.0.1`。API 如下：

```text
GET  /api/job/current
POST /api/job/:id/zip
POST /api/job/:id/fail
GET  /api/state
```

`/api/job/current` 返回当前任务、队列状态和计数。

`/api/job/:id/zip` 接收油猴脚本上传的 ZIP Blob，并保存到输出目录。

`/api/job/:id/fail` 记录当前任务失败原因。连续失败或检测到风控原因时，队列会暂停。

`/api/state` 用于查看当前批量状态。

## 批量配置和输出

JSON 配置格式：

```json
{
  "output_dir": "output",
  "delay": {
    "min_seconds": 15,
    "max_seconds": 45
  },
  "urls": [
    "https://www.zhihu.com/question/123/answer/456",
    "https://zhuanlan.zhihu.com/p/789"
  ]
}
```

批量输出结构：

```text
output/
  001-answer-456.zip
  002-article-789.zip
  batch-state.json
  batch-log.jsonl
```

ZIP 内部结构保持一致：

```text
answer-<id>/
  index.md
  assets/

article-<id>/
  index.md
  assets/
```

## 元数据和 Markdown

Markdown frontmatter 字段为：

```yaml
---
title: "..."
url: "..."
author: "..."
author_url: "..."
time_created: "..."
time_modified: "..."
time_exported: "..."
upvote_count: 0
comment_count: 0
---
```

`target.js` 优先从 `meta[itemprop]` 标签读取元数据。回答页通常使用 `dateCreated`、`dateModified`、`upvoteCount`、`commentCount`；文章页通常使用 `datePublished`、`dateModified`、`commentCount`。

标题层级映射如下：

```text
h1 -> #
h2 -> ##
h3 -> ###
h4 -> ####
h5 -> #####
h6 -> ######
```

媒体会先在 Markdown 中登记为占位符。下载成功后替换为 `./assets/...`，下载失败时保留远程 URL。

媒体下载采用有限并发，单个媒体请求超时后会回退到远程 URL，避免某个 CDN 请求长时间阻塞整个保存流程。

## 反爬虫相关策略

批量模式采用保守调度，不做绕过行为：

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
npm run batch -- urls.json --browser chrome
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
- `save-core`、`userscript`、`batch` 和真正共享的 `shared` 模块能否通过 `node --check`。
- 生成后的油猴脚本是否包含预期 metadata、批量 API 标记和关键 frontmatter 字段。

真实知乎页面中的 DOM、登录状态、媒体 CDN 响应和 Tampermonkey 行为需要手动验收。
