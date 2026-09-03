import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadBatchConfig } from "../src/batch/config.mjs";
import { defaultBatchOutputDir, defaultDataRoot, defaultEmojiCacheDir } from "../src/local-data/paths.mjs";

const localAppData = path.join(os.tmpdir(), "zhmd-local-app-data");
const env = { LOCALAPPDATA: localAppData };
const expectedRoot = path.resolve(localAppData, "Zhihu Archive Kit", "data");

assert.equal(defaultDataRoot(env), expectedRoot);
assert.equal(defaultBatchOutputDir(env), path.join(expectedRoot, "_batch"));
assert.equal(defaultEmojiCacheDir(env), path.resolve(localAppData, "Zhihu Archive Kit", "cache", "emoji"));
assert.throws(() => defaultDataRoot({}), /LOCALAPPDATA is required/);

const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "zhmd-config-"));
const defaultConfigPath = path.join(configDir, "default.json");
await fs.writeFile(defaultConfigPath, JSON.stringify({
  urls: ["https://zhuanlan.zhihu.com/p/789"]
}));
const defaultConfig = await loadBatchConfig([defaultConfigPath], process.cwd(), env);
assert.equal(defaultConfig.outputDir, path.join(expectedRoot, "_batch"));

const explicitConfigPath = path.join(configDir, "explicit.json");
await fs.writeFile(explicitConfigPath, JSON.stringify({
  output_dir: "saved",
  urls: ["https://zhuanlan.zhihu.com/p/789"]
}));
const explicitConfig = await loadBatchConfig([explicitConfigPath], process.cwd(), env);
assert.equal(explicitConfig.outputDir, path.join(configDir, "saved"));

console.log("Local data path checks passed.");
