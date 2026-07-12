# Complete Editor and Share Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed asynchronous/PDF metadata defects and produce repeatable evidence for every editor button and sharing strategy under `verify-output/`.

**Architecture:** A small latest-request guard prevents stale note loads from mutating React state. Rust reads the rendered PDF with `lopdf` to report real page counts. A Playwright verification runner injects controlled Tauri, clipboard, dialog, and image-export adapters, executes an explicit UI matrix, and persists all results.

**Tech Stack:** React 19, TypeScript, Vitest, Playwright, Tauri 2, Rust, genpdf, lopdf

## Global Constraints

- Work in the current `master` checkout with the user's explicit permission.
- Preserve unrelated dirty-worktree changes.
- Save every verification result beneath `verify-output/`.
- Compile Rust with the MSVC environment from `scripts/verify-rust.ps1`.
- Use simplified Chinese for user-visible text.

---

### Task 1: Prevent stale note loads

**Files:**
- Create: `src/lib/latestRequest.ts`
- Create: `src/lib/latestRequest.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `createLatestRequestGuard(): { begin(): number; isLatest(token: number): boolean }`
- Consumes: the guard in `App.loadNote` before mutating state

- [ ] **Step 1: Write the failing guard test**

Test that token 1 becomes stale after token 2 begins and only token 2 remains latest.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/lib/latestRequest.test.ts`

Expected: FAIL because `latestRequest.ts` does not exist.

- [ ] **Step 3: Implement and wire the guard**

Implement a monotonic counter, remove the duplicate initial `loadNote(currentDate)`, begin a token inside the date-driven effect, and ignore stale success/error results.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/lib/latestRequest.test.ts`

Expected: PASS.

### Task 2: Return real PDF page counts

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/export_pdf.rs`

**Interfaces:**
- Produces: `pdf_page_count(path: &Path) -> Result<usize, String>`
- Consumes: the generated target PDF after `render_to_file`

- [ ] **Step 1: Write a failing Rust test**

Create a two-page in-memory `lopdf::Document`, save it to a temporary file, and assert `pdf_page_count` returns `2`.

- [ ] **Step 2: Verify RED**

Run: `powershell -ExecutionPolicy Bypass -File scripts/verify-rust.ps1`

Expected: FAIL because `pdf_page_count` is not defined.

- [ ] **Step 3: Implement page counting**

Load the rendered file with `lopdf::Document::load`, return `get_pages().len()`, and use that value in `PdfExportResult`.

- [ ] **Step 4: Verify GREEN**

Run the Rust verification script and expect all tests to pass.

### Task 3: Add the complete UI verification matrix

**Files:**
- Create: `scripts/verify-complete-ui.mjs`
- Modify: `package.json`
- Create at runtime: `verify-output/editor-matrix.json`
- Create at runtime: `verify-output/share-matrix.json`
- Create at runtime: `verify-output/summary.json`
- Create at runtime: `verify-output/report.md`

**Interfaces:**
- Consumes: Vite page at `http://127.0.0.1:5173/`
- Produces: `npm run verify:complete-ui`

- [ ] **Step 1: Define explicit editor/share matrices**

List every toolbar title and every share option as named checks. Inject Tauri invokes, dialog paths, clipboard capture, and a deterministic `html-to-image` browser surface.

- [ ] **Step 2: Run the matrix and capture initial failures**

Run: `npm run verify:complete-ui`

Expected: non-zero until every listed action has a valid observable assertion.

- [ ] **Step 3: Complete all interaction assertions**

For marks/headings/lists/quote/code/link/image/table/undo/redo, assert editor HTML or popup/table state. For Markdown, clipboard, PDF, PNG, and cancel, assert the exact captured backend/clipboard effects.

- [ ] **Step 4: Persist screenshots, logs, artifacts, and report**

Write matrix JSON, annotated state screenshots, sample Markdown/PDF/PNG artifacts, and a Markdown report without deleting unrelated files already in `verify-output/`.

- [ ] **Step 5: Verify GREEN**

Run `npm run verify:complete-ui` and expect all editor and share checks to pass.

### Task 4: Full verification and independent browser evidence

**Files:**
- Create at runtime: `verify-output/logs/frontend-tests.txt`
- Create at runtime: `verify-output/logs/lint.txt`
- Create at runtime: `verify-output/logs/build.txt`
- Create at runtime: `verify-output/logs/rust-tests.txt`
- Create at runtime: `verify-output/logs/agent-browser-console.txt`
- Create at runtime: `verify-output/logs/agent-browser-errors.txt`

**Interfaces:**
- Consumes: project verification scripts and agent-browser session `daynotes-verify`
- Produces: final reproducible evidence bundle

- [ ] **Step 1: Run frontend tests, lint, build, and Rust tests with tee-style capture**

Execute each command independently and preserve its full stdout/stderr in the named log file.

- [ ] **Step 2: Use agent-browser for visual QA**

Open the Vite page, capture the initial editor and share modal, save console/errors, and close the named session.

- [ ] **Step 3: Validate evidence completeness**

Confirm every expected matrix name, screenshot, log, and artifact exists and has non-zero size.

- [ ] **Step 4: Run final verification gate**

Re-run `npm test`, `npm run lint`, `npm run build`, the Rust verification script, and `npm run verify:complete-ui`; only report success when all exit codes are zero.
