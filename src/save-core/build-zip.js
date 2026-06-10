import { expandCollapsedContent } from "./dom.js";
import { applyMediaReplacements, extractPage, renderDocument } from "./markdown.js";
import { downloadMediaAssets } from "./media.js";
import { detectTarget, extractMetadata, findContentRoot, findItemRoot } from "./target.js";
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
  await expandCollapsedContent();
  options.onProgress?.({ stage: "extract" });
  const result = extractCurrentPage(target);
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

export async function buildCurrentPageZip(options = {}) {
  const ZipCtor = options.ZipCtor || getZipCtor();
  if (!ZipCtor) {
    throw new Error("JSZip is unavailable.");
  }

  const artifact = await buildCurrentPageArtifact(options);
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
