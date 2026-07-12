import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const manifestPath = resolve("dist/.vite/manifest.json");
const limitBytes = 500 * 1024;

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const entry = manifest["index.html"];

if (!entry?.isEntry || !entry.file?.endsWith(".js")) {
  throw new Error("Bundle gate failed: index.html JavaScript entry is missing from the Vite manifest");
}

const entryBytes = (await stat(resolve("dist", entry.file))).size;
if (entryBytes >= limitBytes) {
  throw new Error(
    `Bundle gate failed: ${entry.file} is ${entryBytes} bytes; entry must be below ${limitBytes} bytes`,
  );
}

const dynamicImports = entry.dynamicImports ?? [];
const requiredModals = ["ShareModal", "SettingsModal"];
for (const modal of requiredModals) {
  if (!dynamicImports.some((key) => key.includes(modal))) {
    throw new Error(`Bundle gate failed: dynamic import for ${modal} is absent`);
  }
}

console.log(`Entry: ${entry.file} (${entryBytes} bytes; limit ${limitBytes} bytes)`);
for (const key of dynamicImports.filter((key) => requiredModals.some((modal) => key.includes(modal)))) {
  const asset = manifest[key];
  const bytes = (await stat(resolve("dist", asset.file))).size;
  console.log(`Lazy modal: ${asset.file} (${bytes} bytes)`);
}
