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
  it("navigates only visible toolbar commands without taking menu, input or modifier keys", () => {
    const chain = new Proxy({}, { get: () => () => chain });
    const editor = {
      isActive: vi.fn(() => false),
      chain: () => chain,
      can: () => ({ chain: () => chain, undo: () => true, redo: () => true }),
      state: { selection: { from: 1, to: 1 } },
    } as unknown as Editor;

    render(<EditorToolbar editor={editor} saveStatus="saved" onRetrySave={vi.fn()} />);

    const toolbar = screen.getByRole("toolbar", { name: "编辑工具栏" });
    expect(toolbar.getAttribute("aria-orientation")).toBe("horizontal");
    expect(screen.getByRole("group", { name: "文字格式" })).not.toBeNull();
    expect(screen.getByRole("group", { name: "段落结构" })).not.toBeNull();
    expect(screen.getByRole("group", { name: "历史操作" })).not.toBeNull();

    toolbar.querySelectorAll<HTMLElement>(".toolbar-wide-action").forEach((action) => {
      action.style.display = "none";
    });

    const bold = screen.getByRole("button", { name: "加粗 (Ctrl+B)" });
    const highlight = screen.getByRole("button", { name: "高亮" });
    const headingOne = screen.getByRole("button", { name: "标题1" });
    highlight.focus();
    fireEvent.keyDown(highlight, { key: "ArrowRight" });
    expect(document.activeElement).toBe(headingOne);
    fireEvent.keyDown(headingOne, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(highlight);
    fireEvent.keyDown(highlight, { key: "ArrowRight", ctrlKey: true });
    expect(document.activeElement).toBe(highlight);
    fireEvent.keyDown(highlight, { key: "End" });
    const redo = screen.getByRole("button", { name: "重做 (Ctrl+Y)" });
    expect(document.activeElement).toBe(redo);
    fireEvent.keyDown(redo, { key: "Home" });
    expect(document.activeElement).toBe(bold);

    const input = document.createElement("input");
    toolbar.append(input);
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(document.activeElement).toBe(input);

    const insertMenu = screen.getByRole("button", { name: "插入内容" });
    insertMenu.focus();
    fireEvent.keyDown(insertMenu, { key: "ArrowDown" });
    expect(screen.getByRole("menu", { name: "插入内容" })).not.toBeNull();
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
