# DayNotes Frontend Architecture and Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变用户行为、存储格式或 Tauri IPC 的前提下，拆分前端核心职责，并将入口 JavaScript 块降低到 500 KB 以下。

**Architecture:** `useNoteSession` 成为笔记加载、编辑状态、日期切换和自动保存的唯一所有者；`Editor` 继续拥有 Tiptap 生命周期，但将工具栏和图片读取交给独立模块；分享与设置通过可恢复的懒加载边界按需载入。Vite 按 React、Tiptap 和 lowlight 的真实依赖边界分块。

**Tech Stack:** React 19、TypeScript 5、Tiptap 3、Vite 6、Vitest、Testing Library、Tauri 2、Rust

## Global Constraints

- 不引入 Zustand、Redux 或新的运行时状态管理依赖。
- 不修改 SQLite 表结构、已有用户数据、Tauri 命令名称、参数或返回值。
- 日期继续使用 `YYYY-MM-DD`，正文继续保存 HTML，待办继续保存 JSON。
- 自动保存防抖保持 2 秒，`Ctrl+S`、日期切换和卸载前保存行为保持不变。
- Markdown、HTML、PDF、图片和 ZIP 分享语义及中文 UI 文案保持兼容。
- 图片上限保持 10 MB。
- 每个任务结束时只提交该任务涉及的文件，不提交 `.claude/`、`AGENTS.md`、`CLAUDE.md` 或工作报告。

---

## File Structure

### New files

- `src/hooks/useNoteSession.ts`：笔记会话、自动保存和日期切换。
- `src/hooks/useNoteSession.test.tsx`：会话时序和失败恢复测试。
- `src/components/editor/imageFiles.ts`：图片校验与 `FileReader` Promise 封装。
- `src/components/editor/imageFiles.test.ts`：图片辅助函数测试。
- `src/components/editor/CodeLanguagePicker.tsx`：代码语言菜单。
- `src/components/editor/ImageInsertPopover.tsx`：图片插入菜单与文件输入。
- `src/components/editor/EditorToolbar.tsx`：全部编辑命令和浮层编排。
- `src/components/LazyModalBoundary.tsx`：懒加载等待和错误恢复边界。
- `src/components/LazyModalBoundary.test.tsx`：等待、成功与失败测试。

### Modified files

- `src/App.tsx`：消费 `useNoteSession`，懒加载分享和设置。
- `src/components/Editor.tsx`：只保留 Tiptap 配置、内容同步和编辑区。
- `src/components/ShareModal.tsx`：增加默认导出。
- `src/components/SettingsModal.tsx`：增加默认导出。
- `vite.config.ts`：供应商代码分块。

---

### Task 1: Extract and test the note session

**Files:**
- Create: `src/hooks/useNoteSession.ts`
- Create: `src/hooks/useNoteSession.test.tsx`
- Reuse: `src/lib/latestRequest.ts`
- Reuse: `src/lib/tauri.ts`

**Interfaces:**
- Consumes: `api.getNote(date)`, `api.getNotesDates()`, `api.saveNote(date, content, todos)` and `createLatestRequestGuard()`.
- Produces:

```ts
export interface UseNoteSessionOptions {
  initialDate: string;
  onError: (message: string) => void;
  saveDelay?: number;
}

export interface NoteSession {
  currentDate: string;
  content: string;
  todos: TodoItem[];
  noteDates: Set<string>;
  dirty: boolean;
  setContent: (content: string) => void;
  setTodos: (todos: TodoItem[]) => void;
  changeDate: (date: string) => Promise<void>;
  saveNow: () => Promise<boolean>;
}

export function useNoteSession(options: UseNoteSessionOptions): NoteSession;
```

- [ ] **Step 1: Write failing load and stale-request tests**

Mock `../lib/tauri` with `vi.mock`, render the hook with `saveDelay: 20`, and assert that a later date response wins even when the earlier request resolves last:

```tsx
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

it("keeps the newest date when an older request resolves last", async () => {
  const first = deferred<Note | null>();
  const second = deferred<Note | null>();
  vi.mocked(api.getNote)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  vi.mocked(api.getNotesDates).mockResolvedValue([]);

  const { result } = renderHook(() => useNoteSession({
    initialDate: "2026-07-11",
    onError: vi.fn(),
    saveDelay: 20,
  }));
  await act(() => result.current.changeDate("2026-07-12"));
  second.resolve(note("2026-07-12", "<p>new</p>"));
  await waitFor(() => expect(result.current.content).toBe("<p>new</p>"));
  first.resolve(note("2026-07-11", "<p>old</p>"));
  await act(async () => Promise.resolve());
  expect(result.current.currentDate).toBe("2026-07-12");
  expect(result.current.content).toBe("<p>new</p>");
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/hooks/useNoteSession.test.tsx`

Expected: FAIL because `useNoteSession.ts` does not exist.

- [ ] **Step 3: Implement loading, refs and latest-request protection**

Implement state for `currentDate`, `content`, `todos`, `noteDates`, and `dirty`; synchronize refs during render; load note dates once; load the current note in an effect using `createLatestRequestGuard`; on current-request failure call `onError("加载笔记失败")` without clearing the previous visible document.

The load success path must use:

```ts
setContent(loaded?.content ?? "");
setTodos(parseTodos(loaded?.todos ?? "[]"));
dirtyRef.current = false;
setDirty(false);
```

- [ ] **Step 4: Add failing save lifecycle tests**

Add tests that assert:

```tsx
it("debounces edits and saves the latest snapshot", async () => {
  vi.useFakeTimers();
  // load, call setContent twice, advance 1999 ms: no save; advance 1 ms: one save with latest HTML
});

it("keeps dirty state after a failed save and retries", async () => {
  // first saveNote rejects, second resolves; expect onError("保存失败") and dirty true after first
});

it("saves the previous date before loading the next date", async () => {
  // edit 07-11, changeDate 07-12, assert saveNote(07-11, ...) occurs before getNote(07-12)
});

it("flushes dirty content on unmount", async () => {
  // edit, unmount, expect saveNote with the latest snapshot
});
```

- [ ] **Step 5: Implement save lifecycle**

Use one timer ref and a `saveSnapshot` function. `saveNow()` returns `true` only after `saveNote` succeeds. Clear dirty only when date, HTML and serialized todos still equal the saved snapshot. On failure retain dirty and call `onError("保存失败")`. After success refresh `noteDates`. `changeDate` clears the timer, awaits saving the previous dirty snapshot, then changes the date. The cleanup effect flushes a dirty snapshot without updating state after unmount.

- [ ] **Step 6: Run tests, lint and commit**

Run:

```powershell
npm test -- src/hooks/useNoteSession.test.tsx
npm run lint
```

Expected: all focused tests PASS and ESLint exits 0.

Commit:

```powershell
git add src/hooks/useNoteSession.ts src/hooks/useNoteSession.test.tsx
git commit -m "refactor: 提取笔记会话与自动保存"
```

---

### Task 2: Integrate the note session into App

**Files:**
- Modify: `src/App.tsx`
- Test: `src/hooks/useNoteSession.test.tsx`

**Interfaces:**
- Consumes: `useNoteSession({ initialDate, onError })` from Task 1.
- Produces: `App` with unchanged `DateHeader`, `Editor`, `TodoPanel`, sharing and settings props.

- [ ] **Step 1: Replace local note state and persistence functions**

Remove `Note`, `parseTodos`, `createLatestRequestGuard`, note refs, save timer, `loadNote`, `loadNoteDates`, `doSave`, `doSaveNow`, `scheduleSave`, and local date/content/todos/dirty state. Add:

```tsx
const showToastRef = useRef<(message: string) => void>(() => undefined);
const session = useNoteSession({
  initialDate: getToday(),
  onError: (message) => showToastRef.current(message),
});
const { currentDate, content, todos, noteDates } = session;
```

After declaring `showToast`, synchronize `showToastRef.current = showToast`. Navigation handlers call `void session.changeDate(...)`; editor and todo callbacks call `session.setContent` and `session.setTodos`.

- [ ] **Step 2: Preserve keyboard behavior**

The keydown effect must call session APIs:

```tsx
if (e.ctrlKey && e.key.toLowerCase() === "s") {
  e.preventDefault();
  void session.saveNow().then((saved) => {
    if (saved) showToast("已保存");
  });
}
```

Arrow navigation derives dates from `session.currentDate`. Keep callback dependencies explicit instead of disabling `react-hooks/exhaustive-deps`.

- [ ] **Step 3: Run regression checks**

Run:

```powershell
npm test
npm run lint
npm run build
```

Expected: 8 or more test files pass, lint exits 0, production build succeeds.

- [ ] **Step 4: Commit**

```powershell
git add src/App.tsx
git commit -m "refactor: 由笔记会话驱动应用状态"
```

---

### Task 3: Extract image file handling

**Files:**
- Create: `src/components/editor/imageFiles.ts`
- Create: `src/components/editor/imageFiles.test.ts`
- Modify: `src/components/Editor.tsx`

**Interfaces:**
- Produces:

```ts
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export type ImageFileError = "not-image" | "too-large" | "read-failed";
export function validateImageFile(file: File): ImageFileError | null;
export function readImageAsDataUrl(file: File): Promise<string>;
```

- [ ] **Step 1: Write failing helper tests**

Test a `text/plain` file returns `not-image`, an image larger than `MAX_IMAGE_BYTES` returns `too-large`, a normal PNG returns null, `FileReader.onload` resolves its string, and `FileReader.onerror` rejects with `read-failed`.

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/components/editor/imageFiles.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement minimal helpers**

```ts
export function validateImageFile(file: File): ImageFileError | null {
  if (!file.type.startsWith("image/")) return "not-image";
  if (file.size > MAX_IMAGE_BYTES) return "too-large";
  return null;
}

export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("read-failed"));
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 4: Replace Editor FileReader duplication**

Use the helper for file input, paste and sequential drop. Preserve order for multiple dropped images. Oversized paste/drop images remain skipped; oversized file-picker images continue showing the existing Chinese alert.

- [ ] **Step 5: Run and commit**

Run `npm test -- src/components/editor/imageFiles.test.ts && npm run lint` in a shell that supports `&&`, or run the two commands separately in PowerShell.

Commit:

```powershell
git add src/components/editor/imageFiles.ts src/components/editor/imageFiles.test.ts src/components/Editor.tsx
git commit -m "refactor: 统一编辑器图片读取与校验"
```

---

### Task 4: Split the editor toolbar and popovers

**Files:**
- Create: `src/components/editor/CodeLanguagePicker.tsx`
- Create: `src/components/editor/ImageInsertPopover.tsx`
- Create: `src/components/editor/EditorToolbar.tsx`
- Modify: `src/components/Editor.tsx`
- Modify: `src/components/TablePicker.test.tsx`
- Test: `src/components/LinkEditor.test.tsx`

**Interfaces:**
- `CodeLanguagePicker` consumes `editor: Editor` and `onClose: () => void`.
- `ImageInsertPopover` consumes `editor: Editor`, `open: boolean`, `onOpenChange: (open: boolean) => void`.
- `EditorToolbar` consumes `editor: Editor` and owns all toolbar/popover visibility.

- [ ] **Step 1: Add behavioral assertions before moving JSX**

Extend existing component tests to assert table selection still calls `insertTable({ rows, cols, withHeaderRow: true })`, valid link submission applies a link, and Escape/outside-click closes the active popover. Run the tests and confirm the new outside-click assertion fails before extraction if the test fixture exposes the gap.

- [ ] **Step 2: Create CodeLanguagePicker**

Move the existing 17-language list and language dropdown into `CodeLanguagePicker`. Selecting a language must update an active code block or create one:

```ts
const chain = editor.chain().focus();
if (editor.isActive("codeBlock")) {
  chain.updateAttributes("codeBlock", { language }).run();
} else {
  chain.setCodeBlock({ language }).run();
}
onClose();
```

- [ ] **Step 3: Create ImageInsertPopover**

Move the hidden file input, local-file trigger, URL prompt, size alert and `readImageAsDataUrl` call into the component. Clear the input value after both success and validation failure so selecting the same file again works.

- [ ] **Step 4: Create EditorToolbar**

Move the complete current toolbar JSX and popover state into `EditorToolbar`. Keep these groups and commands unchanged: inline formatting, headings, lists, quote, horizontal rule, code language, links, images, table insertion and table row/column actions, undo and redo. Use one document `mousedown` listener to close popovers, while ignoring clicks inside the active popover refs.

- [ ] **Step 5: Reduce Editor to lifecycle ownership**

`Editor.tsx` retains only extension configuration, paste/drop handlers, `useEditor`, parent-content synchronization, loading state, `<EditorToolbar editor={editor} />`, `<EditorContent editor={editor} />`, and editor content styles. Remove toolbar state and helper commands from this file.

- [ ] **Step 6: Run UI-related tests and build**

Run:

```powershell
npm test -- src/components/LinkEditor.test.tsx src/components/TablePicker.test.tsx src/components/editor/imageFiles.test.ts
npm run lint
npm run build
```

Expected: tests PASS, lint exits 0, build succeeds, and `Editor.tsx` is materially smaller than 825 lines.

- [ ] **Step 7: Commit**

```powershell
git add src/components/Editor.tsx src/components/editor src/components/LinkEditor.test.tsx src/components/TablePicker.test.tsx
git commit -m "refactor: 拆分编辑器工具栏与辅助交互"
```

---

### Task 5: Lazy-load modal features with recovery

**Files:**
- Create: `src/components/LazyModalBoundary.tsx`
- Create: `src/components/LazyModalBoundary.test.tsx`
- Modify: `src/components/ShareModal.tsx`
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces:

```tsx
interface LazyModalBoundaryProps {
  children: ReactNode;
  onClose: () => void;
  retryKey: number;
}
```

- [ ] **Step 1: Write boundary tests**

Test that `Suspense` displays `正在加载…`, a resolved lazy child renders normally, and a throwing child displays `功能加载失败` with `重试` and `关闭` buttons. Clicking close must call `onClose`; changing `retryKey` must reset the captured error.

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/components/LazyModalBoundary.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the recoverable boundary**

Use a small class error boundary because React render errors cannot be caught by hooks. Render the existing modal-overlay visual shell, Chinese error text, retry and close buttons. Wrap its children in `<Suspense fallback={<div role="status">正在加载…</div>}>`.

- [ ] **Step 4: Add default exports and dynamic imports**

Append default exports without removing named exports:

```ts
export default ShareModal;
```

and:

```ts
export default SettingsModal;
```

In `App.tsx` replace static imports with:

```ts
const LazyShareModal = lazy(() => import("./components/ShareModal"));
const LazySettingsModal = lazy(() => import("./components/SettingsModal"));
```

Wrap each open modal in its own `LazyModalBoundary`. Maintain separate retry counters so failure in one modal does not remount the other.

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npm test
npm run lint
npm run build
```

Expected: all tests PASS; build output contains distinct ShareModal and SettingsModal chunks.

Commit:

```powershell
git add src/App.tsx src/components/LazyModalBoundary.tsx src/components/LazyModalBoundary.test.tsx src/components/ShareModal.tsx src/components/SettingsModal.tsx
git commit -m "perf: 按需加载分享与设置功能"
```

---

### Task 6: Configure vendor chunks and enforce the size target

**Files:**
- Modify: `vite.config.ts`
- Create: `scripts/verify-bundle-size.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `npm run verify:bundle`, which exits non-zero if an entry JavaScript asset exceeds 500 KB or lazy modal chunks are absent.

- [ ] **Step 1: Create a failing bundle verifier**

The script reads `dist/.vite/manifest.json`, locates `index.html`'s entry asset, checks its file size is below `500 * 1024`, and asserts manifest keys include dynamic imports for both modal modules. Print asset names and byte sizes on success; print the violated threshold on failure.

Add:

```json
"verify:bundle": "npm run build && node scripts/verify-bundle-size.mjs"
```

Run `npm run verify:bundle` before configuring chunks. Expected: FAIL because the current entry asset is about 904 KB or because manifest generation is not enabled.

- [ ] **Step 2: Enable the manifest and configure manual chunks**

Update `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@tiptap") || id.includes("prosemirror")) return "vendor-editor";
          if (id.includes("lowlight") || id.includes("highlight.js")) return "vendor-highlight";
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id.replaceAll("\\", "/"))) {
            return "vendor-react";
          }
          return "vendor";
        },
      },
    },
  },
});
```

The Tiptap condition must remain before the React condition because `@tiptap/react` belongs to the editor dependency graph. If Rollup reports a circular-chunk warning, adjust the dependency boundary based on the reported module graph; do not silence the warning.

- [ ] **Step 3: Run the bundle gate**

Run: `npm run verify:bundle`

Expected: PASS; entry JavaScript is below 500 KB; ShareModal and SettingsModal are dynamic chunks; Vite emits no over-500-KB warning for the entry chunk.

- [ ] **Step 4: Add the gate to complete verification**

Insert `npm run verify:bundle` into `verify` after lint and before UI verification. Do not remove any existing verification command.

- [ ] **Step 5: Commit**

```powershell
git add vite.config.ts scripts/verify-bundle-size.mjs package.json
git commit -m "perf: 拆分前端依赖并限制入口体积"
```

---

### Task 7: Full regression and production verification

**Files:**
- Update generated evidence only: `verify-output/`
- No source changes unless a verification failure reveals a regression.

**Interfaces:**
- Consumes all deliverables from Tasks 1–6.
- Produces fresh automated results, UI/share evidence and Windows release artifacts.

- [ ] **Step 1: Run all frontend checks**

```powershell
npm test
npm run lint
npm run verify:bundle
```

Expected: all test files pass, ESLint exits 0, entry asset is below 500 KB.

- [ ] **Step 2: Run complete UI and sharing verification**

```powershell
npm run verify:complete-ui
npm run verify:evidence
```

Expected: every editor button and every Markdown, HTML, PDF, image and ZIP strategy passes; refreshed evidence is present under `verify-output/`.

- [ ] **Step 3: Run Rust regression tests**

```powershell
npm run verify:rust
```

Expected: 12 or more Rust tests pass with 0 failures.

- [ ] **Step 4: Build the complete Windows application**

In an MSVC-configured PowerShell run:

```powershell
npm run tauri:build
```

Expected outputs:

```text
src-tauri/target/release/daynotes.exe
src-tauri/target/release/bundle/nsis/DayNotes_0.1.0_x64-setup.exe
src-tauri/target/release/bundle/msi/DayNotes_0.1.0_x64_zh-CN.msi
```

- [ ] **Step 5: Inspect final scope**

Run:

```powershell
git status --short
git log --oneline -8
```

Expected: only intentionally ignored/generated evidence and the pre-existing local collaboration files remain untracked; each implementation task has its own commit.

- [ ] **Step 6: Record the phase completion**

If source fixes were required during full verification, commit only those fixes with a focused message. Otherwise do not create an empty commit. Report test counts, entry chunk size, UI/share results, Rust results and artifact paths.

---

## Plan Self-Review

- Spec coverage: note session, editor boundaries, modal lazy loading, Vite chunking, error recovery, tests, UI/share evidence, Rust and Tauri build are each assigned to a task.
- Scope: UI redesign, database migration, credential storage, image resource migration, CI and signing remain excluded.
- Type consistency: `UseNoteSessionOptions`, `NoteSession`, image helper types and modal boundary props are defined once and consumed under the same names.
- Compatibility: IPC, SQLite, date format, HTML/JSON persistence, 2-second save delay and all sharing strategies remain unchanged.
- Placeholder scan: the plan contains no TBD, TODO or unspecified implementation step.
