import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAppIconDataUri } from "../src/render/app-icon.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svgPath = path.join(rootDir, "assets", "zhihu-archive-kit.svg");
const icoPath = path.join(rootDir, "assets", "zhihu-archive-kit.ico");
const shortcutScriptPath = path.join(rootDir, "create-local-browser-shortcut.ps1");
const launcherScriptPath = path.join(rootDir, "start-local-browser.ps1");

const svg = await fs.readFile(svgPath, "utf8");
assert.match(svg, /^<svg[^>]+viewBox="0 0 64 64"/);
assert.match(svg, /<title[^>]*>Zhihu Archive Kit<\/title>/);
assert.doesNotMatch(svg, /<(?:image|script)\b|(?:href|src)="https?:\/\//);

const iconDataUri = await loadAppIconDataUri();
assert.equal(iconDataUri, `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);

const ico = await fs.readFile(icoPath);
assert.equal(ico.readUInt16LE(0), 0);
assert.equal(ico.readUInt16LE(2), 1);
const imageCount = ico.readUInt16LE(4);
assert.equal(imageCount, 7);

const sizes = [];
for (let index = 0; index < imageCount; index += 1) {
  const entryOffset = 6 + (index * 16);
  const width = ico[entryOffset] || 256;
  const height = ico[entryOffset + 1] || 256;
  const byteLength = ico.readUInt32LE(entryOffset + 8);
  const imageOffset = ico.readUInt32LE(entryOffset + 12);
  assert.equal(width, height);
  assert.deepEqual(ico.subarray(imageOffset, imageOffset + 8), Buffer.from("89504e470d0a1a0a", "hex"));
  assert.ok(imageOffset + byteLength <= ico.length);
  sizes.push(width);
}
assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);

const shortcutScript = await fs.readFile(shortcutScriptPath, "utf8");
assert.match(shortcutScript, /start-local-browser\.ps1/);
assert.match(shortcutScript, /assets\\zhihu-archive-kit\.ico/);
assert.match(shortcutScript, /\.IconLocation =/);

const launcherScript = await fs.readFile(launcherScriptPath, "utf8");
assert.match(launcherScript, /\[Text\.Encoding\]::Unicode\.GetBytes\(\$OpenWhenReady\)/);
assert.match(launcherScript, /"-EncodedCommand", \$EncodedOpenWhenReady/);
assert.doesNotMatch(launcherScript, /"-Command", \$OpenWhenReady/);

console.log("Application icon checks passed.");
