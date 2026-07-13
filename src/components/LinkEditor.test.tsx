// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { describe, expect, it, vi } from "vitest";
import { normalizeWebUrl } from "../lib/linkUtils";
import { LinkEditor } from "./LinkEditor";

describe("normalizeWebUrl", () => {
  it("adds a protocol to ordinary web addresses", () => {
    expect(normalizeWebUrl("example.com")).toBe("https://example.com/");
    expect(normalizeWebUrl("https://example.com/a")).toBe("https://example.com/a");
  });

  it("rejects unsafe and non-web protocols", () => {
    expect(normalizeWebUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeWebUrl("data:text/html,hello")).toBeNull();
    expect(normalizeWebUrl("file:///C:/note.txt")).toBeNull();
  });
});

describe("LinkEditor", () => {
  it("applies a valid link to the selected text", () => {
    const run = vi.fn();
    const setLink = vi.fn(() => ({ run }));
    const setTextSelection = vi.fn(() => ({ setLink }));
    const focus = vi.fn(() => ({ setTextSelection }));
    const editor = {
      getAttributes: () => ({}),
      state: {
        doc: { textBetween: () => "DayNotes" },
      },
      chain: () => ({ focus }),
    } as unknown as Editor;
    const onClose = vi.fn();

    render(<LinkEditor editor={editor} initialRange={{ from: 1, to: 9 }} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText("https://example.com"), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确定" }));

    expect(setTextSelection).toHaveBeenCalledWith({ from: 1, to: 9 });
    expect(setLink).toHaveBeenCalledWith({ href: "https://example.com/" });
    expect(run).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
