// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
// @ts-expect-error Vitest runs in Node, but this frontend project does not install Node type declarations.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Button, IconButton } from "./Button";
import { SegmentedControl } from "./SegmentedControl";
import { StatusBadge } from "./StatusBadge";
import { Surface } from "./Surface";

describe("UI primitives", () => {
  it("requires a visible accessible name for icon buttons", () => {
    render(<IconButton label="打开设置">⚙</IconButton>);
    expect(screen.getByRole("button", { name: "打开设置" }).getAttribute("title")).toBe("打开设置");
  });

  it("renders semantic variants without changing button behavior", () => {
    const onClick = vi.fn();
    render(<Button variant="danger" onClick={onClick}>删除</Button>);
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "删除" }).classList.contains("ui-button--danger")).toBe(true);
  });

  it("preserves semantic primary and danger treatments on hover", () => {
    const uiCss = readFileSync("src/components/ui/ui.css", "utf8");
    const primaryHover = uiCss.match(/\.ui-button\.ui-button--primary:hover\s*\{([^}]*)\}/)?.[1];
    const dangerHover = uiCss.match(/\.ui-button\.ui-button--danger:hover\s*\{([^}]*)\}/)?.[1];

    expect(primaryHover).toBeDefined();
    expect(dangerHover).toBeDefined();
    expect(primaryHover).toContain("background: var(--accent-hover)");
    expect(dangerHover).toContain("background: var(--danger)");
    expect(dangerHover).toContain("border-color: var(--text-primary)");
  });

  it("renders paper surfaces and status text", () => {
    render(<Surface variant="paper"><StatusBadge status="saved">已保存</StatusBadge></Surface>);
    expect(screen.getByText("已保存").classList.contains("ui-status--saved")).toBe(true);
    expect(screen.getByText("已保存").parentElement?.classList.contains("ui-surface--paper")).toBe(true);
  });

  it("changes a segmented setting through native radio semantics", () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="主题" value="system" options={[
      { value: "system", label: "跟随系统" },
      { value: "light", label: "浅色" },
      { value: "dark", label: "深色" },
    ]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "深色" }));
    expect(onChange).toHaveBeenCalledWith("dark");
  });
});
