import fs from "node:fs/promises";

const APP_ICON_URL = new URL("../../assets/zhihu-archive-kit.svg", import.meta.url);
let iconDataUriPromise;

export function loadAppIconDataUri() {
  iconDataUriPromise ||= fs.readFile(APP_ICON_URL)
    .then((content) => `data:image/svg+xml;base64,${content.toString("base64")}`);
  return iconDataUriPromise;
}
