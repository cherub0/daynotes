// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/tauri";
import type { Note } from "../lib/types";
import { useNoteSession } from "./useNoteSession";

vi.mock("../lib/tauri", () => ({
  getNote: vi.fn(),
  getNotesDates: vi.fn(),
  saveNote: vi.fn(),
}));

const note = (date: string, content: string, todos = "[]"): Note => ({
  date,
  content,
  todos,
  created_at: "2026-07-11T00:00:00Z",
  updated_at: "2026-07-11T00:00:00Z",
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

describe("useNoteSession loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getNotesDates).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads the initial note and note dates", async () => {
    vi.mocked(api.getNote).mockResolvedValue(note("2026-07-11", "<p>today</p>"));
    vi.mocked(api.getNotesDates).mockResolvedValue(["2026-07-10", "2026-07-11"]);

    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-11", onError: vi.fn(), saveDelay: 20 }),
    );

    await waitFor(() => expect(result.current.content).toBe("<p>today</p>"));
    expect(result.current.noteDates).toEqual(new Set(["2026-07-10", "2026-07-11"]));
    expect(result.current.dirty).toBe(false);
  });

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

  it("reports dirty, saving and saved for the current snapshot", async () => {
    const pending = deferred<void>();
    vi.mocked(api.getNote).mockResolvedValue(note("2026-07-13", "<p>start</p>"));
    vi.mocked(api.saveNote).mockReturnValue(pending.promise);
    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-13", onError: vi.fn(), saveDelay: 2_000 }),
    );
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
    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-13", onError: vi.fn(), saveDelay: 2_000 }),
    );
    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    act(() => result.current.setContent("<p>first</p>"));
    let saving!: Promise<boolean>;
    act(() => { saving = result.current.saveNow(); });
    act(() => result.current.setContent("<p>second</p>"));
    pending.resolve();
    await act(async () => saving);
    expect(result.current.saveStatus).toBe("dirty");
  });

  it("keeps the latest UI state when serialized saves both succeed", async () => {
    const firstSave = deferred<void>();
    const secondSave = deferred<void>();
    vi.mocked(api.getNote).mockResolvedValue(note("2026-07-13", "<p>start</p>"));
    vi.mocked(api.saveNote)
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-13", onError: vi.fn(), saveDelay: 2_000 }),
    );
    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));

    act(() => result.current.setContent("<p>first</p>"));
    let savingFirst!: Promise<boolean>;
    act(() => { savingFirst = result.current.saveNow(); });
    act(() => result.current.setContent("<p>second</p>"));
    let savingSecond!: Promise<boolean>;
    act(() => { savingSecond = result.current.saveNow(); });
    firstSave.resolve();
    await act(async () => savingFirst);
    await waitFor(() => expect(api.saveNote).toHaveBeenCalledTimes(2));
    secondSave.resolve();
    await act(async () => savingSecond);
    expect(result.current.saveStatus).toBe("saved");
    expect(result.current.dirty).toBe(false);
  });

  it("persists the latest snapshot when saves would otherwise finish out of order", async () => {
    const firstSave = deferred<void>();
    const latestSave = deferred<void>();
    let storedContent = "";
    vi.mocked(api.getNote).mockResolvedValue(note("2026-07-13", "<p>start</p>"));
    vi.mocked(api.saveNote).mockImplementation((_date, html) => {
      const pending = html === "<p>first</p>" ? firstSave : latestSave;
      return pending.promise.then(() => {
        storedContent = html;
      });
    });
    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-13", onError: vi.fn(), saveDelay: 2_000 }),
    );
    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));

    act(() => result.current.setContent("<p>first</p>"));
    let savingFirst!: Promise<boolean>;
    act(() => { savingFirst = result.current.saveNow(); });
    act(() => result.current.setContent("<p>latest</p>"));
    let savingLatest!: Promise<boolean>;
    act(() => { savingLatest = result.current.saveNow(); });

    latestSave.resolve();
    firstSave.resolve();
    await act(async () => Promise.all([savingFirst, savingLatest]));

    expect(storedContent).toBe("<p>latest</p>");
  });

  it("continues with the latest serialized save after an older save fails", async () => {
    const firstSave = deferred<void>();
    const secondSave = deferred<void>();
    const onError = vi.fn();
    vi.mocked(api.getNote).mockResolvedValue(note("2026-07-13", "<p>start</p>"));
    vi.mocked(api.saveNote)
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-13", onError, saveDelay: 2_000 }),
    );
    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));

    act(() => result.current.setContent("<p>first</p>"));
    let savingFirst!: Promise<boolean>;
    act(() => { savingFirst = result.current.saveNow(); });
    act(() => result.current.setContent("<p>second</p>"));
    let savingSecond!: Promise<boolean>;
    act(() => { savingSecond = result.current.saveNow(); });
    firstSave.reject(new Error("older save failed"));
    await act(async () => savingFirst);
    await waitFor(() => expect(api.saveNote).toHaveBeenCalledTimes(2));
    secondSave.resolve();
    await act(async () => savingSecond);
    expect(result.current.saveStatus).toBe("saved");
    expect(result.current.dirty).toBe(false);
    expect(onError).not.toHaveBeenCalledWith("保存失败");
  });

  it("keeps visible content and retries the current load", async () => {
    vi.mocked(api.getNote)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(note("2026-07-13", "<p>recovered</p>"));
    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-13", onError: vi.fn() }),
    );
    await waitFor(() => expect(result.current.loadStatus).toBe("error"));
    await act(() => result.current.retryLoad());
    expect(result.current.loadStatus).toBe("ready");
    expect(result.current.content).toBe("<p>recovered</p>");
  });

  it("does not overwrite content edited while the initial load is pending", async () => {
    const pending = deferred<Note | null>();
    vi.mocked(api.getNote).mockReturnValue(pending.promise);
    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-13", onError: vi.fn(), saveDelay: 2_000 }),
    );
    await waitFor(() => expect(api.getNote).toHaveBeenCalledWith("2026-07-13"));

    act(() => result.current.setContent("<p>local edit</p>"));
    pending.resolve(note("2026-07-13", "<p>remote content</p>"));
    await act(async () => pending.promise);

    expect(result.current.content).toBe("<p>local edit</p>");
    expect(result.current.dirty).toBe(true);
    expect(result.current.saveStatus).toBe("dirty");
    expect(result.current.loadStatus).toBe("ready");
  });

  it("does not overwrite todos edited while a retry load is pending", async () => {
    const pending = deferred<Note | null>();
    vi.mocked(api.getNote)
      .mockRejectedValueOnce(new Error("offline"))
      .mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-13", onError: vi.fn(), saveDelay: 2_000 }),
    );
    await waitFor(() => expect(result.current.loadStatus).toBe("error"));

    let retry!: Promise<void>;
    act(() => { retry = result.current.retryLoad(); });
    const localTodos = [{ id: "local", text: "本地待办", done: false }];
    act(() => result.current.setTodos(localTodos));
    pending.resolve(note("2026-07-13", "<p>remote</p>", JSON.stringify([
      { id: "remote", text: "远端待办", completed: true },
    ])));
    await act(async () => retry);

    expect(result.current.todos).toEqual(localTodos);
    expect(result.current.dirty).toBe(true);
    expect(result.current.saveStatus).toBe("dirty");
    expect(result.current.loadStatus).toBe("error");
  });

  it("keeps the newest date when an older request resolves last", async () => {
    const first = deferred<Note | null>();
    const second = deferred<Note | null>();
    vi.mocked(api.getNote).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-11", onError: vi.fn(), saveDelay: 20 }),
    );
    await waitFor(() => expect(api.getNote).toHaveBeenCalledWith("2026-07-11"));
    let navigation!: Promise<void>;
    act(() => { navigation = result.current.changeDate("2026-07-12"); });
    await waitFor(() => expect(api.getNote).toHaveBeenCalledWith("2026-07-12"));
    second.resolve(note("2026-07-12", "<p>new</p>"));
    await act(async () => navigation);
    first.resolve(note("2026-07-11", "<p>old</p>"));
    await act(async () => Promise.resolve());

    expect(result.current.currentDate).toBe("2026-07-12");
    expect(result.current.content).toBe("<p>new</p>");
  });

  it("keeps visible content and reports the correct message when loading fails", async () => {
    const onError = vi.fn();
    vi.mocked(api.getNote)
      .mockResolvedValueOnce(note("2026-07-11", "<p>visible</p>"))
      .mockRejectedValueOnce(new Error("offline"));

    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-11", onError, saveDelay: 20 }),
    );
    await waitFor(() => expect(result.current.content).toBe("<p>visible</p>"));
    await act(() => result.current.changeDate("2026-07-12"));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("加载笔记失败"));

    expect(result.current.content).toBe("<p>visible</p>");
  });

  it("keeps edits scoped to the visible date after navigation load fails and retries the target", async () => {
    let targetAttempts = 0;
    vi.mocked(api.getNote).mockImplementation(async (date) => {
      if (date === "2026-07-11") return note(date, "<p>A content</p>");
      targetAttempts += 1;
      if (targetAttempts === 1) throw new Error("offline");
      return note(date, "<p>B content</p>");
    });
    vi.mocked(api.saveNote).mockResolvedValue();

    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-11", onError: vi.fn(), saveDelay: 2_000 }),
    );
    await waitFor(() => expect(result.current.content).toBe("<p>A content</p>"));

    await act(() => result.current.changeDate("2026-07-12"));
    await waitFor(() => expect(result.current.loadStatus).toBe("error"));
    expect(result.current.content).toBe("<p>A content</p>");

    act(() => result.current.setContent("<p>A edited</p>"));
    expect(result.current.loadStatus).toBe("error");
    await act(() => result.current.saveNow());
    expect(result.current.loadStatus).toBe("error");
    expect(api.saveNote).toHaveBeenCalledWith("2026-07-11", "<p>A edited</p>", "[]");
    expect(api.saveNote).not.toHaveBeenCalledWith("2026-07-12", "<p>A edited</p>", "[]");

    await act(() => result.current.retryLoad());
    expect(result.current.currentDate).toBe("2026-07-12");
    expect(result.current.content).toBe("<p>B content</p>");
    expect(result.current.loadStatus).toBe("ready");
  });

  it("debounces edits and saves the latest snapshot", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getNote).mockResolvedValue(note("2026-07-11", "<p>start</p>"));
    vi.mocked(api.saveNote).mockResolvedValue();

    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-11", onError: vi.fn(), saveDelay: 2_000 }),
    );
    await act(async () => Promise.resolve());
    act(() => {
      result.current.setContent("<p>first</p>");
      result.current.setContent("<p>latest</p>");
    });

    await act(async () => vi.advanceTimersByTimeAsync(1_999));
    expect(api.saveNote).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(api.saveNote).toHaveBeenCalledTimes(1);
    expect(api.saveNote).toHaveBeenCalledWith("2026-07-11", "<p>latest</p>", "[]");
  });

  it("keeps dirty state after a failed save and retries", async () => {
    const onError = vi.fn();
    vi.mocked(api.getNote).mockResolvedValue(note("2026-07-11", "<p>start</p>"));
    vi.mocked(api.saveNote).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce();

    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-11", onError, saveDelay: 20 }),
    );
    await waitFor(() => expect(result.current.content).toBe("<p>start</p>"));
    act(() => result.current.setContent("<p>changed</p>"));

    let failedSave!: boolean;
    await act(async () => { failedSave = await result.current.saveNow(); });
    expect(failedSave).toBe(false);
    expect(onError).toHaveBeenCalledWith("保存失败");
    expect(result.current.dirty).toBe(true);
    expect(result.current.saveStatus).toBe("error");
    let successfulSave!: boolean;
    await act(async () => { successfulSave = await result.current.saveNow(); });
    expect(successfulSave).toBe(true);
    await waitFor(() => expect(result.current.dirty).toBe(false));
    expect(result.current.saveStatus).toBe("saved");
    expect(api.saveNote).toHaveBeenCalledTimes(2);
  });

  it("saves the previous date before loading the next date", async () => {
    const events: string[] = [];
    vi.mocked(api.getNote).mockImplementation(async (date) => {
      events.push(`load:${date}`);
      return note(date, "<p>loaded</p>");
    });
    vi.mocked(api.saveNote).mockImplementation(async (date) => {
      events.push(`save:${date}`);
    });

    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-11", onError: vi.fn(), saveDelay: 20 }),
    );
    await waitFor(() => expect(result.current.content).toBe("<p>loaded</p>"));
    act(() => result.current.setContent("<p>edited</p>"));
    await act(() => result.current.changeDate("2026-07-12"));
    await waitFor(() => expect(api.getNote).toHaveBeenCalledWith("2026-07-12"));

    expect(events.indexOf("save:2026-07-11")).toBeLessThan(events.indexOf("load:2026-07-12"));
    expect(api.saveNote).toHaveBeenCalledWith("2026-07-11", "<p>edited</p>", "[]");
  });

  it("only lets the newest navigation continue across serialized saves", async () => {
    const firstSave = deferred<void>();
    const secondSave = deferred<void>();
    vi.mocked(api.getNote).mockImplementation(async (date) => note(date, `<p>${date}</p>`));
    vi.mocked(api.saveNote)
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);

    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-11", onError: vi.fn(), saveDelay: 2_000 }),
    );
    await waitFor(() => expect(result.current.content).toBe("<p>2026-07-11</p>"));
    act(() => result.current.setContent("<p>dirty A</p>"));

    let navigateToB!: Promise<void>;
    let navigateToC!: Promise<void>;
    act(() => {
      navigateToB = result.current.changeDate("2026-07-12");
      navigateToC = result.current.changeDate("2026-07-13");
    });
    firstSave.resolve();
    await act(async () => navigateToB);
    await waitFor(() => expect(api.saveNote).toHaveBeenCalledTimes(2));
    secondSave.resolve();
    await act(async () => navigateToC);

    await waitFor(() => expect(result.current.currentDate).toBe("2026-07-13"));
    expect(api.getNote).toHaveBeenCalledWith("2026-07-13");
    expect(api.getNote).not.toHaveBeenCalledWith("2026-07-12");
  });

  it("stays on the current note when saving before navigation fails", async () => {
    vi.mocked(api.getNote).mockImplementation(async (date) => note(date, `<p>${date}</p>`));
    vi.mocked(api.saveNote).mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-11", onError: vi.fn(), saveDelay: 2_000 }),
    );
    await waitFor(() => expect(result.current.content).toBe("<p>2026-07-11</p>"));
    act(() => result.current.setContent("<p>unsaved</p>"));
    await act(() => result.current.changeDate("2026-07-12"));

    expect(result.current.currentDate).toBe("2026-07-11");
    expect(result.current.content).toBe("<p>unsaved</p>");
    expect(result.current.dirty).toBe(true);
    expect(api.getNote).not.toHaveBeenCalledWith("2026-07-12");
  });

  it("stays on the current note when it is edited while the navigation save is pending", async () => {
    const pendingSave = deferred<void>();
    vi.mocked(api.getNote).mockImplementation(async (date) => note(date, `<p>${date}</p>`));
    vi.mocked(api.saveNote).mockReturnValue(pendingSave.promise);

    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-11", onError: vi.fn(), saveDelay: 2_000 }),
    );
    await waitFor(() => expect(result.current.content).toBe("<p>2026-07-11</p>"));
    act(() => result.current.setContent("<p>first edit</p>"));

    let navigation!: Promise<void>;
    act(() => { navigation = result.current.changeDate("2026-07-12"); });
    act(() => result.current.setContent("<p>new edit during save</p>"));
    pendingSave.resolve();
    await act(async () => navigation);

    expect(result.current.currentDate).toBe("2026-07-11");
    expect(result.current.content).toBe("<p>new edit during save</p>");
    expect(result.current.dirty).toBe(true);
    expect(api.getNote).not.toHaveBeenCalledWith("2026-07-12");
  });

  it("flushes dirty content on unmount", async () => {
    vi.mocked(api.getNote).mockResolvedValue(note("2026-07-11", "<p>start</p>"));
    vi.mocked(api.saveNote).mockResolvedValue();

    const { result, unmount } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-11", onError: vi.fn(), saveDelay: 20 }),
    );
    await waitFor(() => expect(result.current.content).toBe("<p>start</p>"));
    act(() => result.current.setContent("<p>last edit</p>"));
    unmount();

    await waitFor(() =>
      expect(api.saveNote).toHaveBeenCalledWith("2026-07-11", "<p>last edit</p>", "[]"),
    );
  });
});
