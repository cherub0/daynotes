use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
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
        INSERT OR IGNORE INTO settings (key, value) VALUES ('app_settings', '{}');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('last_sent_date', '');",
    )
    .expect("Failed to initialize database");
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
        serde_json::from_str::<AppSettings>(&value).map_err(|e| e.to_string())?
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
            let time = t.time.as_ref().map(|tm| format!(" @ {}", tm)).unwrap_or_default();
            format!("{} {}{}", mark, t.text, time)
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
        let settings: AppSettings = match serde_json::from_str(&value) {
            Ok(s) => s,
            Err(_) => return,
        };

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
    tauri::Builder::default()
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
            get_notes_dates,
            delete_note,
            get_settings,
            save_settings,
            send_daily_email,
            write_text_file,
            write_binary_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
