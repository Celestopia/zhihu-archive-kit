import assert from "node:assert/strict";
import { extractQuestionMetadata, formatAnswerTitle } from "../src/save-core/target.js";

/**
 * Focused checks for question-level metadata extraction.
 *
 * The production code runs in the browser. This test uses a minimal fake
 * document/root shape because the extractor only needs querySelector and meta
 * content attributes.
 */

const meta = {
  name: "你发生过的最尴尬的事是什么？",
  dateCreated: "2019-01-21T01:47:26.000Z",
  dateModified: "2019-02-03T05:53:39.000Z",
  url: "https://www.zhihu.com/question/309772647",
  answerCount: "10467",
  commentCount: "22",
  "zhihu:followerCount": "35855",
  keywords: "心理,人际交往,尴尬"
};

globalThis.document = {
  querySelector(selector) {
    return selector === ".QuestionPage[itemtype='http://schema.org/Question']" ? questionRoot : null;
  }
};

const questionRoot = {
  querySelector(selector) {
    const match = selector.match(/^meta\[itemprop='(.+)']$/);
    if (!match || !Object.hasOwn(meta, match[1])) {
      return null;
    }
    return {
      getAttribute(name) {
        return name === "content" ? meta[match[1]] : "";
      }
    };
  }
};

assert.deepEqual(extractQuestionMetadata(), {
  question_title: "你发生过的最尴尬的事是什么？",
  question_url: "https://www.zhihu.com/question/309772647",
  question_time_created: "2019-01-21T01:47:26.000Z",
  question_time_modified: "2019-02-03T05:53:39.000Z",
  question_answer_count: 10467,
  question_comment_count: 22,
  question_follower_count: 35855,
  question_topic: "心理, 人际交往, 尴尬"
});

assert.equal(formatAnswerTitle("我选择跨考金融专硕真的选错了吗?", "Jarvis"), "我选择跨考金融专硕真的选错了吗? - Jarvis的回答");

delete meta.url;

assert.deepEqual(extractQuestionMetadata(), {
  question_title: "你发生过的最尴尬的事是什么？",
  question_url: "",
  question_time_created: "2019-01-21T01:47:26.000Z",
  question_time_modified: "2019-02-03T05:53:39.000Z",
  question_answer_count: 10467,
  question_comment_count: 22,
  question_follower_count: 35855,
  question_topic: "心理, 人际交往, 尴尬"
});

globalThis.document = {
  querySelector() {
    return null;
  }
};

assert.deepEqual(extractQuestionMetadata(), {
  question_title: "",
  question_url: "",
  question_time_created: "",
  question_time_modified: "",
  question_answer_count: "",
  question_comment_count: "",
  question_follower_count: "",
  question_topic: ""
});

delete globalThis.document;

console.log("Question metadata checks passed.");
