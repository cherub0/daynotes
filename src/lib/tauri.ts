import { invoke } from "@tauri-apps/api/core";
import type { Note, AppSettings } from "./types";

export interface ExportImagePayload {
  path: string;
  bytes: number[];
}

export interface ExportResult {
  path: string;
  image_count: number;
}

export async function exportMarkdownZip(
  path: string,
  markdownName: string,
  markdown: string,
  images: ExportImagePayload[],
): Promise<ExportResult> {
  return invoke("export_markdown_zip", { path, markdownName, markdown, images });
}

export interface PdfExportResult {
  path: string;
  pages: number;
  orientation: "portrait" | "landscape";
}

// ── Note CRUD ───────────────────────────────────────────────────

export async function saveNote(date: string, content: string, todos: string): Promise<void> {
  return invoke("save_note", { date, content, todos });
}

export async function getNote(date: string): Promise<Note | null> {
  return invoke("get_note", { date });
}

export async function getNotesInRange(startDate: string, endDate: string): Promise<Note[]> {
  return invoke("get_notes_in_range", { startDate, endDate });
}

export async function getNotesDates(): Promise<string[]> {
  return invoke("get_notes_dates");
}

export async function deleteNote(date: string): Promise<void> {
  return invoke("delete_note", { date });
}

// ── Settings ────────────────────────────────────────────────────

export async function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

// ── Email ───────────────────────────────────────────────────────

export async function sendDailyEmail(): Promise<string> {
  return invoke("send_daily_email");
}

export async function testEmailSettings(): Promise<string> {
  return invoke("test_email_settings");
}

// ── File I/O ────────────────────────────────────────────────────

export async function readBinaryFile(path: string): Promise<number[]> {
  return invoke("read_binary_file", { path });
}

export async function writeBinaryFile(path: string, contents: number[]): Promise<void> {
  return invoke("write_binary_file", { path, contents });
}

export async function exportPdfPages(path: string, date: string, pages: number[][]): Promise<PdfExportResult> {
  return invoke("export_pdf_pages", { path, date, pages });
}
