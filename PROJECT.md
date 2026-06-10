# 项目说明

本文档面向开发者和 AI Agent，说明当前项目的架构、数据流和关键约束。

本项目由一个 Tampermonkey/油猴脚本和一个本地批量调度 CLI 组成，用于将知乎回答详情页和知乎专栏文章页保存为 Markdown 文件夹或 Markdown ZIP。

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

src/shared/
  url.js

test/
  check-build.mjs
  check-extract.mjs

userscripts/
  zhihu-markdown-saver.user.js
```

## 架构分层

`src/save-core/` 是浏览器内保存核心。它负责展开正文、定位 DOM、提取元数据、渲染 Markdown、下载媒体，并构造页面保存产物。核心产物结构为：

```js
{
  folderName,
  indexMarkdown,
  assets,
  fileName,
  target,
  metadata
}
```

`buildCurrentPageArtifact()` 使用当前 URL 构建产物，供批量模式使用。`buildAnswerItemArtifact()` 和 `buildArticleRootArtifact()` 使用明确传入的 DOM 节点构建产物，供网页端手动保存使用。对应的 ZIP 函数基于同一产物生成 ZIP Blob。

`src/userscript/` 是油猴脚本入口和单页保存界面。它把保存控件注入到回答卡片或文章正文区域；主按钮默认调用浏览器 File System Access API，把产物写入用户授权目录；齿轮菜单中的“下载为 ZIP”调用 FileSaver 下载 ZIP。

`src/batch/` 包含命令行批量调度、本地 HTTP 服务、浏览器端批量客户端和 ZIP 解压逻辑。批量客户端运行在真实知乎页面中，生成 ZIP 后上传给本地服务。本地服务根据配置保存 ZIP 或解压为文件夹。

`src/shared/` 只存放浏览器端和 Node 端都使用的纯工具函数。目前这里包含 URL 识别、清洗和目标文件夹命名逻辑。

## 构建与依赖

Webpack 以 `src/userscript/main.js` 为入口，输出单文件油猴脚本：

```text
userscripts/zhihu-markdown-saver.user.js
```

构建产物不压缩，便于在 Tampermonkey 中查看和调试。

油猴脚本通过 Tampermonkey `@require` 加载浏览器端依赖：

```text
https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js
```

Node 端批量解压使用项目依赖 `jszip`。它安装在项目 `node_modules/` 中，并记录在 `package-lock.json`。

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
4. 用户点击某个控件的“保存”后，`single-save.js` 调用对应的 DOM 驱动 artifact 构建函数。
5. `save-core` 只从绑定的回答卡片或文章区域生成 Markdown、下载媒体并返回保存产物。
6. `directory-save.js` 检查或请求目录写入权限。
7. 如果目标文件夹已存在，抛出错误并停止写入。
8. 如果目标文件夹不存在，创建文件夹、写入 `index.md` 和 `assets/`。

网页端目录写入使用 File System Access API。浏览器不会允许脚本通过字符串路径直接写入系统目录，因此保存根目录必须由用户通过目录选择器授权。目录句柄存放在 IndexedDB 中，后续保存会先检查权限再复用。

齿轮菜单中的“下载为 ZIP”流程调用绑定 DOM 对应的 ZIP 构建函数，再通过 FileSaver 交给浏览器下载。

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
    assets/
  article-789/
    index.md
    assets/
  batch-state.json
  batch-log.jsonl
```

`--extract` 模式下，如果目标文件夹已经存在，该任务会被标记为失败并写入日志，服务端不会覆盖文件夹，队列会继续处理后续任务。

ZIP 解压只接受单个顶层目录。解压模块会拒绝绝对路径、`..` 路径和解析后逃逸目标目录的条目。

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
title: "..."
url: "..."
author: "..."
author_url: "..."
time_created: "..."
time_modified: "..."
time_exported: "..."
upvote_count: 0
comment_count: 0
like_count: 0
favorite_count: 0
---
```

`target.js` 优先从 `meta[itemprop]` 标签读取元数据。回答页通常使用 `dateCreated`、`dateModified`、`upvoteCount`、`commentCount`；文章页通常使用 `datePublished`、`dateModified`、`commentCount`。

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
- 构建后的油猴脚本是否包含预期 metadata、保存入口、批量 API 标记和 frontmatter 字段。
- ZIP 解压是否拒绝路径逃逸，并在目标文件夹已存在时失败。

真实知乎页面中的 DOM、登录状态、媒体 CDN 响应、目录授权和 Tampermonkey 行为需要手动验收。
