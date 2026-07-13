// @vitest-environment node

import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyBundleManifest } from "./verify-bundle-size.mjs";
import { attachBrowserErrorListeners } from "./verify-browser-errors.mjs";
import {
  assertBackendPdfEvidence,
  assertRequiredCommandLogs,
  assertRequiredUiScreenshots,
  REQUIRED_COMMAND_LOGS,
  REQUIRED_UI_SCREENSHOTS,
} from "./verify-evidence.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("bundle verification", () => {
  it("requires the exact normalized modal manifest keys and existing files", async () => {
    const dist = await mkdtemp(path.join(tmpdir(), "daynotes-bundle-"));
    temporaryDirectories.push(dist);
    await mkdir(path.join(dist, "assets"));
    await writeFile(path.join(dist, "assets/index.js"), "entry");
    const manifest = {
      "index.html": { isEntry: true, file: "assets/index.js", dynamicImports: ["other/ShareModal.tsx", "src/components/SettingsModal.tsx"] },
      "other/ShareModal.tsx": { file: "assets/share.js" },
      "src/components/SettingsModal.tsx": { file: "assets/settings.js" },
    };

    await expect(verifyBundleManifest(manifest, dist)).rejects.toThrow("src/components/ShareModal.tsx");
  });

  it("rejects a manifest asset whose file is absent", async () => {
    const dist = await mkdtemp(path.join(tmpdir(), "daynotes-bundle-"));
    temporaryDirectories.push(dist);
    await mkdir(path.join(dist, "assets"));
    await writeFile(path.join(dist, "assets/index.js"), "entry");
    const manifest = {
      "index.html": { isEntry: true, file: "assets/index.js", dynamicImports: ["src/components/ShareModal.tsx", "src/components/SettingsModal.tsx"] },
      "src/components/ShareModal.tsx": { file: "assets/share.js" },
      "src/components/SettingsModal.tsx": { file: "assets/settings.js" },
    };

    await expect(verifyBundleManifest(manifest, dist)).rejects.toThrow("assets/share.js");
  });
});

describe("complete UI browser error evidence", () => {
  it("records page errors in the evidence error format", () => {
    const page = new EventEmitter();
    const messages: string[] = [];
    attachBrowserErrorListeners(page, messages);

    page.emit("pageerror", new Error("bootstrap crashed"));
    expect(messages).toEqual(["[error] bootstrap crashed"]);
  });
});

describe("complete UI visual evidence", () => {
  it.each(REQUIRED_UI_SCREENSHOTS)("rejects evidence missing %s", async (missingPath) => {
    const outputDir = await mkdtemp(path.join(tmpdir(), "daynotes-evidence-"));
    temporaryDirectories.push(outputDir);
    for (const relativePath of REQUIRED_UI_SCREENSHOTS) {
      if (relativePath === missingPath) continue;
      const absolutePath = path.join(outputDir, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, "screenshot");
    }

    await expect(assertRequiredUiScreenshots(outputDir)).rejects.toThrow(missingPath);
  });

  it("defines semantic surface and focus tokens in both themes plus reduced motion", async () => {
    const css = await import("node:fs/promises").then(({ readFile }) => readFile(path.join(process.cwd(), "src/index.css"), "utf8"));
    const lightTheme = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    const darkTheme = css.match(/\[data-theme=["']dark["']\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

    for (const token of ["--surface-app", "--surface-paper", "--focus-ring"]) {
      expect(lightTheme).toContain(`${token}:`);
      expect(darkTheme).toContain(`${token}:`);
    }
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});

describe("complete verification command evidence", () => {
  it.each(REQUIRED_COMMAND_LOGS)("rejects a missing command log: %s", async ({ path: relativePath }) => {
    const outputDir = await mkdtemp(path.join(tmpdir(), "daynotes-command-logs-"));
    temporaryDirectories.push(outputDir);
    await mkdir(path.join(outputDir, "logs"), { recursive: true });
    for (const required of REQUIRED_COMMAND_LOGS) {
      if (required.path === relativePath) continue;
      await writeFile(path.join(outputDir, required.path), required.exampleSuccess);
    }

    await expect(assertRequiredCommandLogs(outputDir)).rejects.toThrow(relativePath);
  });

  it.each(REQUIRED_COMMAND_LOGS)("rejects a command log without its success markers: %s", async (invalidLog) => {
    const outputDir = await mkdtemp(path.join(tmpdir(), "daynotes-command-logs-"));
    temporaryDirectories.push(outputDir);
    await mkdir(path.join(outputDir, "logs"), { recursive: true });
    for (const required of REQUIRED_COMMAND_LOGS) {
      await writeFile(path.join(outputDir, required.path), required === invalidLog ? "command started" : required.exampleSuccess);
    }

    await expect(assertRequiredCommandLogs(outputDir)).rejects.toThrow(invalidLog.path);
  });

  it("requires backend PDF provenance and matching browser/backend page counts", () => {
    const valid = {
      pdf: Buffer.from("%PDF-real-backend-artifact"),
      pdfPageCount: 2,
      renderedPageCount: 2,
      layoutPageCount: 2,
      rustLog: "test export_pdf::tests::exports_the_browser_rendered_pages_as_a_real_pdf_artifact ... ok\ntest result: ok. 12 passed; 0 failed",
    };

    expect(() => assertBackendPdfEvidence(valid)).not.toThrow();
    expect(() => assertBackendPdfEvidence({ ...valid, rustLog: "test result: ok. 12 passed; 0 failed" })).toThrow(/backend PDF/i);
    expect(() => assertBackendPdfEvidence({ ...valid, pdfPageCount: 1 })).toThrow(/page count/i);
  });
});
