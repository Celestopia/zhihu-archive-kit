import fs from "node:fs/promises";
import path from "node:path";

export function applicationSettingsPath(env = process.env) {
  return path.join(applicationRoot(env), "settings.json");
}

export function defaultEmojiCacheDir(env = process.env) {
  return path.join(applicationRoot(env), "cache", "emoji");
}

export async function resolveArchiveRoot(explicitRoot, env = process.env) {
  let root;
  if (explicitRoot !== undefined) {
    if (typeof explicitRoot !== "string" || !explicitRoot.trim()) throw new Error("Archive root must be a non-empty path.");
    root = path.resolve(explicitRoot);
  } else {
    let settings;
    try {
      settings = JSON.parse(await fs.readFile(applicationSettingsPath(env), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error("No archive folder is selected. Run start-local-browser.ps1 or pass an archive root explicitly.");
      }
      throw error;
    }
    if (!settings || typeof settings.archiveRoot !== "string" || !path.isAbsolute(settings.archiveRoot)) {
      throw new Error("settings.json must contain an absolute archiveRoot path.");
    }
    root = settings.archiveRoot;
  }
  if (!(await fs.stat(root)).isDirectory()) throw new Error(`Archive root is not a directory: ${root}`);
  return root;
}

function applicationRoot(env) {
  if (typeof env.APPDATA !== "string" || !env.APPDATA.trim()) {
    throw new Error("APPDATA is required for application settings and emoji caching.");
  }
  return path.resolve(env.APPDATA, "Zhihu Archive Kit");
}
