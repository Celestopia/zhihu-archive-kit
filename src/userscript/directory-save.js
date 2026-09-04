const DB_NAME = "zhihu-archive-kit";
const STORE_NAME = "settings";
const ROOT_KEY = "archive-root";
const DEFAULT_COLLECTION = "默认收藏夹";
const METADATA_FILE = "collection.json";

export async function getArchiveRoot() {
  assertDirectoryPicker();
  const root = await readStoredRoot();
  if (!root) return changeArchiveRoot();
  if (await root.queryPermission({ mode: "readwrite" }) !== "granted"
    && await root.requestPermission({ mode: "readwrite" }) !== "granted") {
    throw new Error("未获得目录写入权限，请授权或通过齿轮菜单更改保存文件夹。");
  }
  await ensureDefaultCollection(root);
  return root;
}

export async function changeArchiveRoot() {
  assertDirectoryPicker();
  const root = await window.showDirectoryPicker({ id: "zhihu-archive-kit", mode: "readwrite" });
  await ensureDefaultCollection(root);
  await storeRoot(root);
  return root;
}

export async function listCollections(root) {
  const collections = [];
  for await (const [name, handle] of root.entries()) {
    if (handle.kind !== "directory" || name.startsWith("_")) continue;
    if (!await fileExists(handle, METADATA_FILE) || await fileExists(handle, "index.md")) continue;
    const metadata = await readMetadata(handle);
    collections.push({ name, description: metadata.description });
  }
  return collections.sort((a, b) => {
    if (a.name === DEFAULT_COLLECTION) return -1;
    if (b.name === DEFAULT_COLLECTION) return 1;
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}

export async function createCollection(root, name, description) {
  const collectionName = validateCollectionName(name);
  if (await entryExists(root, collectionName)) throw new Error(`收藏夹已存在：${collectionName}`);
  const collection = await root.getDirectoryHandle(collectionName, { create: true });
  const metadata = { schema_version: 1, name: collectionName, description, time_created: new Date().toISOString() };
  await writeFile(collection, METADATA_FILE, JSON.stringify(metadata, null, 2) + "\n");
  return metadata;
}

export async function writeArtifactToCollection(root, artifact, collectionName) {
  validateCollectionName(collectionName);
  if (!/^(?:question-\d+-answer-\d+|article-\d+)$/.test(artifact.folderName)) {
    throw new Error("内容目录名无效。");
  }
  const collection = await root.getDirectoryHandle(collectionName);
  await readMetadata(collection);
  if (await entryExists(collection, artifact.folderName)) {
    throw new Error(`目标文件夹已存在：${collectionName}/${artifact.folderName}`);
  }
  const folder = await collection.getDirectoryHandle(artifact.folderName, { create: true });
  const assets = await folder.getDirectoryHandle("assets", { create: true });
  for (const asset of artifact.assets) await writeFile(assets, asset.fileName, asset.data);
  await writeFile(folder, "comments.json", artifact.commentsJson);
  await writeFile(folder, "index.md", artifact.indexMarkdown);
}

export async function findSavedCollectionsForFolder(folderName) {
  if (typeof window.showDirectoryPicker !== "function") return [];
  const root = await readStoredRoot();
  if (!root || await root.queryPermission({ mode: "readwrite" }) !== "granted") return [];
  const matches = [];
  for (const collection of await listCollections(root)) {
    const handle = await root.getDirectoryHandle(collection.name);
    try {
      const item = await handle.getDirectoryHandle(folderName);
      if (await fileExists(item, "index.md") && await fileExists(item, "comments.json")) matches.push(collection.name);
    } catch (error) {
      if (error.name !== "NotFoundError") throw error;
    }
  }
  return matches;
}

function assertDirectoryPicker() {
  if (typeof window.showDirectoryPicker !== "function") {
    throw new Error("当前浏览器不支持保存到文件夹，请使用 Chrome/Edge，或下载为 ZIP。");
  }
}

async function ensureDefaultCollection(root) {
  const collection = await root.getDirectoryHandle(DEFAULT_COLLECTION, { create: true });
  if (await fileExists(collection, "index.md")) throw new Error("默认收藏夹不能是内容目录。");
  if (!await fileExists(collection, METADATA_FILE)) {
    await writeFile(collection, METADATA_FILE, JSON.stringify({
      schema_version: 1, name: DEFAULT_COLLECTION, description: "", time_created: new Date().toISOString()
    }, null, 2) + "\n");
  }
}

function validateCollectionName(name) {
  const value = name.trim();
  if (!value || value === "." || value === ".." || value.startsWith("_")
    || /[<>:"/\\|?*\x00-\x1f]/.test(value) || /[. ]$/.test(value)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) {
    throw new Error("收藏夹名称无效：不能使用路径分隔符、Windows 保留名称或以下划线开头。");
  }
  return value;
}

async function readMetadata(collection) {
  const handle = await collection.getFileHandle(METADATA_FILE);
  return JSON.parse(await (await handle.getFile()).text());
}

async function fileExists(directory, name) {
  try {
    await directory.getFileHandle(name);
    return true;
  } catch (error) {
    if (error.name === "NotFoundError") return false;
    throw error;
  }
}

async function entryExists(directory, name) {
  for await (const entryName of directory.keys()) {
    if (entryName.toLowerCase() === name.toLowerCase()) return true;
  }
  return false;
}

async function writeFile(directory, name, data) {
  const handle = await directory.getFileHandle(name, { create: true });
  const stream = await handle.createWritable();
  try {
    await stream.write(data);
    await stream.close();
  } catch (error) {
    await stream.abort();
    throw error;
  }
}

async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStoredRoot() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(ROOT_KEY);
    transaction.oncomplete = () => { db.close(); resolve(request.result); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

async function storeRoot(root) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(root, ROOT_KEY);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}
