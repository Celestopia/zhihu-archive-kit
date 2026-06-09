import { expandCollapsedContent } from "./dom.js";
import { applyMediaReplacements, extractPage, renderDocument } from "./markdown.js";
import { downloadMediaToZip } from "./media.js";
import { detectTarget, extractMetadata, findContentRoot, findItemRoot } from "./target.js";

/**
 * Browser-side save core.
 *
 * This module only builds the ZIP Blob for the current Zhihu page. It does not
 * know whether the caller will download the Blob with FileSaver or upload it to
 * a local batch server.
 */

export async function buildCurrentPageZip(options = {}) {
  const timeExported = new Date().toISOString();
  options.onProgress?.({ stage: "detect" });
  const target = detectTarget(options.href || location.href);
  if (!target) {
    throw new Error("Only Zhihu answer/article detail pages are supported.");
  }

  const ZipCtor = options.ZipCtor || getZipCtor();
  if (!ZipCtor) {
    throw new Error("JSZip is unavailable.");
  }

  options.onProgress?.({ stage: "expand" });
  await expandCollapsedContent();
  options.onProgress?.({ stage: "extract" });
  const result = extractCurrentPage(target);
  const folderName = `${target.type}-${target.id}`;
  const zip = new ZipCtor();
  const folder = zip.folder(folderName);
  const assetsFolder = folder.folder("assets");
  options.onProgress?.({ stage: "media", completed: 0, total: result.media.length });
  const replacements = await downloadMediaToZip(result.media, assetsFolder, {
    onProgress: (progress) => options.onProgress?.({ stage: "media", ...progress })
  });
  options.onProgress?.({ stage: "markdown" });
  const metadata = {
    ...result.metadata,
    time_exported: timeExported
  };
  const markdown = applyMediaReplacements(renderDocument(metadata, result.markdown), replacements);

  folder.file("index.md", markdown);
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
    fileName: `${folderName}.zip`,
    folderName,
    target,
    metadata
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
