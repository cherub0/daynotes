use crate::AppSettings;
#[cfg(test)]
use std::cell::RefCell;

pub trait EmailCredentialStore {
    fn get_password(&self) -> Result<Option<String>, String>;
    fn set_password(&self, password: &str) -> Result<(), String>;
    fn delete_password(&self) -> Result<(), String>;
}

const SMTP_CREDENTIAL_SERVICE: &str = "com.daynotes.app.smtp";
const SMTP_CREDENTIAL_ACCOUNT: &str = "smtp_password";

#[derive(Debug, Default, Clone, Copy)]
pub struct SystemEmailCredentialStore;

impl SystemEmailCredentialStore {
    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new(SMTP_CREDENTIAL_SERVICE, SMTP_CREDENTIAL_ACCOUNT)
            .map_err(|error| format!("无法访问系统凭据存储：{error}"))
    }
}

impl EmailCredentialStore for SystemEmailCredentialStore {
    fn get_password(&self) -> Result<Option<String>, String> {
        match self.entry()?.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(format!("读取 SMTP 授权码失败：{error}")),
        }
    }

    fn set_password(&self, password: &str) -> Result<(), String> {
        self.entry()?
            .set_password(password)
            .map_err(|error| format!("保存 SMTP 授权码失败：{error}"))
    }

    fn delete_password(&self) -> Result<(), String> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(format!("清除 SMTP 授权码失败：{error}")),
        }
    }
}

#[cfg(test)]
#[derive(Default)]
pub struct MemoryEmailCredentialStore {
    password: RefCell<Option<String>>,
}

#[cfg(test)]
impl EmailCredentialStore for MemoryEmailCredentialStore {
    fn get_password(&self) -> Result<Option<String>, String> {
        Ok(self.password.borrow().clone())
    }

    fn set_password(&self, password: &str) -> Result<(), String> {
        *self.password.borrow_mut() = Some(password.to_string());
        Ok(())
    }

    fn delete_password(&self) -> Result<(), String> {
        *self.password.borrow_mut() = None;
        Ok(())
    }
}

pub fn sanitize_settings_for_storage(settings: &mut AppSettings) {
    settings.email.password.clear();
    settings.email.password_saved = false;
}

pub fn attach_password_saved_state(
    settings: &mut AppSettings,
    store: &dyn EmailCredentialStore,
) -> Result<(), String> {
    settings.email.password.clear();
    settings.email.password_saved = store.get_password()?.is_some();
    Ok(())
}

pub fn migrate_plaintext_password(
    settings: &mut AppSettings,
    store: &dyn EmailCredentialStore,
) -> Result<bool, String> {
    let plaintext = settings.email.password.trim().to_string();
    if plaintext.is_empty() {
        attach_password_saved_state(settings, store)?;
        return Ok(false);
    }

    store.set_password(&plaintext)?;
    settings.email.password.clear();
    settings.email.password_saved = true;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_settings_for_storage_removes_password_and_saved_marker() {
        let mut settings = AppSettings::default();
        settings.email.password = "secret-code".to_string();
        settings.email.password_saved = true;

        sanitize_settings_for_storage(&mut settings);

        assert_eq!(settings.email.password, "");
        assert!(!settings.email.password_saved);
    }

    #[test]
    fn attach_password_saved_state_reflects_store_presence() {
        let mut settings = AppSettings::default();
        let store = MemoryEmailCredentialStore::default();
        store.set_password("stored-code").unwrap();

        attach_password_saved_state(&mut settings, &store).unwrap();

        assert_eq!(settings.email.password, "");
        assert!(settings.email.password_saved);
    }

    #[test]
    fn migrate_plaintext_password_moves_secret_to_store_and_clears_response() {
        let mut settings = AppSettings::default();
        settings.email.password = "legacy-code".to_string();
        let store = MemoryEmailCredentialStore::default();

        let changed = migrate_plaintext_password(&mut settings, &store).unwrap();

        assert!(changed);
        assert_eq!(store.get_password().unwrap().as_deref(), Some("legacy-code"));
        assert_eq!(settings.email.password, "");
        assert!(settings.email.password_saved);
    }

    #[test]
    fn migrate_without_plaintext_keeps_existing_store_state() {
        let mut settings = AppSettings::default();
        let store = MemoryEmailCredentialStore::default();

        let changed = migrate_plaintext_password(&mut settings, &store).unwrap();

        assert!(!changed);
        assert_eq!(settings.email.password, "");
        assert!(!settings.email.password_saved);
    }
}
