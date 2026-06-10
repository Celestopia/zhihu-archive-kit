import { expandCollapsedContent } from "./dom.js";
import { applyMediaReplacements, extractPage, renderDocument } from "./markdown.js";
import { downloadMediaAssets } from "./media.js";
import {
  detectTarget,
  extractAnswerTarget,
  extractArticleTarget,
  extractMetadata,
  findAnswerContentRoot,
  findAnswerItemByTarget,
  findArticleContentRoot,
  findArticleRoot,
  findContentRoot,
  findItemRoot
} from "./target.js";
import { targetFolderName } from "../shared/url.js";

/**
 * Browser-side save core.
 *
 * This module builds a page artifact first, then serializes it as a ZIP when a
 * caller needs archive output.
 */

export async function buildCurrentPageArtifact(options = {}) {
  const timeExported = new Date().toISOString();
  options.onProgress?.({ stage: "detect" });
  const target = detectTarget(options.href || location.href);
  if (!target) {
    throw new Error("Only Zhihu answer/article detail pages are supported.");
  }

  options.onProgress?.({ stage: "expand" });
  await expandCollapsedContent(findExpansionScope(target) || document);
  options.onProgress?.({ stage: "extract" });
  const result = extractCurrentPage(target);
  return buildArtifactFromExtracted({ target, result, options, timeExported });
}

export async function buildCurrentPageZip(options = {}) {
  return buildZipFromArtifact(await buildCurrentPageArtifact(options), options);
}

export async function buildAnswerItemArtifact(answerItem, options = {}) {
  const timeExported = new Date().toISOString();
  options.onProgress?.({ stage: "detect" });
  const target = extractAnswerTarget(answerItem);

  options.onProgress?.({ stage: "expand" });
  await expandCollapsedContent(answerItem);
  options.onProgress?.({ stage: "extract" });
  const root = findAnswerContentRoot(answerItem);
  if (!root) {
    throw new Error("Cannot find answer content root.");
  }

  const metadata = extractMetadata({ target, itemRoot: answerItem });
  const result = extractPage({ root, metadata });
  return buildArtifactFromExtracted({ target, result, options, timeExported });
}

export async function buildAnswerItemZip(answerItem, options = {}) {
  return buildZipFromArtifact(await buildAnswerItemArtifact(answerItem, options), options);
}

export async function buildArticleRootArtifact(articleRoot, options = {}) {
  const timeExported = new Date().toISOString();
  options.onProgress?.({ stage: "detect" });
  const target = extractArticleTarget(articleRoot);

  options.onProgress?.({ stage: "expand" });
  await expandCollapsedContent(articleRoot);
  options.onProgress?.({ stage: "extract" });
  const root = findArticleContentRoot(articleRoot);
  if (!root) {
    throw new Error("Cannot find article content root.");
  }

  const itemRoot = findItemRoot(root, "article");
  const metadata = extractMetadata({ target, itemRoot });
  const result = extractPage({ root, metadata });
  return buildArtifactFromExtracted({ target, result, options, timeExported });
}

export async function buildArticleRootZip(articleRoot, options = {}) {
  return buildZipFromArtifact(await buildArticleRootArtifact(articleRoot, options), options);
}

export async function buildZipFromArtifact(artifact, options = {}) {
  const ZipCtor = options.ZipCtor || getZipCtor();
  if (!ZipCtor) {
    throw new Error("JSZip is unavailable.");
  }

  const zip = new ZipCtor();
  const folder = zip.folder(artifact.folderName);
  const assetsFolder = folder.folder("assets");

  folder.file("index.md", artifact.indexMarkdown);
  for (const asset of artifact.assets) {
    assetsFolder.file(asset.fileName, asset.data, { binary: true });
  }
  options.onProgress?.({ stage: "zip", percent: 0 });
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "STORE",
    streamFiles: true
  }, (metadata) => {
    options.onProgress?.({
      stage: "zip",
      percent: Math.floor(metadata.percent || 0),
      currentFile: metadata.currentFile || ""
    });
  });

  return {
    blob,
    fileName: artifact.fileName,
    folderName: artifact.folderName,
    target: artifact.target,
    metadata: artifact.metadata
  };
}

async function buildArtifactFromExtracted({ target, result, options, timeExported }) {
  const folderName = targetFolderName(target, result.metadata);
  options.onProgress?.({ stage: "media", completed: 0, total: result.media.length });
  const media = await downloadMediaAssets(result.media, {
    onProgress: (progress) => options.onProgress?.({ stage: "media", ...progress })
  });
  options.onProgress?.({ stage: "markdown" });
  const metadata = {
    ...result.metadata,
    time_exported: timeExported
  };
  const indexMarkdown = applyMediaReplacements(renderDocument(metadata, result.markdown), media.replacements);

  return {
    folderName,
    indexMarkdown,
    assets: media.assets,
    fileName: `${folderName}.zip`,
    target,
    metadata
  };
}

function findExpansionScope(target) {
  if (target.type === "answer") {
    return findAnswerItemByTarget(target);
  }
  return findArticleRoot();
}

export function extractCurrentPage(target) {
  const root = findContentRoot(target);
  if (!root) {
    throw new Error(`Cannot find ${target.type} content root.`);
  }

  const itemRoot = findItemRoot(root, target.type);
  const metadata = extractMetadata({ target, itemRoot });
  return extractPage({ root, itemRoot, metadata });
}

export function getZipCtor() {
  return window.JSZip || (typeof JSZip !== "undefined" ? JSZip : null);
}
