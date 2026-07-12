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
    isActive: vi.fn(() => false),
    chain: () => chain,
    can: () => ({ chain: () => chain, undo: () => true, redo: () => true }),
    state: { selection: { from: 1, to: 1 } },
  } as unknown as Editor;
  return { editor, insertTable };
}

describe("EditorToolbar table popover", () => {
  it("inserts the selected table size with a header row", () => {
    const { editor, insertTable } = createEditor();
    const { container } = render(<EditorToolbar editor={editor} />);

    fireEvent.click(container.querySelector('[data-toolbar-action="table"]')!);
    fireEvent.click(screen.getByRole("button", { name: "3 行 5 列" }));

    expect(insertTable).toHaveBeenCalledWith({ rows: 3, cols: 5, withHeaderRow: true });
  });

  it("closes the active popover on an outside click", () => {
    const { editor } = createEditor();
    const { container } = render(<EditorToolbar editor={editor} />);

    fireEvent.click(container.querySelector('[data-toolbar-action="table"]')!);
    expect(screen.getByRole("dialog", { name: "选择表格大小" })).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog", { name: "选择表格大小" })).toBeNull();
  });
});
