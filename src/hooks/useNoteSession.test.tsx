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
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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

  it("keeps the newest date when an older request resolves last", async () => {
    const first = deferred<Note | null>();
    const second = deferred<Note | null>();
    vi.mocked(api.getNote).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result } = renderHook(() =>
      useNoteSession({ initialDate: "2026-07-11", onError: vi.fn(), saveDelay: 20 }),
    );
    await waitFor(() => expect(api.getNote).toHaveBeenCalledWith("2026-07-11"));
    await act(() => result.current.changeDate("2026-07-12"));
    second.resolve(note("2026-07-12", "<p>new</p>"));
    await waitFor(() => expect(result.current.content).toBe("<p>new</p>"));
    first.resolve(note("2026-07-11", "<p>old</p>"));
    await act(async () => Promise.resolve());

    expect(result.current.currentDate).toBe("2026-07-12");
    expect(result.current.content).toBe("<p>new</p>");
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

    await expect(result.current.saveNow()).resolves.toBe(false);
    expect(onError).toHaveBeenCalledWith("淇濆瓨澶辫触");
    expect(result.current.dirty).toBe(true);
    await expect(result.current.saveNow()).resolves.toBe(true);
    await waitFor(() => expect(result.current.dirty).toBe(false));
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
