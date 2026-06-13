# Zhihu Archive Kit

Zhihu Archive Kit 用于把知乎回答和知乎专栏文章归档到本地，保存 Markdown 正文、媒体资源、评论数据、收藏夹结构，并提供本地 HTML 预览和导航页。

支持四种使用方式：

- 网页端单页保存：悬浮回答卡片或文章正文，点击左侧“保存”。
- 命令行批量保存：从 JSON 文件读取 URL 列表，逐个保存。
- HTML 预览：把已保存的内容文件夹渲染为可直接打开的网页。
- HTML 导航页：聚合 `output/` 下的保存结果，生成可检索的本地导航页。

## 支持范围

支持以下页面：

- 知乎回答详情页：`https://www.zhihu.com/question/.../answer/...`
- 知乎回答详情页：`https://www.zhihu.com/answer/...`
- 知乎问题页：`https://www.zhihu.com/question/...`
- 知乎专栏文章页：`https://zhuanlan.zhihu.com/p/...`

本项目保存正文，并支持把手动暂存的评论保存为 `comments.json`。

## 保存结果

回答保存为：

```text
question-<question_id>-answer-<answer_id>/
  index.md
  comments.json
  assets/
```

文章保存为：

```text
article-<article_id>/
  index.md
  comments.json
  assets/
```

其中：

- `index.md` 是转换后的 Markdown 正文。
- `comments.json` 是评论暂存结果；未暂存评论时也会生成空评论文件。
- `assets/` 存放成功下载到本地的媒体文件。
- 如果某个媒体下载失败，Markdown 中会保留原始远程链接。
- 知乎直答实体解释链接会保存为纯文本，不保留 `zhida.zhihu.com` 链接。
- 如果目标文件夹已经存在，本项目会报错并停止本次保存，不会覆盖已有文件夹。

`index.md` 头部包含元数据：

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

## 安装油猴脚本

构建后的油猴脚本文件是：

```text
userscripts/zhihu-archive-kit.user.js
```

安装步骤：

1. 在 Chrome 或 Edge 中安装 Tampermonkey。
2. 打开 Tampermonkey 管理页面。
3. 新建脚本。
4. 将 `userscripts/zhihu-archive-kit.user.js` 的完整内容粘贴进去。
5. 保存脚本。
6. 确认该浏览器已经登录知乎。

网页端保存为文件夹依赖浏览器的 File System Access API，建议使用 Chrome 或 Edge。

## 单页保存

打开支持的知乎页面后，把鼠标悬浮到某个回答卡片或文章正文区域，左侧会出现“保存”控件。

在问题页中，每个回答卡片都有自己的保存控件。点击某个卡片左侧的“保存”时，只会保存该卡片对应的回答，不会根据当前网页 URL 选择其它回答。

专栏文章页也使用同样的左侧悬浮控件，按钮绑定到文章正文区域。

第一次点击“保存”时，浏览器会要求你选择一个默认保存目录。授权后，脚本会在该目录下创建真实的 `默认收藏夹` 子目录，并在其中写入 `collection.json`。之后每次点击“保存”都会先打开收藏夹菜单，你可以选择 `默认收藏夹`、其它已有收藏夹，或新建收藏夹后再保存。

网页端保存后的目录结构类似：

```text
默认保存目录/
  默认收藏夹/
    collection.json
    question-123-answer-456/
      index.md
      comments.json
      assets/
  技术收藏/
    collection.json
    article-789/
      index.md
      comments.json
      assets/
```

新建收藏夹时需要输入收藏夹名称，也可以输入可选描述。收藏夹名称就是目录名，不能留空，不能包含 `/` 或 `\`。如果同一收藏夹中目标回答/文章文件夹已经存在，本项目会报错并停止本次保存，不会覆盖已有文件夹。

浏览器安全机制不允许油猴脚本通过文本配置任意系统路径，因此网页端的默认保存位置必须由你在目录选择器中授权。

如果只想下载 ZIP，把鼠标悬浮到“保存”按钮右侧的齿轮图标上，点击“下载为 ZIP”。ZIP 会通过浏览器下载到默认下载目录。

## 评论保存

评论保存需要先手动暂存：

1. 打开回答或文章的评论区。
2. 手动展开需要保存的评论、二级回复或“查看全部评论”弹窗。
3. 点击评论区里的“暂存当前评论”。
4. 继续加载更多评论后，可以重复点击暂存；脚本会按评论 ID 去重。
5. 最后点击回答或文章左侧的“保存”或齿轮菜单里的“下载为 ZIP”。

保存结果中的 `comments.json` 会包含评论 ID、作者、作者主页、正文、发布时间、喜欢数、IP 属地、评论图片路径和二级回复结构。评论图片会下载到 `assets/`，文件名形如 `comment-image-001.png`；如果下载失败，`image_url` 会保留远程 URL。评论暂存只保存在当前页面内存中，刷新页面后需要重新暂存。

## 批量保存

批量保存由命令行和油猴脚本协作完成：

- 命令行读取 URL 列表、启动本地队列服务、保存输出文件。
- 油猴脚本在真实知乎页面中逐个打开 URL、解析 DOM、生成 ZIP，并上传给本地服务。

### JSON 配置

创建一个 JSON 文件，例如 `urls.json`：

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

字段说明：

- `urls`：要保存的知乎回答或文章 URL。
- `output_dir`：批量输出目录，默认是 `output`。
- `delay.min_seconds` / `delay.max_seconds`：每个任务之间的随机等待时间，默认是 `15-45` 秒。

### 保存为 ZIP

```bash
npm run batch -- urls.json
```

输出示例：

```text
output/
  question-123-answer-456.zip
  article-789.zip
  batch-state.json
  batch-log.jsonl
```

### 保存为文件夹

启用 `--extract` 后，批量保存会自动解压 ZIP，只保留文件夹：

```bash
npm run batch -- urls.json --extract
```

输出示例：

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

如果某个目标文件夹已经存在，该任务会被标记为失败，批量流程会继续处理后续 URL。

批量模式不会自动打开或抓取评论区，因此批量输出中的 `comments.json` 为空评论文件。

### 指定浏览器

默认会用系统默认浏览器打开第一个任务 URL。也可以指定浏览器：

```bash
npm run batch -- urls.json --browser chrome
npm run batch -- urls.json --browser edge
npm run batch -- urls.json --browser "C:\\Path\\To\\browser.exe"
```

## 批量访问节奏

批量任务严格串行执行，一次只处理一个 URL。每个任务完成后会等待一段随机时间再继续。

如果检测到知乎风控提示、验证码、安全验证页面或连续失败，队列会暂停，不会继续访问后续 URL。

当队列全部完成后，命令行中的本地服务会自动停止，PowerShell 会恢复可输入状态。

## 渲染为 HTML

已保存的内容文件夹可以渲染为静态 HTML 页面：

```bash
npm run render -- output/question-123-answer-456
```

命令会读取该文件夹中的：

```text
index.md
comments.json
assets/
```

并生成：

```text
preview.html
```

`preview.html` 与 `assets/` 位于同一文件夹内，可以直接用浏览器打开。页面上方显示回答或文章正文，下方是可展开的评论区。每次运行会覆盖同名 `preview.html`，不会修改 `index.md`、`comments.json` 或 `assets/`。

## 生成导航页

可以为 `output/` 根目录生成一个聚合导航页：

```bash
npm run render:index
```

也可以指定其它保存根目录：

```bash
npm run render:index -- output
```

命令会扫描根目录下的一级收藏夹目录。收藏夹目录需要包含 `collection.json`；每个收藏夹内部的直接子目录如果同时包含 `index.md` 和 `comments.json`，就会被视为一个有效内容目录。根目录下直接保存的旧内容目录不会进入导航页。

```text
index.html
```

导航页默认只保存标题、摘要和元数据。左侧悬浮收藏夹菜单可以在“所有”、`默认收藏夹` 和其它收藏夹之间切换；搜索和回答/文章筛选会继续叠加生效。筛选结果会分页显示，默认每页 20 条；页码、上一页和下一页按钮位于列表底部。卡片第二行显示作者、创建时间、修改时间和导出时间，其中导出时间靠右显示。点击摘要后的“阅读全文”时，摘要行会被完整正文替换；展开后可以点击右上角的“收起全文”或正文末尾的“收起”退回摘要状态。点击底部“评论区”时，页面会按需加载对应内容目录里的评论区。点击标题会在新窗口打开单页预览，点击右上角“阅读原文”会在新窗口打开知乎原文。

推荐用本地服务打开导航页：

```bash
npm run render:serve
```

也可以指定保存根目录和端口：

```bash
npm run render:serve -- output --port 17892
```

服务只监听 `127.0.0.1`。打开命令输出的本地地址后，可以按收藏夹、标题、作者、摘要和回答/文章类型筛选。直接用 `file://` 打开 `output/index.html` 时仍能查看列表，但浏览器通常会限制动态加载本地文件，因此无法展开正文和评论。

## 从源码构建

需要 Node.js 20 或更高版本。

安装依赖：

```bash
npm install --cache .npm-cache
```

构建油猴脚本：

```bash
npm run build
```

运行后会生成：

```text
userscripts/zhihu-archive-kit.user.js
```

## 检查

运行语法和构建产物检查：

```bash
npm run check
```

运行完整检查：

```bash
npm test
```

真实知乎页面的 DOM、登录状态、目录授权和媒体下载行为需要在浏览器中手动验证。
