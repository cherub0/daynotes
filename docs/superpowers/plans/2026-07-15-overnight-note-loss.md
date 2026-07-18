# Overnight Note Loss Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a React rerender after midnight from loading an empty new-day document and saving it over the previous day's note.

**Architecture:** Treat `initialDate` as a mount-time seed inside `useNoteSession`; later navigation continues exclusively through `changeDate`. Add a second boundary in `Editor` so external content synchronization updates Tiptap without emitting a user-edit event.

**Tech Stack:** React 19 hooks, TypeScript, Tiptap 3.27.1, Vitest 3.2.4, Testing Library, Tauri 2.

## Global Constraints

- Do not change the SQLite schema or migrate stored notes.
- Do not automatically jump to a new day at midnight.
- Preserve the existing two-second debounced autosave, manual save, save-failure protection, and explicit date navigation behavior.
- Programmatic editor synchronization must not call the consumer's `onChange`; real editor updates must continue using the existing Tiptap `onUpdate` callback.
- Follow TDD: observe each regression test fail for the intended reason before modifying production code.

---

### Task 1: Make the session's initial date mount-only

**Files:**
- Modify: `src/hooks/useNoteSession.ts:31-32,124-126`
- Test: `src/hooks/useNoteSession.test.tsx`

**Interfaces:**
- Consumes: `UseNoteSessionOptions.initialDate: string` as the mount-time date seed.
- Produces: unchanged `useNoteSession(options): NoteSession`; post-mount changes to `options.initialDate` have no effect.

- [ ] **Step 1: Write the failing overnight rerender test**

Append this test inside `describe("useNoteSession loading", ...)` in `src/hooks/useNoteSession.test.tsx`:

```tsx
it("keeps the mounted date and note when the initial date prop changes after midnight", async () => {
  vi.mocked(api.getNote).mockImplementation(async (date) => date === "2026-07-14"
    ? note(date, "<p>yesterday survives</p>")
    : null);

  const { result, rerender } = renderHook(
    ({ initialDate }) => useNoteSession({ initialDate, onError: vi.fn(), saveDelay: 20 }),
    { initialProps: { initialDate: "2026-07-14" } },
  );

  await waitFor(() => expect(result.current.content).toBe("<p>yesterday survives</p>"));
  vi.mocked(api.getNote).mockClear();

  rerender({ initialDate: "2026-07-15" });
  await act(async () => Promise.resolve());

  expect(result.current.currentDate).toBe("2026-07-14");
  expect(result.current.content).toBe("<p>yesterday survives</p>");
  expect(api.getNote).not.toHaveBeenCalled();
  expect(api.saveNote).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run:

```powershell
npx vitest run src/hooks/useNoteSession.test.tsx -t "keeps the mounted date"
```

Expected: FAIL because the second `initialDate` triggers `getNote("2026-07-15")` and replaces the visible content with an empty string.

- [ ] **Step 3: Pin the mount-time date in the Hook**

At the start of `useNoteSession`, capture the seed before initializing state:

```tsx
export function useNoteSession({ initialDate, onError, saveDelay = 2_000 }: UseNoteSessionOptions): NoteSession {
  const initialDateRef = useRef(initialDate);
  const [currentDate, setCurrentDate] = useState(initialDateRef.current);
```

Change the initial load effect to read the stable reference:

```tsx
useEffect(() => {
  void loadDate(initialDateRef.current);
}, [loadDate]);
```

- [ ] **Step 4: Run the targeted Hook suite and verify green**

Run:

```powershell
npx vitest run src/hooks/useNoteSession.test.tsx
```

Expected: PASS with 20 tests and no unexpected console errors.

- [ ] **Step 5: Commit the session fix**

```powershell
git add src/hooks/useNoteSession.ts src/hooks/useNoteSession.test.tsx
git commit -m "fix: keep note session date stable across midnight"
```

### Task 2: Prevent programmatic editor loads from becoming edits

**Files:**
- Modify: `src/components/Editor.tsx:133-135`
- Test: `src/components/Editor.test.tsx`

**Interfaces:**
- Consumes: `EditorProps.content: string` as externally loaded HTML.
- Produces: external content is applied with `editor.commands.setContent(content, { emitUpdate: false })`; Tiptap's existing `onUpdate` continues to call `EditorProps.onChange(html)` for actual edits.

- [ ] **Step 1: Write the failing editor synchronization behavior test**

Add the component testing imports to `src/components/Editor.test.tsx`:

```tsx
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Editor } from "./Editor";
```

Keep the existing `readFileSync` import, remove the old `vitest` import that this replaces, and append:

```tsx
it("applies externally loaded content without emitting a user update", async () => {
  const onChange = vi.fn();
  const onRetrySave = vi.fn();
  const { container, rerender } = render(
    <Editor
      content="<p>first</p>"
      onChange={onChange}
      saveStatus="saved"
      onRetrySave={onRetrySave}
    />,
  );
  await waitFor(() => expect(container.querySelector(".ProseMirror")?.textContent).toBe("first"));
  onChange.mockClear();

  rerender(
    <Editor
      content="<p>second</p>"
      onChange={onChange}
      saveStatus="saved"
      onRetrySave={onRetrySave}
    />,
  );
  await waitFor(() => expect(container.querySelector(".ProseMirror")?.textContent).toBe("second"));

  expect(onChange).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run:

```powershell
npx vitest run src/components/Editor.test.tsx -t "without emitting a user update"
```

Expected: FAIL with one `onChange("<p>second</p>")` call because the component currently calls `setContent(content)` and Tiptap 3 defaults `emitUpdate` to `true`.

- [ ] **Step 3: Disable update emission only for external synchronization**

Replace the editor synchronization effect body in `src/components/Editor.tsx` with:

```tsx
useEffect(() => {
  if (editor && editor.getHTML() !== content) {
    editor.commands.setContent(content, { emitUpdate: false });
  }
}, [content, editor]);
```

Do not change the existing `onUpdate` option.

- [ ] **Step 4: Run the editor and Hook suites**

Run:

```powershell
npx vitest run src/components/Editor.test.tsx src/hooks/useNoteSession.test.tsx
```

Expected: PASS with 23 tests. The Hook count is 20 and the Editor count is 3.

- [ ] **Step 5: Commit the editor boundary fix**

```powershell
git add src/components/Editor.tsx src/components/Editor.test.tsx
git commit -m "fix: ignore programmatic editor updates"
```

### Task 3: Verify the complete fix and review the resulting diff

**Files:**
- Verify: `src/hooks/useNoteSession.ts`
- Verify: `src/hooks/useNoteSession.test.tsx`
- Verify: `src/components/Editor.tsx`
- Verify: `src/components/Editor.test.tsx`
- Verify: `docs/superpowers/specs/2026-07-15-overnight-note-loss-design.md`
- Verify: `docs/superpowers/plans/2026-07-15-overnight-note-loss.md`

**Interfaces:**
- Consumes: the two independently committed fixes from Tasks 1 and 2.
- Produces: a verified branch ready for review and release preparation.

- [ ] **Step 1: Run all frontend tests**

```powershell
npm test
```

Expected: all test files pass with zero failed tests.

- [ ] **Step 2: Run static checks and the production build**

```powershell
npm run lint
npm run build
```

Expected: both commands exit with code 0; Vite emits the production bundle.

- [ ] **Step 3: Run the full repository verification**

```powershell
npm run verify
```

Expected: frontend, UI, Rust, bundle, packaging, and evidence checks all report success with exit code 0.

- [ ] **Step 4: Inspect the final diff and repository state**

```powershell
git diff master...HEAD --check
git status --short --branch
git log --oneline master..HEAD
```

Expected: no whitespace errors, no uncommitted files, and only the design, plan, regression tests, and two targeted production fixes appear on the branch.
