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

export async function writeArtifactToDirectory(artifact) {
  if (!supportsDirectoryPicker()) {
    throw new Error("当前浏览器不支持保存到文件夹，请使用 Chrome/Edge，或通过齿轮菜单下载 ZIP。");
  }

  const root = await getExportRootDirectory();
  if (await directoryExists(root, artifact.folderName)) {
    throw new Error(`目标文件夹已存在：${artifact.folderName}`);
  }

  const folder = await root.getDirectoryHandle(artifact.folderName, { create: true });
  await writeFile(folder, "index.md", artifact.indexMarkdown);

  const assetsFolder = await folder.getDirectoryHandle("assets", { create: true });
  for (const asset of artifact.assets) {
    await writeFile(assetsFolder, asset.fileName, asset.data);
  }
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
  return selected;
}

async function getExportRootDirectory() {
  const stored = await readStoredDirectoryHandle();
  if (stored && await ensureReadWritePermission(stored)) {
    return stored;
  }

  return changeExportRootDirectory();
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

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
