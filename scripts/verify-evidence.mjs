import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_UI_SCREENSHOTS = [
  "screenshots/ui-light-main.png",
  "screenshots/ui-dark-main.png",
  "screenshots/ui-narrow-main.png",
  "screenshots/ui-calendar-focus.png",
  "screenshots/ui-todo-progress.png",
  "screenshots/ui-share-modal.png",
  "screenshots/ui-settings-modal.png",
  "screenshots/ui-save-error.png",
];

export async function assertRequiredUiScreenshots(outputDir) {
  for (const relativePath of REQUIRED_UI_SCREENSHOTS) {
    try {
      const stat = await fs.stat(path.join(outputDir, relativePath));
      if (!stat.isFile() || stat.size === 0) throw new Error("empty");
    } catch {
      throw new Error(`Required UI screenshot is missing or empty: ${relativePath}`);
    }
  }
}

export async function verifyEvidence(outputDir) {
  const summaryPath = path.join(outputDir, "summary.json");
  const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));
  await assertRequiredUiScreenshots(outputDir);
  const declared = [...summary.artifacts, ...summary.screenshots, ...summary.logs];
  const files = [];
  for (const relativePath of declared) {
    const absolutePath = path.join(outputDir, relativePath);
    try {
      const stat = await fs.stat(absolutePath);
      files.push({ path: relativePath, exists: true, bytes: stat.size });
    } catch {
      files.push({ path: relativePath, exists: false, bytes: 0 });
    }
  }
  const consoleLog = await fs.readFile(path.join(outputDir, "logs", "agent-browser-console.txt"), "utf8");
  const consoleErrors = consoleLog.split(/\r?\n/).filter((line) => /^\[error\]/i.test(line.trim()));
  const pdf = await fs.readFile(path.join(outputDir, "artifacts", "sample.pdf"));
  const png = await fs.readFile(path.join(outputDir, "artifacts", "sample.png"));
  const renderedPdfPages = (await fs.readdir(path.join(outputDir, "artifacts")))
    .filter((filename) => /^pdf-page-\d+\.png$/.test(filename));
  const pdfPageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)\b/g) || []).length;
  const evidence = {
    files,
    missing: files.filter((file) => !file.exists),
    empty: files.filter((file) => file.exists && file.bytes === 0),
    consoleErrors,
    pdfSignatureValid: pdf.subarray(0, 5).toString("ascii") === "%PDF-",
    pngSignatureValid: png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    renderedPageCount: renderedPdfPages.length,
    pdfPageCount,
  };
  evidence.passed = evidence.missing.length === 0
    && evidence.empty.length === 0
    && evidence.consoleErrors.length === 0
    && evidence.pdfSignatureValid
    && evidence.pngSignatureValid
    && evidence.renderedPageCount >= 2
    && evidence.pdfPageCount === evidence.renderedPageCount;
  summary.evidence = evidence;
  summary.passed = Boolean(summary.passed && evidence.passed);
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  await fs.writeFile(path.join(outputDir, "evidence-matrix.json"), JSON.stringify(evidence, null, 2), "utf8");
  return evidence;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const outputDir = path.join(process.cwd(), "verify-output");
  const evidence = await verifyEvidence(outputDir);
  console.log(JSON.stringify(evidence, null, 2));
  if (!evidence.passed) process.exitCode = 1;
}
