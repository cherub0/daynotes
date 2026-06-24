use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
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
pub struct TodoItem {
    pub id: String,
    pub text: String,
    pub done: bool,
    pub time: Option<String>,  // "HH:MM"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub email: EmailSettings,
    pub theme: String,          // "light" | "dark" | "system"
    pub font_size: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            email: EmailSettings {
                smtp_host: "smtp.qq.com".to_string(),
                smtp_port: 465,
                username: "".to_string(),
                password: "".to_string(),
                recipient: "".to_string(),
                send_time: "08:00".to_string(),
                weekdays_only: true,
                enabled: false,
            },
            theme: "system".to_string(),
            font_size: 14,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NoteDatesResponse {
    pub dates: Vec<String>,
}

// ── Database State ───────────────────────────────────────────────

pub struct DbState {
    pub db: Mutex<Connection>,
}

fn get_db_path(app_data_dir: &PathBuf) -> PathBuf {
    fs::create_dir_all(app_data_dir).ok();
    app_data_dir.join("daynotes.db")
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
        INSERT OR IGNORE INTO settings (key, value) VALUES ('app_settings', '{}');",
    )
    .expect("Failed to initialize database");
}

// ── Tauri Commands ───────────────────────────────────────────────

#[tauri::command]
fn save_note(state: tauri::State<DbState>, date: String, content: String, todos: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO notes (date, content, todos, updated_at)
         VALUES (?1, ?2, ?3, datetime('now', 'localtime'))
         ON CONFLICT(date) DO UPDATE SET
           content = excluded.content,
           todos = excluded.todos,
           updated_at = datetime('now', 'localtime')",
        params![date, content, todos],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_note(state: tauri::State<DbState>, date: String) -> Result<Option<Note>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT date, content, todos, created_at, updated_at FROM notes WHERE date = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query_map(params![date], |row| {
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
        Some(Ok(note)) => Ok(Some(note)),
        _ => Ok(None),
    }
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
    serde_json::from_str::<AppSettings>(&value).map_err(|e| e.to_string())
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
    let settings = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT value FROM settings WHERE key = 'app_settings'")
            .map_err(|e| e.to_string())?;
        let value: String = stmt
            .query_row([], |row| row.get(0))
            .unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str::<AppSettings>(&value).map_err(|e| e.to_string())?
    };

    let email = &settings.email;
    if !email.enabled {
        return Err("Email sending is not enabled".to_string());
    }

    // Get today's note
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let note = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT date, content, todos, created_at, updated_at FROM notes WHERE date = ?1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query_map(params![today], |row| {
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
            _ => return Err("No note for today".to_string()),
        }
    };

    // Parse todos
    let todos: Vec<TodoItem> = serde_json::from_str(&note.todos).unwrap_or_default();
    let done_count = todos.iter().filter(|t| t.done).count();
    let total = todos.len();

    // Build todo list text
    let todo_text: String = todos
        .iter()
        .map(|t| {
            let mark = if t.done { "☑" } else { "☐" };
            let time = t.time.as_ref().map(|tm| format!(" @ {}", tm)).unwrap_or_default();
            format!("{} {}{}", mark, t.text, time)
        })
        .collect::<Vec<_>>()
        .join("\n");

    // Strip HTML tags for plain text summary
    let plain_content = strip_html_tags(&note.content);
    let summary: String = plain_content.chars().take(200).collect();

    // Build email body
    let subject = format!("【DayNotes】{} 今日任务", today);
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

    // Send via SMTP
    send_email_smtp(email, &subject, &body)?;

    Ok(format!("Email sent to {}", email.recipient))
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

fn send_email_smtp(settings: &EmailSettings, subject: &str, body: &str) -> Result<(), String> {
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

// ── App Entry & Setup ────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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

            app.manage(DbState {
                db: Mutex::new(conn),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_note,
            get_note,
            get_notes_dates,
            delete_note,
            get_settings,
            save_settings,
            send_daily_email,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
