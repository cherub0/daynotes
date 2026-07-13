// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SaveStatus } from "../hooks/useNoteSession";
import { SaveStatusIndicator } from "./SaveStatus";

afterEach(cleanup);

describe("SaveStatusIndicator", () => {
  it.each([
    ["saved", "已保存"],
    ["dirty", "未保存"],
    ["saving", "正在保存"],
    ["error", "保存失败"],
  ] satisfies [SaveStatus, string][])('renders the "%s" label', (status, label) => {
    render(<SaveStatusIndicator status={status} onRetry={vi.fn()} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it.each(["saved", "dirty", "saving"] satisfies SaveStatus[])(
    "does not render a retry action for %s",
    (status) => {
      render(<SaveStatusIndicator status={status} onRetry={vi.fn()} />);
      expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
    },
  );

  it("renders a retry action for an error and invokes onRetry", () => {
    const onRetry = vi.fn();
    render(<SaveStatusIndicator status="error" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
