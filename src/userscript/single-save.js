import { buildCurrentPageZip } from "../save-core/build-zip.js";
import { setButtonState } from "./ui.js";

/**
 * Single-page save entry used by the visible userscript button.
 */

export async function saveCurrentPage(button) {
  const saveFile = window.saveAs || (typeof saveAs === "function" ? saveAs : null);
  if (!saveFile) {
    setButtonState(button, "缺少 FileSaver", false);
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  setButtonState(button, "保存中...", true);

  try {
    const result = await buildCurrentPageZip({
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
    window.setTimeout(() => {
      button.disabled = false;
      setButtonState(button, originalText, true);
    }, 1600);
  } catch (error) {
    console.error("[Zhihu Markdown Saver] save failed:", error);
    button.disabled = false;
    setButtonState(button, "保存失败", false);
    window.setTimeout(() => {
      setButtonState(button, originalText, true);
    }, 2200);
  }
}
