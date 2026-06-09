# 知乎 Markdown 保存工具

本项目用于把知乎回答或知乎专栏文章保存为本地 Markdown ZIP 文件。

项目支持两种使用方式：

- 在网页右下角点击按钮，保存当前单个回答或文章。
- 在命令行启动批量任务，从 JSON 文件读取 URL 列表，逐个保存多个回答或文章。

## 支持范围

支持以下页面：

- 知乎回答详情页
  - `https://www.zhihu.com/question/.../answer/...`
  - `https://www.zhihu.com/answer/...`
- 知乎专栏文章页
  - `https://zhuanlan.zhihu.com/p/...`

本项目只保存正文，评论区内容不会被保存。

## 保存结果

每个回答或文章都会保存为一个 ZIP。ZIP 内部结构如下：

```text
answer-<id>/
  index.md
  assets/

article-<id>/
  index.md
  assets/
```

其中：

- `index.md` 是转换后的 Markdown 正文。
- `assets/` 存放成功下载到本地的图片、视频等媒体文件。
- 如果某个媒体文件下载失败，Markdown 中会保留原始远程链接，ZIP 仍会正常生成。

`index.md` 文件头部包含元数据：

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

1. 在浏览器中安装 Tampermonkey插件；
2. 打开 Tampermonkey 管理页面；
3. 新建脚本；
4. 将 `userscripts/zhihu-markdown-saver.user.js` 的完整内容粘贴进去；
5. 保存脚本；
6. 确认该浏览器已经登录知乎。

## 单页保存

打开一个支持的知乎回答或文章页面，点击右下角“保存为 ZIP”按钮即可。

单页保存会通过浏览器直接下载 ZIP 文件。

## 批量保存

批量保存由两部分协作完成：

- 命令行程序读取 URL 列表、启动本地服务、保存 ZIP 文件。
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

### 启动批量服务

启动本地服务，并自动用系统默认浏览器打开第一个任务 URL：

```bash
npm run batch -- urls.json
```

指定浏览器打开：

```bash
npm run batch -- urls.json --browser chrome
npm run batch -- urls.json --browser edge
npm run batch -- urls.json --browser "C:\\Path\\To\\browser.exe"
```

批量输出目录示例：

```text
output/
  001-answer-456.zip
  002-article-789.zip
  batch-state.json
  batch-log.jsonl
```

### 批量保存的访问节奏

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

运行后，会在项目目录下生成：

```text
userscripts/zhihu-markdown-saver.user.js
```

## 检查

运行语法和构建产物检查：

```bash
npm run check
```

运行完整检查命令：

```bash
npm test
```

真实知乎页面的 DOM、登录状态和媒体下载行为需要在浏览器中手动验证。

## 声明

本项目主要由 Codex（GPT-5.5）开发，大量参考了 [zhihu-copy-as-markdown](https://github.com/Howardzhangdqs/zhihu-copy-as-markdown) 和 [zhihu-backup-collect](https://github.com/qtqz/zhihu-backup-collect) 的内容，感谢前人的探索！

目前本项目仅为个人试验性质，功能仍在完善中。
