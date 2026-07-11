import { useState } from "react";
import type { AppSettings, EmailSettings } from "../lib/types";
import { testEmailSettings } from "../lib/tauri";
import { validateEmailSettings } from "../lib/emailValidation";

interface SettingsModalProps {
  settings: AppSettings | null;
  onSave: (settings: AppSettings) => void;
  onClose: () => void;
}

const DEFAULT_EMAIL: EmailSettings = {
  smtp_host: "smtp.qq.com",
  smtp_port: 465,
  username: "",
  password: "",
  recipient: "",
  send_time: "08:00",
  weekdays_only: true,
  enabled: false,
};

const DEFAULT_SETTINGS: AppSettings = {
  email: DEFAULT_EMAIL,
  theme: "system",
  font_size: 14,
};

const SMTP_PRESETS: { label: string; host: string; port: number }[] = [
  { label: "QQ邮箱", host: "smtp.qq.com", port: 465 },
  { label: "163邮箱", host: "smtp.163.com", port: 465 },
  { label: "Gmail", host: "smtp.gmail.com", port: 587 },
  { label: "Outlook", host: "smtp.office365.com", port: 587 },
  { label: "自定义", host: "", port: 465 },
];

export function SettingsModal({ settings, onSave, onClose }: SettingsModalProps) {
  const [local, setLocal] = useState<AppSettings>(settings || DEFAULT_SETTINGS);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [testEmailStatus, setTestEmailStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [testEmailMessage, setTestEmailMessage] = useState("");

  function updateEmail(field: keyof EmailSettings, value: string | number | boolean) {
    setLocal({
      ...local,
      email: { ...local.email, [field]: value },
    });
  }

  function handlePresetChange(presetLabel: string) {
    const idx = SMTP_PRESETS.findIndex((p) => p.label === presetLabel);
    setSelectedPreset(idx >= 0 ? idx : 4);
    if (idx >= 0 && idx < 4) {
      const preset = SMTP_PRESETS[idx];
      setLocal({
        ...local,
        email: {
          ...local.email,
          smtp_host: preset.host,
          smtp_port: preset.port,
        },
      });
    }
  }

  function handleSave() {
    onSave(local);
  }

  async function handleTestEmail() {
    const errors = validateEmailSettings(local.email);
    if (errors.length > 0) {
      setTestEmailStatus("error");
      setTestEmailMessage(errors.join("；"));
      return;
    }
    setTestEmailStatus("sending");
    setTestEmailMessage("");
    try {
      const result = await testEmailSettings();
      setTestEmailStatus("success");
      setTestEmailMessage(result);
    } catch (error) {
      setTestEmailStatus("error");
      setTestEmailMessage(String(error));
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-backdrop" />
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>⚙ 设置</h2>

        {/* ── Email Settings ── */}
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, marginTop: 4, color: "var(--accent)" }}>
          📧 邮件设置
        </h3>

        <div className="form-group">
          <label>邮箱服务</label>
          <select
            value={SMTP_PRESETS[selectedPreset]?.label || "自定义"}
            onChange={(e) => handlePresetChange(e.target.value)}
          >
            {SMTP_PRESETS.map((p) => (
              <option key={p.label} value={p.label}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>SMTP 服务器</label>
            <input
              type="text"
              value={local.email.smtp_host}
              onChange={(e) => updateEmail("smtp_host", e.target.value)}
              placeholder="smtp.qq.com"
            />
          </div>
          <div className="form-group" style={{ maxWidth: 100 }}>
            <label>端口</label>
            <input
              type="number"
              value={local.email.smtp_port}
              onChange={(e) => updateEmail("smtp_port", parseInt(e.target.value) || 465)}
            />
          </div>
        </div>

        <div className="form-group">
          <label>发件邮箱</label>
          <input
            type="email"
            value={local.email.username}
            onChange={(e) => updateEmail("username", e.target.value)}
            placeholder="your@qq.com"
          />
        </div>

        <div className="form-group">
          <label>授权码（非邮箱密码，QQ邮箱需在设置中生成）</label>
          <input
            type="password"
            value={local.email.password}
            onChange={(e) => updateEmail("password", e.target.value)}
            placeholder="授权码"
          />
        </div>

        <div className="form-group">
          <label>收件邮箱</label>
          <input
            type="email"
            value={local.email.recipient}
            onChange={(e) => updateEmail("recipient", e.target.value)}
            placeholder="recipient@company.com"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>每日发送时间</label>
            <input
              type="time"
              value={local.email.send_time}
              onChange={(e) => updateEmail("send_time", e.target.value)}
            />
          </div>
        </div>

        <div className="form-check">
          <input
            type="checkbox"
            id="enabled"
            checked={local.email.enabled}
            onChange={(e) => updateEmail("enabled", e.target.checked)}
          />
          <label htmlFor="enabled" style={{ margin: 0 }}>启用每日邮件</label>
        </div>

        <div className="form-check">
          <input
            type="checkbox"
            id="weekdays"
            checked={local.email.weekdays_only}
            onChange={(e) => updateEmail("weekdays_only", e.target.checked)}
          />
          <label htmlFor="weekdays" style={{ margin: 0 }}>仅工作日发送（周一~周五）</label>
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            className="btn btn-secondary"
            onClick={handleTestEmail}
            disabled={testEmailStatus === "sending"}
          >
            {testEmailStatus === "sending" ? "发送中…" : "发送测试邮件"}
          </button>
          {testEmailMessage && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: testEmailStatus === "success" ? "var(--accent)" : "#d64545",
                whiteSpace: "pre-wrap",
              }}
            >
              {testEmailMessage}
            </div>
          )}
        </div>

        {/* ── Appearance ── */}
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, marginTop: 20, color: "var(--accent)" }}>
          🎨 外观
        </h3>

        <div className="form-group">
          <label>主题</label>
          <select
            value={local.theme}
            onChange={(e) => setLocal({ ...local, theme: e.target.value as "light" | "dark" | "system" })}
          >
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>

        <div className="form-group">
          <label>字号: {local.font_size}px</label>
          <input
            type="range"
            min={12}
            max={20}
            value={local.font_size}
            onChange={(e) => setLocal({ ...local, font_size: parseInt(e.target.value) })}
            style={{ width: "100%" }}
          />
        </div>

        {/* ── Actions ── */}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}>保存设置</button>
        </div>
      </div>
    </div>
  );
}
