// @vitest-environment node

import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyBundleManifest } from "./verify-bundle-size.mjs";
import { attachBrowserErrorListeners } from "./verify-browser-errors.mjs";

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
