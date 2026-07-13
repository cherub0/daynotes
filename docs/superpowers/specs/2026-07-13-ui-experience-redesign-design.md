# DayNotes UI Experience Redesign Design

**Date:** 2026-07-13
**Status:** Approved in conversation; written-spec review pending
**Scope:** UI experience phase only

## 1. Goal

Redesign the complete DayNotes interface around a calm, date-centered writing experience while preserving all existing note, todo, export, email, storage, and keyboard behavior.

The selected visual direction is:

- Light theme: **晨光纸页** — warm paper surfaces, restrained terracotta accents, generous whitespace, and editorial typography.
- Main layout: **纵向纸页** — one centered reading flow with the note first and the todo panel below it.
- Toolbar: **语义分组工具栏** — frequently used commands stay visible; lower-frequency insert actions move into a clear `＋` menu.
- Dark theme: **深蓝夜幕** — cool navy layers with readable boundaries and warm accent continuity.
- Coverage: the main window, editor, todo panel, calendar, share modal, settings modal, lazy-load states, toast messages, and error states all use the same design system.

## 2. Non-goals

This phase does not implement:

- todo drag-and-drop;
- database schema migration;
- SMTP credential secure storage;
- image resource file migration;
- CI, release automation, code signing, or application updates;
- changes to Tauri IPC command names, parameters, or response values;
- changes to SQLite data, note HTML, todo JSON, export formats, or existing keyboard shortcuts.

Those items remain assigned to later backend and engineering-release phases.

## 3. Design Principles

1. **Writing remains primary.** The note occupies the visual center and receives the strongest surface hierarchy.
2. **Date remains the organizing dimension.** Previous/next navigation and the calendar are always easy to reach without adding a permanent sidebar.
3. **State is visible.** Loading and saving are represented by persistent, understandable states rather than only transient toasts.
4. **Capabilities remain discoverable.** Toolbar grouping may reduce visual density but must not remove or hide commands behind undocumented gestures.
5. **One system, two themes.** Light and dark themes share semantic roles instead of maintaining unrelated component colors.
6. **Keyboard use is first-class.** Every interactive flow must work without a mouse and must restore focus predictably.
7. **Local-first remains literal.** No UI font, image, icon, or animation may require a network request.

## 4. Architecture

### 4.1 Design tokens

`src/index.css` remains the global token owner. Existing variables are expanded into semantic groups:

- surfaces: application background, raised surface, paper surface, inset surface, overlay;
- text: primary, secondary, muted, inverse, link;
- actions: accent, accent-hover, subtle accent, success, warning, danger;
- borders and focus: default border, strong border, focus ring;
- geometry: spacing scale, control heights, radii, content widths;
- typography: UI font, editorial date/title font, monospace font, size and line-height scale;
- elevation: small, medium, modal, and floating-menu shadows;
- motion: fast and normal durations plus easing;
- layers: toolbar popover, calendar, modal, toast.

Light tokens implement the warm paper palette. `[data-theme="dark"]` implements the deep navy palette using the same variable names. Component styles reference semantic variables only; export-specific variables remain independent so document output does not change with the application theme.

No network font is introduced. The UI uses a Windows-compatible system sans-serif stack, and dates/headings use a Chinese-capable serif fallback stack.

### 4.2 Base UI components

Create small, styling-focused components under `src/components/ui/`:

- `Button`: primary, secondary, subtle, and danger actions;
- `IconButton`: icon-only control with required Chinese accessible label and optional tooltip text;
- `Surface`: paper, raised, and inset containers;
- `StatusBadge`: saved, saving, dirty, warning, and error states;
- `ModalShell`: overlay, title, close action, content region, and action footer;
- `MenuPopover`: anchored menu shell with Escape/outside-click handling and focus return;
- `SegmentedControl`: settings choices such as theme selection.

These components own presentation and generic interaction only. They do not import Tauri APIs, note-session logic, Tiptap commands, or export logic.

### 4.3 Feature ownership

- `useNoteSession` continues to own note loading, dirty state, save timing, date switching, and stale-request protection.
- `App` continues to coordinate layout, modal visibility, settings, and toast notifications.
- `Editor` continues to own Tiptap setup and content synchronization.
- `EditorToolbar` continues to map UI actions to Tiptap commands.
- `TodoPanel`, `CalendarPicker`, `ShareModal`, and `SettingsModal` keep their feature-specific state and callbacks.

The redesign must not move business logic back into visual components.

## 5. Main Window Layout

The application uses a single centered vertical flow:

1. compact application header with calendar entry, DayNotes identity, share, email, and settings actions;
2. centered date heading with previous/next navigation and save state;
3. semantic editor toolbar;
4. raised paper editor surface;
5. todo panel aligned to the same content width;
6. toast region outside the document flow.

The editor paper has a maximum width near 900 px so body lines remain readable on wide monitors. The todo panel follows the editor rather than occupying a permanent side column.

### 5.1 Responsive behavior

- At 1024 px and above, use the full spacing scale and display toolbar group labels where they improve scanning.
- From 720 px through 1023 px, reduce page gutters and hide nonessential button text while retaining accessible names and tooltips.
- Below 720 px, keep the page single-column, collapse lower-frequency toolbar groups into menus, and allow modal actions to stack.
- The editor and todo panel never create horizontal page scrolling.
- Wide tables may scroll inside the editor surface rather than widening the application.

The Tauri native window configuration is not given a new minimum size in this phase; the responsive UI must tolerate the existing window behavior.

## 6. Editor Toolbar

The selected toolbar uses explicit semantic groups:

- text: bold, italic, underline, highlight, and a clear path to strike and inline code;
- structure: heading selection, bullet list, ordered list, task list, quote, and horizontal rule;
- insert (`＋`): code block/language, link, image, and table;
- history: undo and redo;
- state: save status at the trailing edge when space permits.

Every existing editor command remains available. Active formatting remains visually distinct in both themes. Disabled commands remain readable but are not presented as active.

The `＋` menu is labeled `插入内容`, opens by keyboard, closes with Escape or outside click, returns focus to its trigger, and never relies on icon recognition alone.

## 7. Save and Load State

### 7.1 Public note-session state

Extend the note-session result with presentation-neutral state:

```ts
export type SaveStatus = "saved" | "dirty" | "saving" | "error";
export type LoadStatus = "loading" | "ready" | "error";

saveStatus: SaveStatus;
loadStatus: LoadStatus;
retryLoad: () => Promise<void>;
```

`dirty` remains available where existing consumers or tests require it. The new state reflects the existing persistence lifecycle rather than creating a second save mechanism.

### 7.2 State transitions

- successful initial load: `loading → ready`, save state `saved`;
- edit: `saved → dirty`;
- debounce or manual save begins: `dirty → saving`;
- save succeeds with an unchanged snapshot: `saving → saved`;
- content changes during an in-flight save: return to `dirty` after that snapshot succeeds;
- save fails: `saving → error`, retain dirty data;
- retry begins: `error → saving`;
- load fails: preserve the visible document, set load state to `error`, and expose `retryLoad`;
- date navigation remains blocked whenever the pre-navigation snapshot cannot be stabilized.

The UI renders Chinese labels `未保存`, `正在保存`, `已保存`, and `保存失败`. The error state provides a `重试` action. Toasts remain useful for operation summaries but are no longer the sole persistence feedback.

## 8. Unified Feature Surfaces

### 8.1 Calendar

The calendar uses the shared raised surface, button, focus, and shadow tokens. The selected date, today, dates containing notes, hover state, and keyboard focus must remain distinguishable without relying on color alone. Arrow keys move between days; Page Up/Page Down move between months; Escape closes and restores focus.

### 8.2 Todo panel

The todo panel shares the editor width and paper hierarchy but uses an inset header so it reads as a companion section rather than a second editor. Progress, completed items, destructive actions, empty state, and add-item control use shared status and button styles. This phase does not alter todo ordering or storage.

### 8.3 Share and settings

Both features use `ModalShell` and shared controls. Existing lazy-loading and recovery remain intact. Share strategies, preview behavior, SMTP validation, settings persistence, and Chinese messages do not change.

On open, focus moves to the modal heading or first meaningful control. Tab and Shift+Tab stay within the modal. Close, Escape, overlay dismissal where currently allowed, and successful completion restore focus to the trigger.

### 8.4 Toasts and lazy-load states

Toasts use semantic success, warning, and danger presentation with `aria-live` behavior appropriate to urgency. Lazy loading uses a quiet progress surface; lazy-load errors use the same modal shell and retain retry/close actions.

## 9. Accessibility and Motion

- Every icon-only control requires a Chinese `aria-label`.
- Visible tooltips supplement but do not replace accessible names.
- Focus rings appear for keyboard navigation through `:focus-visible` and remain high-contrast in both themes.
- Menus use menu-appropriate keyboard navigation; dialogs expose a name and modal semantics.
- Text, controls, boundaries, and focus indicators target WCAG AA contrast.
- Status is never communicated by color alone; text or shape accompanies it.
- Motion stays between 120 and 200 ms for routine transitions.
- `prefers-reduced-motion: reduce` removes nonessential transforms, fades, and spinners while preserving state changes.

## 10. Error Handling

- Note load failure preserves current content and displays an inline retry near the date/status region.
- Save failure preserves dirty data and displays a persistent retry action.
- Lazy-modal failure remains isolated to the modal region.
- Image, export, and email errors retain their current diagnostic meaning and adopt shared visual treatment.
- No visual asset failure can blank the application because all required assets are local or CSS-based.

## 11. Testing and Verification

### 11.1 Automated tests

Add or extend tests for:

- note-session save/load status transitions, retry, and edits during in-flight saves;
- base button, icon-button, menu, modal, status, and segmented-control behavior;
- toolbar grouping and access to every existing command;
- Escape, outside click, focus containment, and focus restoration;
- calendar keyboard navigation;
- light/dark semantic tokens and reduced-motion overrides;
- responsive class or layout behavior at representative 720 px, 1024 px, and wide desktop viewports;
- retry behavior for load, save, and lazy-modal failures.

### 11.2 Regression verification

The following must remain green:

- `npm test`;
- `npm run lint`;
- `npm run verify:bundle`;
- `npm run verify:complete-ui`;
- `npm run verify:rust`;
- `npm run verify:evidence`;
- `npm run tauri:build` in the repository's MSVC-configured environment.

### 11.3 Visual evidence

Refresh deterministic screenshots for:

- light main window;
- deep-navy dark main window;
- narrow single-column layout;
- calendar with keyboard focus;
- todo progress and completed state;
- share modal;
- settings modal;
- save failure with retry.

Screenshots must be generated from the production bundle and stored in the existing ignored verification output structure. The UI verification script must continue to cover all editor commands and every sharing strategy.

## 12. Acceptance Criteria

The UI phase is complete only when:

1. all approved visual decisions are present across the complete application;
2. no existing editor, todo, calendar, sharing, settings, email, or keyboard behavior is removed;
3. save and load status is visible, retryable, and consistent with actual persistence state;
4. the main window remains usable without horizontal application scrolling at 720 px and above and degrades safely below it;
5. keyboard-only users can operate the toolbar, calendar, todos, share modal, and settings modal with predictable focus return;
6. both themes meet the specified semantic contrast and focus requirements;
7. no new runtime UI framework or network visual dependency is introduced;
8. frontend tests, complete UI/share verification, Rust tests, evidence checks, and Windows production packaging pass;
9. implementation work is divided into focused commits that can be reviewed and reverted independently.

## 13. Follow-up Sequence

After this UI phase is implemented, verified, reviewed, and merged, work proceeds in order to:

1. backend foundations: database migrations, SMTP credential secure storage, and image resource file migration;
2. engineering release: CI, automated releases, signing integration, and application updates.

Each follow-up phase requires its own approved design and implementation plan.
