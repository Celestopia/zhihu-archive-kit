/**
 * Browser directory persistence for the default single-page save action.
 *
 * Chrome and Edge expose File System Access API handles only after the user
 * chooses a directory. The chosen handle is stored in IndexedDB so later saves
 * can reuse the same export root after a permission check.
 */

const DB_NAME = "zhihu-markdown-saver";
const DB_VERSION = 1;
const STORE_NAME = "settings";
const EXPORT_ROOT_KEY = "export-root-directory";
export const DEFAULT_COLLECTION_NAME = "默认收藏夹";
export const COLLECTION_METADATA_FILE = "collection.json";
const INTERNAL_DIRECTORY_PREFIX = "_";

export async function writeArtifactToDirectory(artifact) {
  await writeArtifactToCollection(artifact, DEFAULT_COLLECTION_NAME);
}

export async function writeArtifactToCollection(artifact, collectionName) {
  if (!supportsDirectoryPicker()) {
    throw new Error("当前浏览器不支持保存到文件夹，请使用 Chrome/Edge，或通过齿轮菜单下载 ZIP。");
  }

  const root = await getExportRootDirectory();
  await ensureDefaultCollection(root);

  const collection = await getCollectionDirectory(root, collectionName);
  if (await directoryExists(collection, artifact.folderName)) {
    throw new Error(`目标文件夹已存在：${collectionName}/${artifact.folderName}`);
  }

  const folder = await collection.getDirectoryHandle(artifact.folderName, { create: true });
  await writeFile(folder, "index.md", artifact.indexMarkdown);
  await writeFile(folder, "comments.json", artifact.commentsJson);

  const assetsFolder = await folder.getDirectoryHandle("assets", { create: true });
  for (const asset of artifact.assets) {
    await writeFile(assetsFolder, asset.fileName, asset.data);
  }
}

export async function findSavedCollectionsForFolder(folderName) {
  if (!supportsDirectoryPicker()) {
    return [];
  }

  const root = await getGrantedExportRootDirectory();
  if (!root) {
    return [];
  }

  const collections = await listExistingCollections(root);
  const savedCollections = [];
  for (const collection of collections) {
    if (await directoryExists(collection.handle, folderName)) {
      savedCollections.push(collection.name);
    }
  }
  return savedCollections;
}

export async function listCollections() {
  if (!supportsDirectoryPicker()) {
    throw new Error("当前浏览器不支持保存到文件夹，请使用 Chrome/Edge，或通过齿轮菜单下载 ZIP。");
  }

  const root = await getExportRootDirectory();
  await ensureDefaultCollection(root);

  const collections = [];
  for await (const [name, handle] of root.entries()) {
    if (handle.kind !== "directory") {
      continue;
    }
    if (isInternalDirectoryName(name) || !await isCollectionDirectory(handle)) {
      continue;
    }

    const metadata = await readCollectionMetadata(handle);
    collections.push(metadata);
  }

  return collections.sort((a, b) => {
    if (a.name === DEFAULT_COLLECTION_NAME) {
      return -1;
    }
    if (b.name === DEFAULT_COLLECTION_NAME) {
      return 1;
    }
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}

export async function createCollection(name, description) {
  if (!supportsDirectoryPicker()) {
    throw new Error("当前浏览器不支持保存到文件夹。");
  }

  const cleanName = validateCollectionName(name);
  const root = await getExportRootDirectory();
  await ensureDefaultCollection(root);

  if (await directoryExists(root, cleanName)) {
    throw new Error(`收藏夹已存在：${cleanName}`);
  }

  const collection = await root.getDirectoryHandle(cleanName, { create: true });
  return writeCollectionMetadata(collection, {
    schema_version: 1,
    name: cleanName,
    time_created: formatLocalIso(new Date()),
    description: String(description || "")
  });
}

export function supportsDirectoryPicker() {
  return typeof window.showDirectoryPicker === "function";
}

export async function changeExportRootDirectory() {
  if (!supportsDirectoryPicker()) {
    throw new Error("当前浏览器不支持选择保存目录。");
  }

  const selected = await window.showDirectoryPicker({
    id: "zhihu-markdown-saver",
    mode: "readwrite"
  });
  if (!await ensureReadWritePermission(selected)) {
    throw new Error("未获得目录写入权限。");
  }
  await storeDirectoryHandle(selected);
  await ensureDefaultCollection(selected);
  return selected;
}

async function getExportRootDirectory() {
  const stored = await readStoredDirectoryHandle();
  if (stored && await ensureReadWritePermission(stored)) {
    return stored;
  }

  return changeExportRootDirectory();
}

async function getGrantedExportRootDirectory() {
  const stored = await readStoredDirectoryHandle();
  if (!stored) {
    return null;
  }
  return await hasReadWritePermission(stored) ? stored : null;
}

async function ensureDefaultCollection(root) {
  const collection = await root.getDirectoryHandle(DEFAULT_COLLECTION_NAME, { create: true });
  return ensureCollectionMetadata(collection, DEFAULT_COLLECTION_NAME, "");
}

async function listExistingCollections(root) {
  const collections = [];
  for await (const [name, handle] of root.entries()) {
    if (handle.kind !== "directory") {
      continue;
    }
    if (isInternalDirectoryName(name) || !await isCollectionDirectory(handle)) {
      continue;
    }

    const metadata = await readCollectionMetadata(handle);
    collections.push({
      name: metadata.name || name,
      handle
    });
  }

  return collections.sort((a, b) => {
    if (a.name === DEFAULT_COLLECTION_NAME) {
      return -1;
    }
    if (b.name === DEFAULT_COLLECTION_NAME) {
      return 1;
    }
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}

async function getCollectionDirectory(root, collectionName) {
  const cleanName = validateCollectionName(collectionName);
  try {
    const collection = await root.getDirectoryHandle(cleanName, { create: false });
    if (await isContentDirectory(collection)) {
      throw new Error(`目标不是收藏夹：${cleanName}`);
    }
    await ensureCollectionMetadata(collection, cleanName, "");
    return collection;
  } catch (error) {
    if (error?.name === "NotFoundError") {
      throw new Error(`收藏夹不存在：${cleanName}`);
    }
    throw error;
  }
}

async function ensureCollectionMetadata(collection, name, description) {
  try {
    const handle = await collection.getFileHandle(COLLECTION_METADATA_FILE, { create: false });
    const file = await handle.getFile();
    return JSON.parse(await file.text());
  } catch (error) {
    if (error?.name !== "NotFoundError") {
      throw error;
    }
  }

  return writeCollectionMetadata(collection, {
    schema_version: 1,
    name,
    time_created: formatLocalIso(new Date()),
    description
  });
}

async function readCollectionMetadata(collection) {
  const handle = await collection.getFileHandle(COLLECTION_METADATA_FILE, { create: false });
  const file = await handle.getFile();
  return JSON.parse(await file.text());
}

async function writeCollectionMetadata(collection, metadata) {
  await writeFile(collection, COLLECTION_METADATA_FILE, `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}

async function hasReadWritePermission(handle) {
  return await handle.queryPermission({ mode: "readwrite" }) === "granted";
}

async function ensureReadWritePermission(handle) {
  const options = { mode: "readwrite" };
  if (await handle.queryPermission(options) === "granted") {
    return true;
  }
  return await handle.requestPermission(options) === "granted";
}

async function directoryExists(parent, name) {
  try {
    await parent.getDirectoryHandle(name, { create: false });
    return true;
  } catch (error) {
    if (error?.name === "NotFoundError") {
      return false;
    }
    throw error;
  }
}

async function isContentDirectory(handle) {
  return await fileExists(handle, "index.md") && await fileExists(handle, "comments.json");
}

async function isCollectionDirectory(handle) {
  return !await isContentDirectory(handle) && await fileExists(handle, COLLECTION_METADATA_FILE);
}

async function fileExists(parent, name) {
  try {
    await parent.getFileHandle(name, { create: false });
    return true;
  } catch (error) {
    if (error?.name === "NotFoundError") {
      return false;
    }
    throw error;
  }
}

async function writeFile(directory, fileName, data) {
  const handle = await directory.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }
}

async function readStoredDirectoryHandle() {
  const db = await openDatabase();
  return requestToPromise(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(EXPORT_ROOT_KEY));
}

async function storeDirectoryHandle(handle) {
  const db = await openDatabase();
  await requestToPromise(
    db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(handle, EXPORT_ROOT_KEY)
  );
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function validateCollectionName(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName || cleanName === "." || cleanName === ".." || cleanName.includes("/") || cleanName.includes("\\")) {
    throw new Error("收藏夹名称不能为空，且不能是 .、..，也不能包含 / 或 \\。");
  }
  if (isInternalDirectoryName(cleanName)) {
    throw new Error("收藏夹名称不能以下划线开头。");
  }
  return cleanName;
}

function isInternalDirectoryName(name) {
  return String(name || "").startsWith(INTERNAL_DIRECTORY_PREFIX);
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

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
