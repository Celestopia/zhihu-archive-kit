import assert from "node:assert/strict";
import { renderBlock } from "../src/save-core/markdown.js";

/**
 * Focused DOM-to-Markdown renderer checks.
 *
 * The production renderer receives browser DOM nodes. These fake nodes only
 * implement the DOM surface used by renderBlock/renderRich for this case.
 */

globalThis.Node = {
  ELEMENT_NODE: 1,
  TEXT_NODE: 3
};

const blockquote = element("blockquote", [
  text("某河北衡水式高中，学生在宿舍过生日"),
  element("br"),
  element("br"),
  text("并把处分布告贴在宿舍门口"),
  element("br"),
  element("br"),
  text("这些诞生在互联网时代的"),
  element("b", [text("10后")]),
  text("远不像他们的前辈一样逆来顺受")
]);

assert.equal(renderBlock(blockquote, []), [
  "> 某河北衡水式高中，学生在宿舍过生日",
  ">",
  "> 并把处分布告贴在宿舍门口",
  ">",
  "> 这些诞生在互联网时代的**10后**远不像他们的前辈一样逆来顺受"
].join("\n"));

delete globalThis.Node;

console.log("Markdown renderer checks passed.");

function text(value) {
  return {
    nodeType: Node.TEXT_NODE,
    textContent: value
  };
}

function element(tagName, childNodes = []) {
  return {
    nodeType: Node.ELEMENT_NODE,
    tagName,
    childNodes
  };
}
