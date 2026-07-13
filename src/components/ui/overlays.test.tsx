// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MenuPopover } from "./MenuPopover";
import { ModalShell } from "./ModalShell";

describe("accessible overlays", () => {
  afterEach(cleanup);

  it("closes a menu with Escape and restores trigger focus", () => {
    render(<MenuPopover label="插入内容" triggerContent="＋"><button>插入图片</button></MenuPopover>);
    const trigger = screen.getByRole("button", { name: "插入内容" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "插入内容" })).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes a menu on an outside pointer event", () => {
    render(<><MenuPopover label="插入内容" triggerContent="＋"><button>插入图片</button></MenuPopover><button>外部</button></>);
    fireEvent.click(screen.getByRole("button", { name: "插入内容" }));
    fireEvent.mouseDown(screen.getByRole("button", { name: "外部" }));
    expect(screen.queryByRole("menu")).toBeNull();
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
    expect(screen.getByRole("dialog", { name: "设置" })).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
