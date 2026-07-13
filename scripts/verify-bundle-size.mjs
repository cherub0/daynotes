import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const limitBytes = 500 * 1024;
const requiredModalKeys = [
  "src/components/ShareModal.tsx",
  "src/components/SettingsModal.tsx",
];

export async function verifyBundleManifest(manifest, distDir) {
  const entry = manifest["index.html"];
  if (!entry?.isEntry || typeof entry.file !== "string" || !entry.file.endsWith(".js")) {
    throw new Error("Bundle gate failed: index.html JavaScript entry is missing from the Vite manifest");
  }
  const entryPath = path.resolve(distDir, entry.file);
  let entryBytes;
  try {
    entryBytes = (await stat(entryPath)).size;
  } catch {
    throw new Error(`Bundle gate failed: manifest entry file is missing: ${entry.file}`);
  }
  if (entryBytes >= limitBytes) {
    throw new Error(`Bundle gate failed: ${entry.file} is ${entryBytes} bytes; entry must be below ${limitBytes} bytes`);
  }

  const dynamicImports = entry.dynamicImports ?? [];
  const lazyAssets = [];
  for (const key of requiredModalKeys) {
    if (!dynamicImports.includes(key)) {
      throw new Error(`Bundle gate failed: exact dynamic import ${key} is absent`);
    }
    const asset = manifest[key];
    if (!asset || typeof asset.file !== "string") {
      throw new Error(`Bundle gate failed: manifest entry for ${key} has no file`);
    }
    try {
      const bytes = (await stat(path.resolve(distDir, asset.file))).size;
      lazyAssets.push({ file: asset.file, bytes });
    } catch {
      throw new Error(`Bundle gate failed: manifest asset file is missing: ${asset.file}`);
    }
  }
  return { entry: { file: entry.file, bytes: entryBytes }, lazyAssets };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const root = path.resolve(path.dirname(scriptPath), "..");
  const distDir = path.join(root, "dist");
  const manifest = JSON.parse(await readFile(path.join(distDir, ".vite", "manifest.json"), "utf8"));
  const result = await verifyBundleManifest(manifest, distDir);
  console.log(`Entry: ${result.entry.file} (${result.entry.bytes} bytes; limit ${limitBytes} bytes)`);
  for (const asset of result.lazyAssets) console.log(`Lazy modal: ${asset.file} (${asset.bytes} bytes)`);
}
