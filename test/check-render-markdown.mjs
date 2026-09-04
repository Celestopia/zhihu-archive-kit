import assert from "node:assert/strict";
import { renderMarkdown } from "../src/render/markdown.mjs";
import { renderMathCss } from "../src/render/math.mjs";
import { escapeAttr } from "../src/render/html-utils.mjs";

const sources = new Map([["[赞]", "data:image/png;base64,AQID"]]);
globalThis.fetch = () => { throw new Error("Math rendering must not fetch network resources"); };
const render = (value, options) => renderMarkdown(value, sources, options);

const equation = String.raw`log(\frac{1}{P(x)})`;
const display = await render(`$${equation}$`);
assert.match(display, /^<mjx-container[^>]*display="true"/);
assert.match(display, /<svg[^>]*viewBox=/);
assert.match(display, /<path /);
assert.ok(display.includes(`data-tex="${equation}"`));
assert.doesNotMatch(display, /<use\b|<defs\b|<script\b|<link\b/);
assert.match(display, /role="math" aria-label=/);

const set = String.raw`A \times B = \{(a,b): a \in A, b \in B\}`;
const inline = await render(`集合$${set}$相等。`);
assert.ok(inline.includes(`data-tex="${set}"`));
assert.doesNotMatch(inline, /display="true"/);
assert.match(inline, /data-c="7B"/);
assert.match(inline, /data-c="7D"/);

for (const input of [String.raw`$$\sum_{i=1}^{n} x_i$$`, '$$\n\\begin{matrix}a&b\\\\c&d\\end{matrix}\n$$', '> $x^2$', '- $x^2$']) {
  const html = await render(input);
  assert.match(html, /class="MathJax"/);
  assert.doesNotMatch(html, /class="math-error/);
}
assert.match(await render('问题$x$描述', { inline: true }), /class="MathJax"/);
assert.match(await render('前段\n\n$x$\n\n后段'), /display="true"/);

for (const input of ['`$x$ [赞]`', '``$x$ ` [赞]``', '```tex\n$x$ [赞]\n```', '~~~tex\n$$x$$ [赞]\n~~~', '    $x$ [赞]', '<code>$x$ [赞]</code>', '<pre>$x$ [赞]</pre>']) {
  const html = await render(input);
  assert.doesNotMatch(html, /class="MathJax"|class="zhihu-emoji"/);
  assert.match(html, /\$/);
}
for (const input of [String.raw`\$x\$`, 'Price $5 and $10.', '$unclosed', 'empty $$ pair']) {
  assert.doesNotMatch(await render(input), /class="MathJax"/);
}
const link = await render('[链接](https://example.com/$x$) ![$x$](./assets/$x$.png)');
assert.match(link, /href="https:\/\/example.com\/\$x\$"/);
assert.match(link, /src="\.\/assets\/\$x\$\.png"/);
assert.doesNotMatch(link, /class="MathJax"/);

assert.match(await render('**思路是“造零件”：**定义'), /<strong>思路是“造零件”：<\/strong>定义/);
assert.match(await render('**普通加粗**'), /<strong>普通加粗<\/strong>/);
assert.match(await render('**粗体 *斜体*：**定义'), /<strong>粗体 <em>斜体<\/em>：<\/strong>定义/);
const boldMath = await render(String.raw`**关系 $x_*+y_*$：**定义`);
assert.match(boldMath, /<strong>关系 <mjx-container/);
assert.ok(boldMath.includes('data-tex="x_*+y_*"'));
assert.match(boldMath, /<\/mjx-container>：<\/strong>定义/);
assert.doesNotMatch(await render('`**思路：**定义`'), /<strong>/);
assert.match(await render('普通 [赞] **加粗 [赞]**'), /class="zhihu-emoji"/);
assert.equal((await render('普通 [赞] **加粗 [赞]**')).match(/class="zhihu-emoji"/g).length, 2);
const protectedEmoji = await render(String.raw`$\text{[赞]}$`);
assert.doesNotMatch(protectedEmoji, /class="zhihu-emoji"/);
assert.ok(protectedEmoji.includes('data-tex="\\text{[赞]}"'));

const warnings = [];
const originalWarn = console.warn;
console.warn = (message) => warnings.push(message);
try {
  const invalid = await render(String.raw`$\badcommand{<script>}$`);
  assert.match(invalid, /class="math-error math-error--display"/);
  assert.match(invalid, /&lt;script&gt;/);
  assert.doesNotMatch(invalid, /<script>/);
  for (const tex of [String.raw`\href{javascript:alert(1)}{x}`, String.raw`\require{html}`, String.raw`\htmlClass{evil}{x}`]) {
    const html = await render(`$${tex}$`);
    assert.match(html, /class="math-error/);
    assert.doesNotMatch(html, /<a\b|<script\b/);
  }
  // A definition in one author's formula must not affect a later expression.
  await render(String.raw`$\newcommand{\owned}{x}\owned$`);
  assert.match(await render(String.raw`$\owned$`), /class="math-error/);
  assert.equal(warnings.length, 5);
} finally {
  console.warn = originalWarn;
}
const concurrent = await Promise.all(['x^2', String.raw`\frac{a}{b}`, String.raw`\ce{H2O}`, String.raw`\bbox[#CAF,20px,border:1px]{\delta S=0}\\`].map((tex) => render(`$${tex}$`)));
for (const html of concurrent) {
  assert.match(html, /class="MathJax"/);
  assert.doesNotMatch(html, /class="math-error/);
}
const special = String.raw`\text{a\&b}`;
assert.ok((await render(`$${special}$`)).includes(`data-tex="${escapeAttr(special)}"`));
assert.match(renderMathCss(), /mjx-container\[display\]/);
assert.match(renderMathCss(), /overflow-x: auto/);
delete globalThis.fetch;
console.log("MathJax Markdown rendering checks passed.");
