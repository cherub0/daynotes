# SMTP Credential Secure Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move SMTP authorization codes out of SQLite and into OS credential storage while preserving existing mail workflows and adding clear UI state.

**Architecture:** Add a narrow Rust credential-store boundary, sanitize settings before persistence, resolve SMTP credentials only at send/test time, and expose a clear-password command. The frontend treats saved password state as metadata: loaded password fields are empty, `password_saved` drives validation and hints, and clearing credentials is explicit.

**Tech Stack:** Tauri 2, Rust 1.77.2+, rusqlite, keyring-compatible credential adapter, React 19, TypeScript, Vitest, cargo test.

## Global Constraints

- UI text must remain Simplified Chinese.
- Date format stays `"YYYY-MM-DD"` and is unrelated to this change.
- SQLite `settings.app_settings` must not persist SMTP authorization codes after this implementation.
- Backups must not carry SMTP authorization codes.
- Existing users with plaintext `email.password` must be migrated safely.
- Missing or failed credential operations must not leak the authorization code.
- Production Rust build must use the MSVC toolchain on Windows.

---

## File Structure

- Create `src-tauri/src/credentials.rs`: credential store trait, in-memory test store, production store wrapper, settings sanitization and migration helpers.
- Modify `src-tauri/src/lib.rs`: add `password_saved`, manage credential state, sanitize `get_settings`/`save_settings`, expose `clear_email_password`, resolve password before `send_email_for_date` and scheduler checks.
- Modify `src-tauri/src/email.rs`: resolve password before SMTP test, preserve redacted error behavior.
- Modify `src-tauri/Cargo.toml`: add the production credential dependency after the helper tests define the needed interface.
- Modify `src/lib/types.ts`: add `password_saved?: boolean`.
- Modify `src/lib/tauri.ts`: add `clearEmailPassword()`.
- Modify `src/lib/emailValidation.ts` and `src/lib/emailValidation.test.ts`: allow empty password when a saved credential exists.
- Modify `src/components/SettingsModal.tsx` and `src/components/SettingsModal.test.tsx`: add secure password hint, clear button, and local state update.

---

### Task 1: Backend credential-store boundary and sanitization helpers

**Files:**
- Create: `src-tauri/src/credentials.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `EmailCredentialStore` trait with `get_password() -> Result<Option<String>, String>`, `set_password(&str) -> Result<(), String>`, and `delete_password() -> Result<(), String>`.
- Produces: `MemoryEmailCredentialStore` for tests.
- Produces: `sanitize_settings_for_storage(settings: &mut AppSettings)`.
- Produces: `attach_password_saved_state(settings: &mut AppSettings, store: &dyn EmailCredentialStore) -> Result<(), String>`.
- Produces: `migrate_plaintext_password(settings: &mut AppSettings, store: &dyn EmailCredentialStore) -> Result<bool, String>`.
- Consumes: `AppSettings` and `EmailSettings` from `src-tauri/src/lib.rs`.

- [ ] **Step 1: Wire the module and add `password_saved` to the Rust data model**

In `src-tauri/src/lib.rs`, add the module:

```rust
mod credentials;
```

Add this field to `EmailSettings`:

```rust
    pub password: String,
    pub password_saved: bool,
```

Update `Default for EmailSettings`:

```rust
            password: "".to_string(),
            password_saved: false,
```

- [ ] **Step 2: Write failing Rust tests for sanitization and migration**

Create `src-tauri/src/credentials.rs` with the tests first:

```rust
use crate::AppSettings;
use std::cell::RefCell;

pub trait EmailCredentialStore {
    fn get_password(&self) -> Result<Option<String>, String>;
    fn set_password(&self, password: &str) -> Result<(), String>;
    fn delete_password(&self) -> Result<(), String>;
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

pub fn sanitize_settings_for_storage(_settings: &mut AppSettings) {
    unimplemented!("implemented after failing tests");
}

pub fn attach_password_saved_state(
    _settings: &mut AppSettings,
    _store: &dyn EmailCredentialStore,
) -> Result<(), String> {
    unimplemented!("implemented after failing tests");
}

pub fn migrate_plaintext_password(
    _settings: &mut AppSettings,
    _store: &dyn EmailCredentialStore,
) -> Result<bool, String> {
    unimplemented!("implemented after failing tests");
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
```

- [ ] **Step 3: Run the failing tests**

Run:

```powershell
cargo test credentials::tests --manifest-path src-tauri/Cargo.toml
```

Expected: FAIL because the helper functions are `unimplemented!()`.

- [ ] **Step 4: Implement the helpers minimally**

Replace the three helper bodies in `src-tauri/src/credentials.rs`:

```rust
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
```

- [ ] **Step 5: Run the tests and commit**

Run:

```powershell
cargo test credentials::tests --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

Commit:

```powershell
git add src-tauri/src/lib.rs src-tauri/src/credentials.rs
git commit -m "test: add smtp credential sanitization boundary"
```

---

### Task 2: Persist settings without plaintext and migrate legacy values

**Files:**
- Modify: `src-tauri/src/credentials.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `sanitize_settings_for_storage`, `attach_password_saved_state`, and `migrate_plaintext_password`.
- Produces: `load_app_settings(conn: &Connection, store: &dyn EmailCredentialStore) -> Result<AppSettings, String>`.
- Produces: `save_app_settings(conn: &Connection, settings: AppSettings, store: &dyn EmailCredentialStore) -> Result<AppSettings, String>`.
- Produces: `clear_email_password_from_store(conn: &Connection, store: &dyn EmailCredentialStore) -> Result<AppSettings, String>`.

- [ ] **Step 1: Write failing Rust tests around SQLite persistence**

Add tests to the existing `#[cfg(test)] mod tests` in `src-tauri/src/lib.rs`:

```rust
    #[test]
    fn save_app_settings_does_not_store_plaintext_email_password() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn);
        let store = credentials::MemoryEmailCredentialStore::default();
        let mut settings = AppSettings::default();
        settings.email.username = "sender@qq.com".to_string();
        settings.email.password = "new-code".to_string();

        let returned = save_app_settings(&conn, settings, &store).unwrap();

        let stored_json: String = conn
            .query_row("SELECT value FROM settings WHERE key = 'app_settings'", [], |row| row.get(0))
            .unwrap();
        assert!(!stored_json.contains("new-code"));
        assert_eq!(store.get_password().unwrap().as_deref(), Some("new-code"));
        assert_eq!(returned.email.password, "");
        assert!(returned.email.password_saved);
    }

    #[test]
    fn load_app_settings_migrates_legacy_plaintext_password() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn);
        conn.execute(
            "UPDATE settings SET value = ?1 WHERE key = 'app_settings'",
            [r#"{"email":{"username":"sender@qq.com","password":"legacy-code"}}"#],
        )
        .unwrap();
        let store = credentials::MemoryEmailCredentialStore::default();

        let settings = load_app_settings(&conn, &store).unwrap();

        let stored_json: String = conn
            .query_row("SELECT value FROM settings WHERE key = 'app_settings'", [], |row| row.get(0))
            .unwrap();
        assert!(!stored_json.contains("legacy-code"));
        assert_eq!(store.get_password().unwrap().as_deref(), Some("legacy-code"));
        assert_eq!(settings.email.password, "");
        assert!(settings.email.password_saved);
    }

    #[test]
    fn save_app_settings_with_empty_password_preserves_existing_credential() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn);
        let store = credentials::MemoryEmailCredentialStore::default();
        store.set_password("existing-code").unwrap();
        let mut settings = AppSettings::default();
        settings.email.username = "sender@qq.com".to_string();
        settings.email.password = "".to_string();

        let returned = save_app_settings(&conn, settings, &store).unwrap();

        assert_eq!(store.get_password().unwrap().as_deref(), Some("existing-code"));
        assert!(returned.email.password_saved);
    }

    #[test]
    fn clear_email_password_deletes_credential_and_returns_unsaved_state() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn);
        let store = credentials::MemoryEmailCredentialStore::default();
        store.set_password("existing-code").unwrap();

        let returned = clear_email_password_from_store(&conn, &store).unwrap();

        assert_eq!(store.get_password().unwrap(), None);
        assert!(!returned.email.password_saved);
        assert_eq!(returned.email.password, "");
    }
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
cargo test app_settings --manifest-path src-tauri/Cargo.toml
```

Expected: FAIL because `load_app_settings`, `save_app_settings`, and `clear_email_password_from_store` do not exist.

- [ ] **Step 3: Implement settings persistence helpers**

In `src-tauri/src/lib.rs`, import the trait and helpers:

```rust
use credentials::{
    attach_password_saved_state,
    migrate_plaintext_password,
    sanitize_settings_for_storage,
    EmailCredentialStore,
};
```

Add these helpers near `parse_app_settings`:

```rust
const APP_SETTINGS_KEY: &str = "app_settings";

fn read_app_settings_json(conn: &Connection) -> Result<String, String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![APP_SETTINGS_KEY],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|error| error.to_string())
    .map(|value| value.unwrap_or_else(|| "{}".to_string()))
}

fn write_app_settings_json(conn: &Connection, settings: &AppSettings) -> Result<(), String> {
    let value = serde_json::to_string(settings).map_err(|error| error.to_string())?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![APP_SETTINGS_KEY, value],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn load_app_settings(
    conn: &Connection,
    store: &dyn EmailCredentialStore,
) -> Result<AppSettings, String> {
    let value = read_app_settings_json(conn)?;
    let mut settings = parse_app_settings(&value);
    let migrated = migrate_plaintext_password(&mut settings, store)?;
    if migrated {
        let mut stored = settings.clone();
        sanitize_settings_for_storage(&mut stored);
        write_app_settings_json(conn, &stored)?;
    }
    attach_password_saved_state(&mut settings, store)?;
    Ok(settings)
}

fn save_app_settings(
    conn: &Connection,
    mut settings: AppSettings,
    store: &dyn EmailCredentialStore,
) -> Result<AppSettings, String> {
    let submitted_password = settings.email.password.trim().to_string();
    if !submitted_password.is_empty() {
        store.set_password(&submitted_password)?;
    }

    sanitize_settings_for_storage(&mut settings);
    write_app_settings_json(conn, &settings)?;
    attach_password_saved_state(&mut settings, store)?;
    Ok(settings)
}

fn clear_email_password_from_store(
    conn: &Connection,
    store: &dyn EmailCredentialStore,
) -> Result<AppSettings, String> {
    store.delete_password()?;
    let mut settings = load_app_settings(conn, store)?;
    settings.email.password.clear();
    settings.email.password_saved = false;
    Ok(settings)
}
```

- [ ] **Step 4: Run tests and commit**

Run:

```powershell
cargo test app_settings --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

Commit:

```powershell
git add src-tauri/src/lib.rs
git commit -m "feat: sanitize persisted email settings"
```

---

### Task 3: Production credential store, Tauri commands, and email resolution

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/credentials.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/email.rs`

**Interfaces:**
- Consumes: `EmailCredentialStore` and settings helpers from Tasks 1-2.
- Produces: `SystemEmailCredentialStore`.
- Produces: `resolve_email_settings_for_send(conn: &Connection, store: &dyn EmailCredentialStore) -> Result<EmailSettings, String>`.
- Produces Tauri command: `clear_email_password(state: tauri::State<DbState>) -> Result<AppSettings, String>`.

- [ ] **Step 1: Write failing tests for send-time resolution**

Add tests to `src-tauri/src/lib.rs` tests:

```rust
    #[test]
    fn resolve_email_settings_for_send_injects_stored_password() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn);
        let store = credentials::MemoryEmailCredentialStore::default();
        store.set_password("stored-code").unwrap();
        let mut settings = AppSettings::default();
        settings.email.enabled = true;
        settings.email.username = "sender@qq.com".to_string();
        settings.email.recipient = "receiver@example.com".to_string();
        save_app_settings(&conn, settings, &store).unwrap();

        let email = resolve_email_settings_for_send(&conn, &store).unwrap();

        assert_eq!(email.password, "stored-code");
        assert!(email.password_saved);
    }

    #[test]
    fn resolve_email_settings_for_send_reports_missing_password() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn);
        let store = credentials::MemoryEmailCredentialStore::default();
        let mut settings = AppSettings::default();
        settings.email.enabled = true;
        save_app_settings(&conn, settings, &store).unwrap();

        let error = resolve_email_settings_for_send(&conn, &store).unwrap_err();

        assert!(error.contains("未保存 SMTP 授权码"));
    }
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
cargo test resolve_email_settings --manifest-path src-tauri/Cargo.toml
```

Expected: FAIL because `resolve_email_settings_for_send` does not exist.

- [ ] **Step 3: Add the production credential dependency**

Run:

```powershell
cargo add keyring --manifest-path src-tauri/Cargo.toml
```

If `cargo add` is unavailable, add this dependency to `src-tauri/Cargo.toml`:

```toml
keyring = "3"
```

- [ ] **Step 4: Implement `SystemEmailCredentialStore`**

Add to `src-tauri/src/credentials.rs`:

```rust
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
```

- [ ] **Step 5: Implement send-time resolution and wire commands**

Add to `src-tauri/src/lib.rs` near settings helpers:

```rust
fn resolve_email_settings_for_send(
    conn: &Connection,
    store: &dyn EmailCredentialStore,
) -> Result<EmailSettings, String> {
    let settings = load_app_settings(conn, store)?;
    let mut email = settings.email;
    let password = store
        .get_password()?
        .ok_or_else(|| "未保存 SMTP 授权码，请在设置中重新填写".to_string())?;
    email.password = password;
    email.password_saved = true;
    Ok(email)
}

fn system_credential_store() -> credentials::SystemEmailCredentialStore {
    credentials::SystemEmailCredentialStore
}
```

Replace the `get_settings` command with:

```rust
#[tauri::command]
fn get_settings(state: tauri::State<DbState>) -> Result<AppSettings, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    load_app_settings(&db, &system_credential_store())
}
```

Replace the `save_settings` command with:

```rust
#[tauri::command]
fn save_settings(state: tauri::State<DbState>, settings: AppSettings) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    save_app_settings(&db, settings, &system_credential_store()).map(|_| ())
}
```

Add the clear command:

```rust
#[tauri::command]
fn clear_email_password(state: tauri::State<DbState>) -> Result<AppSettings, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    clear_email_password_from_store(&db, &system_credential_store())
}
```

Register it in `tauri::generate_handler!` immediately after `save_settings`:

```rust
            clear_email_password,
```

Update `send_email_for_date` so it loads `email` via `resolve_email_settings_for_send`:

```rust
    let email = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        resolve_email_settings_for_send(&db, &system_credential_store())?
    };
    if !email.enabled {
        return Err("Email sending is not enabled".to_string());
    }
```

Then pass `&email` to `send_email_smtp`.

Update scheduler checks so it reads settings with `load_app_settings(&db, &system_credential_store())`. It only needs `enabled`, `weekdays_only`, and `send_time`; it must not require a password until `send_email_for_date` actually sends.

In `src-tauri/src/email.rs`, replace direct `parse_app_settings` loading with:

```rust
        crate::resolve_email_settings_for_send(&db, &crate::system_credential_store())
```

Then use the returned `email` value for `send_email_smtp(&email, ...)` and redaction.

- [ ] **Step 6: Run tests and commit**

Run:

```powershell
cargo test resolve_email_settings --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

Commit:

```powershell
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/credentials.rs src-tauri/src/lib.rs src-tauri/src/email.rs
git commit -m "feat: store smtp authorization code securely"
```

---

### Task 4: Frontend types, IPC wrapper, and validation behavior

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/tauri.ts`
- Modify: `src/lib/emailValidation.ts`
- Modify: `src/lib/emailValidation.test.ts`

**Interfaces:**
- Produces: `EmailSettings.password_saved?: boolean`.
- Produces: `clearEmailPassword(): Promise<AppSettings>`.
- Updates: `validateEmailSettings(settings)` allows empty password when `password_saved === true`.

- [ ] **Step 1: Write failing frontend validation tests**

Add to `src/lib/emailValidation.test.ts`:

```ts
  it("allows an empty password when a credential is already saved", () => {
    expect(validateEmailSettings({ ...valid, password: "", password_saved: true })).not.toContain(
      "请输入邮箱服务商生成的 SMTP 授权码",
    );
  });

  it("still requires a password when no saved credential exists", () => {
    expect(validateEmailSettings({ ...valid, password: "", password_saved: false })).toContain(
      "请输入邮箱服务商生成的 SMTP 授权码",
    );
  });
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
npm test -- src/lib/emailValidation.test.ts
```

Expected: FAIL because `password_saved` is not typed and validation still rejects empty password.

- [ ] **Step 3: Implement type, wrapper, and validation changes**

In `src/lib/types.ts`, update `EmailSettings`:

```ts
  password: string;
  password_saved?: boolean;
```

In `src/lib/tauri.ts`, add after `saveSettings`:

```ts
export async function clearEmailPassword(): Promise<AppSettings> {
  return invoke("clear_email_password");
}
```

In `src/lib/emailValidation.ts`, replace password validation with:

```ts
  if (!settings.password.trim() && !settings.password_saved) {
    errors.push("请输入邮箱服务商生成的 SMTP 授权码");
  }
```

- [ ] **Step 4: Run tests and commit**

Run:

```powershell
npm test -- src/lib/emailValidation.test.ts
```

Expected: PASS.

Commit:

```powershell
git add src/lib/types.ts src/lib/tauri.ts src/lib/emailValidation.ts src/lib/emailValidation.test.ts
git commit -m "feat: support saved smtp credential state"
```

---

### Task 5: Settings modal secure credential UI

**Files:**
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/components/SettingsModal.test.tsx`

**Interfaces:**
- Consumes: `clearEmailPassword()` from `src/lib/tauri.ts`.
- Consumes: `EmailSettings.password_saved`.
- Produces UI hint and clear action in the settings modal.

- [ ] **Step 1: Write failing UI tests**

Update the mock in `src/components/SettingsModal.test.tsx`:

```ts
  clearEmailPassword: vi.fn(async () => ({
    ...settings,
    email: { ...settings.email, password: "", password_saved: false },
  })),
```

Add tests:

```ts
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
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

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
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
npm test -- src/components/SettingsModal.test.tsx
```

Expected: FAIL because the UI hint, mock import, and clear button do not exist.

- [ ] **Step 3: Implement the UI**

In `src/components/SettingsModal.tsx`, import `clearEmailPassword`:

```ts
  clearEmailPassword,
```

Add state:

```ts
  const [credentialMessage, setCredentialMessage] = useState("");
```

Add clear handler:

```ts
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
```

Replace the password form group with:

```tsx
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
```

- [ ] **Step 4: Run tests and commit**

Run:

```powershell
npm test -- src/components/SettingsModal.test.tsx
npm test -- src/lib/emailValidation.test.ts
```

Expected: PASS.

Commit:

```powershell
git add src/components/SettingsModal.tsx src/components/SettingsModal.test.tsx
git commit -m "feat: show secure smtp credential controls"
```

---

### Task 6: Full verification and branch publication

**Files:**
- Modify only if verification reveals issues in files touched above.

**Interfaces:**
- Consumes all previous tasks.
- Produces a verified, pushed branch.

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected:

- Vitest passes.
- TypeScript/Vite production build passes.
- Rust unit tests pass.

- [ ] **Step 2: Inspect persisted JSON behavior manually through tests or debug assertion**

Run:

```powershell
cargo test save_app_settings_does_not_store_plaintext_email_password --manifest-path src-tauri/Cargo.toml
```

Expected: PASS, confirming SQLite JSON does not contain the authorization code.

- [ ] **Step 3: Check git state**

Run:

```powershell
git status --short --branch
```

Expected: only the known user untracked files remain, or a clean tracked diff if verification required a small fix.

- [ ] **Step 4: Push branch**

Run:

```powershell
git push
```

Expected: branch updates on GitHub PR #5.
