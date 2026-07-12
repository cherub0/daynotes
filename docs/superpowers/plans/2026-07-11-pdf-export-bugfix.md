# PDF Export Bugfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore direct `.pdf` export from the share modal and verify the project for adjacent defects.

**Architecture:** Keep the existing `ExportDocument` model as the frontend/backend boundary. The share modal selects the target path and loads image bytes; the registered Rust `export_pdf` command renders and writes the PDF.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri 2, Rust, genpdf

## Global Constraints

- Preserve unrelated user changes in the dirty worktree.
- Use simplified Chinese for user-visible text.
- Compile Rust with the MSVC toolchain configured by `scripts/verify-rust.ps1`.

---

### Task 1: Restore direct PDF export

**Files:**
- Modify: `src/components/ShareModal.tsx`
- Test: `src/components/ShareModal.test.tsx`

**Interfaces:**
- Consumes: `exportPdf(path, document, images)` from `src/lib/tauri.ts`
- Produces: a saved `.pdf` selected through the Tauri save dialog

- [x] **Step 1: Write a failing component test**

Render `ShareModal`, click `导出为 PDF`, and assert that the dialog requests a PDF path and `exportPdf` receives the parsed document.

- [x] **Step 2: Run the test and verify the failure**

Run: `npm test -- src/components/ShareModal.test.tsx`

Expected: FAIL because the HTML/browser workaround never calls `exportPdf`.

- [x] **Step 3: Restore the native exporter call**

Select `DayNotes-YYYY-MM-DD.pdf`, load available image bytes without browser-side bitmap decoding, and invoke `exportPdf`.

- [x] **Step 4: Run the focused test**

Run: `npm test -- src/components/ShareModal.test.tsx`

Expected: PASS.

### Task 2: Verify and review

**Files:**
- Inspect: `src/App.tsx`
- Inspect: `src-tauri/src/export_pdf.rs`
- Inspect: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: project scripts in `package.json`
- Produces: verification evidence and a concise list of remaining risks

- [x] **Step 1: Run all frontend tests**

Run: `npm test`

- [x] **Step 2: Run lint and production build**

Run: `npm run lint` and `npm run build`

- [x] **Step 3: Run Rust verification**

Run: `powershell -ExecutionPolicy Bypass -File scripts/verify-rust.ps1`

- [x] **Step 4: Review asynchronous note loading and native export metadata**

Report reproducible or code-evidenced findings without changing unrelated behavior.
