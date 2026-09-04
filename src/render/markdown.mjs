import { Marked } from "marked";
import { renderFormula } from "./math.mjs";
import { renderZhihuEmojiInText } from "./zhihu-emoji.mjs";

export function renderMarkdown(markdown, emojiSources, { inline = false } = {}) {
  const parser = new Marked({
    async: true,
    extensions: [
      {
        name: "mathBlock",
        level: "block",
        start: (source) => source.search(/^ {0,3}\$/m),
        tokenizer(source) {
          const indent = source.match(/^ {0,3}/)[0];
          const math = readMath(source.slice(indent.length));
          if (!math) return;
          const tail = source.slice(indent.length + math.raw.length).match(/^[ \t]*(?:\n|$)/);
          if (!tail) return;
          return { ...math, type: "mathBlock", display: true, raw: indent + math.raw + tail[0] };
        },
        renderer: (token) => token.html + "\n"
      },
      {
        name: "mathInline",
        level: "inline",
        start: (source) => source.indexOf("$"),
        tokenizer(source) {
          if (this.lexer.state.inRawBlock) return;
          const math = readMath(source);
          if (math) return { ...math, type: "mathInline" };
        },
        renderer: (token) => token.html
      },
      {
        name: "chineseStrong",
        level: "inline",
        start: (source) => source.indexOf("**"),
        tokenizer(source) {
          if (this.lexer.state.inRawBlock) return;
          const match = source.match(/^\*\*(?=\S)([^\n]+?)\*\*(?=\p{Script=Han})/u);
          if (!match || !/\p{P}$/u.test(match[1]) || !/\p{Script=Han}/u.test(match[1])) return;
          return { type: "chineseStrong", raw: match[0], tokens: this.lexer.inlineTokens(match[1]) };
        },
        renderer(token) { return `<strong>${this.parser.parseInline(token.tokens)}</strong>`; }
      },
      {
        name: "zhihuEmoji",
        level: "inline",
        start: (source) => source.indexOf("["),
        tokenizer(source) {
          if (this.lexer.state.inRawBlock) return;
          const match = source.match(/^\[([^\]\n]+)\]/);
          if (!match || !emojiSources.has(match[0])) return;
          const next = source[match[0].length];
          if (next === "(" || next === "[" || this.lexer.tokens.links?.[match[1]]) return;
          return { type: "zhihuEmoji", raw: match[0] };
        },
        renderer: (token) => renderZhihuEmojiInText(token.raw, emojiSources)
      }
    ],
    hooks: {
      emStrongMask(source) {
        // TeX asterisks and underscores must not close surrounding Markdown emphasis.
        return source.replace(/\$\$[\s\S]+?\$\$|\$[^\n$]+?\$/g, (math) => "a".repeat(math.length));
      }
    },
    async walkTokens(token) {
      if (token.type === "mathInline" || token.type === "mathBlock") {
        token.html = await renderFormula(token.tex, token.display, token.raw.trim());
      }
    }
  });
  return inline ? parser.parseInline(markdown) : parser.parse(markdown);
}

function readMath(source) {
  if (!source.startsWith("$")) return;
  const delimiter = source.startsWith("$$") ? "$$" : "$";
  const start = delimiter.length;
  if (delimiter === "$" && /\s/.test(source[start] || " ")) return;
  for (let end = start; end < source.length; end++) {
    if (source[end] === "\\") { end++; continue; }
    if (delimiter === "$" && source[end] === "\n") return;
    if (!source.startsWith(delimiter, end)) continue;
    if (delimiter === "$" && (source[end + 1] === "$" || /\s/.test(source[end - 1]) || /\d/.test(source[end + 1] || ""))) return;
    const tex = source.slice(start, end).trim();
    if (!tex) return;
    return { raw: source.slice(0, end + start), tex, display: delimiter === "$$" };
  }
}
