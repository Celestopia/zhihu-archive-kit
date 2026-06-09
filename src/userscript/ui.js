import { BUTTON_ID } from "./constants.js";

/**
 * UI helpers for the floating save button.
 *
 * The UI is intentionally small because the userscript is a utility overlay on
 * top of Zhihu pages. All save orchestration stays in `save.js`.
 */

/**
 * Creates the fixed "Save as ZIP" button.
 */
export function createSaveButton(onClick) {
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.textContent = "保存为 ZIP";
  button.title = "保存当前知乎回答/文章为 Markdown ZIP";
  button.style.position = "fixed";
  button.style.right = "72px";
  button.style.bottom = "12px";
  button.style.zIndex = "2147483647";
  button.style.height = "38px";
  button.style.padding = "0 14px";
  button.style.border = "none";
  button.style.borderRadius = "6px";
  button.style.background = "#056de8";
  button.style.color = "#fff";
  button.style.fontSize = "14px";
  button.style.fontWeight = "600";
  button.style.boxShadow = "0 6px 20px rgba(0, 0, 0, .18)";
  button.style.cursor = "pointer";

  button.addEventListener("click", async () => {
    await onClick(button);
  });

  return button;
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
