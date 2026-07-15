# Share Range, Todo Schedule, and Task List UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users export an inclusive multi-day range, schedule todos with a date and time picker, and edit task lists with clear, compact visual feedback, then verify previously merged optimization work.

**Architecture:** Add one validated Rust range-query command and expose it through the existing Tauri API wrapper. Keep the existing single-day `ExportDocument` as the rendering unit, compose it into an `ExportCollection`, and let `ShareModal` own asynchronous range loading while protecting the current unsaved note. Extend the JSON-only todo shape compatibly and reuse `CalendarPicker`; keep task-list layout changes scoped to Tiptap task-list selectors.

**Tech Stack:** Tauri 2, Rust 1.96 MSVC, rusqlite, React 19, TypeScript 5.8, Tiptap 3, Vitest, Testing Library, Playwright.

## Global Constraints

- Build Rust only with the MSVC toolchain through `scripts/verify-rust.ps1` or `dev.ps1`; Git's `link.exe` must not precede MSVC's linker.
- UI copy remains Simplified Chinese.
- Dates use `YYYY-MM-DD`; times use `HH:MM`.
- Do not migrate SQLite or remove/change existing IPC command signatures.
- Old todo JSON without `date` remains valid.
- Empty dates are omitted from range exports; the range includes both endpoints and is ordered ascending.
- The in-memory current note overrides its database copy during sharing.
- Preserve light, dark, system theme, keyboard accessibility, and reduced-motion behavior.
- Do not stage `.claude/`, `AGENTS.md`, `CLAUDE.md`, or `work-report-2026-06-25.md`.

---

## File Structure

- `src-tauri/src/lib.rs`: validated range query, Tauri command registration, todo date deserialization, Rust tests.
- `src/lib/tauri.ts`: `getNotesInRange(startDate, endDate): Promise<Note[]>`.
- `src/lib/types.ts`: compatible `TodoItem.date?: string` and scheduling helpers.
- `src/lib/shareRange.ts`: range merge, empty-note filtering, collection naming, and latest-request-safe loading inputs.
- `src/lib/shareRange.test.ts`: pure range behavior tests.
- `src/lib/exportDocument.ts`: `ExportCollection`, collection Markdown/HTML helpers, scheduled todo formatting.
- `src/lib/exportDocument.test.ts`: multi-day export and resource-collision tests.
- `src/components/ExportPreview.tsx`: render one or many dated documents in a shared preview.
- `src/components/ExportPreview.test.tsx`: multi-day ordering and date-section tests.
- `src/components/ShareModal.tsx`: range controls, loading/error/retry, multi-day export orchestration.
- `src/components/ShareModal.test.tsx`: range interaction, stale response, error, and filenames.
- `src/components/CalendarPicker.tsx`: optional accessible label for reused calendar instances.
- `src/components/CalendarPicker.test.tsx`: custom-label compatibility.
- `src/components/TodoPanel.tsx`: date calendar, time input, clearing, overdue state.
- `src/components/TodoPanel.test.tsx`: scheduling and compatibility behavior.
- `src/components/Editor.tsx`: task-list-only style and empty item prompt.
- `src/components/editor/EditorToolbar.tsx`: active task-list status description.
- `src/components/TablePicker.test.tsx`: toolbar coverage remains intact.
- `src/App.tsx`, `src/App.test.tsx`: pass `currentDate`; preserve lazy modal props.
- `src/App.css`: range/picker/todo scheduling styles.
- `scripts/verify-complete-ui.mjs`: exercise and capture the three repaired interactions.
- `README.md`: describe range sharing and scheduled todos.
- `docs/verification/2026-07-15-optimization-audit.md`: evidence-backed historical task audit.

---

### Task 1: Add the validated notes range query

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/tauri.ts`

**Interfaces:**
- Produces: Rust `query_notes_in_range(conn: &Connection, start_date: &str, end_date: &str) -> Result<Vec<Note>, String>`.
- Produces: Tauri command `get_notes_in_range(state, start_date, end_date) -> Result<Vec<Note>, String>`.
- Produces: TypeScript `getNotesInRange(startDate: string, endDate: string): Promise<Note[]>`.

- [ ] **Step 1: Write failing Rust range tests**

Add tests using an in-memory connection initialized with `init_db`:

```rust
#[test]
fn query_notes_in_range_is_inclusive_and_ascending() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn);
    for date in ["2026-07-14", "2026-07-12", "2026-07-13", "2026-07-16"] {
        conn.execute(
            "INSERT INTO notes (date, content, todos) VALUES (?1, '<p>x</p>', '[]')",
            params![date],
        ).unwrap();
    }
    let notes = query_notes_in_range(&conn, "2026-07-12", "2026-07-14").unwrap();
    assert_eq!(notes.into_iter().map(|note| note.date).collect::<Vec<_>>(),
        vec!["2026-07-12", "2026-07-13", "2026-07-14"]);
}

#[test]
fn query_notes_in_range_rejects_invalid_or_reversed_dates() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn);
    assert!(query_notes_in_range(&conn, "2026-02-30", "2026-03-01").is_err());
    assert!(query_notes_in_range(&conn, "2026-07-15", "2026-07-14").is_err());
}
```

- [ ] **Step 2: Verify RED**

Run: `powershell -ExecutionPolicy Bypass -File scripts/verify-rust.ps1`

Expected: compile failure because `query_notes_in_range` does not exist.

- [ ] **Step 3: Implement the minimal query and register it**

Use strict parsing and one parameterized ordered query:

```rust
fn parse_iso_date(value: &str) -> Result<chrono::NaiveDate, String> {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| format!("无效日期：{value}"))
}

fn query_notes_in_range(conn: &Connection, start_date: &str, end_date: &str) -> Result<Vec<Note>, String> {
    let start = parse_iso_date(start_date)?;
    let end = parse_iso_date(end_date)?;
    if start > end { return Err("开始日期不能晚于结束日期".to_string()); }
    let mut stmt = conn.prepare(
        "SELECT date, content, todos, created_at, updated_at
         FROM notes WHERE date BETWEEN ?1 AND ?2 ORDER BY date ASC"
    ).map_err(|error| error.to_string())?;
    let rows = stmt.query_map(params![start_date, end_date], |row| Ok(Note {
        date: row.get(0)?, content: row.get(1)?, todos: row.get(2)?,
        created_at: row.get(3)?, updated_at: row.get(4)?,
    })).map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}
```

Wrap it in a Tauri command, add `get_notes_in_range` to `generate_handler!`, and add:

```ts
export async function getNotesInRange(startDate: string, endDate: string): Promise<Note[]> {
  return invoke("get_notes_in_range", { startDate, endDate });
}
```

- [ ] **Step 4: Verify GREEN and commit**

Run:

```powershell
npm run build
powershell -ExecutionPolicy Bypass -File scripts/verify-rust.ps1
```

Expected: both commands exit 0 and the new Rust tests pass.

Commit: `feat: query notes by inclusive date range`

---

### Task 2: Build a multi-day export collection

**Files:**
- Create: `src/lib/shareRange.ts`
- Create: `src/lib/shareRange.test.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/exportDocument.ts`
- Modify: `src/lib/exportDocument.test.ts`
- Modify: `src/components/ExportPreview.tsx`
- Modify: `src/components/ExportPreview.test.tsx`

**Interfaces:**
- Produces: `ShareEntry { date: string; content: string; todos: TodoItem[] }`.
- Produces: `mergeShareEntries(notes, current): ShareEntry[]`.
- Produces: `getShareBaseName(startDate, endDate): string`.
- Produces: `ExportCollection { startDate: string; endDate: string; documents: ExportDocument[] }`.
- Produces: `createExportCollection(startDate, endDate, entries): ExportCollection`.
- Produces: `renderCollectionMarkdown(collection): MarkdownExport`.
- Produces: `renderCollectionHtml(collection): string`.

- [ ] **Step 1: Write failing pure range tests**

Cover database order normalization, blank filtering, local override, malformed todo JSON, and naming:

```ts
it("keeps inclusive non-empty dates in ascending order and overrides the current note", () => {
  const result = mergeShareEntries([
    note("2026-07-14", "<p>数据库版本</p>"),
    note("2026-07-13", "<p></p>"),
    note("2026-07-12", "<p>第一天</p>"),
  ], { date: "2026-07-14", content: "<p>未保存版本</p>", todos: [] });
  expect(result.map((entry) => [entry.date, entry.content])).toEqual([
    ["2026-07-12", "<p>第一天</p>"],
    ["2026-07-14", "<p>未保存版本</p>"],
  ]);
});

expect(getShareBaseName("2026-07-12", "2026-07-14"))
  .toBe("DayNotes-2026-07-12_to_2026-07-14");
```

- [ ] **Step 2: Write failing collection rendering tests**

Create two documents with same-named embedded images and scheduled todos. Assert:

```ts
const collection = createExportCollection("2026-07-12", "2026-07-14", entries);
const output = renderCollectionMarkdown(collection);
expect(output.markdown.indexOf("2026年7月12日")).toBeLessThan(output.markdown.indexOf("2026年7月14日"));
expect(new Set(output.images.map((image) => image.filename)).size).toBe(output.images.length);
expect(output.markdown).toContain("截止：2026-07-14 14:30");
```

Render `<ExportPreview collection={collection} />` and assert two `.export-day` sections in ascending order with a single outer brand header/footer.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npm test -- src/lib/shareRange.test.ts src/lib/exportDocument.test.ts src/components/ExportPreview.test.tsx
```

Expected: failures for missing modules, types, and props.

- [ ] **Step 4: Implement minimal collection helpers**

Extend the todo type and add shared formatting:

```ts
export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  date?: string;
  time?: string;
}

export function formatTodoSchedule(todo: TodoItem): string {
  const schedule = [todo.date, todo.time].filter(Boolean).join(" ");
  return schedule ? `（截止：${schedule}）` : "";
}
```

`mergeShareEntries` must parse todos with `parseTodos`, insert/replace the current entry, reject entries without visible text/media/todos, and sort by string date. The collection renderer must prefix each document with a date heading, remap image IDs and filenames with the document date, and reuse the existing inline/block renderers rather than duplicate HTML parsing.

- [ ] **Step 5: Render the collection preview**

Change the preview interface to:

```ts
interface ExportPreviewProps {
  collection: ExportCollection;
  previewRef?: React.Ref<HTMLDivElement>;
}
```

Render one `.export-day` per document and include the scheduled todo suffix in the `todos` block. Keep one `.export-document` root so PDF and image capture remain unchanged.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```powershell
npm test -- src/lib/shareRange.test.ts src/lib/exportDocument.test.ts src/components/ExportPreview.test.tsx
npm run lint
npm run build
```

Expected: all commands exit 0.

Commit: `feat: compose multi-day export documents`

---

### Task 3: Add share range controls and resilient loading

**Files:**
- Modify: `src/components/ShareModal.tsx`
- Modify: `src/components/ShareModal.test.tsx`
- Modify: `src/components/CalendarPicker.tsx`
- Modify: `src/components/CalendarPicker.test.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `api.getNotesInRange`, `mergeShareEntries`, `createExportCollection`.
- Produces: range buttons named `分享开始日期` and `分享结束日期`.
- Produces: retry button named `重试加载分享内容`.

- [ ] **Step 1: Write failing ShareModal interaction tests**

Mock `getNotesInRange`. Assert initial current-day query, start/end calendar selection, reverse-range normalization, loading disables exports, failures show retry, and older deferred promises cannot replace the newest result. Also verify a multi-day PDF default path and range passed as its PDF title:

```ts
expect(getNotesInRangeMock).toHaveBeenCalledWith("2026-07-11", "2026-07-11");
fireEvent.click(screen.getByRole("button", { name: "分享开始日期" }));
fireEvent.click(screen.getByRole("gridcell", { name: /2026-07-09/ }));
expect(getNotesInRangeMock).toHaveBeenLastCalledWith("2026-07-09", "2026-07-11");
expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({
  defaultPath: "DayNotes-2026-07-09_to_2026-07-11.pdf",
}));
```

- [ ] **Step 2: Write failing calendar-label test**

Render `CalendarPicker` with `label="选择分享开始日期"` and assert that accessible name instead of the hard-coded default.

- [ ] **Step 3: Verify RED**

Run: `npm test -- src/components/ShareModal.test.tsx src/components/CalendarPicker.test.tsx`

Expected: failures because range controls and `label` do not exist.

- [ ] **Step 4: Implement range state and request protection**

Add `startDate`, `endDate`, `entries`, `loadState`, active picker, and a monotonically increasing request ref. Each load calls `getNotesInRange`, merges the in-memory current entry, and only commits if its request ID remains latest. Do not close the modal after load errors or canceled save dialogs. Disable export actions unless `loadState === "ready"` and the collection is non-empty.

Use `CalendarPicker` inside an anchored `.share-date-picker` and pass a label. When selecting start after end, set both to start; when selecting end before start, set both to end.

- [ ] **Step 5: Route all four exports through the collection**

- Markdown calls `renderCollectionMarkdown` and creates one combined Markdown filename.
- Clipboard calls `renderCollectionHtml` and creates matching plain text.
- PDF/image capture the collection preview.
- All save defaults use `getShareBaseName`.
- Keep the modal open when the native save dialog returns `null`; close after successful export only.

- [ ] **Step 6: Add range styles and verify GREEN**

Add `.share-range`, `.share-date-field`, `.share-date-picker`, `.share-load-state`, and narrow-screen rules using tokens only.

Run:

```powershell
npm test -- src/components/ShareModal.test.tsx src/components/CalendarPicker.test.tsx
npm run lint
npm run build
```

Expected: all commands exit 0.

Commit: `feat: select and export a sharing date range`

---

### Task 4: Schedule todos with date and time pickers

**Files:**
- Modify: `src/components/TodoPanel.tsx`
- Modify: `src/components/TodoPanel.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/App.css`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Changes: `TodoPanelProps` adds `currentDate: string`.
- Produces: date button name `截止日期：<todo text>`.
- Produces: time input name `截止时间：<todo text>`.
- Produces: pure `isTodoOverdue(todo, now): boolean` in `src/lib/types.ts`.

- [ ] **Step 1: Write failing todo scheduling tests**

Use fake time and cover:

```ts
it("defaults a new todo to the current note date", () => {
  render(<TodoPanel currentDate="2026-07-15" todos={[]} onChange={onChange} />);
  fireEvent.change(screen.getByRole("textbox", { name: "新待办" }), { target: { value: "复盘" } });
  fireEvent.click(screen.getByRole("button", { name: "添加" }));
  expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ date: "2026-07-15", time: undefined })]);
});
```

Also click the date button, select a cross-month date, change and clear `input[type=time]`, assert `.todo-item--overdue` for an unfinished past deadline, and assert old todos without `date` still render.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/components/TodoPanel.test.tsx src/App.test.tsx`

Expected: prop/type/control assertions fail.

- [ ] **Step 3: Implement scheduling behavior**

Pass `currentDate` from `App`. Add `openCalendarTodoId` state. New todos receive `date: currentDate`; selecting or clearing date/time immutably updates only the targeted item. Render the reused `CalendarPicker` in a local popover and close it after selection.

Implement overdue evaluation with local parsed values; a date without time becomes overdue after the local end of that date, and date plus time becomes overdue immediately after that minute. Never mark completed tasks overdue.

- [ ] **Step 4: Keep Rust email deserialization compatible**

Add `pub date: Option<String>` to Rust `TodoItem` and include `[date, time]` in email todo suffixes without requiring either field. Add a serde test for old JSON and new JSON.

- [ ] **Step 5: Style and verify GREEN**

Add compact `.todo-schedule`, `.todo-date`, `.todo-date-popover`, `.todo-overdue`, and responsive wrapping. Date/time controls must remain visible to keyboard users and use existing focus rings.

Run:

```powershell
npm test -- src/components/TodoPanel.test.tsx src/App.test.tsx
npm run lint
npm run build
powershell -ExecutionPolicy Bypass -File scripts/verify-rust.ps1
```

Expected: all commands exit 0.

Commit: `feat: schedule todos with date and time`

---

### Task 5: Clarify and compact editor task lists

**Files:**
- Modify: `src/components/Editor.tsx`
- Modify: `src/components/editor/EditorToolbar.tsx`
- Modify: `src/components/TablePicker.test.tsx`
- Create: `src/components/Editor.test.tsx`

**Interfaces:**
- Produces: task-list empty paragraph hint `输入任务内容，按 Enter 新增下一项`.
- Preserves: all toolbar command labels and Tiptap commands.

- [ ] **Step 1: Write failing task-list UX tests**

Render an editor containing a task list, focus its paragraph, and verify the task-list toolbar button is pressed and a polite status description is present. Read `Editor.tsx` and assert task-list-scoped CSS contains zero paragraph margins, small item gaps, `:focus-within`, and an empty paragraph pseudo-element; also assert generic paragraph margins remain unchanged.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/components/Editor.test.tsx src/components/TablePicker.test.tsx`

Expected: failures for missing status/hint and compact selectors.

- [ ] **Step 3: Implement task-list-only feedback**

Add an `aria-live="polite"` visually hidden status near the toolbar when `editor.isActive("taskList")`. Extend only these selectors:

```css
.editor-content .ProseMirror ul[data-type="taskList"] {
  padding:8px 10px;
  border-left:3px solid var(--accent);
  border-radius:var(--radius-sm);
  background:var(--surface-inset);
}
.editor-content .ProseMirror ul[data-type="taskList"] > li {
  margin:4px 0;
  padding:4px 6px;
  border-radius:var(--radius-sm);
}
.editor-content .ProseMirror ul[data-type="taskList"] > li:focus-within {
  box-shadow:0 0 0 2px var(--focus-ring);
  background:var(--surface-paper);
}
.editor-content .ProseMirror ul[data-type="taskList"] > li > div > p { margin:0; }
.editor-content .ProseMirror ul[data-type="taskList"] > li > div > p:empty::before { content:"输入任务内容，按 Enter 新增下一项"; }
```

Use theme variables and do not change ordinary `ul`, `ol`, `li`, or `p` selectors.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```powershell
npm test -- src/components/Editor.test.tsx src/components/TablePicker.test.tsx
npm run lint
npm run build
```

Expected: all commands exit 0.

Commit: `fix: clarify task list editing state and spacing`

---

### Task 6: Update end-to-end verification and audit previous tasks

**Files:**
- Modify: `scripts/verify-complete-ui.mjs`
- Modify: `README.md`
- Create: `docs/verification/2026-07-15-optimization-audit.md`

**Interfaces:**
- Produces: deterministic screenshots for share range, todo schedule, and task-list editing.
- Produces: historical audit with requirement, implementation evidence, verification command, and status.

- [ ] **Step 1: Extend the complete UI verifier before changing implementation assumptions**

Seed at least three dated notes through the mocked IPC handler. Exercise:

- selecting a two-day share range and confirming both date sections;
- adding a todo, opening its calendar, choosing a date, and selecting a time;
- activating task-list mode, typing two items with Enter, and measuring that item/paragraph vertical gaps are within the compact CSS target.

Save screenshots `ui-share-range.png`, `ui-todo-schedule.png`, and `ui-task-list-editing.png`. Add them to evidence validation if the existing script requires a fixed screenshot manifest.

- [ ] **Step 2: Update user documentation**

Document inclusive range selection, blank-day skipping, filenames, todo date/time behavior, and the fact that scheduled todos remain attached to their source day.

- [ ] **Step 3: Audit merged optimization designs**

Create a table for every acceptance requirement in:

- `docs/superpowers/specs/2026-07-11-editor-export-single-instance-email-design.md`
- `docs/superpowers/specs/2026-07-12-frontend-architecture-performance-design.md`
- `docs/superpowers/specs/2026-07-13-ui-experience-redesign-design.md`

For each item record exact code/test/evidence paths and mark `完成`, `本轮修复`, or `未完成`. If an item is truly incomplete and remains inside those approved specs, add a failing regression test, implement the smallest fix, and record the verification evidence before continuing.

- [ ] **Step 4: Run the full verification gate**

Run fresh:

```powershell
npm test
npm run lint
npm run build
npm run verify:rust
npm run verify:complete-ui
npm run verify:evidence
npm run verify
```

Expected: every command exits 0, all tests report zero failures, and evidence validation lists all required artifacts. If a command fails, record the actual failure, fix through a new red-green cycle, and rerun the full command.

- [ ] **Step 5: Inspect scope and commit**

Run:

```powershell
git status --short
git diff --check
git diff --stat HEAD~5..HEAD
```

Confirm no unrelated untracked user files are staged. Commit only verifier, README, audit, and any evidence manifest changes:

`test: verify sharing scheduling and prior optimizations`

---

## Plan Self-Review

- Spec coverage: inclusive range loading, blank filtering, local override, four export paths, compatible todo date/time, calendar reuse, overdue semantics, task-list feedback/spacing, full verification, and historical audit each map to a task.
- Type consistency: `TodoItem.date`, `ShareEntry`, `ExportCollection`, `getNotesInRange`, `mergeShareEntries`, and `getShareBaseName` have one spelling and ownership throughout.
- Scope: no global task center, notification engine, SQLite migration, CI, signing, or release work is included.
- Placeholder scan: every implementation and verification step names exact behavior, files, commands, and expected outcomes.
