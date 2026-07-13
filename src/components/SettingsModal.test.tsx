// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

describe("SettingsModal", () => {
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
