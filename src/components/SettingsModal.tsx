import { useEffect, useState } from "react";
import type { AppSettings, BackupStatus, EmailSettings } from "../lib/types";
import {
  clearEmailPassword,
  createManualBackup,
  getBackupStatus,
  restoreDatabaseBackup,
  testEmailSettings,
} from "../lib/tauri";
import { validateEmailSettings } from "../lib/emailValidation";
import { Button } from "./ui/Button";
import { ModalShell } from "./ui/ModalShell";
import { SegmentedControl } from "./ui/SegmentedControl";
import { StatusBadge } from "./ui/StatusBadge";

interface SettingsModalProps {
  settings: AppSettings | null;
  onSave: (settings: AppSettings) => void;
  onClose: () => void;
  onDatabaseRestored?: () => void;
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

export function SettingsModal({ settings, onSave, onClose, onDatabaseRestored }: SettingsModalProps) {
  const [local, setLocal] = useState<AppSettings>(settings || DEFAULT_SETTINGS);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [testEmailStatus, setTestEmailStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [testEmailMessage, setTestEmailMessage] = useState("");
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [backupMessage, setBackupMessage] = useState("");
  const [restorePath, setRestorePath] = useState("");
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [credentialMessage, setCredentialMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getBackupStatus()
      .then((status) => {
        if (!cancelled) setBackupStatus(status);
      })
      .catch((error) => {
        if (!cancelled) setBackupMessage(`读取备份状态失败: ${String(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function handleClearEmailPassword() {
    setCredentialMessage("");
    try {
      const nextSettings = await clearEmailPassword();
      setLocal(nextSettings);
      setCredentialMessage("授权码已清除，请重新填写后保存");
    } catch (error) {
      setCredentialMessage(`清除授权码失败: ${String(error)}`);
    }
  }

  async function refreshBackupStatus() {
    const status = await getBackupStatus();
    setBackupStatus(status);
  }

  async function handleManualBackup() {
    setIsBackupBusy(true);
    setBackupMessage("");
    try {
      const path = await createManualBackup();
      setBackupMessage(`手动备份已创建：${path}`);
      await refreshBackupStatus();
    } catch (error) {
      setBackupMessage(`手动备份失败: ${String(error)}`);
    } finally {
      setIsBackupBusy(false);
    }
  }

  async function handleRestoreDatabase() {
    const path = restorePath.trim();
    if (!path) {
      setBackupMessage("请先填写备份文件路径");
      return;
    }
    if (!window.confirm("恢复整库会覆盖当前所有便签和设置，确认继续？")) return;
    setIsBackupBusy(true);
    setBackupMessage("");
    try {
      await restoreDatabaseBackup(path);
      setBackupMessage("数据库已恢复");
      onDatabaseRestored?.();
      await refreshBackupStatus();
    } catch (error) {
      setBackupMessage(`恢复整库失败: ${String(error)}`);
    } finally {
      setIsBackupBusy(false);
    }
  }

  return (
    <ModalShell
      title="设置"
      onClose={onClose}
      closeLabel="关闭设置"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={handleSave}>保存设置</Button>
        </>
      )}
    >
      <div className="settings-modal">

        {/* ── Email Settings ── */}
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, marginTop: 4, color: "var(--accent)" }}>
          📧 邮件设置
        </h3>

        <div className="form-group">
          <label htmlFor="settings-email-preset">邮箱服务</label>
          <select
            id="settings-email-preset"
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
            <label htmlFor="settings-smtp-host">SMTP 服务器</label>
            <input
              id="settings-smtp-host"
              type="text"
              value={local.email.smtp_host}
              onChange={(e) => updateEmail("smtp_host", e.target.value)}
              placeholder="smtp.qq.com"
            />
          </div>
          <div className="form-group" style={{ maxWidth: 100 }}>
            <label htmlFor="settings-smtp-port">端口</label>
            <input
              id="settings-smtp-port"
              type="number"
              value={local.email.smtp_port}
              onChange={(e) => updateEmail("smtp_port", parseInt(e.target.value) || 465)}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="settings-sender-email">发件邮箱</label>
          <input
            id="settings-sender-email"
            type="email"
            value={local.email.username}
            onChange={(e) => updateEmail("username", e.target.value)}
            placeholder="your@qq.com"
          />
        </div>

        <div className="form-group">
          <label htmlFor="settings-email-password">
            {local.email.password_saved
              ? "授权码已安全保存，留空保持不变"
              : "授权码（非邮箱密码，QQ邮箱需在设置中生成）"}
          </label>
          <input
            id="settings-email-password"
            type="password"
            value={local.email.password}
            onChange={(e) => updateEmail("password", e.target.value)}
            placeholder={local.email.password_saved ? "留空保持已保存授权码" : "授权码"}
          />
          {local.email.password_saved && (
            <div style={{ marginTop: 8 }}>
              <Button
                variant="secondary"
                onClick={() => { void handleClearEmailPassword(); }}
              >
                清除已保存授权码
              </Button>
            </div>
          )}
          {credentialMessage && (
            <div className="settings-test-status">
              <StatusBadge status={credentialMessage.includes("失败") ? "error" : "saved"}>
                {credentialMessage}
              </StatusBadge>
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="settings-recipient-email">收件邮箱</label>
          <input
            id="settings-recipient-email"
            type="email"
            value={local.email.recipient}
            onChange={(e) => updateEmail("recipient", e.target.value)}
            placeholder="recipient@company.com"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="settings-send-time">每日发送时间</label>
            <input
              id="settings-send-time"
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
          <Button
            variant="secondary"
            onClick={handleTestEmail}
            disabled={testEmailStatus === "sending"}
          >
            {testEmailStatus === "sending" ? "发送中…" : "发送测试邮件"}
          </Button>
          {testEmailStatus === "sending" && (
            <div className="settings-test-status"><StatusBadge status="saving">正在发送测试邮件…</StatusBadge></div>
          )}
          {testEmailMessage && testEmailStatus === "success" && (
            <div className="settings-test-status"><StatusBadge status="saved">{testEmailMessage}</StatusBadge></div>
          )}
          {testEmailMessage && testEmailStatus === "error" && (
            <div className="settings-test-status"><StatusBadge status="error">{testEmailMessage}</StatusBadge></div>
          )}
        </div>

        {/* ── Appearance ── */}
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, marginTop: 20, color: "var(--accent)" }}>
          🎨 外观
        </h3>

        <div className="form-group">
          <SegmentedControl
            label="主题"
            value={local.theme}
            options={[
              { value: "system", label: "跟随系统" },
              { value: "light", label: "浅色" },
              { value: "dark", label: "深色" },
            ]}
            onChange={(theme) => setLocal({ ...local, theme })}
          />
        </div>

        <div className="form-group">
          <label htmlFor="settings-font-size">字号: {local.font_size}px</label>
          <input
            id="settings-font-size"
            type="range"
            min={12}
            max={20}
            value={local.font_size}
            onChange={(e) => setLocal({ ...local, font_size: parseInt(e.target.value) })}
            style={{ width: "100%" }}
          />
        </div>

        {/* ── Data Protection ── */}
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, marginTop: 20, color: "var(--accent)" }}>
          数据保护
        </h3>

        <div className="form-group">
          <label>最近自动备份</label>
          <div className="settings-test-status">
            <StatusBadge status={backupStatus?.last_error ? "error" : "saved"}>
              {backupStatus?.last_error
                ? `备份失败：${backupStatus.last_error}`
                : backupStatus?.last_auto_backup_at
                  ? `${backupStatus.last_auto_backup_at}`
                  : "暂无自动备份记录"}
            </StatusBadge>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <Button
            variant="secondary"
            onClick={() => { void handleManualBackup(); }}
            disabled={isBackupBusy}
          >
            {isBackupBusy ? "处理中…" : "立即备份"}
          </Button>
        </div>

        <div className="form-group" style={{ marginTop: 12 }}>
          <label htmlFor="settings-restore-path">备份文件路径</label>
          <input
            id="settings-restore-path"
            type="text"
            value={restorePath}
            onChange={(event) => setRestorePath(event.target.value)}
            placeholder="D:\\...\backups\\auto-2026-07-18.db"
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <Button
            variant="danger"
            onClick={() => { void handleRestoreDatabase(); }}
            disabled={isBackupBusy}
          >
            恢复整库
          </Button>
          {backupMessage && (
            <div className="settings-test-status">
              <StatusBadge status={backupMessage.includes("失败") ? "error" : "saved"}>
                {backupMessage}
              </StatusBadge>
            </div>
          )}
        </div>

      </div>
    </ModalShell>
  );
}

export default SettingsModal;
