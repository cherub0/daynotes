// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../lib/types";
import { SettingsModal } from "./SettingsModal";

vi.mock("../lib/tauri", () => ({
  testEmailSettings: vi.fn(),
}));

const settings: AppSettings = {
  email: {
    smtp_host: "smtp.qq.com",
    smtp_port: 465,
    username: "sender@qq.com",
    password: "authorization-code",
    recipient: "receiver@example.com",
    send_time: "08:00",
    weekdays_only: true,
    enabled: false,
  },
  theme: "system",
  font_size: 14,
};

afterEach(cleanup);

describe("SettingsModal", () => {
  it("associates configuration fields with their visible labels", () => {
    render(<SettingsModal settings={settings} onSave={vi.fn()} onClose={() => undefined} />);

    expect(screen.getByRole("textbox", { name: "SMTP 服务器" })).not.toBeNull();
    expect(screen.getByRole("spinbutton", { name: "端口" })).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "发件邮箱" })).not.toBeNull();
    expect(screen.getByLabelText(/授权码/)).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "收件邮箱" })).not.toBeNull();
    expect(screen.getByLabelText("每日发送时间")).not.toBeNull();
    expect(screen.getByRole("slider", { name: "字号: 14px" })).not.toBeNull();
  });

  it("uses dialog and radio semantics for theme selection", () => {
    const onSave = vi.fn();
    render(<SettingsModal settings={settings} onSave={onSave} onClose={() => undefined} />);

    const dialog = screen.getByRole("dialog", { name: "设置" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const darkTheme = screen.getByRole("radio", { name: "深色" });
    expect(darkTheme).not.toBeNull();

    fireEvent.click(darkTheme);
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    expect(onSave).toHaveBeenCalledWith({ ...settings, theme: "dark" });
  });
});
