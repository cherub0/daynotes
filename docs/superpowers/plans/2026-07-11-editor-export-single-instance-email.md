# DayNotes Editor, Export, Single-Instance, and Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the seven confirmed editor, sharing, tray, PDF, link, Markdown-image, and email-verification issues with directly saved, testable desktop outputs.

**Architecture:** Keep Tiptap interaction in focused React components, extract HTML export parsing into pure TypeScript, and pass a serializable export document to focused Rust modules for ZIP and native PDF generation. Initialize Tauri's official single-instance plugin before setup, and expose a dedicated SMTP test command that accepts unsaved form values.

**Tech Stack:** React 19, TypeScript 5.8, Tiptap 3, Vitest + jsdom, Tauri 2.11, Rust 2021/MSVC, `tauri-plugin-single-instance`, `zip` 8.6, `printpdf` 0.9, `image`, `lettre` 0.11.

## Global Constraints

- Build Rust only with the MSVC toolchain and ensure the Visual Studio `link.exe` precedes Git's `link.exe`; use `dev.ps1` or `scripts/verify-rust.ps1`.
- All UI text is Simplified Chinese and all dates remain `YYYY-MM-DD`.
- Theme-aware UI styles use existing CSS variables rather than hard-coded light-only colors.
- PDF paper size is A4; orientation is selected automatically for the whole document.
- Markdown always exports as one ZIP containing `YYYY-MM-DD.md` and an `images/` directory when localized images exist.
- SMTP tests send a real email but never log or return the authorization code.
- Preserve all unrelated untracked files and user changes.

---

### Task 1: Add a pure export document model and test harness

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.app.json`
- Create: `src/lib/exportDocument.ts`
- Create: `src/lib/exportDocument.test.ts`

**Interfaces:**
- Produces: `parseExportDocument(date: string, html: string, todos: TodoItem[]): ExportDocument`
- Produces: `renderMarkdown(document: ExportDocument): MarkdownExport`
- Produces: `ExportDocument`, `ExportBlock`, `ExportImage`, and `MarkdownExport` serializable types consumed by Tasks 3 and 4.

- [ ] **Step 1: Add Vitest test scripts and dependencies**

Add `"test": "vitest run"` and `"test:watch": "vitest"` to `scripts`; add `vitest` and `jsdom` as dev dependencies. Configure the test environment with a per-file `// @vitest-environment jsdom` directive so production TypeScript settings remain unchanged.

- [ ] **Step 2: Write failing parser and Markdown tests**

Create tests that assert:

```ts
const doc = parseExportDocument(
  "2026-07-11",
  `<h2>标题</h2><p>访问 <a href="https://example.com">示例</a></p>
   <table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>
   <pre><code class="language-rust">fn main() {}</code></pre>
   <img src="data:image/png;base64,aGVsbG8=" alt="图">`,
  [{ id: "1", text: "完成导出", done: false }],
);

expect(doc.blocks.map((block) => block.kind)).toEqual([
  "heading", "paragraph", "table", "code", "image", "todos",
]);
const output = renderMarkdown(doc);
expect(output.markdown).toContain("[示例](https://example.com)");
expect(output.markdown).toContain("![图](images/image-1.png)");
expect(output.markdown).toContain("```rust");
expect(output.images).toHaveLength(1);
```

Add cases proving duplicate image sources reuse one resource, table pipes are escaped, Data URL MIME types map to correct extensions, and remote image URLs remain remote until localized.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- src/lib/exportDocument.test.ts`

Expected: FAIL because `exportDocument.ts` and its exports do not exist.

- [ ] **Step 4: Implement the minimal model, DOM walker, and Markdown renderer**

Use a discriminated union whose block variants contain only JSON-safe strings, numbers, booleans, and arrays. Parse headings, paragraphs with inline marks/links, lists, task lists, blockquotes, code language, tables, horizontal rules, and images. Append one `todos` block from the separate application todo list. Assign stable resource IDs by first source occurrence and render ZIP paths with forward slashes.

- [ ] **Step 5: Run the focused and full frontend checks**

Run: `npm test -- src/lib/exportDocument.test.ts`

Expected: PASS with all parser and Markdown tests.

Run: `npm run build`

Expected: TypeScript and Vite build complete without errors.

- [ ] **Step 6: Commit Task 1**

```powershell
git add package.json package-lock.json tsconfig.app.json src/lib/exportDocument.ts src/lib/exportDocument.test.ts
git commit -m "test: define shared export document model"
```

---

### Task 2: Fix table selection and link editing without losing selection

**Files:**
- Create: `src/components/TablePicker.tsx`
- Create: `src/components/TablePicker.test.tsx`
- Create: `src/components/LinkEditor.tsx`
- Create: `src/components/LinkEditor.test.tsx`
- Modify: `src/components/Editor.tsx`

**Interfaces:**
- Consumes: Tiptap `Editor` from `@tiptap/react`.
- Produces: `TablePicker({ maxRows, maxCols, onSelect, onClose })` where `onSelect(rows, cols)` receives values from 1 through 20.
- Produces: `LinkEditor({ editor, initialRange, onClose })`, which restores `{ from, to }` before applying link commands.

- [ ] **Step 1: Write failing table picker interaction tests**

Using React Testing Library added as dev dependencies, render a 20×20 picker and assert that hovering cell row 3/column 5 shows `3 行 × 5 列`, sets 15 cells to the highlighted class, and clicking invokes `onSelect(3, 5)`. Assert cell 20/20 is present and Escape calls `onClose`.

- [ ] **Step 2: Write failing link intent tests**

Extract and test a pure `normalizeWebUrl(value: string): string | null` helper:

```ts
expect(normalizeWebUrl("example.com")).toBe("https://example.com");
expect(normalizeWebUrl("https://example.com/a")).toBe("https://example.com/a");
expect(normalizeWebUrl("javascript:alert(1)")).toBeNull();
```

Test LinkEditor against a small real Tiptap editor: selected text becomes linked, an empty selection inserts display text, editing loads the active href, and “取消链接” unsets it.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- src/components/TablePicker.test.tsx src/components/LinkEditor.test.tsx`

Expected: FAIL because both components and URL helper are missing.

- [ ] **Step 4: Implement TablePicker and wire table commands**

Replace the fixed `insertTable({ rows: 3, cols: 3 })` action with TablePicker state. Add a table-only toolbar using `editor.isActive("table")` and `editor.can().chain()` for `addRowBefore`, `addRowAfter`, `addColumnBefore`, `addColumnAfter`, `deleteRow`, `deleteColumn`, and `deleteTable`. Keep `withHeaderRow: true`.

- [ ] **Step 5: Implement LinkEditor and valid local file links**

Capture `editor.state.selection.from/to` before opening the panel. Restore the range with `setTextSelection`, then set or insert link content. Replace the direct `plugin:dialog|open` invocation with the official dialog API already installed by the Rust plugin; encode selected Windows paths into `file:///` URLs. Remove the web fallback that creates an invalid `file:///filename` link.

- [ ] **Step 6: Run focused tests, lint, and build**

Run: `npm test -- src/components/TablePicker.test.tsx src/components/LinkEditor.test.tsx`

Expected: PASS.

Run: `npm run lint`

Expected: no ESLint errors.

Run: `npm run build`

Expected: no TypeScript or Vite errors.

- [ ] **Step 7: Commit Task 2**

```powershell
git add package.json package-lock.json src/components/TablePicker.tsx src/components/TablePicker.test.tsx src/components/LinkEditor.tsx src/components/LinkEditor.test.tsx src/components/Editor.tsx
git commit -m "fix: add table sizing and reliable links"
```

---

### Task 3: Generate a Markdown ZIP with localized images

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Create: `src-tauri/src/export_zip.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/tauri.ts`
- Modify: `src/components/ShareModal.tsx`

**Interfaces:**
- Consumes: `MarkdownExport { markdown: string, images: ExportImage[] }` from Task 1.
- Produces Rust command: `export_markdown_zip(path: String, markdown_name: String, markdown: String, images: Vec<ExportImagePayload>) -> Result<ExportResult, String>`.
- Produces frontend wrapper: `exportMarkdownZip(path, markdownName, markdown, images): Promise<ExportResult>`.

- [ ] **Step 1: Write failing Rust ZIP tests**

In `export_zip.rs`, test an in-memory `build_markdown_zip` function. Open its bytes with `zip::ZipArchive` and assert entries are exactly `2026-07-11.md` and `images/image-1.png`, Markdown contains `images/image-1.png`, and decoded bytes match the payload. Add rejection tests for absolute paths and `..` traversal in entry names.

- [ ] **Step 2: Run the Rust test and verify RED**

Run: `powershell -ExecutionPolicy Bypass -File scripts/verify-rust.ps1`

Expected: FAIL because `export_zip` and `build_markdown_zip` do not exist.

- [ ] **Step 3: Implement ZIP bytes and atomic file writing**

Add `zip = { version = "8.6", default-features = false, features = ["deflate"] }`. Use `ZipWriter<Cursor<Vec<u8>>>` and `SimpleFileOptions`; sanitize every archive path. Write to a sibling `.tmp` file and rename only after successful completion. Decode Data URLs in Rust or accept already decoded byte arrays; never place absolute paths in the archive.

- [ ] **Step 4: Replace ShareModal's Markdown directory/fallback flow**

Use the Tauri save dialog with default `DayNotes-YYYY-MM-DD.zip`. Call `parseExportDocument` and `renderMarkdown`; send localized Data URL resources to Rust. For remote URLs, attempt fetch in the frontend, convert successful responses to payloads and rewrite their Markdown references; retain failed URLs and show `已导出，N 张网络图片未能打包，已保留原链接`. Treat a canceled dialog as a no-op.

- [ ] **Step 5: Run focused Rust and frontend verification**

Run: `powershell -ExecutionPolicy Bypass -File scripts/verify-rust.ps1`

Expected: ZIP tests PASS.

Run: `npm test -- src/lib/exportDocument.test.ts && npm run build`

Expected: tests and build PASS.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/export_zip.rs src-tauri/src/lib.rs src/lib/tauri.ts src/components/ShareModal.tsx
git commit -m "feat: export markdown and images as zip"
```

---

### Task 4: Make image export match preview and create directly saved paginated PDFs

**Files:**
- Create: `src/components/ExportPreview.tsx`
- Create: `src/components/ExportPreview.test.tsx`
- Create: `src/lib/exportImage.ts`
- Modify: `src/components/ShareModal.tsx`
- Create: `src-tauri/src/export_pdf.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src/lib/tauri.ts`
- Add: `src-tauri/assets/fonts/NotoSansSC-Regular.ttf`

**Interfaces:**
- Consumes: `ExportDocument` from Task 1.
- Produces: `choose_orientation(document: &ExportDocument, metrics: &DocumentMetrics) -> Orientation`.
- Produces Rust command: `export_pdf(path: String, document: ExportDocument) -> Result<ExportResult, String>`.
- Produces frontend: `captureExportPreview(element: HTMLElement): Promise<Blob>`.

- [ ] **Step 1: Write failing preview rendering tests**

Render an ExportDocument containing heading, link, code, table, todo, and a Data URL image. Assert semantic elements (`h2`, `a`, `pre`, `table`, `img`) exist, the image `src` is real, and no text matching `/\[图片 \d+\]/` is rendered.

- [ ] **Step 2: Write failing Rust orientation and pagination tests**

Assert a normal text document chooses portrait, a table whose measured natural width exceeds portrait content width chooses landscape, and a 1600×900 image chooses landscape. Test `fit_size` keeps aspect ratio and never exceeds content bounds. Feed block heights crossing the bottom margin into `paginate_blocks` and assert every placement remains within page bounds and produces at least two pages.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- src/components/ExportPreview.test.tsx`

Expected: FAIL because ExportPreview is missing.

Run: `powershell -ExecutionPolicy Bypass -File scripts/verify-rust.ps1`

Expected: FAIL because PDF layout helpers are missing.

- [ ] **Step 4: Implement shared preview rendering and long-image capture**

Render ExportPreview in an off-screen theme-aware container used by both the visible share preview and image capture. Wait for `document.fonts.ready` plus every image's load/error event. Use a maintained DOM-to-canvas dependency with canvas dimensions derived from the rendered element; apply export CSS that constrains images and tables to width. Delete `parseMarkdownLines`, `parseInlineMarkdown`, and the manual `[图片 N]` canvas renderer from ShareModal.

- [ ] **Step 5: Implement native PDF layout and save command**

Add `printpdf = { version = "0.9", features = ["png", "jpeg"] }` and the minimal image decoding feature set. Embed the redistributable Noto Sans SC font asset and subset it on save. Translate ExportDocument blocks into PDF text, rules, table cells, link-styled text, code backgrounds, todos, and image XObjects. Calculate all placements before serialization, select A4 portrait or landscape once, and paginate rows/lines/blocks without clipping. Write bytes atomically to the selected path.

- [ ] **Step 6: Wire direct PDF save and feedback**

Replace `window.open`/print instructions with a Tauri `.pdf` save dialog and `exportPdf` IPC call. Canceled saves return silently; success reports the chosen file; PDF failures include the generation stage. Keep copy-as-HTML behavior unchanged.

- [ ] **Step 7: Run focused and regression checks**

Run: `npm test -- src/components/ExportPreview.test.tsx src/lib/exportDocument.test.ts`

Expected: PASS.

Run: `powershell -ExecutionPolicy Bypass -File scripts/verify-rust.ps1`

Expected: orientation, fit, and pagination tests PASS.

Run: `npm run lint && npm run build`

Expected: PASS without warnings promoted to errors.

- [ ] **Step 8: Commit Task 4**

```powershell
git add package.json package-lock.json src/components/ExportPreview.tsx src/components/ExportPreview.test.tsx src/lib/exportImage.ts src/components/ShareModal.tsx src-tauri/src/export_pdf.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/assets/fonts/NotoSansSC-Regular.ttf src/lib/tauri.ts
git commit -m "feat: add faithful image and direct pdf exports"
```

---

### Task 5: Enforce one desktop instance and one tray icon

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/src/lib.rs`
- Modify: `scripts/verify-app.mjs`

**Interfaces:**
- Produces: `focus_main_window(app: &tauri::AppHandle) -> Result<(), String>` used by the single-instance callback and testable through a thin window abstraction.

- [ ] **Step 1: Add a failing lifecycle unit test**

Extract a small `WindowActions` trait and test `activate_window` with a fake recording calls. Assert the order is `unminimize`, `show`, `set_focus`, and that a failed `unminimize` does not prevent `show`/`set_focus` attempts.

- [ ] **Step 2: Run the test and verify RED**

Run: `powershell -ExecutionPolicy Bypass -File scripts/verify-rust.ps1`

Expected: FAIL because the activation helper does not exist.

- [ ] **Step 3: Install and initialize the official single-instance plugin**

Add the desktop-target dependency `tauri-plugin-single-instance = "2"`. Initialize it before shell/dialog plugins and before `.setup()`. Its callback unminimizes, shows, and focuses `main`; it must not initialize a second database, scheduler, or tray. Keep the TrayIcon handle alive through Tauri's managed lifecycle rather than creating another icon on activation.

- [ ] **Step 4: Extend GUI verification for duplicate startup**

Add a packaged-app-only verification path that launches the EXE twice, records the DayNotes process count, and checks it remains one after the callback interval. Keep existing browser-based development verification unchanged when no packaged EXE is supplied.

- [ ] **Step 5: Run Rust and GUI verification**

Run: `powershell -ExecutionPolicy Bypass -File scripts/verify-rust.ps1`

Expected: lifecycle test PASS.

Run: `npm run verify:gui`

Expected: existing GUI checks PASS; packaged duplicate-instance check runs when its EXE environment variable is present.

- [ ] **Step 6: Commit Task 5**

```powershell
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs scripts/verify-app.mjs
git commit -m "fix: enforce a single tray instance"
```

---

### Task 6: Add real SMTP test mail with safe Chinese diagnostics

**Files:**
- Create: `src/lib/emailValidation.ts`
- Create: `src/lib/emailValidation.test.ts`
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/lib/tauri.ts`
- Create: `src-tauri/src/email.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces frontend: `validateEmailSettings(settings: EmailSettings): string[]`.
- Produces IPC wrapper: `testEmailSettings(settings: EmailSettings): Promise<string>`.
- Produces Rust command: `test_email_settings(settings: EmailSettings) -> Result<String, String>`.
- Produces Rust: `classify_smtp_error(message: &str) -> EmailErrorKind` and `safe_email_error(kind, message) -> String`.

- [ ] **Step 1: Write failing frontend validation tests**

Assert valid QQ settings yield no errors; empty host, port 0/65536, invalid sender/recipient, and empty authorization code yield specific Chinese messages. Assert `enabled: false` does not invalidate testing.

- [ ] **Step 2: Write failing Rust safety and classification tests**

Test representative server messages for authentication, timeout, TLS, connection, and recipient rejection. Pass a sentinel authorization code such as `SECRET-DO-NOT-LEAK` and assert no public error string contains it. Test the generated subject equals `【DayNotes】邮箱配置测试` and body contains a local timestamp.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- src/lib/emailValidation.test.ts`

Expected: FAIL because validation is missing.

Run: `powershell -ExecutionPolicy Bypass -File scripts/verify-rust.ps1`

Expected: FAIL because classification and test-mail composition are missing.

- [ ] **Step 4: Extract SMTP service and add the test command**

Move reusable SMTP construction from `lib.rs` into `email.rs`. Keep daily email behavior, add a test composition path using the supplied unsaved settings, and map errors to actionable Chinese categories without secrets. Do not require `settings.enabled` for test mail.

- [ ] **Step 5: Add SettingsModal's test workflow**

Add local `testingEmail` state and a secondary `发送测试邮件` button. Validate first, then call the command with current form values. Disable during the request and show success/failure inline or through a new `onToast` prop. Saving settings remains a separate explicit action.

- [ ] **Step 6: Run focused and full verification**

Run: `npm test -- src/lib/emailValidation.test.ts`

Expected: PASS.

Run: `powershell -ExecutionPolicy Bypass -File scripts/verify-rust.ps1`

Expected: PASS.

Run: `npm run lint && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```powershell
git add src/lib/emailValidation.ts src/lib/emailValidation.test.ts src/components/SettingsModal.tsx src/lib/tauri.ts src-tauri/src/email.rs src-tauri/src/lib.rs
git commit -m "feat: send smtp configuration test mail"
```

---

### Task 7: Run integrated acceptance verification and document manual checks

**Files:**
- Modify: `README.md`
- Create: `docs/verification/2026-07-11-sharing-and-email.md`

**Interfaces:**
- Consumes all outputs from Tasks 1–6.
- Produces a reproducible Windows acceptance checklist and records tested build paths without credentials.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: all Vitest suites PASS.

Run: `npm run lint`

Expected: no ESLint errors.

Run: `npm run build`

Expected: TypeScript and production Vite build PASS.

Run: `powershell -ExecutionPolicy Bypass -File scripts/verify-rust.ps1`

Expected: all Rust tests and checks PASS under MSVC.

Run: `npm run verify:gui`

Expected: GUI verification PASS.

- [ ] **Step 2: Build and manually verify the packaged Windows app**

Run: `.\dev.ps1` for interactive checks, then `npx tauri build` for the packaged EXE. Verify 1×1, 3×5, and 20×20 tables; selected/empty/local-file links; Markdown ZIP extraction with images; long-image preview parity; portrait and landscape multi-page PDFs; duplicate EXE startup; valid SMTP test receipt; and invalid-code Chinese diagnostics.

- [ ] **Step 3: Record evidence and user instructions**

Document exact artifact paths, sample contents, pass/fail results, and SMTP provider setup instructions without including mailbox addresses or authorization codes. Update README with the ZIP structure, direct PDF behavior, single-instance behavior, and how to send a test email.

- [ ] **Step 4: Re-run diff and regression checks**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only intended Task 7 documentation changes remain unstaged before commit; unrelated pre-existing untracked files remain untouched.

- [ ] **Step 5: Commit Task 7**

```powershell
git add README.md docs/verification/2026-07-11-sharing-and-email.md
git commit -m "docs: add export and email verification guide"
```
