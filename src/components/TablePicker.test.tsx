// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TablePicker } from "./TablePicker";

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
