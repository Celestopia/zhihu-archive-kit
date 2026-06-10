import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

/**
 * Extracts a userscript-generated ZIP into the configured batch output folder.
 *
 * The archive must contain exactly one top-level directory. Existing target
 * directories are rejected to avoid overwriting a previous export.
 */

export async function extractSingleFolderZip(buffer, outputDir) {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  const rootNames = new Set();
  const normalizedEntries = entries.map((entry) => {
    const parts = validateZipPath(entry.unsafeOriginalName || entry.name);
    rootNames.add(parts[0]);
    return { entry, parts };
  });

  if (rootNames.size !== 1) {
    throw new Error("ZIP must contain exactly one top-level folder.");
  }

  const folderName = Array.from(rootNames)[0];
  const targetDir = path.join(outputDir, folderName);
  if (await pathExists(targetDir)) {
    throw new Error(`目标文件夹已存在：${folderName}`);
  }

  await fs.mkdir(targetDir, { recursive: false });
  for (const item of normalizedEntries) {
    if (item.entry.dir) {
      continue;
    }
    if (item.parts.length < 2) {
      throw new Error("ZIP files must be placed inside the top-level folder.");
    }

    const relativeParts = item.parts.slice(1);
    const outputPath = path.resolve(targetDir, ...relativeParts);
    if (!isInsideDirectory(outputPath, targetDir)) {
      throw new Error("ZIP entry resolves outside the target folder.");
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, await item.entry.async("nodebuffer"));
  }

  return { folderName, outputPath: targetDir };
}

function validateZipPath(rawName) {
  const name = String(rawName || "").replace(/\\/g, "/");
  if (!name || name.startsWith("/") || /^[a-zA-Z]:/.test(name)) {
    throw new Error("ZIP contains an invalid path.");
  }

  const parts = name.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error("ZIP contains an invalid path.");
  }
  return parts;
}

function isInsideDirectory(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
