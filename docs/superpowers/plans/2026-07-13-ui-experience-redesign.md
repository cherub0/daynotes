# DayNotes UI Experience Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the complete DayNotes interface as the approved warm paper/deep navy experience while preserving every existing note, todo, export, email, storage, and keyboard behavior.

**Architecture:** Add a small semantic-token and UI-primitive layer without a runtime component framework, then migrate one feature boundary at a time. `useNoteSession` remains the only owner of persistence timing, `Editor` remains the Tiptap lifecycle owner, and feature components retain their business logic while consuming shared visual and accessibility primitives.

**Tech Stack:** React 19, TypeScript 5.8, Tiptap 3, CSS custom properties, Vitest, Testing Library, Playwright, Tauri 2, Rust/MSVC

## Global Constraints

- Do not add a runtime UI framework or any network-loaded font, image, icon, or animation.
- Do not change Tauri IPC command names, parameters, or response values.
- Do not change SQLite data, note HTML, todo JSON, export formats, SMTP behavior, or existing keyboard shortcuts.
- Keep the 2-second save debounce and the existing save-before-navigation data-loss protection.
- UI text remains Simplified Chinese and dates remain `YYYY-MM-DD` at storage and IPC boundaries.
- Light theme is **晨光纸页**; dark theme is **深蓝夜幕**.
- Main layout is **纵向纸页**; the todo panel follows the editor at the same content width.
- Toolbar uses semantic groups; every existing command remains reachable.
- Support full spacing at 1024 px and above, compact controls from 720–1023 px, and safe single-column degradation below 720 px.
- Target WCAG AA contrast, visible `:focus-visible` rings, keyboard-complete menus/dialogs/calendar, and deterministic focus return.
- Routine motion stays between 120–200 ms and respects `prefers-reduced-motion: reduce`.
- Do not include todo drag-and-drop, database migration, SMTP secure storage, image resource migration, CI, releases, signing, or updates in this phase.
- Each task commits only its listed files; do not add `.claude/`, `AGENTS.md`, `CLAUDE.md`, work reports, or `.superpowers/brainstorm/`.

---

## File Structure

### New files

- `src/components/ui/Button.tsx`: `Button` and `IconButton` primitives.
- `src/components/ui/Surface.tsx`: semantic paper/raised/inset containers.
- `src/components/ui/StatusBadge.tsx`: saved, dirty, saving, warning, and error states.
- `src/components/ui/SegmentedControl.tsx`: accessible single-choice setting control.
- `src/components/ui/MenuPopover.tsx`: anchored menu with Escape, outside-click, and focus return.
- `src/components/ui/ModalShell.tsx`: accessible dialog shell with focus containment and restoration.
- `src/components/ui/focus.ts`: shared focusable-element and focus-loop helpers.
- `src/components/ui/ui.css`: primitive styling using semantic tokens only.
- `src/components/ui/primitives.test.tsx`: base visual primitive contracts.
- `src/components/ui/overlays.test.tsx`: menu and modal keyboard/focus behavior.
- `src/components/SaveStatus.tsx`: note save/load state presentation and retry actions.
- `src/components/SaveStatus.test.tsx`: Chinese labels and retry behavior.
- `src/components/Toast.tsx`: accessible typed toast surface.
- `src/components/CalendarPicker.test.tsx`: calendar keyboard and selection behavior.
- `src/components/TodoPanel.test.tsx`: todo interaction and progress behavior.
- `src/components/DateHeader.test.tsx`: header navigation, load retry, and calendar focus return.
- `src/components/SettingsModal.test.tsx`: settings dialog semantics, theme selection, and existing save payload.

### Modified files

- `src/index.css`: semantic light/dark tokens, global focus, form, scrollbar, and reduced-motion rules.
- `src/main.tsx`: import `ui.css` once.
- `src/hooks/useNoteSession.ts`: expose `saveStatus`, `loadStatus`, and `retryLoad` from the existing lifecycle.
- `src/hooks/useNoteSession.test.tsx`: status transitions, retry, and concurrency coverage.
- `src/App.tsx`: consume session status, use the centered layout, typed toasts, and shared feature shells.
- `src/App.css`: approved full-window layout, responsive rules, feature surface styles, and removal of superseded side-column/modal rules.
- `src/components/DateHeader.tsx`: app header, editorial date heading, load error, and accessible calendar trigger.
- `src/components/Editor.tsx`: accept save-state props and apply the paper surface.
- `src/components/editor/EditorToolbar.tsx`: semantic groups and `插入内容` menu.
- `src/components/TablePicker.test.tsx`: open table actions through the insert menu.
- `src/components/LinkEditor.test.tsx`: focus return through the new menu shell.
- `src/components/CalendarPicker.tsx`: grid semantics and keyboard navigation.
- `src/components/TodoPanel.tsx`: centered companion surface and accessible controls.
- `src/components/ShareModal.tsx`: consume `ModalShell`, `Button`, and shared option styles.
- `src/components/SettingsModal.tsx`: consume `ModalShell`, buttons, status, and `SegmentedControl`.
- `src/components/LazyModalBoundary.tsx`: shared loading/error modal presentation.
- `src/components/LazyModalBoundary.test.tsx`: retain recovery tests and add accessible dialog assertions.
- `src/components/ShareModal.test.tsx`: modal semantics and existing PDF export behavior.
- `scripts/verify-complete-ui.mjs`: adapt toolbar selectors and generate approved visual evidence.
- `scripts/verify-evidence.mjs`: require the new screenshot set.
- `scripts/verification-helpers.test.ts`: verify evidence requirements and semantic CSS gates.

---

### Task 1: Add semantic tokens and non-overlay UI primitives

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Surface.tsx`
- Create: `src/components/ui/StatusBadge.tsx`
- Create: `src/components/ui/SegmentedControl.tsx`
- Create: `src/components/ui/ui.css`
- Create: `src/components/ui/primitives.test.tsx`
- Modify: `src/index.css`
- Modify: `src/main.tsx`

**Interfaces:**
- Produces `Button`, `IconButton`, `Surface`, `StatusBadge`, and `SegmentedControl` for Tasks 2–8.
- `StatusBadge` consumes `status: "saved" | "dirty" | "saving" | "warning" | "error"` and optional `children`.
- `SegmentedControl<T extends string>` consumes `label`, `value`, `options`, and `onChange`.

- [ ] **Step 1: Write failing primitive tests**

Create `src/components/ui/primitives.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, IconButton } from "./Button";
import { SegmentedControl } from "./SegmentedControl";
import { StatusBadge } from "./StatusBadge";
import { Surface } from "./Surface";

describe("UI primitives", () => {
  it("requires a visible accessible name for icon buttons", () => {
    render(<IconButton label="打开设置">⚙</IconButton>);
    expect(screen.getByRole("button", { name: "打开设置" })).toHaveAttribute("title", "打开设置");
  });

  it("renders semantic variants without changing button behavior", () => {
    const onClick = vi.fn();
    render(<Button variant="danger" onClick={onClick}>删除</Button>);
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "删除" })).toHaveClass("ui-button--danger");
  });

  it("renders paper surfaces and status text", () => {
    render(<Surface variant="paper"><StatusBadge status="saved">已保存</StatusBadge></Surface>);
    expect(screen.getByText("已保存")).toHaveClass("ui-status--saved");
    expect(screen.getByText("已保存").parentElement).toHaveClass("ui-surface--paper");
  });

  it("changes a segmented setting through native radio semantics", () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="主题" value="system" options={[
      { value: "system", label: "跟随系统" },
      { value: "light", label: "浅色" },
      { value: "dark", label: "深色" },
    ]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "深色" }));
    expect(onChange).toHaveBeenCalledWith("dark");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/components/ui/primitives.test.tsx`

Expected: FAIL because the primitive modules do not exist.

- [ ] **Step 3: Implement the primitive interfaces**

Use these exact public shapes:

```tsx
// Button.tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "subtle" | "danger";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}
export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  return <button className={`ui-button ui-button--${variant} ${className}`.trim()} {...props} />;
}
export interface IconButtonProps extends Omit<ButtonProps, "aria-label" | "title"> {
  label: string;
  children: ReactNode;
  active?: boolean;
}
export function IconButton({ label, active = false, className = "", ...props }: IconButtonProps) {
  return <Button aria-label={label} title={label} aria-pressed={active || undefined}
    className={`ui-icon-button ${active ? "is-active" : ""} ${className}`.trim()} {...props} />;
}
```

```tsx
// StatusBadge.tsx
import type { ReactNode } from "react";
export type StatusTone = "saved" | "dirty" | "saving" | "warning" | "error";
export function StatusBadge({ status, children }: { status: StatusTone; children: ReactNode }) {
  return <span className={`ui-status ui-status--${status}`} role={status === "error" ? "alert" : "status"}>{children}</span>;
}
```

```tsx
// Surface.tsx
import type { HTMLAttributes } from "react";
export type SurfaceVariant = "paper" | "raised" | "inset";
export function Surface({ variant, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { variant: SurfaceVariant }) {
  return <div className={`ui-surface ui-surface--${variant} ${className}`.trim()} {...props} />;
}
```

Implement `SegmentedControl` with a `<fieldset>`/`<legend>` and radio inputs; use a unique `name` from `useId()` so multiple instances do not interfere.

```tsx
import { useId } from "react";

export interface SegmentOption<T extends string> { value: T; label: string; }
export interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}
export function SegmentedControl<T extends string>({ label, value, options, onChange }: SegmentedControlProps<T>) {
  const name = useId();
  return <fieldset className="ui-segmented"><legend>{label}</legend><div className="ui-segmented__options">{options.map((option) => <label key={option.value} className="ui-segmented__option"><input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} /><span>{option.label}</span></label>)}</div></fieldset>;
}
```

- [ ] **Step 4: Add the approved semantic tokens and CSS aliases**

In `src/index.css`, define these exact primary roles and keep existing export tokens unchanged:

```css
:root {
  --surface-app: #ebe7df;
  --surface-raised: #f8f5ef;
  --surface-paper: #fffdf9;
  --surface-inset: #f1ece3;
  --surface-overlay: rgba(47, 48, 44, 0.42);
  --text-primary: #2f302c;
  --text-secondary: #6f6a60;
  --text-muted: #928b80;
  --text-inverse: #fffaf3;
  --text-link: #9f593a;
  --accent: #a85f3d;
  --accent-hover: #914b2f;
  --accent-light: #f2e2d7;
  --success: #2f7d4f;
  --warning: #9a6700;
  --danger: #b42318;
  --border-color: #ded6c9;
  --border-strong: #bdb2a1;
  --focus-ring: #1b67c9;
  --content-max: 900px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --radius-sm: 6px;
  --radius: 10px;
  --radius-lg: 16px;
  --shadow: 0 8px 20px rgba(82, 72, 55, 0.08);
  --shadow-lg: 0 18px 44px rgba(64, 53, 39, 0.16);
  --motion-fast: 120ms;
  --motion-normal: 180ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --font-ui: "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
  --font-editorial: "Songti SC", SimSun, Georgia, serif;
  --bg-primary: var(--surface-paper);
  --bg-secondary: var(--surface-raised);
  --bg-tertiary: var(--surface-inset);
}

[data-theme="dark"] {
  --surface-app: #111827;
  --surface-raised: #172033;
  --surface-paper: #1c273b;
  --surface-inset: #202c42;
  --surface-overlay: rgba(3, 8, 20, 0.7);
  --text-primary: #eef3fb;
  --text-secondary: #b8c3d4;
  --text-muted: #8491a6;
  --text-inverse: #101827;
  --text-link: #8eb4ef;
  --accent: #e09a73;
  --accent-hover: #f0af89;
  --accent-light: #3a2b2a;
  --success: #84c99a;
  --warning: #f2c66d;
  --danger: #ff8b86;
  --border-color: #32415b;
  --border-strong: #52627c;
  --focus-ring: #8eb4ef;
  --shadow: 0 8px 20px rgba(3, 8, 20, 0.24);
  --shadow-lg: 0 18px 44px rgba(3, 8, 20, 0.42);
}
```

Add global `:focus-visible` and reduced-motion rules, write primitive classes in `ui.css`, and import `./components/ui/ui.css` from `main.tsx` after `index.css`.

```css
:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }
.ui-button { min-height: 36px; padding: 0 var(--space-3); border: 1px solid transparent; border-radius: var(--radius-sm); transition: background var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard), transform var(--motion-fast) var(--ease-standard); }
.ui-button--primary { background: var(--accent); color: var(--text-inverse); }
.ui-button--secondary { background: var(--surface-inset); color: var(--text-primary); border-color: var(--border-color); }
.ui-button--subtle { background: transparent; color: var(--text-secondary); }
.ui-button--danger { background: var(--danger); color: var(--text-inverse); }
.ui-icon-button { width: 36px; padding: 0; display: inline-grid; place-items: center; }
.ui-icon-button.is-active { color: var(--accent); background: var(--accent-light); }
.ui-surface--paper { background: var(--surface-paper); }
.ui-surface--raised { background: var(--surface-raised); }
.ui-surface--inset { background: var(--surface-inset); }
.ui-status { display: inline-flex; align-items: center; gap: var(--space-1); font-size: 12px; }
.ui-status--saved { color: var(--success); }
.ui-status--dirty, .ui-status--warning { color: var(--warning); }
.ui-status--error { color: var(--danger); }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; } }
```

- [ ] **Step 5: Run focused and regression checks**

Run:

```powershell
npm test -- src/components/ui/primitives.test.tsx
npm run lint
npm run build
```

Expected: 4 primitive tests PASS; lint exits 0; the production build succeeds without new large-chunk warnings.

- [ ] **Step 6: Commit Task 1**

```powershell
git add src/index.css src/main.tsx src/components/ui/Button.tsx src/components/ui/Surface.tsx src/components/ui/StatusBadge.tsx src/components/ui/SegmentedControl.tsx src/components/ui/ui.css src/components/ui/primitives.test.tsx
git commit -m "feat: 建立 DayNotes 轻量设计系统"
```

---

### Task 2: Add accessible menu and modal shells

**Files:**
- Create: `src/components/ui/focus.ts`
- Create: `src/components/ui/MenuPopover.tsx`
- Create: `src/components/ui/ModalShell.tsx`
- Create: `src/components/ui/overlays.test.tsx`
- Modify: `src/components/ui/ui.css`

**Interfaces:**
- `MenuPopover` owns its trigger, menu container, Escape/outside-click close, and trigger focus restoration.
- `ModalShell` owns dialog semantics, focus containment, Escape/backdrop close, and trigger focus restoration.
- Feature callbacks and content remain children; neither component imports feature APIs.

- [ ] **Step 1: Write failing focus and dismissal tests**

Create `src/components/ui/overlays.test.tsx` with tests that:

```tsx
it("closes a menu with Escape and restores trigger focus", () => {
  render(<MenuPopover label="插入内容" triggerContent="＋"><button>插入图片</button></MenuPopover>);
  const trigger = screen.getByRole("button", { name: "插入内容" });
  fireEvent.click(trigger);
  expect(screen.getByRole("menu", { name: "插入内容" })).toBeInTheDocument();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it("closes a menu on an outside pointer event", () => {
  render(<><MenuPopover label="插入内容" triggerContent="＋"><button>插入图片</button></MenuPopover><button>外部</button></>);
  fireEvent.click(screen.getByRole("button", { name: "插入内容" }));
  fireEvent.mouseDown(screen.getByRole("button", { name: "外部" }));
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it("traps Tab inside a modal and restores the opener", () => {
  function Fixture() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>打开设置</button>{open && <ModalShell title="设置" onClose={() => setOpen(false)} footer={<button>保存</button>}><input aria-label="邮箱" /></ModalShell>}</>;
  }
  render(<Fixture />);
  const opener = screen.getByRole("button", { name: "打开设置" });
  fireEvent.click(opener);
  expect(screen.getByRole("dialog", { name: "设置" })).toBeInTheDocument();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});
```

Import `useState`, Testing Library helpers, and the two new components explicitly.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/components/ui/overlays.test.tsx`

Expected: FAIL because `MenuPopover`, `ModalShell`, and `focus.ts` do not exist.

- [ ] **Step 3: Implement shared focus helpers**

Create `focus.ts` with:

```ts
const FOCUSABLE = [
  "button:not([disabled])", "[href]", "input:not([disabled])", "select:not([disabled])",
  "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => !element.hidden);
}

export function loopFocus(event: KeyboardEvent, container: HTMLElement) {
  if (event.key !== "Tab") return;
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) { event.preventDefault(); container.focus(); return; }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
```

- [ ] **Step 4: Implement `MenuPopover` and `ModalShell`**

Use these exact props:

```ts
export interface MenuPopoverProps {
  label: string;
  triggerContent: ReactNode;
  children: ReactNode;
  active?: boolean;
  align?: "start" | "end";
  className?: string;
}

export interface ModalShellProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: "compact" | "default" | "wide";
  closeOnBackdrop?: boolean;
}
```

`MenuPopover` renders a labeled `IconButton`, `role="menu"`, and a document `mousedown`/`keydown` listener only while open. `ModalShell` captures `document.activeElement` on mount, focuses the first control (or the dialog), loops Tab through `loopFocus`, and restores the captured opener on unmount.

- [ ] **Step 5: Run focused checks**

```powershell
npm test -- src/components/ui/overlays.test.tsx src/components/ui/primitives.test.tsx
npm run lint
```

Expected: all overlay and primitive tests PASS; lint exits 0.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/components/ui/focus.ts src/components/ui/MenuPopover.tsx src/components/ui/ModalShell.tsx src/components/ui/overlays.test.tsx src/components/ui/ui.css
git commit -m "feat: 增加无障碍菜单与弹窗基础组件"
```

---

### Task 3: Expose accurate note load and save states

**Files:**
- Modify: `src/hooks/useNoteSession.ts`
- Modify: `src/hooks/useNoteSession.test.tsx`
- Create: `src/components/SaveStatus.tsx`
- Create: `src/components/SaveStatus.test.tsx`

**Interfaces:**
- Produces `SaveStatus = "saved" | "dirty" | "saving" | "error"`.
- Produces `LoadStatus = "loading" | "ready" | "error"`.
- Extends `NoteSession` with `saveStatus`, `loadStatus`, and `retryLoad(): Promise<void>`.
- `SaveStatusIndicator` consumes status plus `onRetry` and never initiates persistence on its own.

- [ ] **Step 1: Add failing session-state tests**

Extend `useNoteSession.test.tsx` with focused tests using the existing deferred helper:

```tsx
it("reports dirty, saving and saved for the current snapshot", async () => {
  const pending = deferred<void>();
  vi.mocked(api.getNote).mockResolvedValue(note("2026-07-13", "<p>start</p>"));
  vi.mocked(api.saveNote).mockReturnValue(pending.promise);
  const { result } = renderHook(() => useNoteSession({ initialDate: "2026-07-13", onError: vi.fn(), saveDelay: 2_000 }));
  await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
  act(() => result.current.setContent("<p>changed</p>"));
  expect(result.current.saveStatus).toBe("dirty");
  let saving!: Promise<boolean>;
  act(() => { saving = result.current.saveNow(); });
  expect(result.current.saveStatus).toBe("saving");
  pending.resolve();
  await act(async () => saving);
  expect(result.current.saveStatus).toBe("saved");
});

it("returns to dirty when content changes during an in-flight save", async () => {
  const pending = deferred<void>();
  vi.mocked(api.getNote).mockResolvedValue(note("2026-07-13", "<p>start</p>"));
  vi.mocked(api.saveNote).mockReturnValue(pending.promise);
  const { result } = renderHook(() => useNoteSession({ initialDate: "2026-07-13", onError: vi.fn(), saveDelay: 2_000 }));
  await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
  act(() => result.current.setContent("<p>first</p>"));
  let saving!: Promise<boolean>;
  act(() => { saving = result.current.saveNow(); });
  act(() => result.current.setContent("<p>second</p>"));
  pending.resolve();
  await act(async () => saving);
  expect(result.current.saveStatus).toBe("dirty");
});

it("keeps visible content and retries the current load", async () => {
  vi.mocked(api.getNote).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(note("2026-07-13", "<p>recovered</p>"));
  const { result } = renderHook(() => useNoteSession({ initialDate: "2026-07-13", onError: vi.fn() }));
  await waitFor(() => expect(result.current.loadStatus).toBe("error"));
  await act(() => result.current.retryLoad());
  expect(result.current.loadStatus).toBe("ready");
  expect(result.current.content).toBe("<p>recovered</p>");
});
```

- [ ] **Step 2: Write failing presentation tests**

Create `SaveStatus.test.tsx` asserting all Chinese labels and that only error renders a `重试` button which invokes `onRetry`.

- [ ] **Step 3: Run the tests and verify RED**

Run: `npm test -- src/hooks/useNoteSession.test.tsx src/components/SaveStatus.test.tsx`

Expected: FAIL because the new states and component do not exist.

- [ ] **Step 4: Implement state transitions inside the existing lifecycle**

Add state without duplicating persistence:

```ts
export type SaveStatus = "saved" | "dirty" | "saving" | "error";
export type LoadStatus = "loading" | "ready" | "error";
const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
```

Extract the current note-loading effect body into `loadDate(date): Promise<void>`, set `loading` before the guarded request, set `ready` and `saved` only on the latest successful response, and set `error` only for the latest failure. Define `retryLoad` as `loadDate(currentDateRef.current)`.

In `saveSnapshot`, set `saving` before awaiting `api.saveNote`; after success set `saved` only when the saved snapshot still matches, otherwise set `dirty`; on failure set `error` and retain `dirtyRef.current`. Both `setContent` and `setTodos` synchronously set `dirty`.

- [ ] **Step 5: Implement `SaveStatusIndicator`**

Render `StatusBadge` with exact labels:

```tsx
const LABELS: Record<SaveStatus, string> = {
  saved: "已保存", dirty: "未保存", saving: "正在保存", error: "保存失败",
};
export function SaveStatusIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  const tone = status === "error" ? "error" : status;
  return <div className="save-status"><StatusBadge status={tone}>{LABELS[status]}</StatusBadge>{status === "error" && <Button variant="subtle" onClick={onRetry}>重试</Button>}</div>;
}
```

- [ ] **Step 6: Run focused and full tests**

```powershell
npm test -- src/hooks/useNoteSession.test.tsx src/components/SaveStatus.test.tsx
npm test
npm run lint
```

Expected: all session and presentation tests PASS; the full suite has no regressions; lint exits 0.

- [ ] **Step 7: Commit Task 3**

```powershell
git add src/hooks/useNoteSession.ts src/hooks/useNoteSession.test.tsx src/components/SaveStatus.tsx src/components/SaveStatus.test.tsx
git commit -m "feat: 展示笔记加载与保存状态"
```

---

### Task 4: Build the centered paper layout and accessible header

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `src/components/DateHeader.tsx`
- Create: `src/components/DateHeader.test.tsx`
- Create: `src/components/Toast.tsx`

**Interfaces:**
- `DateHeaderProps` adds `loadStatus` and `onRetryLoad` while keeping all existing navigation/action callbacks; the calendar trigger ref remains private to `DateHeader`.
- `Toast` consumes `{ message: string; tone: "success" | "warning" | "error" }`.
- `App` passes `saveStatus` to `Editor` in Task 5 and renders load recovery near the date heading.

- [ ] **Step 1: Write failing header behavior tests**

Create `DateHeader.test.tsx` to assert:

```tsx
it("exposes named navigation and application actions", () => {
  render(<DateHeader {...props} />);
  expect(screen.getByRole("button", { name: "前一天" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "后一天" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "选择日期" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "分享今日笔记" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "打开设置" })).toBeInTheDocument();
});

it("shows a retry action when loading fails", () => {
  const onRetryLoad = vi.fn();
  render(<DateHeader {...props} loadStatus="error" onRetryLoad={onRetryLoad} />);
  fireEvent.click(screen.getByRole("button", { name: "重试加载" }));
  expect(onRetryLoad).toHaveBeenCalledOnce();
});
```

Build `props` with the real `DateHeaderProps` and `loadStatus: "ready"` by default.

- [ ] **Step 2: Run the header test and verify RED**

Run: `npm test -- src/components/DateHeader.test.tsx`

Expected: FAIL because the new accessible labels and load-state props are missing.

- [ ] **Step 3: Restructure the application shell**

In `App.tsx`, consume:

```ts
const { currentDate, content, todos, noteDates, changeDate, saveNow, setContent, setTodos, loadStatus, retryLoad } = session;
```

Replace the side-by-side `main-content` with:

```tsx
<main className="daily-flow">
  <section className="editor-paper" aria-label="笔记正文">
    <Editor content={content} onChange={setContent} />
  </section>
  <TodoPanel todos={todos} onChange={setTodos} />
</main>
```

Use typed toast state instead of a string and map save/email/settings outcomes to success, warning, or error without changing their Chinese message content.

- [ ] **Step 4: Implement the approved header hierarchy**

`DateHeader` renders:

- a compact draggable app bar with DayNotes identity and email/share/settings actions;
- a centered editorial date heading;
- previous, next, calendar, and conditional `回到今天` actions;
- a loading status or persistent `加载笔记失败` + `重试加载` action.

Replace emoji-only buttons with `IconButton` accessible names; visible glyphs may remain local Unicode.

- [ ] **Step 5: Replace the layout CSS**

Define `.app-container`, `.daily-scroll`, `.daily-flow`, `.editor-paper`, and responsive gutters using semantic tokens. Required invariants:

```css
.app-container { height: 100vh; overflow: hidden; background: var(--surface-app); }
.daily-scroll { height: calc(100vh - var(--app-header-height)); overflow-y: auto; }
.daily-flow { width: min(var(--content-max), calc(100% - 48px)); margin: 0 auto; padding: var(--space-5) 0 var(--space-6); }
.editor-paper { min-height: 52vh; border: 1px solid var(--border-color); border-radius: var(--radius-lg); background: var(--surface-paper); box-shadow: var(--shadow); overflow: hidden; }
@media (max-width: 719px) { .daily-flow { width: calc(100% - 24px); padding-top: var(--space-3); } }
```

Remove the old fixed 260 px todo column rules.

- [ ] **Step 6: Implement accessible typed toasts**

`Toast` uses `role="status"` and `aria-live="polite"` for success/warning, and `role="alert"` for errors. Keep the current 2-second dismissal unless an error includes a retry action elsewhere.

- [ ] **Step 7: Run checks**

```powershell
npm test -- src/components/DateHeader.test.tsx src/hooks/useNoteSession.test.tsx
npm run lint
npm run build
```

Expected: focused tests PASS; lint and build exit 0.

- [ ] **Step 8: Commit Task 4**

```powershell
git add src/App.tsx src/App.css src/components/DateHeader.tsx src/components/DateHeader.test.tsx src/components/Toast.tsx
git commit -m "feat: 重塑日期核心的纵向纸页布局"
```

---

### Task 5: Reorganize the editor toolbar without losing commands

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Editor.tsx`
- Modify: `src/components/editor/EditorToolbar.tsx`
- Modify: `src/components/TablePicker.test.tsx`
- Modify: `src/components/LinkEditor.test.tsx`
- Modify: `src/App.css`

**Interfaces:**
- `EditorProps` adds `saveStatus: SaveStatus` and `onRetrySave: () => void`.
- `EditorToolbarProps` adds the same two props.
- `App` passes `saveStatus` and `() => { void saveNow(); }` through `Editor` only after these props exist.
- The insert menu trigger is always named `插入内容`.
- Existing button titles used by verification remain available as accessible labels.

- [ ] **Step 1: Extend behavioral tests before moving commands**

Update table/link tests so they open `插入内容` first and assert focus return:

```tsx
fireEvent.click(screen.getByRole("button", { name: "插入内容" }));
fireEvent.click(screen.getByRole("menuitem", { name: "插入表格" }));
expect(editor.chain().focus().insertTable).toHaveBeenCalledWith({ rows: 3, cols: 5, withHeaderRow: true });
fireEvent.keyDown(document, { key: "Escape" });
expect(screen.getByRole("button", { name: "插入内容" })).toHaveFocus();
```

Add an assertion that labels for bold, italic, underline, highlight, heading, all list types, quote, horizontal rule, code block, link, image, table, undo, redo, and table row/column actions are present after opening the appropriate group.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/components/TablePicker.test.tsx src/components/LinkEditor.test.tsx`

Expected: FAIL because the current toolbar has no `插入内容` menu and does not restore focus through it.

- [ ] **Step 3: Implement semantic toolbar groups**

First update the `Editor` call in `App.tsx`:

```tsx
const { saveStatus } = session;
<Editor content={content} onChange={setContent} saveStatus={saveStatus} onRetrySave={() => { void saveNow(); }} />
```

Render these groups in order:

```tsx
<div className="editor-toolbar" aria-label="编辑工具栏">
  <div className="toolbar-group" aria-label="文字格式">
    <IconButton label="加粗 (Ctrl+B)" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></IconButton>
    <IconButton label="斜体 (Ctrl+I)" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></IconButton>
    <IconButton label="下划线 (Ctrl+U)" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></IconButton>
    <IconButton label="高亮" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>H</IconButton>
  </div>
  <div className="toolbar-group" aria-label="段落结构">
    <IconButton label="标题1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</IconButton>
    <IconButton label="无序列表" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>≡</IconButton>
    <IconButton label="有序列表" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</IconButton>
    <IconButton label="任务列表" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>☑</IconButton>
  </div>
  <MenuPopover label="插入内容" triggerContent="＋">
    <Button role="menuitem" variant="subtle" onClick={() => editor.chain().focus().setHorizontalRule().run()}>插入分隔线</Button>
    <Button role="menuitem" variant="subtle" onClick={() => setShowLangPicker(true)}>代码块</Button>
    <Button role="menuitem" variant="subtle" data-toolbar-action="link" onClick={() => setShowLinkPicker(true)}>插入链接</Button>
    <Button role="menuitem" variant="subtle" onClick={() => setShowImagePicker(true)}>插入图片</Button>
    <Button role="menuitem" variant="subtle" data-toolbar-action="table" onClick={() => setShowTablePicker(true)}>插入表格</Button>
  </MenuPopover>
  {editor.isActive("table") && <div className="toolbar-group table-actions" aria-label="表格操作"><IconButton label="在上方插入行" onClick={() => editor.chain().focus().addRowBefore().run()}>行↑</IconButton><IconButton label="在下方插入行" onClick={() => editor.chain().focus().addRowAfter().run()}>行↓</IconButton><IconButton label="在左侧插入列" onClick={() => editor.chain().focus().addColumnBefore().run()}>列←</IconButton><IconButton label="在右侧插入列" onClick={() => editor.chain().focus().addColumnAfter().run()}>列→</IconButton><IconButton label="删除当前行" onClick={() => editor.chain().focus().deleteRow().run()}>删行</IconButton><IconButton label="删除当前列" onClick={() => editor.chain().focus().deleteColumn().run()}>删列</IconButton><IconButton label="删除表格" onClick={() => editor.chain().focus().deleteTable().run()}>删表</IconButton></div>}
  <div className="toolbar-group toolbar-history" aria-label="历史操作"><IconButton label="撤销 (Ctrl+Z)" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>↩</IconButton><IconButton label="重做 (Ctrl+Y)" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>↪</IconButton></div>
  <SaveStatusIndicator status={saveStatus} onRetry={onRetrySave} />
</div>
```

Keep strike, headings 2–3, quote, the current `CodeLanguagePicker`, `LinkEditor`, `ImageInsertPopover`, and `TablePicker` mounted from the corresponding state booleans immediately after the toolbar so every existing command remains reachable.

Use `IconButton` for every icon-only action. Keep `data-toolbar-action="link"` and `data-toolbar-action="table"` on the final actionable menuitems so existing test intent stays explicit.

Do not combine link selection state, Tauri file selection, image validation, code-language selection, or table command logic; only move their triggers into the approved menu hierarchy.

- [ ] **Step 4: Add compact toolbar behavior**

At 720–1023 px, hide `.toolbar-group-label` visually while keeping it available to assistive technology. Below 720 px, move strike, headings 2–3, quote, and horizontal rule into the insert/overflow menu while keeping bold, italic, underline, highlight, list, task, insert, undo, and redo directly reachable.

- [ ] **Step 5: Run UI-focused tests and build**

```powershell
npm test -- src/components/TablePicker.test.tsx src/components/LinkEditor.test.tsx src/components/editor/ImageInsertPopover.test.tsx src/components/SaveStatus.test.tsx
npm run lint
npm run build
```

Expected: all focused tests PASS; lint and build exit 0; no editor command is removed.

- [ ] **Step 6: Commit Task 5**

```powershell
git add src/App.tsx src/components/Editor.tsx src/components/editor/EditorToolbar.tsx src/components/TablePicker.test.tsx src/components/LinkEditor.test.tsx src/App.css
git commit -m "feat: 按语义重组编辑器工具栏"
```

---

### Task 6: Make the calendar keyboard-complete

**Files:**
- Modify: `src/components/CalendarPicker.tsx`
- Create: `src/components/CalendarPicker.test.tsx`
- Modify: `src/components/DateHeader.tsx`
- Modify: `src/components/DateHeader.test.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Calendar remains controlled by `currentDate`, `noteDates`, `onSelect`, and `onClose`.
- Day cells become buttons in `role="grid"`; one cell has `tabIndex=0`, all others `-1`.
- Arrow keys move one day/week, Page Up/Down move one month, Enter/Space select, Escape closes.

- [ ] **Step 1: Write failing calendar keyboard tests**

Create `CalendarPicker.test.tsx`:

```tsx
it("moves focus by day and week and selects with Enter", () => {
  const onSelect = vi.fn();
  render(<CalendarPicker currentDate="2026-07-13" noteDates={new Set(["2026-07-14"])} onSelect={onSelect} onClose={vi.fn()} />);
  const selected = screen.getByRole("gridcell", { name: /2026-07-13/ });
  selected.focus();
  fireEvent.keyDown(selected, { key: "ArrowRight" });
  expect(screen.getByRole("gridcell", { name: /2026-07-14/ })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(screen.getByRole("gridcell", { name: /2026-07-21/ })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "Enter" });
  expect(onSelect).toHaveBeenCalledWith("2026-07-21");
});

it("changes month with PageDown and closes with Escape", () => {
  const onClose = vi.fn();
  render(<CalendarPicker currentDate="2026-07-13" noteDates={new Set()} onSelect={vi.fn()} onClose={onClose} />);
  fireEvent.keyDown(screen.getByRole("grid"), { key: "PageDown" });
  expect(screen.getByText("2026年 8月")).toBeInTheDocument();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/components/CalendarPicker.test.tsx src/components/DateHeader.test.tsx`

Expected: FAIL because day cells are non-focusable divs and `onClose` is unused.

- [ ] **Step 3: Implement roving focus and date movement**

Maintain `focusedDate` as `YYYY-MM-DD`, create refs keyed by date, and use date-fns-free native date helpers already compatible with `formatDate`. Update `viewDate` whenever focus crosses a month boundary, then focus the matching button in a layout effect.

Each cell uses an accessible label containing the full date plus `今天`, `已选择`, and `有笔记` when applicable. Retain CSS classes for visual indicators and add a non-color marker for note presence.

- [ ] **Step 4: Ensure DateHeader focus return**

Store the calendar trigger ref in `DateHeader`; all close paths call one `closeCalendar()` that sets visibility false and focuses the trigger in `requestAnimationFrame`.

- [ ] **Step 5: Run checks**

```powershell
npm test -- src/components/CalendarPicker.test.tsx src/components/DateHeader.test.tsx
npm run lint
```

Expected: calendar/header tests PASS; lint exits 0.

- [ ] **Step 6: Commit Task 6**

```powershell
git add src/components/CalendarPicker.tsx src/components/CalendarPicker.test.tsx src/components/DateHeader.tsx src/components/DateHeader.test.tsx src/App.css
git commit -m "feat: 完善日历键盘导航与焦点恢复"
```

---

### Task 7: Redesign the todo companion surface

**Files:**
- Modify: `src/components/TodoPanel.tsx`
- Create: `src/components/TodoPanel.test.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Keeps `TodoPanelProps { todos: TodoItem[]; onChange: (todos: TodoItem[]) => void }` unchanged.
- Uses shared `Button`, `IconButton`, `Surface`, and `StatusBadge` only for presentation.
- Todo ordering and serialized shape remain unchanged.

- [ ] **Step 1: Write failing accessibility and behavior tests**

Create `TodoPanel.test.tsx`:

```tsx
it("adds, edits, completes and removes todos through named controls", () => {
  const onChange = vi.fn();
  const todos = [{ id: "1", text: "完成复盘", done: false }];
  const { rerender } = render(<TodoPanel todos={todos} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "完成待办：完成复盘" }));
  expect(onChange).toHaveBeenCalledWith([{ id: "1", text: "完成复盘", done: true }]);
  rerender(<TodoPanel todos={[{ id: "1", text: "完成复盘", done: true }]} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "删除待办：完成复盘" }));
  expect(onChange).toHaveBeenLastCalledWith([]);
});

it("announces progress and adds on Enter", () => {
  const onChange = vi.fn();
  render(<TodoPanel todos={[]} onChange={onChange} />);
  fireEvent.change(screen.getByRole("textbox", { name: "新待办" }), { target: { value: "散步" } });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "新待办" }), { key: "Enter" });
  expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ text: "散步", done: false })]);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/components/TodoPanel.test.tsx`

Expected: FAIL because current icon buttons and new-item input lack the required accessible names.

- [ ] **Step 3: Implement the companion surface**

Wrap the panel in `<Surface variant="raised" className="todo-pane">`. Render a heading, progress bar with text `已完成 {doneCount} / {total}`, the named new-item field, and pending/completed groups. Use `IconButton` labels that include the todo text.

Keep `generateId`, add, toggle, edit, time, and remove algorithms unchanged. Do not add drag handles or reorder logic.

- [ ] **Step 4: Move component CSS to the shared layout stylesheet**

Remove the inline `<style>` from `TodoPanel.tsx`; add `.todo-pane`, `.todo-progress-bar`, `.todo-item`, `.todo-check`, `.todo-time`, `.todo-remove`, and empty-state rules to `App.css` using semantic tokens. Ensure remove actions become visible on `:focus-visible`, not only hover.

- [ ] **Step 5: Run checks**

```powershell
npm test -- src/components/TodoPanel.test.tsx
npm run lint
npm run build
```

Expected: todo tests PASS; lint and build exit 0.

- [ ] **Step 6: Commit Task 7**

```powershell
git add src/components/TodoPanel.tsx src/components/TodoPanel.test.tsx src/App.css
git commit -m "feat: 统一待办面板视觉与无障碍交互"
```

---

### Task 8: Migrate share, settings, and lazy states to shared shells

**Files:**
- Modify: `src/components/ShareModal.tsx`
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/components/LazyModalBoundary.tsx`
- Modify: `src/components/LazyModalBoundary.test.tsx`
- Modify: `src/components/ShareModal.test.tsx`
- Create: `src/components/SettingsModal.test.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Feature modal public props remain unchanged.
- Both modals render `ModalShell`; settings uses `SegmentedControl` for theme.
- Lazy error/loading states use the same visual hierarchy but retain independent retry generations.

- [ ] **Step 1: Add failing modal integration assertions**

Extend the share/lazy tests and create `SettingsModal.test.tsx` with:

```tsx
expect(screen.getByRole("dialog", { name: /分享/ })).toHaveAttribute("aria-modal", "true");
expect(screen.getByRole("button", { name: "关闭分享" })).toBeInTheDocument();
expect(screen.getByRole("dialog", { name: "设置" })).toHaveAttribute("aria-modal", "true");
expect(screen.getByRole("radio", { name: "深色" })).toBeInTheDocument();
```

In lazy-boundary tests, assert the failure surface is a dialog named `功能加载失败`, contains `重试` and `关闭`, and continues to reset on `retryKey` changes.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/components/ShareModal.test.tsx src/components/LazyModalBoundary.test.tsx`

Expected: FAIL because current modals do not consume `ModalShell` or expose the new labels.

- [ ] **Step 3: Migrate ShareModal without touching export functions**

Replace only the outer overlay/content/close JSX with:

```tsx
<ModalShell title={`分享 — ${formatDateDisplay(currentDate)}`} onClose={onClose} size="default">
  <div className="share-options">
    <Button variant="secondary" className="share-option" onClick={exportMarkdown} disabled={exporting}>导出为 Markdown</Button>
    <Button variant="secondary" className="share-option" onClick={copyAsHtml} disabled={exporting}>复制为富文本</Button>
    <Button variant="secondary" className="share-option" onClick={exportPDF} disabled={exporting}>导出为 PDF</Button>
    <Button variant="secondary" className="share-option" onClick={exportImage} disabled={exporting}>导出为图片</Button>
  </div>
  {exporting && <StatusBadge status="saving">导出中…</StatusBadge>}
</ModalShell>
```

Render export choices as shared secondary buttons or semantic option cards. Keep `loadExportImage`, Markdown ZIP, clipboard, PDF, PNG, `finally`, toast, and close behavior byte-for-byte equivalent unless typing requires moving JSX only.

- [ ] **Step 4: Migrate SettingsModal**

Use `ModalShell` with footer buttons. Replace the theme `<select>` with:

```tsx
<SegmentedControl
  label="主题"
  value={local.theme}
  options={[{ value: "system", label: "跟随系统" }, { value: "light", label: "浅色" }, { value: "dark", label: "深色" }]}
  onChange={(theme) => setLocal({ ...local, theme })}
/>
```

Keep SMTP presets, validation, testing, enable flags, send time, font size, and save payload unchanged. Use `StatusBadge` for test-email sending/success/error feedback.

- [ ] **Step 5: Migrate lazy loading and error recovery**

Render Suspense fallback inside a compact `ModalShell` with `正在加载…`. Render the error state in `ModalShell` with close/retry buttons while preserving the existing `retryGeneration` and `createRetryableLazy` cache rules.

- [ ] **Step 6: Run focused and full checks**

```powershell
npm test -- src/components/ShareModal.test.tsx src/components/LazyModalBoundary.test.tsx src/components/ui/overlays.test.tsx src/lib/emailValidation.test.ts
npm test
npm run lint
npm run build
```

Expected: all focused and full tests PASS; lint and build exit 0; lazy modal chunks remain separate.

- [ ] **Step 7: Commit Task 8**

```powershell
git add src/components/ShareModal.tsx src/components/SettingsModal.tsx src/components/LazyModalBoundary.tsx src/components/LazyModalBoundary.test.tsx src/components/ShareModal.test.tsx src/components/SettingsModal.test.tsx src/App.css
git commit -m "feat: 统一分享设置与加载状态界面"
```

---

### Task 9: Enforce responsive, accessibility, and visual acceptance

**Files:**
- Modify: `scripts/verify-complete-ui.mjs`
- Modify: `scripts/verify-evidence.mjs`
- Modify: `scripts/verification-helpers.test.ts`
- Modify: `src/App.css`
- Modify generated ignored evidence: `verify-output/`

**Interfaces:**
- Complete UI verification still tests every editor command and all seven share checks.
- Evidence validation additionally requires approved light, dark, narrow, calendar, todo, share, settings, and save-error screenshots.
- No production source interface changes in this task unless verification exposes a regression.

- [ ] **Step 1: Add failing verification-helper tests**

Extend `scripts/verification-helpers.test.ts` so a fixture missing any of these paths fails:

```ts
const REQUIRED_UI_SCREENSHOTS = [
  "screenshots/ui-light-main.png",
  "screenshots/ui-dark-main.png",
  "screenshots/ui-narrow-main.png",
  "screenshots/ui-calendar-focus.png",
  "screenshots/ui-todo-progress.png",
  "screenshots/ui-share-modal.png",
  "screenshots/ui-settings-modal.png",
  "screenshots/ui-save-error.png",
];
```

Add a semantic CSS gate that reads `src/index.css` and asserts both themes define `--surface-app`, `--surface-paper`, `--focus-ring`, and that a `prefers-reduced-motion: reduce` rule exists.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- scripts/verification-helpers.test.ts`

Expected: FAIL because evidence verification and the complete UI runner do not yet produce the new screenshot set.

- [ ] **Step 3: Update complete UI selectors without reducing coverage**

Add a helper that opens `插入内容` before low-frequency commands. Keep the existing editor check count at 27 or higher and share check count at 7. Continue checking Markdown, rich text, PDF, PNG, HTML/PDF layout strategies, and ZIP output.

```js
const toolbar = (name) => page.getByRole("button", { name, exact: true });
async function clickEditorCommand(name, location = "toolbar") {
  if (location === "insert") {
    await page.getByRole("button", { name: "插入内容" }).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
    return;
  }
  await toolbar(name).click();
}
```

- [ ] **Step 4: Generate deterministic visual states**

In `verify-complete-ui.mjs`:

- capture the 1440×1000 light main window;
- apply dark settings and capture the same content;
- set the viewport to 700×900 and capture the narrow layout while asserting `document.documentElement.scrollWidth === document.documentElement.clientWidth`;
- open the calendar via its accessible name, focus a note date, and capture it;
- create mixed completed/pending todos and capture progress;
- capture share and settings dialogs;
- make the next `save_note` IPC mock reject, edit content, invoke save, assert `保存失败` and `重试`, then capture it.

Reset mocked state between scenarios so screenshot setup does not change export verification data.

- [ ] **Step 5: Verify reduced motion and focus visibility**

Use Playwright media emulation for `reducedMotion: "reduce"` and assert the computed transition duration of routine controls is `0s` or effectively disabled. Tab from the body through header actions, the toolbar, calendar, and both dialogs; assert each focused element has a visible outline or box shadow.

- [ ] **Step 6: Run complete frontend and evidence verification**

```powershell
npm test
npm run lint
npm run verify:bundle
npm run verify:complete-ui
npm run verify:evidence
```

Expected:

- all test files PASS;
- ESLint exits 0;
- entry JavaScript remains below 512000 bytes;
- editor checks are 27/27 or higher;
- share checks are 7/7;
- all eight new screenshots exist and are non-empty;
- PDF/PNG signatures and page counts remain valid;
- browser console/error logs remain empty.

- [ ] **Step 7: Run Rust and Windows production verification**

```powershell
npm run verify:rust
```

Then configure MSVC exactly as `scripts/verify-rust.ps1` does and run:

```powershell
npm run tauri:build
```

Expected: 12 or more Rust tests pass; `daynotes.exe`, the NSIS installer, and the zh-CN MSI are produced under `src-tauri/target/release/`.

- [ ] **Step 8: Inspect scope and commit verification changes**

```powershell
git status --short
git diff --check
git diff --stat master...HEAD
git add scripts/verify-complete-ui.mjs scripts/verify-evidence.mjs scripts/verification-helpers.test.ts src/App.css
git commit -m "test: 固化 UI 重设计完整验收证据"
```

Expected: generated `verify-output/` remains ignored; only planned source and verification files are committed; collaboration files and brainstorm artifacts are absent from the commit.

---

## Plan Self-Review

- Spec coverage: tokens, full light/dark redesign, centered layout, toolbar grouping, persistence states, calendar, todos, unified modals, focus, motion, responsive behavior, errors, visual evidence, Rust, and Windows packaging each map to a task.
- Scope: backend migration, secure SMTP storage, image file migration, CI, releases, signing, and updates remain explicitly excluded.
- Interface consistency: `SaveStatus`, `LoadStatus`, `retryLoad`, `ModalShellProps`, `MenuPopoverProps`, and the toolbar save props are defined before later consumption.
- Compatibility: Tauri IPC, SQLite, note HTML, todo JSON, export semantics, email behavior, date format, 2-second debounce, and shortcut behavior remain unchanged.
- Placeholder scan: the plan contains no unfinished implementation marker or unspecified code step.
