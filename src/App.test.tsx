// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const hookState = vi.hoisted(() => ({
  onError: null as null | ((message: string) => void),
}));

vi.mock("./hooks/useNoteSession", () => ({
  useNoteSession: (options: { onError: (message: string) => void }) => {
    hookState.onError = options.onError;
    return {
      currentDate: "2026-07-14",
      content: "",
      todos: [],
      noteDates: new Set<string>(),
      dirty: false,
      saveStatus: "saved",
      loadStatus: "ready",
      setContent: vi.fn(),
      setTodos: vi.fn(),
      changeDate: vi.fn(async () => undefined),
      saveNow: vi.fn(async () => true),
      retryLoad: vi.fn(async () => undefined),
    };
  },
}));

vi.mock("./components/DateHeader", () => ({ DateHeader: () => null }));
vi.mock("./components/Editor", () => ({ Editor: () => null }));
vi.mock("./components/TodoPanel", () => ({ TodoPanel: () => null }));
vi.mock("./lib/tauri", () => ({
  getSettings: vi.fn(() => new Promise(() => undefined)),
  saveSettings: vi.fn(),
  sendDailyEmail: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  hookState.onError = null;
});

describe("App toast lifecycle", () => {
  it("does not let an older dismissal timer clear a newer toast", () => {
    vi.useFakeTimers();
    render(<App />);

    act(() => hookState.onError?.("第一次失败"));
    expect(screen.getByRole("alert").textContent).toBe("第一次失败");
    act(() => vi.advanceTimersByTime(1_000));

    act(() => hookState.onError?.("第二次失败"));
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByRole("alert").textContent).toBe("第二次失败");

    act(() => vi.advanceTimersByTime(999));
    expect(screen.getByRole("alert").textContent).toBe("第二次失败");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
