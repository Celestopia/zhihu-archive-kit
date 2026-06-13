import { CONTROL_CLASS, CONTROL_HOST_CLASS, CONTROL_STYLE_ID } from "./constants.js";

/**
 * UI helpers for content-bound save controls.
 *
 * Controls are inserted into answer/article containers and revealed by CSS when
 * the user hovers over the related content area.
 */

export function ensureSaveControlStyle() {
  if (document.getElementById(CONTROL_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = CONTROL_STYLE_ID;
  style.textContent = `
    .AnswerItem .RichContent,
    .Post-content,
    .Post-RichTextContainer,
    .Post-Main,
    .${CONTROL_HOST_CLASS} {
      position: relative;
    }

    .${CONTROL_CLASS} {
      opacity: 0;
      pointer-events: none;
      position: absolute;
      left: -240px;
      top: -48px;
      bottom: -48px;
      width: 240px;
      min-height: 320px;
      z-index: 2147483646;
      transition: opacity .16s ease;
      user-select: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .${CONTROL_CLASS}__inner {
      position: sticky;
      top: 120px;
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin-left: 96px;
      margin-top: 48px;
    }

    .AnswerItem:hover .${CONTROL_CLASS},
    .Post-content:hover .${CONTROL_CLASS},
    .Post-RichTextContainer:hover .${CONTROL_CLASS},
    .Post-Main:hover .${CONTROL_CLASS},
    .${CONTROL_HOST_CLASS}:hover .${CONTROL_CLASS},
    .${CONTROL_CLASS}:hover {
      opacity: 1;
      pointer-events: auto;
    }

    .${CONTROL_CLASS} button {
      border: none;
      border-radius: 6px;
      color: #fff;
      cursor: pointer;
      font-weight: 600;
      box-shadow: 0 6px 20px rgba(0, 0, 0, .14);
    }

    .${CONTROL_CLASS}__primary {
      min-width: 64px;
      height: 38px;
      padding: 0 14px;
      background: #056de8;
      font-size: 14px;
    }

    .${CONTROL_CLASS}__gear {
      width: 30px;
      height: 30px;
      background: rgba(23, 25, 31, .88);
      font-size: 15px;
      line-height: 30px;
    }

    .${CONTROL_CLASS}__menu {
      display: none;
      position: absolute;
      left: 0;
      top: 44px;
      padding: 6px;
      border-radius: 6px;
      background: rgba(23, 25, 31, .96);
      box-shadow: 0 8px 24px rgba(0, 0, 0, .22);
    }

    .${CONTROL_CLASS}:hover .${CONTROL_CLASS}__menu {
      display: block;
    }

    .${CONTROL_CLASS}__zip {
      height: 32px;
      padding: 0 12px;
      background: #303846;
      font-size: 13px;
      white-space: nowrap;
    }

    .${CONTROL_CLASS}__directory {
      display: block;
      height: 32px;
      margin-bottom: 6px;
      padding: 0 12px;
      background: #303846;
      font-size: 13px;
      white-space: nowrap;
    }

    .${CONTROL_CLASS}__collection-menu {
      position: absolute;
      left: 0;
      top: 44px;
      width: 188px;
      padding: 8px;
      border-radius: 6px;
      background: rgba(23, 25, 31, .96);
      box-shadow: 0 8px 24px rgba(0, 0, 0, .22);
    }

    .${CONTROL_CLASS}__collection-title {
      margin-bottom: 6px;
      color: rgba(255, 255, 255, .84);
      font-size: 13px;
      font-weight: 600;
    }

    .${CONTROL_CLASS}__collection-select {
      display: block;
      width: 100%;
      height: 32px;
      margin-bottom: 8px;
      border: 1px solid rgba(255, 255, 255, .18);
      border-radius: 5px;
      background: #fff;
      color: #1f2328;
      font-size: 13px;
    }

    .${CONTROL_CLASS}__collection-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .${CONTROL_CLASS}__collection-actions button {
      height: 30px;
      padding: 0 8px;
      font-size: 12px;
      white-space: nowrap;
    }

    .${CONTROL_CLASS}__collection-secondary {
      background: #303846;
    }

    .${CONTROL_CLASS}__collection-save {
      grid-column: 1 / -1;
      background: #056de8;
    }
  `;
  document.documentElement.append(style);
}

export function createSaveControl(onSave, onZip, onChangeDirectory) {
  const wrapper = document.createElement("div");
  wrapper.className = CONTROL_CLASS;

  const inner = document.createElement("div");
  inner.className = `${CONTROL_CLASS}__inner`;

  const button = document.createElement("button");
  button.type = "button";
  button.className = `${CONTROL_CLASS}__primary`;
  button.textContent = "保存";
  button.title = "选择收藏夹后保存当前知乎回答/文章到本地目录";
  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    await onSave(button);
  });

  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = `${CONTROL_CLASS}__gear`;
  gear.textContent = "⚙";
  gear.title = "保存选项";
  gear.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  const menu = document.createElement("div");
  menu.className = `${CONTROL_CLASS}__menu`;

  const directoryButton = document.createElement("button");
  directoryButton.type = "button";
  directoryButton.className = `${CONTROL_CLASS}__directory`;
  directoryButton.textContent = "更改保存目录";
  directoryButton.title = "重新选择保存到本地的文件夹";
  directoryButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    await onChangeDirectory(directoryButton);
  });

  const zipButton = document.createElement("button");
  zipButton.type = "button";
  zipButton.className = `${CONTROL_CLASS}__zip`;
  zipButton.textContent = "下载为 ZIP";
  zipButton.title = "通过浏览器下载当前内容为 ZIP；下载目录为浏览器默认下载目录";
  zipButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    await onZip(zipButton);
  });

  menu.append(directoryButton, zipButton);
  inner.append(button, gear, menu);
  wrapper.append(inner);
  return wrapper;
}

export function setButtonState(button, text, ok) {
  button.textContent = text;
  button.style.background = ok ? "" : "#c02c38";
}

export function removeSaveControls() {
  document.querySelectorAll(`.${CONTROL_CLASS}`).forEach((item) => item.remove());
}
