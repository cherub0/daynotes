// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/react";
import { ImageInsertPopover } from "./ImageInsertPopover";

describe("ImageInsertPopover", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports a local image read failure", async () => {
    class FailingFileReader {
      result: string | ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() { this.onerror?.(); }
    }
    vi.stubGlobal("FileReader", FailingFileReader);
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const editor = { chain: vi.fn() } as unknown as Editor;
    const { container } = render(
      <ImageInsertPopover editor={editor} open={true} onOpenChange={vi.fn()} />,
    );

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["png"], "broken.png", { type: "image/png" })] },
    });

    await waitFor(() => expect(alert).toHaveBeenCalledWith("图片读取失败"));
    expect(screen.getByTitle("插入图片")).not.toBeNull();
  });
});
