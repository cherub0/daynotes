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
