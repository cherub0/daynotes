// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../lib/types";
import { SettingsModal } from "./SettingsModal";

vi.mock("../lib/tauri", () => ({
  testEmailSettings: vi.fn(),
  getBackupStatus: vi.fn(async () => ({
    last_auto_backup_at: "2026-07-18 09:00:00",
    last_auto_backup_path: "D:\\backup\\auto-2026-07-18.db",
    last_error: null,
  })),
  createManualBackup: vi.fn(async () => "D:\\backup\\manual.db"),
  restoreDatabaseBackup: vi.fn(async () => undefined),
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

    expect(screen.getByRole("combobox", { name: "邮箱服务" })).not.toBeNull();
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

  it("shows data protection controls", async () => {
    render(<SettingsModal settings={settings} onSave={vi.fn()} onClose={() => undefined} />);

    expect(await screen.findByText("数据保护")).not.toBeNull();
    expect(screen.getByRole("button", { name: "立即备份" })).not.toBeNull();
    expect(screen.getByLabelText("备份文件路径")).not.toBeNull();
    expect(screen.getByRole("button", { name: "恢复整库" })).not.toBeNull();
  });
});
