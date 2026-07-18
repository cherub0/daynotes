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

    render(
      <NoteHistoryModal
        currentDate="2026-07-18"
        onClose={vi.fn()}
        onRestored={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    expect(await screen.findByText("暂无历史版本")).not.toBeNull();
  });

  it("previews and restores a selected revision", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    api.getNoteRevisions.mockResolvedValue([
      {
        id: 7,
        note_date: "2026-07-18",
        content: "<p>旧内容</p>",
        todos: "[]",
        created_at: "2026-07-18 09:00:00",
      },
    ]);
    api.restoreNoteRevision.mockResolvedValue({
      date: "2026-07-18",
      content: "<p>旧内容</p>",
      todos: "[]",
      created_at: "2026-07-18 08:00:00",
      updated_at: "2026-07-18 10:00:00",
    });
    const onRestored = vi.fn();

    render(
      <NoteHistoryModal
        currentDate="2026-07-18"
        onClose={vi.fn()}
        onRestored={onRestored}
        onToast={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /2026-07-18 09:00:00/ }));
    expect(screen.getAllByText("旧内容").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "恢复此版本" }));

    await waitFor(() => expect(onRestored).toHaveBeenCalled());
  });
});
