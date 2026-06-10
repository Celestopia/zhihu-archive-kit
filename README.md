# 知乎 Markdown 保存工具

本项目用于把知乎回答和知乎专栏文章保存为本地 Markdown 文件，并把图片、视频等媒体文件放到同一个内容文件夹中。

支持两种使用方式：

- 网页端单页保存：悬浮回答卡片或文章正文，点击左侧“保存”。
- 命令行批量保存：从 JSON 文件读取 URL 列表，逐个保存。

## 支持范围

支持以下页面：

- 知乎回答详情页：`https://www.zhihu.com/question/.../answer/...`
- 知乎回答详情页：`https://www.zhihu.com/answer/...`
- 知乎问题页：`https://www.zhihu.com/question/...`
- 知乎专栏文章页：`https://zhuanlan.zhihu.com/p/...`

本项目只保存正文，不保存评论区。

## 保存结果

回答保存为：

```text
question-<question_id>-answer-<answer_id>/
  index.md
  assets/
```

文章保存为：

```text
article-<article_id>/
  index.md
  assets/
```

其中：

- `index.md` 是转换后的 Markdown 正文。
- `assets/` 存放成功下载到本地的媒体文件。
- 如果某个媒体下载失败，Markdown 中会保留原始远程链接。
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
---
```

## 安装油猴脚本

构建后的油猴脚本文件是：

```text
userscripts/zhihu-markdown-saver.user.js
```

安装步骤：

1. 在 Chrome 或 Edge 中安装 Tampermonkey。
2. 打开 Tampermonkey 管理页面。
3. 新建脚本。
4. 将 `userscripts/zhihu-markdown-saver.user.js` 的完整内容粘贴进去。
5. 保存脚本。
6. 确认该浏览器已经登录知乎。

网页端保存为文件夹依赖浏览器的 File System Access API，建议使用 Chrome 或 Edge。

## 单页保存

打开支持的知乎页面后，把鼠标悬浮到某个回答卡片或文章正文区域，左侧会出现“保存”控件。

在问题页中，每个回答卡片都有自己的保存控件。点击某个卡片左侧的“保存”时，只会保存该卡片对应的回答，不会根据当前网页 URL 选择其它回答。

专栏文章页也使用同样的左侧悬浮控件，按钮绑定到文章正文区域。

第一次点击“保存”时，浏览器会要求你选择一个保存目录。授权后，脚本会在该目录下创建回答或文章文件夹。之后再次保存时，脚本会优先复用已授权的目录；如果权限失效，浏览器会再次请求授权。

浏览器安全机制不允许油猴脚本通过文本配置任意系统路径，因此网页端的默认保存位置必须由你在目录选择器中授权。

如果只想下载 ZIP，把鼠标悬浮到“保存”按钮右侧的齿轮图标上，点击“下载为 ZIP”。ZIP 会通过浏览器下载到默认下载目录。

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
    assets/
  article-789/
    index.md
    assets/
  batch-state.json
  batch-log.jsonl
```

如果某个目标文件夹已经存在，该任务会被标记为失败，批量流程会继续处理后续 URL。

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
userscripts/zhihu-markdown-saver.user.js
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
