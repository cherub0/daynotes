// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { Note } from "./types";
import { getShareBaseName, mergeShareEntries } from "./shareRange";

function note(date: string, content: string, todos = "[]"): Note {
  return { date, content, todos, created_at: "", updated_at: "" };
}

describe("share range", () => {
  it("sorts non-empty notes, skips blank dates, and uses the unsaved current note", () => {
    const entries = mergeShareEntries(
      [
        note("2026-07-14", "<p>数据库版本</p>"),
        note("2026-07-13", "<p>  </p>"),
        note("2026-07-12", "<p>第一天</p>"),
      ],
      { date: "2026-07-14", content: "<p>未保存版本</p>", todos: [] },
    );

    expect(entries.map((entry) => [entry.date, entry.content])).toEqual([
      ["2026-07-12", "<p>第一天</p>"],
      ["2026-07-14", "<p>未保存版本</p>"],
    ]);
  });

  it("keeps notes that only contain media or todos", () => {
    const entries = mergeShareEntries([
      note("2026-07-12", '<p><img src="data:image/png;base64,YQ=="></p>'),
      note("2026-07-13", "", '[{"id":"1","text":"待办","done":false}]'),
    ]);

    expect(entries.map((entry) => entry.date)).toEqual(["2026-07-12", "2026-07-13"]);
  });

  it("treats malformed todo JSON as empty and removes a blank current override", () => {
    const entries = mergeShareEntries(
      [note("2026-07-12", "<p>旧内容</p>"), note("2026-07-13", "", "not json")],
      { date: "2026-07-12", content: "<p></p>", todos: [] },
    );

    expect(entries).toEqual([]);
  });

  it("uses one date for single-day filenames and both endpoints for a range", () => {
    expect(getShareBaseName("2026-07-12", "2026-07-12")).toBe("DayNotes-2026-07-12");
    expect(getShareBaseName("2026-07-12", "2026-07-14")).toBe(
      "DayNotes-2026-07-12_to_2026-07-14",
    );
  });
});
