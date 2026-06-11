import { renderSavedFolder } from "./render.mjs";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    throw new Error("Usage: npm run render -- <content-folder>");
  }

  const outputPath = await renderSavedFolder(args[0]);
  console.log(`HTML preview written to ${outputPath}`);
}

main().catch((error) => {
  console.error(`[render] ${error.message}`);
  process.exitCode = 1;
});
