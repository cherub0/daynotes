import type { EmailSettings } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmailSettings(settings: EmailSettings): string[] {
  const errors: string[] = [];

  if (!settings.smtp_host.trim()) {
    errors.push("请输入 SMTP 服务器地址");
  }

  if (!Number.isInteger(settings.smtp_port) || settings.smtp_port < 1 || settings.smtp_port > 65535) {
    errors.push("SMTP 端口必须在 1 到 65535 之间");
  }

  if (!EMAIL_RE.test(settings.username.trim())) {
    errors.push("请输入有效的发件邮箱地址");
  }

  if (!EMAIL_RE.test(settings.recipient.trim())) {
    errors.push("请输入有效的收件邮箱地址");
  }

  if (!settings.password.trim()) {
    errors.push("请输入邮箱服务商生成的 SMTP 授权码");
  }

  return errors;
}
