// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TablePicker } from "./TablePicker";
import { EditorToolbar } from "./editor/EditorToolbar";

afterEach(cleanup);

describe("TablePicker", () => {
  it("selects any size through 20 by 20", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <TablePicker maxRows={20} maxCols={20} onSelect={onSelect} onClose={onClose} />,
    );

    const cell = screen.getByRole("button", { name: "3 行 5 列" });
    fireEvent.mouseEnter(cell);
    expect(screen.getByText("3 行 × 5 列")).toBeTruthy();
    expect(container.querySelectorAll(".table-picker-cell.highlighted")).toHaveLength(15);
    fireEvent.click(cell);
    expect(onSelect).toHaveBeenCalledWith(3, 5);
    expect(screen.getByRole("button", { name: "20 行 20 列" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

function createEditor() {
  const run = vi.fn(() => true);
  const insertTable = vi.fn(() => ({ run }));
  const chain = new Proxy({ insertTable }, {
    get(target, property) {
      if (property in target) return target[property as keyof typeof target];
      return () => chain;
    },
  });
  const editor = {
    isActive: vi.fn((name: string) => name === "table"),
    chain: () => chain,
    can: () => ({ chain: () => chain, undo: () => true, redo: () => true }),
    state: { selection: { from: 1, to: 1 } },
  } as unknown as Editor;
  return { editor, insertTable };
}

describe("EditorToolbar table popover", () => {
  it("keeps the local image file input mounted after opening the system picker", () => {
    const { editor } = createEditor();
    const { container } = render(<EditorToolbar editor={editor} saveStatus="saved" onRetrySave={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "插入内容" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "插入图片" }));
    fireEvent.click(screen.getByRole("button", { name: "📁 本地文件…" }));

    expect(container.querySelector('input[type="file"]')).not.toBeNull();
  });

  it("inserts the selected table size with a header row", () => {
    const { editor, insertTable } = createEditor();
    render(<EditorToolbar editor={editor} saveStatus="saved" onRetrySave={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "插入内容" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "插入表格" }));
    fireEvent.click(screen.getByRole("button", { name: "3 行 5 列" }));

    expect(insertTable).toHaveBeenCalledWith({ rows: 3, cols: 5, withHeaderRow: true });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "插入内容" }));
  });

  it("closes the active popover on an outside click", () => {
    const { editor } = createEditor();
    render(<EditorToolbar editor={editor} saveStatus="saved" onRetrySave={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "插入内容" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "插入表格" }));
    expect(screen.getByRole("dialog", { name: "选择表格大小" })).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog", { name: "选择表格大小" })).toBeNull();
  });

  it("keeps every editor command reachable through accessible labels", () => {
    const { editor } = createEditor();
    render(<EditorToolbar editor={editor} saveStatus="saved" onRetrySave={vi.fn()} />);

    for (const label of [
      "加粗 (Ctrl+B)", "斜体 (Ctrl+I)", "下划线 (Ctrl+U)", "高亮",
      "删除线", "标题1", "标题2", "标题3", "无序列表", "有序列表", "任务列表", "引用",
      "插入分隔线", "撤销 (Ctrl+Z)", "重做 (Ctrl+Y)",
      "在上方插入行", "在下方插入行", "在左侧插入列", "在右侧插入列",
      "删除当前行", "删除当前列", "删除表格",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }

    fireEvent.click(screen.getByRole("button", { name: "插入内容" }));
    for (const label of ["插入分隔线", "插入图片", "插入表格"]) {
      expect(screen.getByRole("menuitem", { name: label })).toBeTruthy();
    }
    expect(screen.getByRole("menuitemcheckbox", { name: "删除线" })).toBeTruthy();
    expect(screen.getByRole("menuitemradio", { name: "标题2" })).toBeTruthy();
    expect(screen.getByRole("menuitemradio", { name: "标题3" })).toBeTruthy();
    expect(screen.getByRole("menuitemcheckbox", { name: "引用" })).toBeTruthy();
    expect(screen.getByRole("menuitemcheckbox", { name: "代码块" })).toBeTruthy();
    expect(screen.getByRole("menuitemcheckbox", { name: "插入链接" })).toBeTruthy();
  });

  it("announces active formatting in both toolbar buttons and compact menu items", () => {
    const { editor } = createEditor();
    editor.isActive = vi.fn((name: string, attributes?: { level?: number }) => (
      name === "bold" || name === "strike" || name === "codeBlock" || name === "link"
      || (name === "heading" && attributes?.level === 2)
    ));
    render(<EditorToolbar editor={editor} saveStatus="saved" onRetrySave={vi.fn()} />);

    expect(screen.getByRole("button", { name: "加粗 (Ctrl+B)" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "斜体 (Ctrl+I)" }).getAttribute("aria-pressed")).toBe("false");
    const trigger = screen.getByRole("button", { name: "插入内容" });
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-pressed")).toBeNull();
    expect(screen.getByRole("menuitemcheckbox", { name: "删除线" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitemradio", { name: "标题2" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitemradio", { name: "标题3" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("menuitemcheckbox", { name: "引用" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("menuitemcheckbox", { name: "代码块" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitemcheckbox", { name: "插入链接" }).getAttribute("aria-checked")).toBe("true");
  });

  it.each([
    ["代码块", "button", "JavaScript"],
    ["插入链接", "button", "🌐 网页链接…"],
    ["插入图片", "button", "📁 本地文件…"],
    ["插入表格", "button", "1 行 1 列"],
  ])("moves focus from %s to its secondary popover and restores the trigger with Escape", (actionName, role, firstControlName) => {
    const { editor } = createEditor();
    render(<EditorToolbar editor={editor} saveStatus="saved" onRetrySave={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "插入内容" });
    fireEvent.click(trigger);
    const action = screen.queryByRole("menuitemcheckbox", { name: actionName })
      ?? screen.getByRole("menuitem", { name: actionName });
    fireEvent.click(action);

    expect(screen.queryByRole("menu", { name: "插入内容" })).toBeNull();
    const firstControl = screen.getByRole(role, { name: firstControlName });
    expect(document.activeElement).toBe(firstControl);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
  });
});
