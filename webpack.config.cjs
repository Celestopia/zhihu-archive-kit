const path = require("path");
const webpack = require("webpack");

const userscriptHeader = `// ==UserScript==
// @name         Zhihu Markdown Saver
// @namespace    https://github.com/local/zhihu-markdown-downloader
// @version      0.1.0
// @description  Save Zhihu answers and Zhuanlan articles as Markdown folders or ZIP files.
// @author       local
// @match        https://www.zhihu.com/question/*
// @match        https://www.zhihu.com/question/*/answer/*
// @match        https://www.zhihu.com/answer/*
// @match        https://zhuanlan.zhihu.com/p/*
// @icon         https://static.zhihu.com/heifetz/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
// @require      https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js
// @grant        none
// ==/UserScript==`;

/**
 * Webpack builds the modular userscript source into a single Tampermonkey file.
 *
 * JSZip and FileSaver are intentionally not bundled. Tampermonkey loads them via
 * @require before running the generated script.
 */
module.exports = {
  mode: "development",
  entry: path.resolve(__dirname, "src/userscript/main.js"),
  output: {
    filename: "zhihu-markdown-saver.user.js",
    path: path.resolve(__dirname, "userscripts"),
    iife: true,
    clean: false
  },
  optimization: {
    minimize: false
  },
  plugins: [
    new webpack.BannerPlugin({
      banner: userscriptHeader,
      raw: true,
      entryOnly: true
    })
  ],
  devtool: false
};
