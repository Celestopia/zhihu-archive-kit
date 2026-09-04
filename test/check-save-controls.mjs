import assert from "node:assert/strict";
import { observeSaveControlChanges, repairSaveControl } from "../src/userscript/ui.js";
import { CONTROL_CLASS, CONTROL_HOST_CLASS, CONTROL_SCOPE_CLASS } from "../src/userscript/constants.js";

// Minimal DOM shape for control ownership, class repairs, and observer delivery.
const mutations = [];
class Element {
  children = [];
  parentElement = null;
  attributes = new Map();

  constructor(className) {
    this.classes = new Set(className.split(" "));
    this.classList = {
      contains: (name) => this.classes.has(name),
      add: (name) => {
        this.classes.add(name);
        mutations.push({ type: "attributes", target: this });
      }
    };
  }

  matches(selector) {
    return selector.split(", ").some((name) => this.classes.has(name.slice(1)));
  }

  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector)
    ]);
  }

  prepend(child) {
    child.remove();
    child.parentElement = this;
    this.children.unshift(child);
  }

  remove() {
    if (this.parentElement) {
      const siblings = this.parentElement.children;
      siblings.splice(siblings.indexOf(this), 1);
      this.parentElement = null;
    }
  }

  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

const folderName = "question-123-answer-456";
function addControl(host, folder = folderName) {
  const control = new Element(CONTROL_CLASS);
  control.attributes.set("data-zhmd-folder-name", folder);
  host.prepend(control);
  return control;
}

const answer = new Element("ContentItem AnswerItem");
const host = new Element("RichContent RichContent--unescapable");
answer.prepend(host);
assert.equal(repairSaveControl(answer, host, folderName), null);
assert.equal(mutations.length, 2);
const control = addControl(host);

// Match the reported comment toggle: keep the button but rewrite host classes.
host.classes = new Set(["RichContent", "RichContent--unescapable", "is-collapsed"]);
mutations.length = 0;
assert.equal(repairSaveControl(answer, host, folderName), control);
assert.equal(host.classList.contains(CONTROL_HOST_CLASS), true);
assert.equal(host.classList.contains("is-collapsed"), true);
assert.equal(mutations.length, 1);
assert.equal(answer.querySelectorAll(`.${CONTROL_CLASS}`).length, 1);

answer.classes.delete(CONTROL_SCOPE_CLASS);
assert.equal(repairSaveControl(answer, host, folderName), control);
assert.equal(answer.classList.contains(CONTROL_SCOPE_CLASS), true);
mutations.length = 0;
for (let i = 0; i < 5; i++) assert.equal(repairSaveControl(answer, host, folderName), control);
assert.equal(mutations.length, 0, "Healthy scans must not write classes again");

control.remove();
assert.equal(repairSaveControl(answer, host, folderName), null);
const replacement = addControl(host);
addControl(host);
const retained = repairSaveControl(answer, host, folderName);
assert.equal(retained.parentElement, host);
assert.equal(answer.querySelectorAll(`.${CONTROL_CLASS}`).length, 1);

// A new host must not reuse a control still attached to another host.
const newHost = new Element("RichContent");
answer.prepend(newHost);
assert.equal(repairSaveControl(answer, newHost, folderName), null);
assert.equal(answer.querySelectorAll(`.${CONTROL_CLASS}`).length, 0);
assert.equal(replacement.parentElement, null);
addControl(newHost);
assert.equal(repairSaveControl(answer, newHost, "question-123-answer-789"), null);

const article = new Element("Post-Main");
const articleFolder = "article-789";
assert.equal(repairSaveControl(article, article, articleFolder), null);
const articleControl = addControl(article, articleFolder);
article.classes = new Set(["Post-Main"]);
assert.equal(repairSaveControl(article, article, articleFolder), articleControl);
assert.equal(article.classList.contains(CONTROL_SCOPE_CLASS), true);
assert.equal(article.classList.contains(CONTROL_HOST_CLASS), true);

let notify;
let observed;
globalThis.document = { documentElement: {} };
globalThis.MutationObserver = class {
  constructor(callback) { notify = callback; }
  observe(target, options) { observed = { target, options }; }
};
let scans = 0;
observeSaveControlChanges(() => { scans++; });
assert.equal(observed.target, document.documentElement);
assert.deepEqual(observed.options, {
  childList: true, subtree: true, attributes: true, attributeFilter: ["class"]
});
notify([{ type: "attributes", target: new Element("Button") }]);
assert.equal(scans, 0);
for (const target of [answer, newHost, article, new Element("Post-content"), new Element("Post-RichTextContainer")]) {
  notify([{ type: "attributes", target }]);
}
assert.equal(scans, 5);
notify([{ type: "childList", target: {} }]);
assert.equal(scans, 6);

// Deliver our repair mutations, then verify the follow-up scan produces none.
article.classes.delete(CONTROL_HOST_CLASS);
mutations.length = 0;
repairSaveControl(article, article, articleFolder);
notify(mutations.splice(0));
assert.equal(scans, 7);
repairSaveControl(article, article, articleFolder);
assert.equal(mutations.length, 0);
delete globalThis.document;
delete globalThis.MutationObserver;

console.log("Save control lifecycle checks passed.");
