// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
// @ts-expect-error Vitest runs in Node, but this frontend project does not install Node type declarations.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DateHeaderProps } from "./DateHeader";
import { DateHeader } from "./DateHeader";
import { Toast } from "./Toast";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const createProps = (overrides: Partial<DateHeaderProps> = {}): DateHeaderProps => ({
  currentDate: "2026-07-12",
  noteDates: new Set(),
  loadStatus: "ready",
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onToday: vi.fn(),
  onSelectDate: vi.fn(),
  onHistory: vi.fn(),
  onShare: vi.fn(),
  onSettings: vi.fn(),
  onSendEmail: vi.fn(),
  onRetryLoad: vi.fn(),
  ...overrides,
});

describe("DateHeader", () => {
  it("exposes named navigation and application actions", () => {
    render(<DateHeader {...createProps()} />);

    expect(screen.getByRole("button", { name: "前一天" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "后一天" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "选择日期" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "立即发送今日邮件" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "历史版本" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "分享" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "设置" })).toBeTruthy();
  });

  it("shows a retry action when loading fails", () => {
    const onRetryLoad = vi.fn();
    render(<DateHeader {...createProps({ loadStatus: "error", onRetryLoad })} />);

    expect(screen.getByText("加载笔记失败")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetryLoad).toHaveBeenCalledOnce();
  });

  it("shows a persistent loading state", () => {
    render(<DateHeader {...createProps({ loadStatus: "loading" })} />);

    expect(screen.getByText("正在加载笔记")).toBeTruthy();
  });

  it("keeps the today action named and compactable on narrow screens", () => {
    render(<DateHeader {...createProps()} />);

    const todayAction = screen.getByRole("button", { name: "回到今天" });
    expect(todayAction.classList.contains("date-today-action")).toBe(true);
    expect(todayAction.querySelector(".date-today-compact")?.textContent).toBe("今天");
  });

  it("reserves separate narrow-screen rows for navigation and status actions", () => {
    const appCss = readFileSync("src/App.css", "utf8");

    expect(appCss).toContain('grid-template-areas: "navigation navigation" "status tools"');
    expect(appCss).toMatch(/@media \(max-width: 719px\)[\s\S]*\.date-tools\s*{[^}]*position:\s*static/);
    expect(appCss).toMatch(/@media \(max-width: 719px\)[\s\S]*\.load-state\s*{[^}]*position:\s*static/);
  });

  it("restores focus to the calendar trigger after Escape", () => {
    render(<DateHeader {...createProps()} />);
    const trigger = screen.getByRole("button", { name: "选择日期" });

    fireEvent.click(trigger);
    expect(screen.getByRole("grid")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("grid")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("selects through the existing callback and restores trigger focus", () => {
    const onSelectDate = vi.fn();
    render(<DateHeader {...createProps({ onSelectDate })} />);
    const trigger = screen.getByRole("button", { name: "选择日期" });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("gridcell", { name: /2026-07-13/ }));

    expect(onSelectDate).toHaveBeenCalledWith("2026-07-13");
    expect(screen.queryByRole("grid")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("Toast", () => {
  it("uses a polite status for non-error messages", () => {
    render(<Toast message="设置已保存" tone="success" />);
    const toast = screen.getByRole("status");
    expect(toast.getAttribute("aria-live")).toBe("polite");
  });

  it("uses an alert for errors", () => {
    render(<Toast message="发送失败" tone="error" />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
