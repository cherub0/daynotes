# Data Safety Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the local DayNotes workspace to the unified `05.codex` directory and add user-visible note history plus SQLite backup and restore protection.

**Architecture:** Keep the existing Tauri IPC shape and add focused Rust helper functions around the current `DbState { db: Mutex<Connection> }`. The backend owns all persistence, validation, backup, and restore behavior; the frontend adds typed wrappers, a note history modal, and a data protection section in settings.

**Tech Stack:** Tauri 2, React 19, TypeScript 5.8, Vitest 3, rusqlite 0.31 with bundled SQLite, chrono, Windows PowerShell/MSVC Rust toolchain.

## Global Constraints

- Move local project from `D:\for_cherub\daynotes` to `D:\for_cherub\05.codex\codex-daynotes`.
- Do not change GitHub repo `cherub0/daynotes`, product name DayNotes, Tauri app identifier, or app data database path.
- Preserve `.git`, branches, remotes, tags, and untracked user files.
- Keep UI text in Simplified Chinese.
- Automatic daily backups retain 7 days.
- Per-note revisions retain 10 versions per date.
- Manual backups are separate from automatic backup cleanup.
- SMTP credential encryption is out of scope for this plan.
- Use MSVC Rust toolchain; do not use GNU Rust toolchain.
- Do not let Vitest discover tests inside `.worktrees`.

---

## File Structure

- Modify `vite.config.ts`: add Vitest `test.exclude` rules for `.worktrees`.
- Modify `src-tauri/Cargo.toml`: enable the `backup` feature for `rusqlite`.
- Modify `src-tauri/src/lib.rs`: add revision structs, backup status structs, database helpers, Tauri commands, and Rust tests.
- Modify `src/lib/types.ts`: add `NoteRevision`, `BackupStatus`, and related frontend types.
- Modify `src/lib/tauri.ts`: add typed IPC wrappers for history, backup, and restore commands.
- Modify `src/App.tsx`: own note history modal state and post-restore reload flow.
- Modify `src/components/DateHeader.tsx`: add a history entry near date tools.
- Create `src/components/NoteHistoryModal.tsx`: list, preview, and restore note revisions.
- Create `src/components/NoteHistoryModal.test.tsx`: test history UI behavior.
- Modify `src/components/SettingsModal.tsx`: add the data protection section.
- Modify `src/components/SettingsModal.test.tsx`: cover backup status and restore controls.

---

### Task 1: Workspace Migration And Test Discovery Guard

**Files:**
- Modify: `vite.config.ts`
- Runtime move: `D:\for_cherub\daynotes` to `D:\for_cherub\05.codex\codex-daynotes`

**Interfaces:**
- Produces: working repository at `D:\for_cherub\05.codex\codex-daynotes`.
- Produces: `test.exclude` config that prevents `.worktrees` from being scanned.

- [ ] **Step 1: Verify old worktree is safe to remove**

Run:

```powershell
git worktree list
git status --short --branch
git merge-base --is-ancestor codex/share-range-todo-schedule master
```

Expected: the old worktree is listed under `.worktrees\share-range-todo-schedule`, root branch is `codex/data-safety-recovery`, and `merge-base` exits `0`.

- [ ] **Step 2: Remove the merged worktree safely**

Run:

```powershell
$repo = (Resolve-Path .).Path
$worktree = (Resolve-Path ".worktrees\share-range-todo-schedule").Path
if (-not $worktree.StartsWith((Join-Path $repo ".worktrees"))) { throw "Unexpected worktree path: $worktree" }
git worktree remove ".worktrees\share-range-todo-schedule"
git branch -d codex/share-range-todo-schedule
```

Expected: worktree removed and local merged branch deleted.

- [ ] **Step 3: Write failing test-discovery config check**

Add this config block to `vite.config.ts`:

```ts
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.worktrees/**",
    ],
  },
```

The final file should keep the existing `plugins` and `build` sections and include `test` at the top level of `defineConfig`.

- [ ] **Step 4: Run tests from old path**

Run:

```powershell
npm test
```

Expected: Vitest runs only the root tests and does not report duplicate React hook failures from `.worktrees`.

- [ ] **Step 5: Move the repository**

Run from `D:\for_cherub`:

```powershell
New-Item -ItemType Directory -Force "D:\for_cherub\05.codex" | Out-Null
Move-Item -LiteralPath "D:\for_cherub\daynotes" -Destination "D:\for_cherub\05.codex\codex-daynotes"
Set-Location "D:\for_cherub\05.codex\codex-daynotes"
git status --short --branch
```

Expected: branch and untracked user files are preserved at the new path.

- [ ] **Step 6: Commit migration guard**

Run:

```powershell
git add vite.config.ts
git commit -m "test: ignore worktree test files"
```

Expected: one commit with only `vite.config.ts`.

---

### Task 2: Backend Note Revision Persistence

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `pub struct NoteRevision { id: i64, note_date: String, content: String, todos: String, created_at: String }`.
- Produces: `fn save_note_with_revision(conn: &mut Connection, date: &str, content: &str, todos: &str) -> Result<(), String>`.
- Produces IPC command: `get_note_revisions(state, date) -> Result<Vec<NoteRevision>, String>`.
- Produces IPC command: `restore_note_revision(state, revision_id) -> Result<Note, String>`.

- [ ] **Step 1: Write failing Rust tests**

Add tests inside `#[cfg(test)] mod tests`:

```rust
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
        save_note_with_revision(&mut conn, "2026-07-18", &format!("<p>{idx}</p>"), "[]").unwrap();
    }

    let revisions = query_note_revisions(&conn, "2026-07-18").unwrap();
    assert_eq!(revisions.len(), 10);
    assert_eq!(revisions.last().unwrap().content, "<p>1</p>");
}
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
cd src-tauri
cargo test save_note_
```

Expected: compile fails because `save_note_with_revision` and `query_note_revisions` do not exist.

- [ ] **Step 3: Add schema and structs**

Update `init_db` batch:

```rust
CREATE TABLE IF NOT EXISTS note_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_date TEXT NOT NULL,
    content TEXT NOT NULL,
    todos TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_note_revisions_note_date_created_at
ON note_revisions(note_date, created_at DESC, id DESC);
```

Add struct near `Note`:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NoteRevision {
    pub id: i64,
    pub note_date: String,
    pub content: String,
    pub todos: String,
    pub created_at: String,
}
```

- [ ] **Step 4: Add revision helpers**

Add helpers before Tauri commands:

```rust
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
    serde_json::from_str::<Vec<TodoItem>>(todos).map_err(|error| format!("无效待办数据：{error}"))?;
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
```

Also import `OptionalExtension`:

```rust
use rusqlite::{params, Connection, OptionalExtension};
```

- [ ] **Step 5: Wire IPC commands**

Change `save_note` to lock a mutable connection:

```rust
fn save_note(state: tauri::State<DbState>, date: String, content: String, todos: String) -> Result<(), String> {
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    save_note_with_revision(&mut db, &date, &content, &todos)
}
```

Add commands:

```rust
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
```

Extract `get_note_from_conn(conn, date)` from existing `get_note` query and add both new commands to `tauri::generate_handler!`.

- [ ] **Step 6: Run backend tests and commit**

Run:

```powershell
cd src-tauri
cargo test save_note_
```

Expected: both tests pass.

Commit:

```powershell
git add src-tauri/src/lib.rs
git commit -m "feat: record note revisions"
```

---

### Task 3: Backend Backup And Restore

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `BackupStatus { last_auto_backup_at: Option<String>, last_auto_backup_path: Option<String>, last_error: Option<String> }`.
- Produces IPC commands: `get_backup_status`, `create_manual_backup`, `restore_database_backup`.
- Produces helper: `fn create_database_backup(conn: &Connection, backup_dir: &Path, label: &str) -> Result<PathBuf, String>`.

- [ ] **Step 1: Write failing backup tests**

Add tests:

```rust
#[test]
fn automatic_backup_retains_seven_days() {
    let temp = std::env::temp_dir().join(format!("daynotes-backup-test-{}", chrono::Utc::now().timestamp_nanos_opt().unwrap()));
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
    let bad_file = std::env::temp_dir().join(format!("daynotes-bad-{}.db", chrono::Utc::now().timestamp_nanos_opt().unwrap()));
    fs::write(&bad_file, b"not sqlite").unwrap();
    let result = restore_database_from_backup(&mut conn, &bad_file);
    assert!(result.is_err());
    let _ = fs::remove_file(bad_file);
}
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
cd src-tauri
cargo test backup
cargo test restore_rejects_invalid_backup_file
```

Expected: compile fails because backup helpers do not exist.

- [ ] **Step 3: Enable rusqlite backup feature**

Change `Cargo.toml`:

```toml
rusqlite = { version = "0.31", features = ["bundled", "backup"] }
```

- [ ] **Step 4: Add backup types and helpers**

Add:

```rust
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupStatus {
    pub last_auto_backup_at: Option<String>,
    pub last_auto_backup_path: Option<String>,
    pub last_error: Option<String>,
}
```

Add helpers:

```rust
fn get_backup_dir(app_data_dir: &Path) -> PathBuf {
    let dir = app_data_dir.join("backups");
    fs::create_dir_all(&dir).ok();
    dir
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

fn validate_backup_file(path: &Path) -> Result<(), String> {
    let conn = Connection::open(path).map_err(|error| format!("无法打开备份：{error}"))?;
    let result: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|error| format!("备份校验失败：{error}"))?;
    if result == "ok" { Ok(()) } else { Err(format!("备份文件已损坏：{result}")) }
}
```

Add backup, restore, and status helpers:

```rust
use rusqlite::DatabaseName;

const BACKUP_STATUS_KEY: &str = "backup_status";

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
    serde_json::from_str::<BackupStatus>(&value).or_else(|_| {
        Ok(BackupStatus {
            last_auto_backup_at: None,
            last_auto_backup_path: None,
            last_error: None,
        })
    })
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
    conn.restore(DatabaseName::Main, backup_path, None::<fn(rusqlite::backup::Progress)>)
        .map_err(|error| format!("恢复备份失败：{error}"))?;
    Ok(())
}
```

- [ ] **Step 5: Add IPC commands**

Add commands:

```rust
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
fn restore_database_backup(state: tauri::State<DbState>, path: String) -> Result<(), String> {
    let backup_path = PathBuf::from(path);
    let mut db = state.db.lock().map_err(|error| error.to_string())?;
    restore_database_from_backup(&mut db, &backup_path)
}
```

Register the commands in `tauri::generate_handler!`.

- [ ] **Step 6: Run backend tests and commit**

Run:

```powershell
cd src-tauri
cargo test backup
cargo test restore_rejects_invalid_backup_file
```

Expected: tests pass.

Commit:

```powershell
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs
git commit -m "feat: add database backups"
```

---

### Task 4: Frontend Types And IPC

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/tauri.ts`

**Interfaces:**
- Produces TypeScript `NoteRevision`.
- Produces TypeScript `BackupStatus`.
- Produces API wrappers `getNoteRevisions`, `restoreNoteRevision`, `getBackupStatus`, `createManualBackup`, `restoreDatabaseBackup`.

- [ ] **Step 1: Add frontend types**

Add to `src/lib/types.ts`:

```ts
export interface NoteRevision {
  id: number;
  note_date: string;
  content: string;
  todos: string;
  created_at: string;
}

export interface BackupStatus {
  last_auto_backup_at: string | null;
  last_auto_backup_path: string | null;
  last_error: string | null;
}
```

- [ ] **Step 2: Add IPC wrappers**

Modify import:

```ts
import type { Note, AppSettings, NoteRevision, BackupStatus } from "./types";
```

Add wrappers:

```ts
export async function getNoteRevisions(date: string): Promise<NoteRevision[]> {
  return invoke("get_note_revisions", { date });
}

export async function restoreNoteRevision(revisionId: number): Promise<Note> {
  return invoke("restore_note_revision", { revisionId });
}

export async function getBackupStatus(): Promise<BackupStatus> {
  return invoke("get_backup_status");
}

export async function createManualBackup(): Promise<string> {
  return invoke("create_manual_backup");
}

export async function restoreDatabaseBackup(path: string): Promise<void> {
  return invoke("restore_database_backup", { path });
}
```

- [ ] **Step 3: Run TypeScript build**

Run:

```powershell
npm run build
```

Expected: build passes. Fix import ordering or unused imports before continuing if TypeScript reports them.

- [ ] **Step 4: Commit**

Run:

```powershell
git add src/lib/types.ts src/lib/tauri.ts
git commit -m "feat: add data protection ipc wrappers"
```

---

### Task 5: Note History UI

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/DateHeader.tsx`
- Create: `src/components/NoteHistoryModal.tsx`
- Create: `src/components/NoteHistoryModal.test.tsx`

**Interfaces:**
- Consumes: `api.getNoteRevisions(date)` and `api.restoreNoteRevision(revisionId)`.
- Produces: `NoteHistoryModal` props `{ currentDate: string; onClose: () => void; onRestored: (note: Note) => void; onToast: (message: string, tone?: ToastTone) => void }`.
- Produces: `DateHeaderProps.onHistory`.

- [ ] **Step 1: Write failing modal tests**

Create `src/components/NoteHistoryModal.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteHistoryModal } from "./NoteHistoryModal";

const api = vi.hoisted(() => ({
  getNoteRevisions: vi.fn(),
  restoreNoteRevision: vi.fn(),
}));

vi.mock("../lib/tauri", () => api);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NoteHistoryModal", () => {
  it("shows an empty state when there are no revisions", async () => {
    api.getNoteRevisions.mockResolvedValue([]);
    render(<NoteHistoryModal currentDate="2026-07-18" onClose={vi.fn()} onRestored={vi.fn()} onToast={vi.fn()} />);
    expect(await screen.findByText("暂无历史版本")).not.toBeNull();
  });

  it("previews and restores a selected revision", async () => {
    api.getNoteRevisions.mockResolvedValue([{ id: 7, note_date: "2026-07-18", content: "<p>旧内容</p>", todos: "[]", created_at: "2026-07-18 09:00:00" }]);
    api.restoreNoteRevision.mockResolvedValue({ date: "2026-07-18", content: "<p>旧内容</p>", todos: "[]", created_at: "2026-07-18 08:00:00", updated_at: "2026-07-18 10:00:00" });
    const onRestored = vi.fn();
    render(<NoteHistoryModal currentDate="2026-07-18" onClose={vi.fn()} onRestored={onRestored} onToast={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /2026-07-18 09:00:00/ }));
    expect(screen.getByText("旧内容")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "恢复此版本" }));
    await waitFor(() => expect(onRestored).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run modal test to verify failure**

Run:

```powershell
npx vitest run src/components/NoteHistoryModal.test.tsx
```

Expected: fails because `NoteHistoryModal` does not exist.

- [ ] **Step 3: Implement modal**

Create `NoteHistoryModal.tsx` using `ModalShell`, `Button`, and existing `parseTodos`. Render revision buttons, a preview area using safe text extraction from HTML, todo count, and a restore confirmation button.

Use this signature:

```tsx
export interface NoteHistoryModalProps {
  currentDate: string;
  onClose: () => void;
  onRestored: (note: Note) => void;
  onToast: (message: string, tone?: ToastTone) => void;
}

export function NoteHistoryModal({ currentDate, onClose, onRestored, onToast }: NoteHistoryModalProps) {
  // load revisions on mount/currentDate change
}
```

- [ ] **Step 4: Wire App and DateHeader**

In `DateHeaderProps`, add:

```ts
onHistory: () => void;
```

Add icon button:

```tsx
<IconButton label="历史版本" onClick={onHistory}>↺</IconButton>
```

In `App.tsx`, add lazy modal:

```ts
const LazyNoteHistoryModal = createRetryableLazy(() => import("./components/NoteHistoryModal"));
```

Add state:

```ts
const [showHistory, setShowHistory] = useState(false);
const [historyRetryKey, setHistoryRetryKey] = useState(0);
```

On restore:

```ts
function handleNoteRestored(note: Note) {
  setContent(note.content);
  setTodos(parseTodos(note.todos));
  showToast("已恢复历史版本");
}
```

Import `parseTodos` and `Note`.

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npx vitest run src/components/NoteHistoryModal.test.tsx src/App.test.tsx src/components/DateHeader.test.tsx
```

Expected: tests pass after updating mocks to include `onHistory` where needed.

Commit:

```powershell
git add src/App.tsx src/components/DateHeader.tsx src/components/NoteHistoryModal.tsx src/components/NoteHistoryModal.test.tsx
git commit -m "feat: add note history restore UI"
```

---

### Task 6: Settings Data Protection UI

**Files:**
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/components/SettingsModal.test.tsx`

**Interfaces:**
- Consumes: `api.getBackupStatus`, `api.createManualBackup`, `api.restoreDatabaseBackup`.
- Produces optional prop: `onDatabaseRestored?: () => void`.

- [ ] **Step 1: Update failing settings tests**

Extend the mock:

```ts
vi.mock("../lib/tauri", () => ({
  testEmailSettings: vi.fn(),
  getBackupStatus: vi.fn(async () => ({
    last_auto_backup_at: "2026-07-18 09:00:00",
    last_auto_backup_path: "D:\\backup\\auto-2026-07-18.db",
    last_error: null,
  })),
  createManualBackup: vi.fn(async () => "D:\\backup\\manual.db"),
  restoreDatabaseBackup: vi.fn(async () => undefined),
}));
```

Add test:

```tsx
it("shows data protection controls", async () => {
  render(<SettingsModal settings={settings} onSave={vi.fn()} onClose={() => undefined} />);
  expect(await screen.findByText("数据保护")).not.toBeNull();
  expect(screen.getByRole("button", { name: "立即备份" })).not.toBeNull();
  expect(screen.getByLabelText("备份文件路径")).not.toBeNull();
  expect(screen.getByRole("button", { name: "恢复整库" })).not.toBeNull();
});
```

- [ ] **Step 2: Run settings test to verify failure**

Run:

```powershell
npx vitest run src/components/SettingsModal.test.tsx
```

Expected: fails because data protection controls do not exist.

- [ ] **Step 3: Implement settings data protection section**

Import APIs:

```ts
import { createManualBackup, getBackupStatus, restoreDatabaseBackup, testEmailSettings } from "../lib/tauri";
import type { BackupStatus } from "../lib/types";
```

Add state:

```ts
const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
const [backupMessage, setBackupMessage] = useState("");
const [restorePath, setRestorePath] = useState("");
const [isBackupBusy, setIsBackupBusy] = useState(false);
```

Load status with `useEffect`. Add section title `数据保护`, status text, `立即备份` button, labeled input `备份文件路径`, and `恢复整库` button. Require `window.confirm("恢复整库会覆盖当前所有便签和设置，确认继续？")` before calling restore.

- [ ] **Step 4: Wire post-restore reload**

Add prop:

```ts
onDatabaseRestored?: () => void;
```

Call it after `restoreDatabaseBackup` succeeds. In `App.tsx`, pass:

```tsx
onDatabaseRestored={() => {
  void retryLoad();
  void api.getSettings().then((loadedSettings) => {
    setSettings(loadedSettings);
    applyTheme(loadedSettings.theme);
  });
  showToast("数据库已恢复");
}}
```

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npx vitest run src/components/SettingsModal.test.tsx src/App.test.tsx
```

Expected: tests pass.

Commit:

```powershell
git add src/App.tsx src/components/SettingsModal.tsx src/components/SettingsModal.test.tsx
git commit -m "feat: add data protection settings"
```

---

### Task 7: Full Verification And Release Readiness

**Files:**
- Modify: only the exact files named by a failed verification command, and only to fix that failure.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified branch ready for review/PR.

- [ ] **Step 1: Run full frontend tests**

Run:

```powershell
npm test
```

Expected: all Vitest files pass, and `.worktrees` is not scanned.

- [ ] **Step 2: Run frontend build**

Run:

```powershell
npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Run Rust tests with MSVC environment**

Run:

```powershell
.\dev.ps1
```

If `dev.ps1` starts the app instead of test-only verification, run:

```powershell
npm run verify:rust
```

Expected: Rust tests pass with MSVC `link.exe` before Git `link.exe` in `PATH`.

- [ ] **Step 4: Run git status check**

Run:

```powershell
git status --short --branch
```

Expected: only the known user untracked files remain untracked, unless verification generated ignored build output.

- [ ] **Step 5: Commit final fixes if needed**

If verification required fixes, commit them:

```powershell
git add <changed-files>
git commit -m "test: verify data protection flow"
```

Expected: no uncommitted implementation changes remain.

- [ ] **Step 6: Prepare completion**

Run:

```powershell
git log --oneline --decorate -5
git status --short --branch
```

Expected: branch `codex/data-safety-recovery` contains the plan/spec and implementation commits, with user untracked files preserved.
