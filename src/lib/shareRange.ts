import { parseTodos } from "./types";
import type { Note, TodoItem } from "./types";

export interface ShareEntry {
  date: string;
  content: string;
  todos: TodoItem[];
}

function hasVisibleContent(content: string): boolean {
  const template = document.createElement("template");
  template.innerHTML = content;
  if ((template.content.textContent ?? "").replace(/\u00a0/g, " ").trim()) return true;
  return Boolean(template.content.querySelector("img, table, hr, video, audio"));
}

function isNonEmpty(entry: ShareEntry): boolean {
  return entry.todos.length > 0 || hasVisibleContent(entry.content);
}

export function mergeShareEntries(
  notes: Note[],
  current?: ShareEntry,
): ShareEntry[] {
  const entries = new Map<string, ShareEntry>();
  for (const note of notes) {
    entries.set(note.date, {
      date: note.date,
      content: note.content,
      todos: parseTodos(note.todos),
    });
  }
  if (current) entries.set(current.date, { ...current, todos: current.todos.map((todo) => ({ ...todo })) });

  return Array.from(entries.values())
    .filter(isNonEmpty)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function getShareBaseName(startDate: string, endDate: string): string {
  return startDate === endDate
    ? `DayNotes-${startDate}`
    : `DayNotes-${startDate}_to_${endDate}`;
}
