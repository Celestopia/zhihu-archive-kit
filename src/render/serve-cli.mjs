import { startRenderServer } from "./serve.mjs";

async function main() {
  const { rootPath, port } = parseArgs(process.argv.slice(2));
  const handle = await startRenderServer({ rootPath, port });

  console.log(`HTML navigation served from ${handle.root}`);
  console.log(`Open ${handle.url}`);
  console.log("Press Ctrl+C to stop.");
}

function parseArgs(args) {
  let rootPath = "output";
  let port = 17892;
  let rootSeen = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--port") {
      const value = args[i + 1];
      if (!value || !/^\d+$/.test(value)) {
        throw new Error("Usage: npm run render:serve -- [output-root] [--port 17892]");
      }
      port = Number(value);
      i += 1;
      continue;
    }

    if (arg.startsWith("--") || rootSeen) {
      throw new Error("Usage: npm run render:serve -- [output-root] [--port 17892]");
    }

    rootPath = arg;
    rootSeen = true;
  }

  return { rootPath, port };
}

main().catch((error) => {
  console.error(`[render:serve] ${error.message}`);
  process.exitCode = 1;
});
