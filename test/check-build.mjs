import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Lightweight build artifact checks.
 *
 * These checks verify the generated Tampermonkey file has the required metadata
 * and key behavior markers. Real Zhihu DOM behavior is covered by manual
 * browser acceptance testing.
 */

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const userscriptPath = path.join(rootDir, "userscripts", "zhihu-archive-kit.user.js");
const content = await readFile(userscriptPath, "utf8");

assert.match(content, /\/\/ ==UserScript==/);
assert.match(content, /@name\s+Zhihu Archive Kit/);
assert.match(content, /@match\s+https:\/\/www\.zhihu\.com\/question\/\*/);
assert.match(content, /@match\s+https:\/\/www\.zhihu\.com\/question\/\*\/answer\/\*/);
assert.match(content, /@match\s+https:\/\/www\.zhihu\.com\/answer\/\*/);
assert.match(content, /@match\s+https:\/\/zhuanlan\.zhihu\.com\/p\/\*/);
assert.match(content, /@require\s+https:\/\/cdn\.jsdelivr\.net\/npm\/jszip@3\.10\.1\/dist\/jszip\.min\.js/);
assert.match(content, /@require\s+https:\/\/cdn\.jsdelivr\.net\/npm\/file-saver@2\.0\.5\/dist\/FileSaver\.min\.js/);
assert.match(content, /@grant\s+none/);
assert.match(content, /Heading levels map directly to Markdown heading depth/);
assert.match(content, /下载为 ZIP/);
assert.match(content, /更改保存目录/);
assert.match(content, /默认收藏夹/);
assert.match(content, /collection\.json/);
assert.match(content, /选择收藏夹/);
assert.match(content, /新建收藏夹/);
assert.match(content, /createCollection/);
assert.match(content, /writeArtifactToCollection/);
assert.match(content, /findSavedCollectionsForFolder/);
assert.match(content, /已保存于/);
assert.match(content, /data-zhmd-folder-name/);
assert.match(content, /showDirectoryPicker/);
assert.match(content, /buildAnswerItemArtifact/);
assert.match(content, /buildArticleRootArtifact/);
assert.match(content, /comments\.json/);
assert.match(content, /mountCommentStaging/);
assert.match(content, /parseCommentContainer/);
assert.match(content, /暂存当前评论/);
assert.match(content, /schema_version/);
assert.match(content, /comment-image/);
assert.match(content, /return text\.slice\(0, 10\)/);
assert.doesNotMatch(content, /commentsTarget/);
assert.doesNotMatch(content, /includeTime/);
assert.match(content, /zhmd-save-control/);
assert.match(content, /AnswerItem:hover/);
assert.match(content, /question-\$\{questionId\}-answer-\$\{target\.id\}/);
assert.match(content, /downloadMediaAssets/);
assert.match(content, /isZhidaEntityLink/);
assert.match(content, /zhida\.zhihu\.com/);
assert.match(content, /\/api\/job\/current/);
assert.match(content, /uploadZip/);
assert.match(content, /author_url:/);
assert.match(content, /source_type:/);
assert.match(content, /time_created:/);
assert.match(content, /time_modified:/);
assert.match(content, /time_exported:/);
assert.match(content, /question_title:/);
assert.match(content, /question_description:/);
assert.match(content, /question_time_created:/);
assert.match(content, /question_time_modified:/);
assert.match(content, /question_answer_count:/);
assert.match(content, /question_comment_count:/);
assert.match(content, /question_follower_count:/);
assert.match(content, /question_topic:/);
assert.match(content, /upvote_count:/);
assert.match(content, /comment_count:/);
assert.match(content, /like_count:/);
assert.match(content, /favorite_count:/);
assert.match(content, /content_excerpt:/);
assert.match(content, /createContentExcerpt/);
assert.match(content, /QuestionRichText/);
assert.match(content, /question-image/);
assert.match(content, /dateCreated/);
assert.match(content, /datePublished/);
assert.match(content, /zhihu:followerCount/);
assert.match(content, /upvoteCount/);
assert.match(content, /commentCount/);
assert.match(content, /extractActionCount/);
assert.doesNotMatch(content, /upvote_num:/);
assert.doesNotMatch(content, /comment_num:/);

console.log("Build artifact checks passed.");
