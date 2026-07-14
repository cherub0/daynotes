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

export const REQUIRED_COMMAND_LOGS = [
  {
    path: "logs/frontend-tests.txt",
    markers: [/Test Files\s+\d+ passed/, /Tests\s+\d+ passed/, /VERIFICATION_EXIT_CODE=0/],
    exampleSuccess: "Test Files 20 passed\nTests 121 passed\nVERIFICATION_EXIT_CODE=0\n",
  },
  {
    path: "logs/lint.txt",
    markers: [/> eslint \./, /VERIFICATION_EXIT_CODE=0/],
    exampleSuccess: "> eslint .\nVERIFICATION_EXIT_CODE=0\n",
  },
  {
    path: "logs/build-bundle.txt",
    markers: [/built in \d/, /Entry: .*\(\d+ bytes; limit 512000 bytes\)/, /Lazy modal: .*ShareModal/, /Lazy modal: .*SettingsModal/, /VERIFICATION_EXIT_CODE=0/],
    exampleSuccess: "built in 3s\nEntry: assets/index.js (43000 bytes; limit 512000 bytes)\nLazy modal: assets/ShareModal.js\nLazy modal: assets/SettingsModal.js\nVERIFICATION_EXIT_CODE=0\n",
  },
  {
    path: "logs/complete-ui.txt",
    markers: [/"passed": true/, /"editor":\s*\{\s*"passed": 27,\s*"total": 27/, /"share":\s*\{\s*"passed": 7,\s*"total": 7/, /"acceptance":\s*\{\s*"passed": 4,\s*"total": 4/, /VERIFICATION_EXIT_CODE=0/],
    exampleSuccess: "{\"passed\": true,\"editor\": {\"passed\": 27,\"total\": 27},\"share\": {\"passed\": 7,\"total\": 7},\"acceptance\": {\"passed\": 4,\"total\": 4}}\nVERIFICATION_EXIT_CODE=0\n",
  },
  {
    path: "logs/rust-tests.txt",
    markers: [/exports_the_browser_rendered_pages_as_a_real_pdf_artifact \.\.\. ok/, /test result: ok\. 12 passed; 0 failed/, /VERIFICATION_EXIT_CODE=0/],
    exampleSuccess: "test export_pdf::tests::exports_the_browser_rendered_pages_as_a_real_pdf_artifact ... ok\ntest result: ok. 12 passed; 0 failed\nVERIFICATION_EXIT_CODE=0\n",
  },
  {
    path: "logs/tauri-build.txt",
    markers: [/Link=C:\\Program Files \(x86\)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\[^\r\n]+\\link\.exe/, /Finished 2 bundles at:/, /DayNotes_[^\r\n]+_zh-CN\.msi/, /DayNotes_[^\r\n]+-setup\.exe/, /VERIFICATION_EXIT_CODE=0/],
    exampleSuccess: "Link=C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44\\bin\\Hostx64\\x64\\link.exe\nFinished 2 bundles at:\nDayNotes_0.1.0_x64_zh-CN.msi\nDayNotes_0.1.0_x64-setup.exe\nVERIFICATION_EXIT_CODE=0\n",
  },
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

export async function assertRequiredCommandLogs(outputDir) {
  const contents = new Map();
  for (const required of REQUIRED_COMMAND_LOGS) {
    let content;
    try {
      content = await fs.readFile(path.join(outputDir, required.path), "utf8");
    } catch {
      throw new Error(`Required command log is missing: ${required.path}`);
    }
    if (!required.markers.every((marker) => marker.test(content))) {
      throw new Error(`Required command log has no complete success evidence: ${required.path}`);
    }
    contents.set(required.path, content);
  }
  return contents;
}

export function assertBackendPdfEvidence({ pdf, pdfPageCount, renderedPageCount, layoutPageCount, rustLog }) {
  if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("backend PDF signature is invalid");
  if (!/exports_the_browser_rendered_pages_as_a_real_pdf_artifact \.\.\. ok/.test(rustLog)) {
    throw new Error("backend PDF provenance is absent from the Rust test log");
  }
  if (pdfPageCount < 2 || pdfPageCount !== renderedPageCount || pdfPageCount !== layoutPageCount) {
    throw new Error(`backend PDF page count mismatch: PDF=${pdfPageCount}, rendered=${renderedPageCount}, layout=${layoutPageCount}`);
  }
}

export async function verifyEvidence(outputDir) {
  const summaryPath = path.join(outputDir, "summary.json");
  const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));
  await assertRequiredUiScreenshots(outputDir);
  const commandLogContents = await assertRequiredCommandLogs(outputDir);
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
  const layout = JSON.parse(await fs.readFile(path.join(outputDir, "artifacts", "frontend-pdf-layout.json"), "utf8"));
  const renderedPdfPages = (await fs.readdir(path.join(outputDir, "artifacts")))
    .filter((filename) => /^pdf-page-\d+\.png$/.test(filename));
  const pdfPageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)\b/g) || []).length;
  assertBackendPdfEvidence({
    pdf,
    pdfPageCount,
    renderedPageCount: renderedPdfPages.length,
    layoutPageCount: layout.pageCount,
    rustLog: commandLogContents.get("logs/rust-tests.txt"),
  });
  const evidence = {
    files,
    missing: files.filter((file) => !file.exists),
    empty: files.filter((file) => file.exists && file.bytes === 0),
    consoleErrors,
    pdfSignatureValid: pdf.subarray(0, 5).toString("ascii") === "%PDF-",
    backendPdfValidated: true,
    backendPdfBytes: pdf.length,
    pngSignatureValid: png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    renderedPageCount: renderedPdfPages.length,
    pdfPageCount,
    frontendLayoutPageCount: layout.pageCount,
    commandLogs: REQUIRED_COMMAND_LOGS.map(({ path: logPath }) => ({ path: logPath, successMarkersValid: true })),
  };
  evidence.passed = evidence.missing.length === 0
    && evidence.empty.length === 0
    && evidence.consoleErrors.length === 0
    && evidence.pdfSignatureValid
    && evidence.backendPdfValidated
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
