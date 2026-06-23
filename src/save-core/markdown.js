import { guessGifUrl, registerMedia, selectImageUrl, normalizeMediaUrl } from "./media.js";
import { cleanText, escapeLinkText, normalizeLink } from "./utils.js";

/**
 * DOM-to-Markdown renderer for Zhihu rich text.
 *
 * The renderer parses the browser DOM that Zhihu already rendered, then
 * serializes supported rich-text structures to Markdown. Comments are never
 * parsed here.
 */

export function extractPage({ root, metadata }) {
  const media = [];
  const blocks = parseBlocks(root, media);

  return {
    metadata,
    markdown: blocks.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim(),
    media
  };
}

export function parseBlocks(container, media) {
  const blocks = [];

  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const rendered = renderBlock(node, media);
    if (Array.isArray(rendered)) {
      blocks.push(...rendered.filter(Boolean));
    } else if (rendered) {
      blocks.push(rendered);
    }
  }

  return blocks;
}

export function renderBlock(node, media) {
  const tag = node.tagName.toLowerCase();

  // Heading levels map directly to Markdown heading depth.
  if (tag === "h1") {
    return `# ${renderRich(node, media).trim()}`;
  }
  if (tag === "h2") {
    return `## ${renderRich(node, media).trim()}`;
  }
  if (tag === "h3") {
    return `### ${renderRich(node, media).trim()}`;
  }
  if (tag === "h4") {
    return `#### ${renderRich(node, media).trim()}`;
  }
  if (tag === "h5") {
    return `##### ${renderRich(node, media).trim()}`;
  }
  if (tag === "h6") {
    return `###### ${renderRich(node, media).trim()}`;
  }

  if (tag === "p") {
    return renderRich(node, media).trim();
  }
  if (tag === "blockquote") {
    const quoteBlocks = parseBlocks(node, media);
    const text = quoteBlocks.length > 0 ? quoteBlocks.join("\n\n") : renderRich(node, media).trim();
    return text.split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
  }
  if (tag === "figure") {
    return renderFigure(node, media);
  }
  if (tag === "ul" || tag === "ol") {
    return renderList(node, tag === "ol", media);
  }
  if (tag === "hr") {
    return "---";
  }
  if (tag === "table") {
    return renderTable(node, media);
  }
  if (tag === "pre") {
    return renderCodeBlock(node);
  }

  if (tag === "div") {
    if (node.classList.contains("highlight") || node.querySelector(":scope > pre")) {
      return renderCodeBlock(node);
    }

    if (node.classList.contains("RichText-LinkCardContainer")) {
      const link = node.querySelector("a[href]");
      if (link) {
        const text = cleanText(link.getAttribute("data-text") || link.textContent || link.href);
        const href = normalizeLink(link.href);
        return isZhidaEntityLink(href) ? text : `[${escapeLinkText(text)}](${href})`;
      }
    }

    const video = node.querySelector("video[src], video source[src]");
    if (video) {
      return renderVideo(video, media);
    }

    const nested = parseBlocks(node, media);
    if (nested.length > 0) {
      return nested;
    }
  }

  const video = node.querySelector?.("video[src], video source[src]");
  if (video) {
    return renderVideo(video, media);
  }

  return renderRich(node, media).trim();
}

export function renderRich(node, media) {
  let output = "";

  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      output += child.textContent || "";
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const el = child;
    const tag = el.tagName.toLowerCase();

    if (tag === "b" || tag === "strong") {
      output += `**${renderRich(el, media)}**`;
    } else if (tag === "i" || tag === "em") {
      output += `*${renderRich(el, media)}*`;
    } else if (tag === "br") {
      output += "\n";
    } else if (tag === "code") {
      output += renderInlineCode(el.textContent || "");
    } else if (tag === "a") {
      output += renderInlineLink(el);
    } else if (tag === "span" && el.classList.contains("ztext-math")) {
      output += renderMath(el);
    } else if (tag === "img") {
      output += renderImage(el, media);
    } else {
      output += renderRich(el, media);
    }
  }

  return output;
}

export function renderInlineCode(text) {
  const value = text.replace(/\s+/g, " ").trim();
  if (value.includes("`")) {
    return `\`\` ${value} \`\``;
  }
  return `\`${value}\``;
}

export function renderInlineLink(el) {
  const href = normalizeLink(el.href || el.getAttribute("href") || "");
  const text = cleanText(el.textContent || href);
  if (!href || isZhidaEntityLink(href)) {
    return text;
  }
  return `[${escapeLinkText(text)}](${href})`;
}

export function isZhidaEntityLink(href) {
  if (!href.startsWith("https://zhida.zhihu.com/") && !href.startsWith("http://zhida.zhihu.com/")) {
    return false;
  }
  const url = new URL(href);
  return url.pathname === "/search" || url.searchParams.get("zhida_source") === "entity";
}

export function renderMath(el) {
  const tex = el.getAttribute("data-tex") || el.textContent || "";
  return `$${tex}$`;
}

export function renderFigure(figure, media) {
  const img = figure.querySelector("img");
  return img ? renderImage(img, media) : "";
}

export function renderImage(img, media) {
  let src = selectImageUrl(img);
  if (!src) {
    return "";
  }

  const isGif = img.classList.contains("ztext-gif") || /gif/i.test(img.getAttribute("data-thumbnail") || "");
  if (isGif) {
    src = guessGifUrl(src);
  }

  const placeholder = registerMedia(media, src, isGif ? "gif" : "image");
  const alt = escapeLinkText(cleanText(img.getAttribute("alt") || ""));
  return `![${alt}](${placeholder})`;
}

export function renderVideo(video, media) {
  const src = normalizeMediaUrl(
    video.getAttribute("src")
    || video.querySelector?.("source[src]")?.getAttribute("src")
    || ""
  );
  if (!src) {
    return "";
  }

  const placeholder = registerMedia(media, src, "video");
  return `<video src="${placeholder}" controls></video>`;
}

export function renderCodeBlock(node) {
  const code = node.querySelector("pre > code") || node.querySelector("code");
  const pre = node.querySelector("pre") || node;
  const className = code?.className || "";
  const language = (className.match(/(?:language|lang)-([a-zA-Z0-9_-]+)/) || [])[1] || "";
  const content = (code?.textContent || pre.textContent || "").replace(/\n+$/g, "");
  const fence = content.includes("```") ? "````" : "```";
  return `${fence}${language}\n${content}\n${fence}`;
}

export function renderList(list, ordered, media) {
  const items = Array.from(list.children).filter((child) => child.tagName.toLowerCase() === "li");
  return items.map((item, index) => {
    const marker = ordered ? `${index + 1}.` : "-";
    const text = renderListItem(item, media);
    return `${marker} ${text}`;
  }).join("\n");
}

export function renderListItem(item, media) {
  const blockChildren = Array.from(item.children).filter((child) => {
    const tag = child.tagName.toLowerCase();
    return ["p", "blockquote", "pre", "div", "figure", "table"].includes(tag);
  });

  if (blockChildren.length === 0) {
    return renderRich(item, media).trim().replace(/\n+/g, "\n  ");
  }

  return blockChildren.map((child) => {
    if (child.tagName.toLowerCase() === "p") {
      return renderRich(child, media).trim();
    }
    return renderBlock(child, media);
  }).filter(Boolean).join("\n  ");
}

export function renderTable(table, media) {
  const rows = Array.from(table.rows).map((row) => {
    return Array.from(row.cells).map((cell) => compactTableCell(renderRich(cell, media)));
  });

  if (rows.length === 0) {
    return "";
  }

  const colCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => {
    const copy = row.slice();
    while (copy.length < colCount) {
      copy.push("");
    }
    return copy;
  });
  const header = normalizedRows[0];
  const separator = header.map(() => "---");
  const body = normalizedRows.slice(1);
  return [header, separator, ...body]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
}

export function compactTableCell(value) {
  return cleanText(value).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

export function renderDocument(metadata, body) {
  const frontmatter = [
    "---",
    `source_type: ${yamlString(metadata.source_type)}`,
    `title: ${yamlString(metadata.title)}`,
    `url: ${yamlString(metadata.url)}`,
    `author: ${yamlString(metadata.author)}`,
    `author_url: ${yamlString(metadata.author_url)}`,
    `time_created: ${yamlString(metadata.time_created)}`,
    `time_modified: ${yamlString(metadata.time_modified)}`,
    `time_exported: ${yamlString(metadata.time_exported)}`,
    ...renderQuestionMetadata(metadata),
    `upvote_count: ${yamlNumber(metadata.upvote_count)}`,
    `comment_count: ${yamlNumber(metadata.comment_count)}`,
    `like_count: ${yamlNumber(metadata.like_count)}`,
    `favorite_count: ${yamlNumber(metadata.favorite_count)}`,
    `content_excerpt: ${yamlString(metadata.content_excerpt)}`,
    "---",
    ""
  ].join("\n");

  return `${frontmatter}\n${body.trim()}\n`;
}

function renderQuestionMetadata(metadata) {
  if (!metadata.answer_id && !metadata.question_id) {
    return [];
  }

  return [
    `question_url: ${yamlString(metadata.question_url)}`,
    `question_time_created: ${yamlString(metadata.question_time_created)}`,
    `question_time_modified: ${yamlString(metadata.question_time_modified)}`,
    `question_answer_count: ${yamlNumberOrEmptyString(metadata.question_answer_count)}`,
    `question_comment_count: ${yamlNumberOrEmptyString(metadata.question_comment_count)}`,
    `question_follower_count: ${yamlNumberOrEmptyString(metadata.question_follower_count)}`,
    `question_topic: ${yamlString(metadata.question_topic)}`
  ];
}

export function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

export function yamlNumber(value) {
  return Number.isFinite(value) ? String(value) : "";
}

export function createContentExcerpt(markdown, limit = 160) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > limit ? text.slice(0, limit) : text;
}

function yamlNumberOrEmptyString(value) {
  return value === "" ? yamlString("") : yamlNumber(value);
}

export function applyMediaReplacements(markdown, replacements) {
  let output = markdown;
  for (const [placeholder, value] of replacements) {
    output = output.split(placeholder).join(value);
  }
  return output;
}
