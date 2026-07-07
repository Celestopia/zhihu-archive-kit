import fs from "node:fs/promises";
import path from "node:path";

const COLLECTION_METADATA_FILE = "collection.json";
const INTERNAL_DIRECTORY_PREFIX = "_";

export class EditApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Dispatch localhost edit API requests for the saved-output root.
 */
export async function handleEditApiRequest({ root, method, segments, body }) {
  if (segments.length === 1 && segments[0] === "collections" && method === "GET") {
    return { status: 200, body: { collections: await listCollections(root) }, mutated: false };
  }

  if (segments.length === 1 && segments[0] === "collections" && method === "POST") {
    return { status: 201, body: { collection: await createCollection(root, body) }, mutated: true };
  }

  if (segments.length === 2 && segments[0] === "collections" && method === "PATCH") {
    return {
      status: 200,
      body: { collection: await updateCollection(root, segments[1], body) },
      mutated: true
    };
  }

  if (segments.length === 3 && segments[0] === "items" && method === "DELETE") {
    await deleteContentItem(root, segments[1], segments[2]);
    return { status: 200, body: { ok: true }, mutated: true };
  }

  if (segments.length === 4 && segments[0] === "items" && segments[3] === "move" && method === "POST") {
    await moveContentItem(root, segments[1], segments[2], body?.targetCollection);
    return { status: 200, body: { ok: true }, mutated: true };
  }

  throw new EditApiError(404, "Unknown API endpoint.");
}

export async function listCollections(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const collections = [];

  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    if (isInternalDirectoryName(entry.name)) {
      continue;
    }

    const collectionPath = rootChildPath(root, entry.name);
    if (!await isCollectionDirectory(collectionPath)) {
      continue;
    }

    const metadata = await readCollectionMetadata(collectionPath);
    collections.push({
      name: metadata.name || entry.name,
      description: metadata.description || "",
      time_created: metadata.time_created || "",
      count: await countContentDirectories(collectionPath)
    });
  }

  return collections.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
}

export async function createCollection(root, payload) {
  const name = validateName(payload?.name, "收藏夹名称");
  const collectionPath = rootChildPath(root, name);
  if (await pathExists(collectionPath)) {
    throw new EditApiError(409, `收藏夹已存在：${name}`);
  }

  await fs.mkdir(collectionPath);
  const metadata = {
    schema_version: 1,
    name,
    time_created: formatLocalIso(new Date()),
    description: String(payload?.description || "")
  };
  await writeCollectionMetadata(collectionPath, metadata);
  return { ...metadata, count: 0 };
}

export async function updateCollection(root, currentName, payload) {
  const cleanCurrentName = validateName(currentName, "收藏夹名称");
  const currentPath = rootChildPath(root, cleanCurrentName);
  await assertCollectionDirectory(currentPath, cleanCurrentName);

  const existingMetadata = await readCollectionMetadata(currentPath);
  const nextName = payload && Object.hasOwn(payload, "name")
    ? validateName(payload.name, "收藏夹名称")
    : cleanCurrentName;
  const nextDescription = payload && Object.hasOwn(payload, "description")
    ? String(payload.description || "")
    : String(existingMetadata.description || "");
  const nextPath = rootChildPath(root, nextName);

  if (nextName !== cleanCurrentName && await pathExists(nextPath)) {
    throw new EditApiError(409, `收藏夹已存在：${nextName}`);
  }

  const metadata = {
    schema_version: 1,
    name: nextName,
    time_created: existingMetadata.time_created || formatLocalIso(new Date()),
    description: nextDescription
  };
  await writeCollectionMetadata(currentPath, metadata);

  if (nextName !== cleanCurrentName) {
    await fs.rename(currentPath, nextPath);
  }

  return {
    ...metadata,
    count: await countContentDirectories(nextPath)
  };
}

export async function deleteContentItem(root, collectionName, folderName) {
  const collectionPath = await requireCollectionPath(root, collectionName);
  const contentPath = collectionChildPath(collectionPath, folderName, "内容目录名");
  await assertContentDirectory(contentPath, folderName);
  await fs.rm(contentPath, { recursive: true, force: false });
}

export async function moveContentItem(root, collectionName, folderName, targetCollectionName) {
  const sourceCollectionPath = await requireCollectionPath(root, collectionName);
  const targetCollectionPath = await requireCollectionPath(root, targetCollectionName);
  if (sourceCollectionPath === targetCollectionPath) {
    throw new EditApiError(409, "目标收藏夹与当前收藏夹相同。");
  }

  const sourcePath = collectionChildPath(sourceCollectionPath, folderName, "内容目录名");
  const targetPath = collectionChildPath(targetCollectionPath, folderName, "内容目录名");
  await assertContentDirectory(sourcePath, folderName);

  if (await pathExists(targetPath)) {
    throw new EditApiError(409, `目标内容已存在：${targetCollectionName}/${folderName}`);
  }

  await fs.rename(sourcePath, targetPath);
}

async function requireCollectionPath(root, name) {
  const cleanName = validateName(name, "收藏夹名称");
  const collectionPath = rootChildPath(root, cleanName);
  await assertCollectionDirectory(collectionPath, cleanName);
  return collectionPath;
}

async function assertCollectionDirectory(collectionPath, name) {
  if (!await isCollectionDirectory(collectionPath)) {
    throw new EditApiError(404, `收藏夹不存在：${name}`);
  }
}

async function assertContentDirectory(contentPath, name) {
  if (!await isDirectory(contentPath)) {
    throw new EditApiError(404, `内容目录不存在：${name}`);
  }
  if (!await isContentDirectory(contentPath)) {
    throw new EditApiError(400, `目标不是内容目录：${name}`);
  }
}

async function isCollectionDirectory(collectionPath) {
  return await isDirectory(collectionPath)
    && !await isContentDirectory(collectionPath)
    && await isFile(path.join(collectionPath, COLLECTION_METADATA_FILE));
}

async function isContentDirectory(contentPath) {
  return await isFile(path.join(contentPath, "index.md")) && await isFile(path.join(contentPath, "comments.json"));
}

async function countContentDirectories(collectionPath) {
  const entries = await fs.readdir(collectionPath, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (entry.isDirectory() && await isContentDirectory(path.join(collectionPath, entry.name))) {
      count += 1;
    }
  }
  return count;
}

async function readCollectionMetadata(collectionPath) {
  return JSON.parse(await fs.readFile(path.join(collectionPath, COLLECTION_METADATA_FILE), "utf8"));
}

async function writeCollectionMetadata(collectionPath, metadata) {
  await fs.writeFile(path.join(collectionPath, COLLECTION_METADATA_FILE), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

function rootChildPath(root, name) {
  const cleanName = validateName(name, "收藏夹名称");
  const childPath = path.resolve(root, cleanName);
  assertInsideRoot(root, childPath);
  return childPath;
}

function collectionChildPath(collectionPath, name, label) {
  const cleanName = validateName(name, label);
  const childPath = path.resolve(collectionPath, cleanName);
  assertInsideRoot(collectionPath, childPath);
  return childPath;
}

function validateName(value, label) {
  const name = String(value || "").trim();
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\") || path.isAbsolute(name)) {
    throw new EditApiError(400, `${label}不能为空，不能是 .、..，也不能包含路径分隔符。`);
  }
  if (isInternalDirectoryName(name)) {
    throw new EditApiError(400, `${label}不能以下划线开头。`);
  }
  return name;
}

function assertInsideRoot(root, targetPath) {
  const cleanRoot = path.resolve(root);
  const cleanTarget = path.resolve(targetPath);
  if (cleanTarget !== cleanRoot && !cleanTarget.startsWith(`${cleanRoot}${path.sep}`)) {
    throw new EditApiError(403, "路径不在保存根目录内。");
  }
}

function isInternalDirectoryName(name) {
  return String(name || "").startsWith(INTERNAL_DIRECTORY_PREFIX);
}

async function pathExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function isFile(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function isDirectory(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isDirectory();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function formatLocalIso(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absoluteOffset / 60), 2);
  const offsetRestMinutes = pad(absoluteOffset % 60, 2);

  return `${date.getFullYear()}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}T${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}.${pad(date.getMilliseconds(), 3)}${sign}${offsetHours}:${offsetRestMinutes}`;
}

function pad(value, length) {
  return String(value).padStart(length, "0");
}
