import { buildCurrentPageArtifact, buildCurrentPageZip } from "../save-core/build-zip.js";
import { CONTROL_CLASS } from "./constants.js";
import {
  changeExportRootDirectory,
  createCollection,
  listCollections,
  writeArtifactToCollection
} from "./directory-save.js";
import { setButtonState } from "./ui.js";

/**
 * Single-page save actions used by content-bound userscript controls.
 */

export async function saveCurrentPage(button) {
  await saveArtifactWithButton(button, buildCurrentPageArtifact);
}

export async function saveCurrentPageAsZip(button) {
  await saveZipWithButton(button, buildCurrentPageZip);
}

export async function changeDirectoryWithButton(button) {
  const originalText = button.textContent;
  button.disabled = true;
  setButtonState(button, "选择目录...", true);

  try {
    await changeExportRootDirectory();
    setButtonState(button, "目录已更改", true);
    resetButtonLater(button, originalText, 1600);
  } catch (error) {
    console.error("[Zhihu Markdown Saver] change directory failed:", error);
    button.disabled = false;
    if (error?.name === "AbortError") {
      setButtonState(button, originalText, true);
      return;
    }
    showUserError(error, "更改保存目录失败");
    setButtonState(button, "更改失败", false);
    resetButtonLater(button, originalText, 2200);
  }
}

export async function saveArtifactWithButton(button, buildArtifact) {
  const originalText = button.textContent;
  button.disabled = true;
  setButtonState(button, "载入收藏夹...", true);

  try {
    const collections = await listCollections();
    button.disabled = false;
    setButtonState(button, originalText, true);
    showCollectionMenu(button, buildArtifact, collections);
  } catch (error) {
    console.error("[Zhihu Markdown Saver] collection menu failed:", error);
    button.disabled = false;
    setButtonState(button, originalText, true);
    if (error?.name === "AbortError") {
      return;
    }
    showUserError(error, "打开收藏夹失败");
  }
}

function showCollectionMenu(button, buildArtifact, collections) {
  const control = button.closest(`.${CONTROL_CLASS}`);
  if (!control) {
    throw new Error("找不到保存控件。");
  }

  closeCollectionMenu(control);

  const menu = document.createElement("div");
  menu.className = `${CONTROL_CLASS}__collection-menu`;
  menu.addEventListener("click", (event) => event.stopPropagation());

  const title = document.createElement("div");
  title.className = `${CONTROL_CLASS}__collection-title`;
  title.textContent = "选择收藏夹";

  const select = document.createElement("select");
  select.className = `${CONTROL_CLASS}__collection-select`;
  fillCollectionSelect(select, collections);

  const newButton = document.createElement("button");
  newButton.type = "button";
  newButton.className = `${CONTROL_CLASS}__collection-secondary`;
  newButton.textContent = "新建收藏夹";
  newButton.addEventListener("click", async () => {
    await createCollectionFromPrompt(select);
  });

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = `${CONTROL_CLASS}__collection-save`;
  saveButton.textContent = "保存";
  saveButton.addEventListener("click", async () => {
    await saveArtifactToSelectedCollection(button, saveButton, buildArtifact, select.value, menu);
  });

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = `${CONTROL_CLASS}__collection-secondary`;
  cancelButton.textContent = "取消";
  cancelButton.addEventListener("click", () => menu.remove());

  const actions = document.createElement("div");
  actions.className = `${CONTROL_CLASS}__collection-actions`;
  actions.append(newButton, cancelButton, saveButton);

  menu.append(title, select, actions);
  control.querySelector(`.${CONTROL_CLASS}__inner`).append(menu);
}

function fillCollectionSelect(select, collections, selectedName = "") {
  select.replaceChildren();

  for (const collection of collections) {
    const option = document.createElement("option");
    option.value = collection.name;
    option.textContent = collection.name;
    if (collection.description) {
      option.title = collection.description;
    }
    select.append(option);
  }

  if (selectedName) {
    select.value = selectedName;
  }
}

async function createCollectionFromPrompt(select) {
  const name = window.prompt("请输入收藏夹名称：", "");
  if (name === null) {
    return;
  }

  const description = window.prompt("请输入收藏夹描述（可留空）：", "");
  try {
    const created = await createCollection(name, description === null ? "" : description);
    const collections = await listCollections();
    fillCollectionSelect(select, collections, created.name);
  } catch (error) {
    console.error("[Zhihu Markdown Saver] create collection failed:", error);
    showUserError(error, "新建收藏夹失败");
  }
}

async function saveArtifactToSelectedCollection(button, saveButton, buildArtifact, collectionName, menu) {
  const originalText = button.textContent;
  button.disabled = true;
  setButtonState(button, "保存中...", true);
  saveButton.disabled = true;
  saveButton.textContent = "保存中...";

  try {
    const artifact = await buildArtifact({
      onProgress: (progress) => {
        if (progress.stage === "media") {
          setButtonState(button, `下载媒体 ${progress.completed}/${progress.total}`, true);
        }
      }
    });
    setButtonState(button, "写入收藏夹", true);
    await writeArtifactToCollection(artifact, collectionName);

    menu.remove();
    setButtonState(button, "保存成功", true);
    resetButtonLater(button, originalText, 1600);
  } catch (error) {
    console.error("[Zhihu Markdown Saver] folder save failed:", error);
    button.disabled = false;
    saveButton.disabled = false;
    saveButton.textContent = "保存";
    if (error?.name === "AbortError") {
      setButtonState(button, originalText, true);
      return;
    }
    showUserError(error, "保存失败");
    setButtonState(button, "保存失败", false);
    resetButtonLater(button, originalText, 2600);
  }
}

function closeCollectionMenu(control) {
  control.querySelectorAll(`.${CONTROL_CLASS}__collection-menu`).forEach((item) => item.remove());
}

export async function saveZipWithButton(button, buildZip) {
  const saveFile = window.saveAs || (typeof saveAs === "function" ? saveAs : null);
  if (!saveFile) {
    setButtonState(button, "缺少 FileSaver", false);
    window.alert("下载 ZIP 失败：缺少 FileSaver。");
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  setButtonState(button, "保存中...", true);

  try {
    const result = await buildZip({
      onProgress: (progress) => {
        if (progress.stage === "media") {
          setButtonState(button, `下载媒体 ${progress.completed}/${progress.total}`, true);
        } else if (progress.stage === "zip") {
          setButtonState(button, `生成 ZIP ${progress.percent || 0}%`, true);
        }
      }
    });
    saveFile(result.blob, result.fileName);

    setButtonState(button, "保存成功", true);
    resetButtonLater(button, originalText, 1600);
  } catch (error) {
    console.error("[Zhihu Markdown Saver] ZIP save failed:", error);
    button.disabled = false;
    showUserError(error, "下载 ZIP 失败");
    setButtonState(button, "保存失败", false);
    resetButtonLater(button, originalText, 2200);
  }
}

function showUserError(error, fallbackMessage) {
  const message = error?.message ? String(error.message) : fallbackMessage;
  window.alert(`${fallbackMessage}：${message}`);
}

function resetButtonLater(button, text, delayMs) {
  window.setTimeout(() => {
    button.disabled = false;
    setButtonState(button, text, true);
  }, delayMs);
}
