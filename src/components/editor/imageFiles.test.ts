// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_IMAGE_BYTES,
  readImageAsDataUrl,
  validateImageFile,
} from "./imageFiles";

describe("image files", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects non-image files", () => {
    const file = new File(["notes"], "notes.txt", { type: "text/plain" });

    expect(validateImageFile(file)).toBe("not-image");
  });

  it("rejects images larger than 10 MB", () => {
    const file = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.png", {
      type: "image/png",
    });

    expect(validateImageFile(file)).toBe("too-large");
  });

  it("accepts a normal PNG", () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "small.png", {
      type: "image/png",
    });

    expect(validateImageFile(file)).toBeNull();
  });

  it("resolves the FileReader string result", async () => {
    class SuccessfulFileReader {
      result: string | ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL() {
        this.result = "data:image/png;base64,cG5n";
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", SuccessfulFileReader);

    await expect(
      readImageAsDataUrl(new File(["png"], "image.png", { type: "image/png" })),
    ).resolves.toBe("data:image/png;base64,cG5n");
  });

  it("rejects with read-failed when FileReader errors", async () => {
    class FailingFileReader {
      result: string | ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL() {
        this.onerror?.();
      }
    }
    vi.stubGlobal("FileReader", FailingFileReader);

    await expect(
      readImageAsDataUrl(new File(["png"], "image.png", { type: "image/png" })),
    ).rejects.toThrow("read-failed");
  });
});
