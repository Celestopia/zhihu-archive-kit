import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { DEFAULT_BATCH_PORT } from "./constants.js";

/**
 * Opens the first batch URL in a normal system browser.
 */

export function openBatchUrl(url, options = {}) {
  const targetUrl = withBatchPort(url, options.port || DEFAULT_BATCH_PORT);
  const browser = options.browser || "default";

  if (browser === "default") {
    return openDefaultBrowser(targetUrl);
  }

  const executable = resolveBrowserExecutable(browser);
  const child = spawn(executable, [targetUrl], {
    detached: true,
    stdio: "ignore",
    shell: false,
    windowsHide: true
  });
  child.unref();
  return executable;
}

export function withBatchPort(url, port) {
  if (Number(port) === DEFAULT_BATCH_PORT) {
    return url;
  }

  const target = new URL(url);
  target.searchParams.set("zhmd_batch_port", String(port));
  return target.href;
}

function openDefaultBrowser(url) {
  if (process.platform === "win32") {
    const child = spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
    return "default";
  }

  const command = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [url], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  return command;
}

function resolveBrowserExecutable(browser) {
  if (browser.includes("\\") || browser.includes("/") || browser.endsWith(".exe")) {
    return browser;
  }

  if (browser === "chrome") {
    return firstExisting([
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      `${process.env.LOCALAPPDATA || ""}\\Google\\Chrome\\Application\\chrome.exe`
    ]) || (process.platform === "win32" ? "chrome.exe" : "google-chrome");
  }

  if (browser === "edge") {
    return firstExisting([
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      `${process.env.LOCALAPPDATA || ""}\\Microsoft\\Edge\\Application\\msedge.exe`
    ]) || (process.platform === "win32" ? "msedge.exe" : "microsoft-edge");
  }

  return browser;
}

function firstExisting(candidates) {
  return candidates.find((candidate) => candidate && existsSync(candidate)) || "";
}
