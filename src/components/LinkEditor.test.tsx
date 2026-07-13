// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeWebUrl } from "../lib/linkUtils";
import { LinkEditor } from "./LinkEditor";
import { EditorToolbar } from "./editor/EditorToolbar";

afterEach(cleanup);

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
  it("exposes toolbar groups and supports predictable command navigation", () => {
    const chain = new Proxy({}, { get: () => () => chain });
    const editor = {
      isActive: vi.fn(() => false),
      chain: () => chain,
      can: () => ({ chain: () => chain, undo: () => true, redo: () => true }),
      state: { selection: { from: 1, to: 1 } },
    } as unknown as Editor;

    render(<EditorToolbar editor={editor} saveStatus="saved" onRetrySave={vi.fn()} />);

    expect(screen.getByRole("toolbar", { name: "编辑工具栏" }).getAttribute("aria-orientation")).toBe("horizontal");
    expect(screen.getByRole("group", { name: "文字格式" })).not.toBeNull();
    expect(screen.getByRole("group", { name: "段落结构" })).not.toBeNull();
    expect(screen.getByRole("group", { name: "历史操作" })).not.toBeNull();

    const bold = screen.getByRole("button", { name: "加粗 (Ctrl+B)" });
    const italic = screen.getByRole("button", { name: "斜体 (Ctrl+I)" });
    bold.focus();
    fireEvent.keyDown(bold, { key: "ArrowRight" });
    expect(document.activeElement).toBe(italic);
    fireEvent.keyDown(italic, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(bold);
    fireEvent.keyDown(bold, { key: "End" });
    const redo = screen.getByRole("button", { name: "重做 (Ctrl+Y)" });
    expect(document.activeElement).toBe(redo);
    fireEvent.keyDown(redo, { key: "Home" });
    expect(document.activeElement).toBe(bold);
  });

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

  it("opens link choices from the insert menu and restores focus on Escape", () => {
    const chain = new Proxy({}, { get: () => () => chain });
    const editor = {
      isActive: vi.fn(() => false),
      chain: () => chain,
      can: () => ({ chain: () => chain, undo: () => true, redo: () => true }),
      state: { selection: { from: 1, to: 1 } },
    } as unknown as Editor;

    render(<EditorToolbar editor={editor} saveStatus="saved" onRetrySave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "插入内容" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "插入链接" }));

    expect(screen.getByRole("button", { name: "🌐 网页链接…" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "插入内容" }));
  });
});
