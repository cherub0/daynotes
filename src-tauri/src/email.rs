use crate::{send_email_smtp, DbState};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EmailErrorKind {
    Authentication,
    Timeout,
    Tls,
    Connection,
    RecipientRejected,
    Unknown,
}

pub fn classify_smtp_error(message: &str) -> EmailErrorKind {
    let lower = message.to_lowercase();
    if lower.contains("authentication") || lower.contains("535") || lower.contains("auth") {
        EmailErrorKind::Authentication
    } else if lower.contains("timeout") || lower.contains("timed out") {
        EmailErrorKind::Timeout
    } else if lower.contains("certificate") || lower.contains("tls") || lower.contains("ssl") {
        EmailErrorKind::Tls
    } else if lower.contains("connection") || lower.contains("refused") || lower.contains("unreachable") {
        EmailErrorKind::Connection
    } else if lower.contains("recipient") || lower.contains("rejected") {
        EmailErrorKind::RecipientRejected
    } else {
        EmailErrorKind::Unknown
    }
}

pub fn safe_email_error(kind: EmailErrorKind, raw: &str, secret: &str) -> String {
    let sanitized = raw.replace(secret, "***");
    let hint = match kind {
        EmailErrorKind::Authentication => {
            "授权码或账号验证失败，请检查邮箱地址和 SMTP 授权码是否正确"
        }
        EmailErrorKind::Timeout => "连接 SMTP 服务器超时，请检查服务器地址和网络连接",
        EmailErrorKind::Tls => "SSL/TLS 安全连接失败，请检查端口号和加密设置",
        EmailErrorKind::Connection => "无法连接到 SMTP 服务器，请检查服务器地址和端口号",
        EmailErrorKind::RecipientRejected => "收件地址被服务器拒绝，请检查收件邮箱地址是否正确",
        EmailErrorKind::Unknown => "邮件发送失败，请检查所有设置是否正确",
    };
    format!("{hint}\n详细错误：{sanitized}")
}

pub fn compose_test_email(timestamp: &str) -> (String, String) {
    let subject = "【DayNotes】邮箱配置测试".to_string();
    let body = format!(
        "这是一封来自 DayNotes 的测试邮件。\n\n\
         如果您收到这封邮件，说明邮箱配置正确，定时推送功能可以正常使用。\n\n\
         发送时间：{}\n\n\
         —— DayNotes",
        timestamp
    );
    (subject, body)
}

/// Tauri command: send a test email using current settings to verify SMTP configuration.
#[tauri::command]
pub fn test_email_settings(state: tauri::State<DbState>) -> Result<String, String> {
    let email = {
        let db = state
            .db
            .lock()
            .map_err(|e| format!("数据库锁定失败：{e}"))?;
        crate::resolve_email_settings_for_send(&db, &crate::system_credential_store())
            .map_err(|e| format!("读取邮件设置失败：{e}"))?
    };

    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let (subject, body) = compose_test_email(&timestamp);

    send_email_smtp(&email, &subject, &body)
        .map(|_| format!("测试邮件已发送到 {}", email.recipient))
        .map_err(|raw_error| {
            let kind = classify_smtp_error(&raw_error);
            safe_email_error(kind, &raw_error, &email.password)
        })
}

#[cfg(test)]
mod tests {
    use super::{classify_smtp_error, compose_test_email, safe_email_error, EmailErrorKind};

    #[test]
    fn classifies_common_smtp_failures() {
        assert_eq!(classify_smtp_error("535 authentication failed"), EmailErrorKind::Authentication);
        assert_eq!(classify_smtp_error("operation timed out"), EmailErrorKind::Timeout);
        assert_eq!(classify_smtp_error("certificate verify failed"), EmailErrorKind::Tls);
        assert_eq!(classify_smtp_error("connection refused"), EmailErrorKind::Connection);
        assert_eq!(classify_smtp_error("recipient address rejected"), EmailErrorKind::RecipientRejected);
    }

    #[test]
    fn public_errors_never_include_authorization_codes() {
        let secret = "SECRET-DO-NOT-LEAK";
        let message = safe_email_error(EmailErrorKind::Authentication, &format!("535 {secret}"), secret);
        assert!(!message.contains(secret));
        assert!(message.contains("授权码"));
    }

    #[test]
    fn composes_a_dated_test_message() {
        let (subject, body) = compose_test_email("2026-07-11 12:00:00");
        assert_eq!(subject, "【DayNotes】邮箱配置测试");
        assert!(body.contains("2026-07-11 12:00:00"));
    }
}
