// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getFocusableElements } from "./focus";
import { MenuPopover } from "./MenuPopover";
import { ModalShell } from "./ModalShell";

describe("accessible overlays", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("closes a menu with Escape and restores trigger focus", () => {
    render(<MenuPopover label="插入内容" triggerContent="＋"><button>插入图片</button></MenuPopover>);
    const trigger = screen.getByRole("button", { name: "插入内容" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "插入内容" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "插入图片" })).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("focuses menu items and supports Arrow, Home, and End navigation", () => {
    render(
      <MenuPopover label="插入内容" triggerContent="＋">
        <button>插入图片</button>
        <button>插入分隔线</button>
        <button>插入代码块</button>
      </MenuPopover>,
    );
    fireEvent.click(screen.getByRole("button", { name: "插入内容" }));
    const items = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(document, { key: "End" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(document, { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("closes a menu on an outside pointer event and restores focus after its default action", () => {
    vi.useFakeTimers();
    render(<><MenuPopover label="插入内容" triggerContent="＋"><button>插入图片</button></MenuPopover><button>外部</button></>);
    const trigger = screen.getByRole("button", { name: "插入内容" });
    const outside = screen.getByRole("button", { name: "外部" });
    fireEvent.click(trigger);
    fireEvent.mouseDown(outside);
    outside.focus();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(outside);
    act(() => vi.runAllTimers());
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps popup-open styling separate from the explicit pressed state", () => {
    render(<MenuPopover label="插入内容" triggerContent="＋"><button>插入图片</button></MenuPopover>);
    const trigger = screen.getByRole("button", { name: "插入内容" });
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-pressed")).toBeNull();
    expect(trigger.classList.contains("is-active")).toBe(true);
  });

  it("traps Tab inside a modal and restores the opener", () => {
    function Fixture() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>打开设置</button>{open && <ModalShell title="设置" onClose={() => setOpen(false)} footer={<button>保存</button>}><input aria-label="邮箱" /></ModalShell>}</>;
    }
    render(<Fixture />);
    const opener = screen.getByRole("button", { name: "打开设置" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "设置" });
    const close = screen.getByRole("button", { name: "关闭" });
    const save = screen.getByRole("button", { name: "保存" });
    save.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(save);
    expect(dialog).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("focuses the dialog itself when no enabled focusable controls remain", () => {
    render(<ModalShell title="空弹窗" onClose={() => undefined}><p>没有操作</p></ModalShell>);
    const dialog = screen.getByRole("dialog", { name: "空弹窗" });
    screen.getByRole("button", { name: "关闭" }).setAttribute("disabled", "");
    dialog.focus();
    const allowed = fireEvent.keyDown(document, { key: "Tab" });
    expect(allowed).toBe(false);
    expect(document.activeElement).toBe(dialog);
  });

  it("excludes focusable controls hidden by ancestors or CSS", () => {
    const { container } = render(
      <div data-testid="focus-scope">
        <div hidden><button>祖先隐藏</button></div>
        <div style={{ display: "none" }}><button>CSS隐藏</button></div>
        <div style={{ visibility: "hidden" }}><button>不可见</button></div>
        <button>可见</button>
      </div>,
    );
    const scope = container.querySelector<HTMLElement>("[data-testid='focus-scope']");
    expect(scope && getFocusableElements(scope).map((element) => element.textContent)).toEqual(["可见"]);
  });
});
