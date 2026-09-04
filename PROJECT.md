# 项目说明

本文档面向开发者和 AI Agent，说明 Zhihu Archive Kit 的架构、数据流和关键约束。

Zhihu Archive Kit 由一个 Tampermonkey/油猴脚本和一组本地 CLI 工具组成，用于将知乎回答、知乎专栏文章及其评论归档为本地内容文件夹或 ZIP，并生成 HTML 预览和导航页。

## 目录结构

```text
assets/
  zhihu-archive-kit.ico
  zhihu-archive-kit.svg

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
  server.mjs
  time.js

src/local-data/
  extract-zip.mjs
  paths.mjs

src/render/
  app-icon.mjs
  card-template.mjs
  cli.mjs
  edit-api.mjs
  html-utils.mjs
  index-cli.mjs
  index-page.mjs
  markdown.mjs
  math.mjs
  render.mjs
  serve-cli.mjs
  serve.mjs
  service-address.mjs
  template.mjs
  zhihu-emoji.mjs

src/shared/
  url.js

test/
  check-app-icon.mjs
  check-build.mjs
  check-directory-save.mjs
  check-save-controls.mjs
  check-extract.mjs
  check-local-data.mjs
  check-markdown.mjs
  check-question-metadata.mjs
  check-render.mjs
  check-render-markdown.mjs
  check-render-edit-api.mjs
  check-render-index.mjs
  check-render-serve.mjs

userscripts/
  zhihu-archive-kit.user.js

create-local-browser-shortcut.ps1
start-local-browser.ps1
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

`src/userscript/` 是油猴脚本入口和单页保存界面。它把保存控件注入到回答卡片或文章正文区域；主按钮通过 File System Access API 把 artifact 写入用户授权的归档根目录，不请求预览服务；齿轮菜单中的“下载为 ZIP”调用 FileSaver 下载 ZIP。评论暂存按钮也在这一层注入，暂存数据只保存在当前页面内存中。

`src/batch/` 包含命令行批量调度、本地 HTTP 服务和浏览器端批量客户端。批量客户端运行在真实知乎页面中，生成 ZIP 后上传给本地服务。本地服务根据配置保存 ZIP 或解压为文件夹。

`src/local-data/` 是 Node 端本地数据基础层。`paths.mjs` 解析显式或已记住的预览根目录以及 Roaming 设置/缓存路径；`extract-zip.mjs` 校验并解压批量客户端生成的内容 ZIP。

`src/render/` 包含静态 HTML 预览、导航页生成器、本地浏览服务和本地数据 API。渲染路径只读取已保存内容文件夹中的 `index.md`、`comments.json` 和 `assets/`，生成内容目录内的 `preview.html` 或保存根目录下的 `index.html`，不读取知乎页面 DOM。`edit-api.mjs` 只服务预览页面，负责收藏夹元数据写入、收藏夹重命名、内容删除和内容移动。`zhihu-emoji.mjs` 在渲染阶段把已知知乎表情转写文本替换为本地缓存图片。`app-icon.mjs` 读取安装目录中的 SVG，并以内嵌 data URI 形式提供给两种 HTML 页面。

`src/shared/` 只存放浏览器端和 Node 端都使用的纯工具函数和常量。目前这里包含 URL 识别、清洗、目标文件夹命名。预览服务地址属于 `src/render/service-address.mjs`。

## 本地数据目录

归档根目录由用户选择，不使用 AppData 下的隐式归档位置。收藏夹及其 `index.md`、`comments.json`、`assets/` 位于所选根目录；渲染生成的 `index.html` 和各内容目录中的 `preview.html` 也保留在归档内。

Node 端应用级数据使用 Roaming：

```text
%APPDATA%/Zhihu Archive Kit/
  settings.json
  cache/emoji/
```

`settings.json` 的契约是 `{ "archiveRoot": "<absolute directory path>" }`，由预览启动器写入。显式 CLI 路径只作用于本次命令，不修改设置。无路径的 `render:index` 和 `render:serve` 使用已记住的目录；缺少设置、无效设置或目录不可访问时直接报错，不创建替代目录。表情缓存不随归档根目录变化。批量配置必须提供 `output_dir`，批量状态和日志与该次输出放在一起。

浏览器目录句柄存储在各知乎 origin 的 IndexedDB 中，数据库为 `zhihu-archive-kit`，store 为 `settings`，key 为 `archive-root`。它不存入 Roaming，也不与 Node 的预览目录自动同步。浏览器权限可能需要更新，两个知乎 origin 分别授权。批量端口保存在浏览器 localStorage，暂存评论只在页面内存中。

项目安装目录只保存源码、应用图标、生成的油猴脚本、启动器和 Node 依赖，不保存归档内容、渲染产物或批量状态。

## 应用图标与启动快捷方式

`assets/zhihu-archive-kit.svg` 是应用图标的可编辑源文件。图形使用 64 × 64 的方形坐标系，由蓝色圆角底板、白色归档盒和路径绘制的字母 Z 组成，不依赖字体或外部资源。`assets/zhihu-archive-kit.ico` 是供 Windows Shell 使用的派生文件，包含 16、24、32、48、64、128 和 256 像素的 PNG 图层。

导航页和单篇预览不会把图标复制到归档数据目录。渲染器通过 `loadAppIconDataUri()` 读取 SVG，将其编码为 `data:image/svg+xml;base64,...`，再写入页面 `<head>` 中的 favicon link。由此生成的 HTML 在本地服务和 `file://` 模式下都不依赖安装目录中的静态资源。

`create-local-browser-shortcut.ps1` 使用 Windows Script Host 创建项目目录下的 `Zhihu Archive Kit.lnk`。快捷方式以当前 PowerShell 可执行文件为目标，用参数启动 `start-local-browser.ps1`，工作目录固定为项目目录，图标指向安装目录中的 ICO。`.lnk` 含有本机绝对路径，因此被 Git 忽略；项目移动后需要重新生成。

`start-local-browser.ps1` 在首次使用、指定 `-ChooseFolder` 或已记住的目录不存在时显示 Windows 文件夹选择器，取消时退出。选择后写入 Roaming 设置并把明确路径传给 Node。在前台运行本地服务，以便用户通过 Ctrl+C 停止。它同时启动一个隐藏的 PowerShell 就绪检查器；检查器使用 UTF-16LE `-EncodedCommand` 传递完整命令，轮询本地地址并在服务响应后调用系统默认浏览器。使用编码命令可以避免 `Start-Process -ArgumentList` 对多行命令和引号的再次解析。

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

1. `main.js` 监听知乎 SPA 页面变化；`ui.js` 的 observer 监听子节点变化及回答、正文和文章容器的 class 变化，以 250 ms 防抖触发扫描。
2. 问题页或回答详情页中，脚本扫描 `.AnswerItem`，为每个有效回答卡片维护一个保存控件。
3. 专栏文章页中，脚本为文章正文区域维护一个保存控件。
4. 用户点击某个控件的“保存”后，`directory-save.js` 读取已保存的句柄并检查读写权限；首次使用调用文件夹选择器，权限被拒绝时停止操作。
5. 确保所选根目录中的默认收藏夹存在，然后直接枚举收藏夹并打开选择菜单。
6. 用户选择已有收藏夹，或在所选根目录中创建带名称和描述的新收藏夹。
7. 用户确认保存后，`save-core` 从绑定的 DOM 节点生成 artifact；不为文件夹保存构建 ZIP。
8. `writeArtifactToCollection(root, artifact, collectionName)` 使用菜单打开时捕获的根句柄写入，切换保存文件夹不会改变正在执行的保存目标。
9. 目标内容目录存在时拒绝覆盖；写入顺序是媒体、评论、Markdown，避免媒体写入失败后被识别为完整内容。失败可能留下不完整目录，不自动覆盖或删除。
10. 保存成功后重新检查已保存状态。此流程不生成 HTML，也不访问本地预览服务。启动预览或点击“刷新归档”时再生成预览。

每次扫描先补回缺失的 scope 和 host class，保持悬浮控件的 hover 与定位规则。`repairSaveControl()` 只复用属于当前 host、且 `data-zhmd-folder-name` 与当前内容一致的真实控件；缺失时重新挂载，重复或失效控件会被移除。修复 class 时保留已有控件及其状态，只写入缺失的 class，避免 observer 自身触发无限扫描。

齿轮菜单的“更改保存文件夹”会重新选择并授权当前 origin 的目录；取消选择保留原授权。被动的已保存状态检查不弹出权限请求。

收藏夹是保存根目录下的一级子目录，每个收藏夹目录都包含：

```json
{
  "schema_version": 1,
  "name": "收藏夹名称",
  "time_created": "2026-06-13T12:00:00.000+08:00",
  "description": ""
}
```

`render:serve` 启动时确保真实的 `默认收藏夹` 及其元数据存在。`默认收藏夹` 是目录名，不是根目录别名。

保存根目录下以下划线开头的一级目录保留给项目内部资源，不作为收藏夹展示，也不能由用户创建为收藏夹。显式配置的批量输出可使用 `_batch/` 目录；表情缓存不属于归档数据根目录。

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
2. `config.mjs` 读取 JSON，要求显式 `output_dir`，填充延时默认值、过滤并去重 URL。
3. `server.mjs` 在 `127.0.0.1` 启动本地 API 服务。
4. `browser-open.mjs` 用默认浏览器或指定浏览器打开第一个任务 URL。
5. 油猴脚本中的 `client.js` 探测本地服务并请求当前任务。
6. 当前页面不匹配任务 URL 时，客户端使用 `location.assign()` 跳转。
7. 当前页面匹配任务 URL 时，客户端调用 `buildCurrentPageZip()`。
8. 客户端通过 `POST /api/job/:id/zip` 上传 ZIP Blob。
9. 服务端保存 ZIP，或在 `--extract` 模式下调用 `local-data/extract-zip.mjs` 解压。
10. 服务端写入 `batch-state.json` 和 `batch-log.jsonl`，再返回下一项等待时间。
11. 所有任务完成后，本地服务关闭，CLI 进程退出。

## 批量输出

ZIP 模式输出：

```text
<output_dir>/
  question-123-answer-456.zip
  article-789.zip
  batch-state.json
  batch-log.jsonl
```

`--extract` 模式输出：

```text
<output_dir>/
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

ZIP 解压只接受单个顶层目录，且该目录必须包含 `index.md` 和 `comments.json`。解压模块会拒绝绝对路径、`..` 路径和解析后逃逸目标目录的条目。

批量模式不自动打开或解析评论区，因此批量产物中的 `comments.json` 使用空评论数组。

## HTML 预览流程

用户运行：

```bash
npm run render -- <content-folder>
```

`render/cli.mjs` 要求传入一个内容文件夹路径。`render.mjs` 读取 `index.md` 和 `comments.json`，解析 Markdown frontmatter，通过 `markdown.mjs` 的异步渲染入口处理正文、问题描述和评论，再由 `template.mjs` 生成单文件 HTML。回答详情预览页会展示 `question_*` 问题元信息；导航页列表保持轻量，不展示这些问题字段。

`markdown.mjs` 为每次调用创建独立的 Marked 实例。公式使用专用 block/inline token，在 Markdown 反斜杠、强调和表情处理之前保留原始 TeX。句中的 `$...$` 是行内公式；独占一行的 `$...$` 以及 `$$...$$` 使用 display 模式。单美元公式不跨行，不接受紧邻分隔符的内部空白或结束分隔符后的数字，减少金额误判；字面美元符号使用 `\$`。代码块、行内代码、HTML code/pre 区域、链接地址和图片属性不进行公式或表情替换。问题描述保留 inline Markdown 解析方式，使用 `$$...$$` 可明确指定 display 模式。

中文加粗扩展只处理包含汉字、内容以标点结束且结束 `**` 紧邻后续汉字的单行片段，例如 `**说明：**正文`。内部内容继续按 inline Markdown 解析，其余强调语法使用 Marked 默认规则。表情也是独立 inline token，不再对整段 Markdown 进行字符串预替换。

`math.mjs` 使用固定版本的 `@mathjax/src`，在 Node 中把 TeX 转为 SVG；字体数据按需从本地 npm 包加载。启用的 TeX 包为 base、ams、newcommand、mathtools、braket、cancel、cases、boldsymbol、bbox、mhchem、physics、textmacros。不加载 require、autoload 或 HTML 注入扩展。每个表达式使用新的 TeX 实例，宏和标签不会跨表达式共享，因此不支持跨公式的宏定义或引用；输入缓冲和宏展开次数设有上限。共享 SVG 输出器的转换顺序串行化，避免并发请求交叉修改渲染状态。

SVG 使用 `fontCache: "none"`，每个字形包含显式路径，不引用其它公式或页面级 defs。原始 TeX 保留在 `data-tex` 和可访问性标签中。`renderCardCss()` 为单篇与导航页同时嵌入 MathJax 样式，动态导入正文/评论时无需再次排版，也不依赖预览页的 head、外部字体或 CDN。display 公式居中并允许横向滚动。SVG 路径不能像普通文字一样直接选中复制；原始公式仍在归档 Markdown 中。无效或不支持的 TeX 显示转义后的源码和错误提示，并输出 warning；模块或资源加载错误仍会使渲染失败。

渲染前会扫描正文、问题描述和评论正文中的知乎表情 token，例如 `[赞]`、`[感谢]`。已知 token 来自 `zhihu-emoji.mjs` 维护的映射表，图片下载到应用缓存目录 `%APPDATA%/Zhihu Archive Kit/cache/emoji/`。渲染器读取缓存文件并把图片以 data URI 写入 `<img class="zhihu-emoji">`，使生成的 HTML 不依赖归档目录之外的文件。缓存文件已存在时直接复用；下载失败时保留原始 token 并输出 warning。Markdown 和 `comments.json` 不会因为本地表情渲染而被改写。行内代码和代码块中的 token 不替换。

输出固定为：

```text
preview.html
```

`preview.html` 与 `assets/` 保持同级，因此正文图片、视频和评论图片继续使用项目已有的相对路径。表情图片直接嵌入 HTML。页面使用和导航页相同的内容卡片模板，默认显示完整正文，评论区由卡片底部的“评论区”按钮展开。

## HTML 导航页流程

用户运行：

```bash
npm run render:index
npm run render:index -- D:\path\to\archive
```

`index-cli.mjs` 使用显式传入的根目录；未传入时读取预览启动器记住的根目录。`index-page.mjs` 只扫描根目录下带 `collection.json` 的一级收藏夹目录，跳过无元数据目录和以下划线开头的内部目录。

每个收藏夹内部的直接子目录如果同时包含 `index.md` 和 `comments.json`，会先通过 `renderSavedFolder()` 生成或刷新 `preview.html`。导航页随后读取 frontmatter、收藏夹元数据和摘要，按 `time_exported` 倒序生成初始页面：

```text
index.html
```

### 导航页生成数据

导航页只内置标题、摘要、元数据、收藏夹名、原文 URL 和 `preview.html` 相对路径，不内嵌完整正文和评论。新保存内容优先读取 frontmatter 中的 `content_excerpt`；没有该字段时从 Markdown 正文生成摘要。

`index-page.mjs` 把以下 frontmatter 字段传给导航卡片：

```text
upvote_count    -> data-sort-upvote
like_count      -> data-sort-like
favorite_count  -> data-sort-favorite
comment_count   -> data-sort-comment
time_created    -> data-sort-created
time_modified   -> data-sort-modified
time_exported   -> data-sort-exported
```

统计数输出为十进制数值，时间在生成阶段转换为毫秒时间戳，缺失或无效值输出为空字符串。数字 `0` 是有效排序值。`data-sort-comment` 表示知乎原文评论总数，不是 `comments.json` 中已保存的评论数量。排序属性只出现在导航卡片中，单篇 `preview.html` 不输出这些属性。

### 客户端筛选、排序与分页

左侧收藏夹菜单来自 `collection.json`，支持“所有”和单个收藏夹筛选；搜索和回答/文章类型筛选继续叠加生效。客户端处理顺序固定为：

```text
收藏夹、类型和搜索筛选 -> 排序全部匹配卡片 -> 分页 -> 更新可见卡片
```

`PAGE_SIZE = 20` 控制每页数量。默认排序字段是导出时间，默认方向是降序；切换字段时方向恢复为降序，排序状态不写入本地存储。缺失或无效值无论升序还是降序都排在末尾；主排序值相同时，先按导出时间降序，再按目录名排序，确保结果稳定。切换收藏夹、类型、搜索、排序字段或排序方向时回到第一页。排序通过移动现有卡片 DOM 节点完成，不重新创建卡片，因此不会丢失已展开正文或评论的状态。

卡片元信息行读取作者、创建时间、修改时间和导出时间；导出时间作为右侧独立字段显示。在“所有”收藏夹中，修改时间后还显示来源收藏夹；选中具体收藏夹时隐藏，因为当前筛选已经明确表达了收藏夹上下文。

### 按需内容加载

页面通过 `fetch()` 按需读取对应 `preview.html`，用 `DOMParser` 抽取 `[data-card-body]` 或 `[data-comments]`，并把 `./assets/...` 这类相对资源路径改写为内容目录下的路径。正文展开时隐藏摘要行，并在同一位置加载完整正文，避免把引用、链接卡片或段落结构裁剪断开。标题链接在新窗口打开单篇预览，右上角“阅读原文”链接在新窗口打开知乎原文。

`preview.html` 和导航页卡片共用 `card-template.mjs`；单篇预览默认显示全文，不显示导航页的摘要折叠、内容管理或排序数据。

推荐通过本地服务打开：

```bash
npm run render:serve
npm run render:serve -- D:\path\to\archive --port 17892
```

`serve.mjs` 会确保默认收藏夹存在、刷新导航页，再用 Node 内置 HTTP 服务托管保存根目录。服务只绑定 `127.0.0.1`。分页是导航页里的客户端行为，不新增 HTTP 分页接口。收藏夹内内容的动态加载路径包含收藏夹目录层级，例如 `默认收藏夹/question-xxx-answer-yyy/preview.html`。直接用 `file://` 打开 `index.html` 只能浏览列表，展开正文或评论时会提示使用本地服务。

通过 `render:serve` 打开的导航页还可以编辑本地保存结果。顶部卡片的 `...` 菜单调用本地 API 新建收藏夹，或在选中具体收藏夹时修改收藏夹名称和描述；左侧收藏夹栏的 `+` 也调用同一新建逻辑，右键收藏夹会打开同一组名称和描述编辑动作。内容卡片的 `...` 菜单可以永久删除当前内容目录，或把内容目录移动到其它收藏夹；移动目标列表在菜单内滚动，不改变卡片布局。所有写操作都限制在当前保存根目录内：收藏夹必须带 `collection.json`，内容目录必须同时带 `index.md` 和 `comments.json`，以下划线开头的内部目录不可操作，重名或目标已存在时直接失败且不覆盖。

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

本地浏览服务也只监听 `127.0.0.1`。它保留静态文件 GET/HEAD 服务，并额外提供导航页编辑 API：

```text
GET    /api/collections
POST   /api/collections
PATCH  /api/collections/:name
POST   /api/refresh
DELETE /api/items/:collection/:folder
POST   /api/items/:collection/:folder/move
```

`GET /api/collections` 返回当前收藏夹、描述和内容数量。`POST /api/collections` 创建收藏夹并写入 `collection.json`。`PATCH /api/collections/:name` 修改收藏夹名称或描述；名称变化时重命名收藏夹目录，并保留 `time_created`。`POST /api/refresh` 重新扫描浏览器直接保存的内容，刷新全部预览和导航页。`DELETE /api/items/:collection/:folder` 永久删除内容目录。`POST /api/items/:collection/:folder/move` 把内容目录移动到目标收藏夹。浏览服务 API 写入成功后会重新运行导航页生成流程，使 `index.html` 和相关 `preview.html` 与文件系统保持一致。

本地导航页以同源方式访问 API；带不同 `Origin` 的请求返回 `403`，知乎页面不使用该服务。静态响应设置 `Cache-Control: no-store`，确保显式刷新后加载新生成的预览。顶部菜单的“刷新归档”调用 `POST /api/refresh`，成功后重新载入页面；普通页面重载只读取已生成文件。

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
npm install
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
npm run render -- <content-folder>
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
- Roaming 设置/表情缓存路径、显式归档路径优先级、缺失配置错误和批量必填输出目录。
- 使用模拟目录句柄和 IndexedDB 验证无网络手动保存、权限拒绝、文件夹切换、取消选择及重复内容保护。
- 使用最小 DOM 模型验证保存控件的 class 修复、节点移除、host 更换、重复清理、文章容器修复，以及 observer 过滤和修复后的收敛。
- ZIP 解压是否要求完整内容结构、拒绝路径逃逸，并在目标文件夹已存在时失败。
- HTML 预览生成器能否读取保存结果并生成包含正文、评论和图片路径的 `preview.html`。
- MathJax 公式的行内/display 布局、集合转义、代码与链接保护、中文标点加粗、表情隔离、错误转义、宏隔离和并发渲染；集成检查覆盖正文、问题描述、嵌套评论与导航页的数学样式，且验证源数据不被改写。
- HTML 导航页生成器能否扫描保存根目录、刷新预览页、跳过无效目录，并生成带筛选、排序和分页行为的轻量 `index.html`。
- 本地浏览服务能否只绑定 `127.0.0.1`，正确处理归档刷新、同源限制、导航页、单篇预览页和 404。

真实知乎页面中的 DOM、登录状态、媒体 CDN 响应、浏览器文件夹授权、批量服务通信和 Tampermonkey 行为需要手动验收。
