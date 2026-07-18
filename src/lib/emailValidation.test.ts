import { describe, expect, it } from "vitest";
import { validateEmailSettings } from "./emailValidation";
import type { EmailSettings } from "./types";

const passwordError = "请输入邮箱服务商生成的 SMTP 授权码";

const valid: EmailSettings = {
  smtp_host: "smtp.qq.com",
  smtp_port: 465,
  username: "sender@qq.com",
  password: "authorization-code",
  recipient: "receiver@example.com",
  send_time: "08:00",
  weekdays_only: true,
  enabled: false,
};

describe("validateEmailSettings", () => {
  it("accepts valid settings even when scheduled sending is disabled", () => {
    expect(validateEmailSettings(valid)).toEqual([]);
  });

  it("returns actionable Chinese validation messages", () => {
    expect(validateEmailSettings({ ...valid, smtp_host: "" })).toContain("请输入 SMTP 服务器地址");
    expect(validateEmailSettings({ ...valid, smtp_port: 0 })).toContain("SMTP 端口必须在 1 到 65535 之间");
    expect(validateEmailSettings({ ...valid, username: "bad" })).toContain("请输入有效的发件邮箱地址");
    expect(validateEmailSettings({ ...valid, recipient: "bad" })).toContain("请输入有效的收件邮箱地址");
    expect(validateEmailSettings({ ...valid, password: "" })).toContain(passwordError);
  });

  it("allows an empty password when a credential is already saved", () => {
    expect(validateEmailSettings({ ...valid, password: "", password_saved: true })).not.toContain(passwordError);
  });

  it("still requires a password when no saved credential exists", () => {
    expect(validateEmailSettings({ ...valid, password: "", password_saved: false })).toContain(passwordError);
  });
});
