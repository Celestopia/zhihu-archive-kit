import { BUTTON_ID } from "./constants.js";

/**
 * UI helpers for the floating save button.
 *
 * The UI is intentionally small because the userscript is a utility overlay on
 * top of Zhihu pages. Save orchestration stays outside this module.
 */

/**
 * Creates the fixed save control with a primary folder-save button and a small
 * ZIP action behind the settings button.
 */
export function createSaveButton(onSave, onZip) {
  const wrapper = document.createElement("div");
  wrapper.id = BUTTON_ID;
  wrapper.style.position = "fixed";
  wrapper.style.right = "72px";
  wrapper.style.bottom = "12px";
  wrapper.style.zIndex = "2147483647";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "6px";
  wrapper.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "保存";
  button.title = "保存当前知乎回答/文章到授权目录";
  button.style.height = "38px";
  button.style.minWidth = "78px";
  button.style.padding = "0 16px";
  button.style.border = "none";
  button.style.borderRadius = "6px";
  button.style.background = "#056de8";
  button.style.color = "#fff";
  button.style.fontSize = "14px";
  button.style.fontWeight = "600";
  button.style.boxShadow = "0 6px 20px rgba(0, 0, 0, .18)";
  button.style.cursor = "pointer";

  button.addEventListener("click", async () => {
    await onSave(button);
  });

  const menu = document.createElement("div");
  menu.style.position = "absolute";
  menu.style.right = "0";
  menu.style.bottom = "44px";
  menu.style.display = "none";
  menu.style.padding = "6px";
  menu.style.borderRadius = "6px";
  menu.style.background = "rgba(23, 25, 31, .96)";
  menu.style.boxShadow = "0 8px 24px rgba(0, 0, 0, .22)";

  const zipButton = document.createElement("button");
  zipButton.type = "button";
  zipButton.textContent = "下载为 ZIP";
  zipButton.title = "通过浏览器下载当前回答/文章 ZIP";
  zipButton.style.height = "32px";
  zipButton.style.padding = "0 12px";
  zipButton.style.border = "none";
  zipButton.style.borderRadius = "5px";
  zipButton.style.background = "#303846";
  zipButton.style.color = "#fff";
  zipButton.style.fontSize = "13px";
  zipButton.style.fontWeight = "600";
  zipButton.style.cursor = "pointer";
  zipButton.style.whiteSpace = "nowrap";
  zipButton.addEventListener("click", async () => {
    await onZip(zipButton);
  });
  menu.append(zipButton);

  const gear = document.createElement("button");
  gear.type = "button";
  gear.textContent = "⚙";
  gear.title = "保存选项";
  gear.style.width = "32px";
  gear.style.height = "32px";
  gear.style.border = "none";
  gear.style.borderRadius = "6px";
  gear.style.background = "rgba(23, 25, 31, .88)";
  gear.style.color = "#fff";
  gear.style.fontSize = "16px";
  gear.style.lineHeight = "32px";
  gear.style.cursor = "pointer";
  gear.style.boxShadow = "0 6px 20px rgba(0, 0, 0, .14)";

  wrapper.addEventListener("mouseenter", () => {
    menu.style.display = "block";
  });
  wrapper.addEventListener("mouseleave", () => {
    menu.style.display = "none";
  });

  wrapper.append(button, gear, menu);
  return wrapper;
}

/**
 * Updates the floating button text and color.
 */
export function setButtonState(button, text, ok) {
  button.textContent = text;
  button.style.background = ok ? "#056de8" : "#c02c38";
}

/**
 * Removes the injected button when navigating away from supported pages.
 */
export function removeSaveButton() {
  document.getElementById(BUTTON_ID)?.remove();
}
