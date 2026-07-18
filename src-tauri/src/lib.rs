mod export_zip;
mod export_pdf;
mod window_lifecycle;
mod email;

use rusqlite::{params, Connection, DatabaseName, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

// ── Data Structures ──────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Note {
    pub date: String,       // "YYYY-MM-DD"
    pub content: String,    // HTML content
    pub todos: String,      // JSON array of TodoItem
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NoteRevision {
    pub id: i64,
    pub note_date: String,
    pub content: String,
    pub todos: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TodoItem {
    pub id: String,
    pub text: String,
    pub done: bool,
    pub date: Option<String>,  // "YYYY-MM-DD"
    pub time: Option<String>,  // "HH:MM"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct EmailSettings {
    pub smtp_host: String,
    pub smtp_port: u16,
    pub username: String,
    pub password: String,       // encrypted in storage
    pub recipient: String,
    pub send_time: String,      // "HH:MM"
    pub weekdays_only: bool,
    pub enabled: bool,
}

impl Default for EmailSettings {
    fn default() -> Self {
        Self {
            smtp_host: "smtp.qq.com".to_string(),
            smtp_port: 465,
            username: "".to_string(),
            password: "".to_string(),
            recipient: "".to_string(),
            send_time: "08:00".to_string(),
            weekdays_only: true,
            enabled: false,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct AppSettings {
    pub email: EmailSettings,
    pub theme: String,          // "light" | "dark" | "system"
    pub font_size: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            email: EmailSettings::default(),
            theme: "system".to_string(),
            font_size: 14,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NoteDatesResponse {
    pub dates: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupStatus {
    pub last_auto_backup_at: Option<String>,
    pub last_auto_backup_path: Option<String>,
    pub last_error: Option<String>,
}

// ── Database State ───────────────────────────────────────────────

pub struct DbState {
    pub db: Mutex<Connection>,
}

const BACKUP_STATUS_KEY: &str = "backup_status";

fn get_db_path(app_data_dir: &PathBuf) -> PathBuf {
    fs::create_dir_all(app_data_dir).ok();
    app_data_dir.join("daynotes.db")
}

fn get_backup_dir(app_data_dir: &Path) -> PathBuf {
    let dir = app_data_dir.join("backups");
    fs::create_dir_all(&dir).ok();
    dir
}

fn init_db(conn: &Connection) {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS notes (
            date TEXT PRIMARY KEY,
            content TEXT NOT NULL DEFAULT '',
            todos TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS note_revisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_date TEXT NOT NULL,
            content TEXT NOT NULL,
            todos TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_note_revisions_note_date_created_at
        ON note_revisions(note_date, created_at DESC, id DESC);
        INSERT OR IGNORE INTO settings (key, value) VALUES ('app_settings', '{}');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('last_sent_date', '');",
    )
    .expect("Failed to initialize database");
}

pub(crate) fn parse_app_settings(value: &str) -> AppSettings {
    serde_json::from_str::<AppSettings>(value).unwrap_or_default()
}

// ── Email Helper ─────────────────────────────────────────────────

fn send_email_for_date(state: &DbState, date: &str) -> Result<String, String> {
    let settings = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT value FROM settings WHERE key = 'app_settings'")
            .map_err(|e| e.to_string())?;
        let value: String = stmt
            .query_row([], |row| row.get(0))
            .unwrap_or_else(|_| "{}".to_string());
        parse_app_settings(&value)
    };

    let email = &settings.email;
    if !email.enabled {
        return Err("Email sending is not enabled".to_string());
    }

    let note = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT date, content, todos, created_at, updated_at FROM notes WHERE date = ?1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query_map(params![date], |row| {
                Ok(Note {
                    date: row.get(0)?,
                    content: row.get(1)?,
                    todos: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(n)) => n,
            _ => return Err(format!("No note for {}", date)),
        }
    };

    let todos: Vec<TodoItem> = serde_json::from_str(&note.todos).unwrap_or_default();
    let done_count = todos.iter().filter(|t| t.done).count();
    let total = todos.len();

    let todo_text: String = todos
        .iter()
        .map(|t| {
            let mark = if t.done { "☑" } else { "☐" };
            let schedule = [t.date.as_deref(), t.time.as_deref()]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(" ");
            let suffix = if schedule.is_empty() {
                String::new()
            } else {
                format!("（截止：{}）", schedule)
            };
            format!("{} {}{}", mark, t.text, suffix)
        })
        .collect::<Vec<_>>()
        .join("\n");

    let plain_content = strip_html_tags(&note.content);
    let summary: String = plain_content.chars().take(200).collect();

    let subject = format!("【DayNotes】{} 今日任务", date);
    let body = format!(
        "📋 今日待办 ({}/{})\n\
         {}\n\
         \n\
         📝 笔记摘要\n\
         {}\n\
         \n\
         ---\n\
         由 DayNotes 自动发送",
        done_count,
        total,
        if total > 0 { todo_text } else { "无待办事项".to_string() },
        if summary.is_empty() { "无笔记内容".to_string() } else { summary }
    );

    send_email_smtp(email, &subject, &body)?;

    Ok(format!("Email sent to {}", email.recipient))
}

// ── Tauri Commands ───────────────────────────────────────────────

#[tauri::command]
fn save_note(state: tauri::State<DbState>, date: String, content: String, todos: String) -> Result<(), String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    save_note_with_revision(&mut db, &date, &content, &todos)
}

#[tauri::command]
fn get_note(state: tauri::State<DbState>, date: String) -> Result<Option<Note>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    get_note_from_conn(&db, &date)
}

fn parse_iso_date(value: &str) -> Result<chrono::NaiveDate, String> {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| format!("无效日期：{value}"))
}

fn get_note_from_conn(conn: &Connection, date: &str) -> Result<Option<Note>, String> {
    parse_iso_date(date)?;
    conn.query_row(
        "SELECT date, content, todos, created_at, updated_at FROM notes WHERE date = ?1",
        params![date],
        |row| {
            Ok(Note {
                date: row.get(0)?,
                content: row.get(1)?,
                todos: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )
    .optional()
    .map_err(|error| error.to_string())
}

fn query_notes_in_range(
    conn: &Connection,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<Note>, String> {
    let start = parse_iso_date(start_date)?;
    let end = parse_iso_date(end_date)?;
    if start > end {
        return Err("开始日期不能晚于结束日期".to_string());
    }

    let mut stmt = conn
        .prepare(
            "SELECT date, content, todos, created_at, updated_at
             FROM notes
             WHERE date BETWEEN ?1 AND ?2
             ORDER BY date ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![start_date, end_date], |row| {
            Ok(Note {
                date: row.get(0)?,
                content: row.get(1)?,
                todos: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn query_note_revisions(conn: &Connection, date: &str) -> Result<Vec<NoteRevision>, String> {
    parse_iso_date(date)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, note_date, content, todos, created_at
             FROM note_revisions
             WHERE note_date = ?1
             ORDER BY created_at DESC, id DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![date], |row| {
            Ok(NoteRevision {
                id: row.get(0)?,
                note_date: row.get(1)?,
                content: row.get(2)?,
                todos: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn save_note_with_revision(
    conn: &mut Connection,
    date: &str,
    content: &str,
    todos: &str,
) -> Result<(), String> {
    parse_iso_date(date)?;
    serde_json::from_str::<Vec<TodoItem>>(todos)
        .map_err(|error| format!("无效待办数据：{error}"))?;

    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let existing = tx
        .query_row(
            "SELECT content, todos FROM notes WHERE date = ?1",
            params![date],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    if let Some((old_content, old_todos)) = existing {
        if old_content != content || old_todos != todos {
            tx.execute(
                "INSERT INTO note_revisions (note_date, content, todos) VALUES (?1, ?2, ?3)",
                params![date, old_content, old_todos],
            )
            .map_err(|error| error.to_string())?;
            tx.execute(
                "DELETE FROM note_revisions
                 WHERE note_date = ?1
                 AND id NOT IN (
                   SELECT id FROM note_revisions
                   WHERE note_date = ?1
                   ORDER BY created_at DESC, id DESC
                   LIMIT 10
                 )",
                params![date],
            )
            .map_err(|error| error.to_string())?;
        }
    }

    tx.execute(
        "INSERT INTO notes (date, content, todos, updated_at)
         VALUES (?1, ?2, ?3, datetime('now', 'localtime'))
         ON CONFLICT(date) DO UPDATE SET
           content = excluded.content,
           todos = excluded.todos,
           updated_at = datetime('now', 'localtime')",
        params![date, content, todos],
    )
    .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())
}

fn now_local_string() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn backup_file_name(label: &str) -> String {
    let stamp = chrono::Local::now().format("%Y-%m-%d-%H%M%S").to_string();
    format!("{label}-{stamp}.db")
}

fn read_backup_status(conn: &Connection) -> Result<BackupStatus, String> {
    let value = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![BACKUP_STATUS_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .unwrap_or_else(|| "{}".to_string());

    serde_json::from_str::<BackupStatus>(&value).or(Ok(BackupStatus {
        last_auto_backup_at: None,
        last_auto_backup_path: None,
        last_error: None,
    }))
}

fn write_backup_status(conn: &Connection, status: &BackupStatus) -> Result<(), String> {
    let value = serde_json::to_string(status).map_err(|error| error.to_string())?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![BACKUP_STATUS_KEY, value],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn validate_backup_file(path: &Path) -> Result<(), String> {
    let conn = Connection::open(path).map_err(|error| format!("无法打开备份：{error}"))?;
    let result: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|error| format!("备份校验失败：{error}"))?;
    if result == "ok" {
        Ok(())
    } else {
        Err(format!("备份文件已损坏：{result}"))
    }
}

fn create_database_backup(conn: &Connection, backup_dir: &Path, label: &str) -> Result<PathBuf, String> {
    fs::create_dir_all(backup_dir).map_err(|error| error.to_string())?;
    let path = backup_dir.join(backup_file_name(label));
    conn.backup(DatabaseName::Main, &path, None)
        .map_err(|error| format!("创建备份失败：{error}"))?;
    validate_backup_file(&path)?;
    Ok(path)
}

fn restore_database_from_backup(conn: &mut Connection, backup_path: &Path) -> Result<(), String> {
    validate_backup_file(backup_path)?;
    conn.restore(
        DatabaseName::Main,
        backup_path,
        None::<fn(rusqlite::backup::Progress)>,
    )
    .map_err(|error| format!("恢复备份失败：{error}"))?;
    Ok(())
}

fn prune_auto_backups(backup_dir: &Path, keep: usize) -> Result<(), String> {
    let mut files = fs::read_dir(backup_dir)
        .map_err(|error| error.to_string())?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_name().to_string_lossy().starts_with("auto-"))
        .collect::<Vec<_>>();
    files.sort_by_key(|entry| entry.file_name());
    while files.len() > keep {
        let entry = files.remove(0);
        fs::remove_file(entry.path()).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn ensure_daily_backup(conn: &Connection, app_data_dir: &Path) -> Result<(), String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let status = read_backup_status(conn)?;
    if status
        .last_auto_backup_at
        .as_deref()
        .is_some_and(|value| value.starts_with(&today))
    {
        return Ok(());
    }

    let backup_dir = get_backup_dir(app_data_dir);
    match create_database_backup(conn, &backup_dir, "auto") {
        Ok(path) => {
            prune_auto_backups(&backup_dir, 7)?;
            write_backup_status(
                conn,
                &BackupStatus {
                    last_auto_backup_at: Some(now_local_string()),
                    last_auto_backup_path: Some(path.to_string_lossy().to_string()),
                    last_error: None,
                },
            )
        }
        Err(error) => {
            let _ = write_backup_status(
                conn,
                &BackupStatus {
                    last_auto_backup_at: status.last_auto_backup_at,
                    last_auto_backup_path: status.last_auto_backup_path,
                    last_error: Some(error.clone()),
                },
            );
            Err(error)
        }
    }
}

#[tauri::command]
fn get_notes_in_range(
    state: tauri::State<DbState>,
    start_date: String,
    end_date: String,
) -> Result<Vec<Note>, String> {
    let db = state.db.lock().map_err(|error| error.to_string())?;
    query_notes_in_range(&db, &start_date, &end_date)
}

#[tauri::command]
fn get_note_revisions(state: tauri::State<DbState>, date: String) -> Result<Vec<NoteRevision>, String> {
    let db = state.db.lock().map_err(|error| error.to_string())?;
    query_note_revisions(&db, &date)
}

#[tauri::command]
fn restore_note_revision(state: tauri::State<DbState>, revision_id: i64) -> Result<Note, String> {
    let mut db = state.db.lock().map_err(|error| error.to_string())?;
    let revision = db
        .query_row(
            "SELECT id, note_date, content, todos, created_at FROM note_revisions WHERE id = ?1",
            params![revision_id],
            |row| {
                Ok(NoteRevision {
                    id: row.get(0)?,
                    note_date: row.get(1)?,
                    content: row.get(2)?,
                    todos: row.get(3)?,
                    created_at: row.get(4)?,
                })
            },
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "历史版本不存在".to_string())?;

    save_note_with_revision(&mut db, &revision.note_date, &revision.content, &revision.todos)?;
    get_note_from_conn(&db, &revision.note_date)?.ok_or_else(|| "恢复后未找到便签".to_string())
}

#[tauri::command]
fn get_backup_status(state: tauri::State<DbState>) -> Result<BackupStatus, String> {
    let db = state.db.lock().map_err(|error| error.to_string())?;
    read_backup_status(&db)
}

#[tauri::command]
fn create_manual_backup(app: tauri::AppHandle, state: tauri::State<DbState>) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let backup_dir = get_backup_dir(&app_data_dir);
    let db = state.db.lock().map_err(|error| error.to_string())?;
    let path = create_database_backup(&db, &backup_dir, "manual")?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn restore_database_backup(
    app: tauri::AppHandle,
    state: tauri::State<DbState>,
    path: String,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let backup_dir = get_backup_dir(&app_data_dir);
    let backup_path = PathBuf::from(path);
    let mut db = state.db.lock().map_err(|error| error.to_string())?;
    let pre_restore = create_database_backup(&db, &backup_dir, "pre-restore")?;
    let result = restore_database_from_backup(&mut db, &backup_path);
    if let Err(error) = result {
        let _ = restore_database_from_backup(&mut db, &pre_restore);
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
fn get_notes_dates(state: tauri::State<DbState>) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT date FROM notes ORDER BY date DESC")
        .map_err(|e| e.to_string())?;
    let dates = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(dates)
}

#[tauri::command]
fn delete_note(state: tauri::State<DbState>, date: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM notes WHERE date = ?1", params![date])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_settings(state: tauri::State<DbState>) -> Result<AppSettings, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT value FROM settings WHERE key = 'app_settings'")
        .map_err(|e| e.to_string())?;
    let value: String = stmt
        .query_row([], |row| row.get(0))
        .unwrap_or_else(|_| "{}".to_string());
    Ok(parse_app_settings(&value))
}

#[tauri::command]
fn save_settings(state: tauri::State<DbState>, settings: AppSettings) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let value = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO settings (key, value) VALUES ('app_settings', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn send_daily_email(state: tauri::State<DbState>) -> Result<String, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    send_email_for_date(&state, &today)
}

fn strip_html_tags(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(c),
            _ => {}
        }
    }
    // Decode common HTML entities
    result = result.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#x27;", "'")
        .replace("&nbsp;", " ");
    result
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_binary_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

pub(crate) fn send_email_smtp(settings: &EmailSettings, subject: &str, body: &str) -> Result<(), String> {
    use lettre::message::header::ContentType;
    use lettre::transport::smtp::authentication::Credentials;
    use lettre::{Message, SmtpTransport, Transport};

    let email = Message::builder()
        .from(
            format!("DayNotes <{}>", settings.username)
                .parse()
                .map_err(|e| format!("Invalid from address: {}", e))?,
        )
        .to(settings
            .recipient
            .parse()
            .map_err(|e| format!("Invalid recipient: {}", e))?)
        .subject(subject)
        .header(ContentType::TEXT_PLAIN)
        .body(body.to_string())
        .map_err(|e| format!("Failed to build email: {}", e))?;

    let creds = Credentials::new(settings.username.clone(), settings.password.clone());

    let mailer = SmtpTransport::relay(&settings.smtp_host)
        .map_err(|e| format!("Invalid SMTP server: {}", e))?
        .port(settings.smtp_port)
        .credentials(creds)
        .build();

    mailer
        .send(&email)
        .map_err(|e| format!("Failed to send email: {}", e))?;

    Ok(())
}

// ── Email Scheduler ──────────────────────────────────────────────

fn scheduler_tick(app_handle: &tauri::AppHandle) {
    let state = app_handle.state::<DbState>();

    let (should_send, today) = {
        let db = match state.db.lock() {
            Ok(db) => db,
            Err(_) => return,
        };

        // Read settings
        let mut stmt = match db.prepare("SELECT value FROM settings WHERE key = 'app_settings'") {
            Ok(s) => s,
            Err(_) => return,
        };
        let value: String = match stmt.query_row([], |row| row.get(0)) {
            Ok(v) => v,
            Err(_) => return,
        };
        let settings = parse_app_settings(&value);

        let email = &settings.email;
        if !email.enabled {
            return;
        }

        // Weekday check (1=Mon..7=Sun in chrono %u)
        if email.weekdays_only {
            let weekday = chrono::Local::now().format("%u").to_string();
            if weekday == "6" || weekday == "7" {
                return;
            }
        }

        // Time check
        let now_time = chrono::Local::now().format("%H:%M").to_string();
        if now_time != email.send_time {
            return;
        }

        // Already sent today?
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let mut stmt2 = match db.prepare("SELECT value FROM settings WHERE key = 'last_sent_date'") {
            Ok(s) => s,
            Err(_) => return,
        };
        let last_sent: String = stmt2.query_row([], |row| row.get(0)).unwrap_or_default();
        if last_sent == today {
            return;
        }

        (true, today)
    };

    if should_send {
        match send_email_for_date(&state, &today) {
            Ok(msg) => {
                log::info!("Auto-send: {}", msg);
                if let Ok(db) = state.db.lock() {
                    let _ = db.execute(
                        "INSERT INTO settings (key, value) VALUES ('last_sent_date', ?1)
                         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                        params![today],
                    );
                }
            }
            Err(e) => {
                log::error!("Auto-send failed: {}", e);
            }
        }
    }
}

// ── App Entry & Setup ────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            window_lifecycle::activate_window(&window);
        } else {
            log::error!("Single-instance activation could not find the main window");
        }
    }));

    builder
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Logging
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize database
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            let db_path = get_db_path(&app_data_dir);
            log::info!("Database path: {:?}", db_path);
            let conn = Connection::open(&db_path)
                .expect("Failed to open database");
            conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
                .ok();
            init_db(&conn);
            if let Err(error) = ensure_daily_backup(&conn, &app_data_dir) {
                log::error!("Daily backup failed: {}", error);
            }

            app.manage(DbState {
                db: Mutex::new(conn),
            });

            // ── System Tray ──
            let show_hide =
                MenuItemBuilder::with_id("show_hide", "显示/隐藏").build(app)?;
            let send_email_tray =
                MenuItemBuilder::with_id("send_email", "发送今日邮件").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_hide)
                .item(&send_email_tray)
                .item(&quit)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .expect("No default window icon found"),
                )
                .menu(&tray_menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show_hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        "send_email" => {
                            let state = app.state::<DbState>();
                            let today =
                                chrono::Local::now().format("%Y-%m-%d").to_string();
                            match send_email_for_date(&state, &today) {
                                Ok(msg) => log::info!("Tray email: {}", msg),
                                Err(e) => log::error!("Tray email failed: {}", e),
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Window close → hide to tray instead of quitting
            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

            // ── Email Scheduler ──
            let app_handle = app.handle().clone();
            scheduler_tick(&app_handle);
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(60));
                    scheduler_tick(&app_handle);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_note,
            get_note,
            get_notes_in_range,
            get_note_revisions,
            restore_note_revision,
            get_backup_status,
            create_manual_backup,
            restore_database_backup,
            get_notes_dates,
            delete_note,
            get_settings,
            save_settings,
            send_daily_email,
            write_text_file,
            write_binary_file,
            read_binary_file,
            export_zip::export_markdown_zip,
            export_pdf::export_pdf_pages,
            email::test_email_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_app_settings_uses_defaults_for_empty_json() {
        let settings = parse_app_settings("{}");

        assert_eq!(settings.theme, "system");
        assert_eq!(settings.font_size, 14);
        assert_eq!(settings.email.smtp_host, "smtp.qq.com");
        assert_eq!(settings.email.smtp_port, 465);
        assert_eq!(settings.email.send_time, "08:00");
        assert!(settings.email.weekdays_only);
        assert!(!settings.email.enabled);
    }

    #[test]
    fn parse_app_settings_preserves_partial_saved_values() {
        let settings = parse_app_settings(r#"{"theme":"dark","email":{"enabled":true}}"#);

        assert_eq!(settings.theme, "dark");
        assert_eq!(settings.font_size, 14);
        assert_eq!(settings.email.smtp_host, "smtp.qq.com");
        assert!(settings.email.enabled);
    }

    #[test]
    fn parse_app_settings_uses_defaults_for_invalid_json() {
        let settings = parse_app_settings("{not json");

        assert_eq!(settings.theme, "system");
        assert_eq!(settings.font_size, 14);
        assert!(!settings.email.enabled);
    }

    #[test]
    fn query_notes_in_range_is_inclusive_and_ascending() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn);
        for date in ["2026-07-14", "2026-07-12", "2026-07-13", "2026-07-16"] {
            conn.execute(
                "INSERT INTO notes (date, content, todos) VALUES (?1, '<p>x</p>', '[]')",
                params![date],
            )
            .unwrap();
        }

        let notes = query_notes_in_range(&conn, "2026-07-12", "2026-07-14").unwrap();

        assert_eq!(
            notes
                .into_iter()
                .map(|note| note.date)
                .collect::<Vec<_>>(),
            vec!["2026-07-12", "2026-07-13", "2026-07-14"]
        );
    }

    #[test]
    fn query_notes_in_range_returns_no_rows_outside_the_range() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn);
        conn.execute(
            "INSERT INTO notes (date, content, todos) VALUES ('2026-07-10', '<p>x</p>', '[]')",
            [],
        )
        .unwrap();

        let notes = query_notes_in_range(&conn, "2026-07-12", "2026-07-14").unwrap();

        assert!(notes.is_empty());
    }

    #[test]
    fn query_notes_in_range_rejects_invalid_or_reversed_dates() {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn);

        assert!(query_notes_in_range(&conn, "2026-02-30", "2026-03-01").is_err());
        assert!(query_notes_in_range(&conn, "2026-07-15", "2026-07-14").is_err());
    }

    #[test]
    fn save_note_records_previous_version_once_when_content_changes() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_db(&conn);

        save_note_with_revision(&mut conn, "2026-07-18", "<p>one</p>", "[]").unwrap();
        save_note_with_revision(&mut conn, "2026-07-18", "<p>two</p>", "[]").unwrap();
        save_note_with_revision(&mut conn, "2026-07-18", "<p>two</p>", "[]").unwrap();

        let revisions = query_note_revisions(&conn, "2026-07-18").unwrap();
        assert_eq!(revisions.len(), 1);
        assert_eq!(revisions[0].content, "<p>one</p>");
    }

    #[test]
    fn save_note_keeps_ten_revisions_per_note() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_db(&conn);

        for idx in 0..12 {
            save_note_with_revision(&mut conn, "2026-07-18", &format!("<p>{idx}</p>"), "[]")
                .unwrap();
        }

        let revisions = query_note_revisions(&conn, "2026-07-18").unwrap();
        assert_eq!(revisions.len(), 10);
        assert_eq!(revisions.last().unwrap().content, "<p>1</p>");
    }

    #[test]
    fn automatic_backup_retains_seven_days() {
        let temp = std::env::temp_dir().join(format!(
            "daynotes-backup-test-{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        fs::create_dir_all(&temp).unwrap();
        for day in 1..=9 {
            fs::write(temp.join(format!("auto-2026-07-{day:02}.db")), b"x").unwrap();
        }

        prune_auto_backups(&temp, 7).unwrap();

        let count = fs::read_dir(&temp).unwrap().count();
        assert_eq!(count, 7);
        assert!(!temp.join("auto-2026-07-01.db").exists());
        let _ = fs::remove_dir_all(temp);
    }

    #[test]
    fn restore_rejects_invalid_backup_file() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_db(&conn);
        let bad_file = std::env::temp_dir().join(format!(
            "daynotes-bad-{}.db",
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        fs::write(&bad_file, b"not sqlite").unwrap();

        let result = restore_database_from_backup(&mut conn, &bad_file);

        assert!(result.is_err());
        let _ = fs::remove_file(bad_file);
    }

    #[test]
    fn todo_json_accepts_old_and_scheduled_shapes() {
        let old: TodoItem = serde_json::from_str(
            r#"{"id":"1","text":"旧待办","done":false,"time":null}"#,
        )
        .unwrap();
        let scheduled: TodoItem = serde_json::from_str(
            r#"{"id":"2","text":"新待办","done":false,"date":"2026-07-15","time":"14:30"}"#,
        )
        .unwrap();

        assert_eq!(old.date, None);
        assert_eq!(scheduled.date.as_deref(), Some("2026-07-15"));
        assert_eq!(scheduled.time.as_deref(), Some("14:30"));
    }
}
