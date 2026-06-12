import { renderOutputIndex } from "./index-page.mjs";

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1) {
    throw new Error("Usage: npm run render:index -- [output-root]");
  }

  const outputPath = await renderOutputIndex(args[0] || "output");
  console.log(`HTML navigation written to ${outputPath}`);
}

main().catch((error) => {
  console.error(`[render:index] ${error.message}`);
  process.exitCode = 1;
});
