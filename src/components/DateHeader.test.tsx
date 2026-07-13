// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DateHeaderProps } from "./DateHeader";
import { DateHeader } from "./DateHeader";
import { Toast } from "./Toast";

afterEach(cleanup);

const createProps = (overrides: Partial<DateHeaderProps> = {}): DateHeaderProps => ({
  currentDate: "2026-07-12",
  noteDates: new Set(),
  loadStatus: "ready",
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onToday: vi.fn(),
  onSelectDate: vi.fn(),
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
