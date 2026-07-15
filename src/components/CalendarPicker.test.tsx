// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
// @ts-expect-error Vitest runs in Node, but this frontend project does not install Node type declarations.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarPicker } from "./CalendarPicker";

afterEach(cleanup);

describe("CalendarPicker", () => {
  it("moves focus by day and week and selects with Enter", () => {
    const onSelect = vi.fn();
    render(
      <CalendarPicker
        currentDate="2026-07-13"
        noteDates={new Set(["2026-07-14"])}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );

    const selected = screen.getByRole("gridcell", { name: /2026-07-13/ });
    selected.focus();
    fireEvent.keyDown(selected, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("gridcell", { name: /2026-07-14/ }));

    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("gridcell", { name: /2026-07-21/ }));

    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("2026-07-21");
  });

  it("moves by month, clamps the day, and selects with Space", () => {
    const onSelect = vi.fn();
    render(
      <CalendarPicker
        currentDate="2026-01-31"
        noteDates={new Set()}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );

    const selected = screen.getByRole("gridcell", { name: /2026-01-31/ });
    selected.focus();
    fireEvent.keyDown(selected, { key: "PageDown" });

    expect(screen.getByText("2026年 2月")).toBeTruthy();
    const februaryEnd = screen.getByRole("gridcell", { name: /2026-02-28/ });
    expect(document.activeElement).toBe(februaryEnd);
    fireEvent.keyDown(februaryEnd, { key: " " });
    expect(onSelect).toHaveBeenCalledWith("2026-02-28");
  });

  it("keeps one roving tab stop and describes selected, today, and noted dates", () => {
    render(
      <CalendarPicker
        currentDate="2026-07-13"
        noteDates={new Set(["2026-07-13"])}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const cells = screen.getAllByRole("gridcell");
    expect(cells.filter((cell) => cell.getAttribute("tabindex") === "0")).toHaveLength(1);
    const selected = screen.getByRole("gridcell", { name: /2026-07-13.*已选择.*有笔记/ });
    expect(selected.getAttribute("aria-selected")).toBe("true");
    expect(selected.querySelector(".calendar-note-marker")).toBeTruthy();
  });

  it("closes with Escape from anywhere in the calendar overlay", () => {
    const onClose = vi.fn();
    render(
      <CalendarPicker
        currentDate="2026-07-13"
        noteDates={new Set()}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses stable non-color cues for hover and selection without obscuring keyboard focus", () => {
    const appCss = readFileSync("src/App.css", "utf8");

    expect(appCss).toMatch(/\.calendar-day:hover\s*{[^}]*box-shadow:\s*inset 0 0 0 1px var\(--border-strong\)/);
    expect(appCss).toMatch(/\.calendar-day\.selected\s*{[^}]*font-weight:\s*700[^}]*box-shadow:\s*inset 0 0 0 2px var\(--border-strong\)/);
    expect(appCss).toMatch(/\.calendar-day:focus-visible\s*{[^}]*outline:\s*3px solid var\(--focus-ring\)[^}]*outline-offset:\s*2px/);
  });

  it("accepts a contextual accessible label when reused outside the main date header", () => {
    render(
      <CalendarPicker
        currentDate="2026-07-13"
        noteDates={new Set()}
        label="选择分享开始日期"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("选择分享开始日期")).toBeTruthy();
  });
});
