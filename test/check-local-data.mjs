import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadBatchConfig } from "../src/batch/config.mjs";
import { applicationSettingsPath, resolveArchiveRoot, defaultEmojiCacheDir } from "../src/local-data/paths.mjs";

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "zhmd-paths-"));
const env = { APPDATA: path.join(temporary, "roaming") };
const settingsPath = applicationSettingsPath(env);
const archive = path.join(temporary, "User archive");
await fs.mkdir(archive);
assert.equal(settingsPath, path.join(env.APPDATA, "Zhihu Archive Kit", "settings.json"));
assert.equal(defaultEmojiCacheDir(env), path.join(env.APPDATA, "Zhihu Archive Kit", "cache", "emoji"));
assert.throws(() => defaultEmojiCacheDir({}), /APPDATA is required/);
await assert.rejects(resolveArchiveRoot(undefined, env), /No archive folder is selected/);
assert.equal(await resolveArchiveRoot(archive, {}), archive);

await fs.mkdir(path.dirname(settingsPath), { recursive: true });
await fs.writeFile(settingsPath, JSON.stringify({ archiveRoot: archive }));
assert.equal(await resolveArchiveRoot(undefined, env), archive);
const otherArchive = path.join(temporary, "Other archive");
await fs.mkdir(otherArchive);
assert.equal(await resolveArchiveRoot(otherArchive, env), otherArchive);
assert.equal(JSON.parse(await fs.readFile(settingsPath)).archiveRoot, archive);
await assert.rejects(resolveArchiveRoot(path.join(temporary, "missing"), env), /ENOENT/);
await assert.rejects(resolveArchiveRoot("", env), /non-empty path/);
await fs.writeFile(settingsPath, JSON.stringify({ archiveRoot: "relative" }));
await assert.rejects(resolveArchiveRoot(undefined, env), /absolute archiveRoot/);
await fs.writeFile(settingsPath, "{broken");
await assert.rejects(resolveArchiveRoot(undefined, env), SyntaxError);

const configPath = path.join(temporary, "batch.json");
await fs.writeFile(configPath, JSON.stringify({ urls: ["https://zhuanlan.zhihu.com/p/789"] }));
await assert.rejects(loadBatchConfig([configPath]), /output_dir is required/);
await fs.writeFile(configPath, JSON.stringify({ output_dir: "saved", urls: ["https://zhuanlan.zhihu.com/p/789"] }));
assert.equal((await loadBatchConfig([configPath])).outputDir, path.join(temporary, "saved"));
console.log("Archive path and application settings checks passed.");
