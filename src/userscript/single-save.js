import { buildCurrentPageArtifact, buildCurrentPageZip } from "../save-core/build-zip.js";
import { changeExportRootDirectory, writeArtifactToDirectory } from "./directory-save.js";
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
  setButtonState(button, "保存中...", true);

  try {
    const artifact = await buildArtifact({
      onProgress: (progress) => {
        if (progress.stage === "media") {
          setButtonState(button, `下载媒体 ${progress.completed}/${progress.total}`, true);
        }
      }
    });
    setButtonState(button, "写入文件夹", true);
    await writeArtifactToDirectory(artifact);

    setButtonState(button, "保存成功", true);
    resetButtonLater(button, originalText, 1600);
  } catch (error) {
    console.error("[Zhihu Markdown Saver] folder save failed:", error);
    button.disabled = false;
    if (error?.name === "AbortError") {
      setButtonState(button, "已取消", false);
      resetButtonLater(button, originalText, 2600);
      return;
    }
    showUserError(error, "保存失败");
    setButtonState(button, "保存失败", false);
    resetButtonLater(button, originalText, 2600);
  }
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
