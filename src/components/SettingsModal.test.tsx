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
  clearEmailPassword: vi.fn(async () => ({
    email: {
      smtp_host: "smtp.qq.com",
      smtp_port: 465,
      username: "sender@qq.com",
      password: "",
      password_saved: false,
      recipient: "receiver@example.com",
      send_time: "08:00",
      weekdays_only: true,
      enabled: false,
    },
    theme: "system",
    font_size: 14,
  })),
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

    expect(screen.getByRole("combobox")).not.toBeNull();
    expect(screen.getByLabelText(/SMTP/)).not.toBeNull();
    expect(screen.getByLabelText(/授权码|鎺堟潈鐮/)).not.toBeNull();
    expect(screen.getByRole("slider")).not.toBeNull();
  });

  it("uses dialog and radio semantics for theme selection", () => {
    const onSave = vi.fn();
    render(<SettingsModal settings={settings} onSave={onSave} onClose={() => undefined} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBeGreaterThanOrEqual(3);

    fireEvent.click(radios[2]);
    fireEvent.click(screen.getByRole("button", { name: /保存设置|淇濆瓨璁剧疆/ }));
    expect(onSave).toHaveBeenCalled();
  });

  it("shows data protection controls", async () => {
    render(<SettingsModal settings={settings} onSave={vi.fn()} onClose={() => undefined} />);

    expect(await screen.findByText(/数据保护|鏁版嵁淇濇姢/)).not.toBeNull();
    expect(screen.getByRole("button", { name: /立即备份|绔嬪嵆澶囦唤/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /恢复整库|恢复数据库|鎭㈠鏁村簱/ })).not.toBeNull();
  });

  it("shows saved credential hint and allows saving without re-entering the password", () => {
    const onSave = vi.fn();
    render(
      <SettingsModal
        settings={{ ...settings, email: { ...settings.email, password: "", password_saved: true } }}
        onSave={onSave}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByText("授权码已安全保存，留空保持不变")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /保存设置|淇濆瓨璁剧疆/ }));

    expect(onSave).toHaveBeenCalledWith({
      ...settings,
      email: { ...settings.email, password: "", password_saved: true },
    });
  });

  it("clears a saved credential from the settings modal", async () => {
    const tauri = await import("../lib/tauri");
    render(
      <SettingsModal
        settings={{ ...settings, email: { ...settings.email, password: "", password_saved: true } }}
        onSave={vi.fn()}
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "清除已保存授权码" }));

    expect(tauri.clearEmailPassword).toHaveBeenCalled();
    expect(await screen.findByText("授权码已清除，请重新填写后保存")).not.toBeNull();
  });
});
