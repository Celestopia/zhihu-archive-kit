#!/usr/bin/env node

import { openBatchUrl } from "./browser-open.mjs";
import { loadBatchConfig } from "./config.mjs";
import { createBatchServer } from "./server.mjs";

/**
 * Batch CLI entry point.
 */

async function main() {
  const config = await loadBatchConfig(process.argv.slice(2));
  const batchServer = await createBatchServer(config);
  await batchServer.listen();

  console.log(`Batch server running at http://127.0.0.1:${config.port}`);
  console.log(`Loaded ${config.jobs.length} supported URL(s).`);
  console.log(`Output directory: ${config.outputDir}`);
  console.log(`Output mode: ${config.extract ? "folder" : "zip"}`);

  const openedBy = openBatchUrl(config.jobs[0].url, {
    browser: config.browser,
    port: config.port
  });
  console.log(`Opened first URL with: ${openedBy}`);

  const reason = await batchServer.completed;
  if (reason === "completed") {
    console.log("Batch queue completed. Server stopped.");
  } else {
    console.log("Batch server stopped.");
  }
}

main().catch((error) => {
  console.error(`[batch] ${error.message}`);
  process.exitCode = 1;
});
