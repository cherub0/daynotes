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

export interface PdfImagePayload {
  id: string;
  bytes: number[];
  width: number;
  height: number;
}

export interface PdfExportResult {
  path: string;
  pages: number;
  orientation: "portrait" | "landscape";
}

export async function exportPdf(
  path: string,
  document: import("./exportDocument").ExportDocument,
  images: PdfImagePayload[],
): Promise<PdfExportResult> {
  return invoke("export_pdf", { path, document, images });
}

// ── Note CRUD ───────────────────────────────────────────────────

export async function saveNote(date: string, content: string, todos: string): Promise<void> {
  return invoke("save_note", { date, content, todos });
}

export async function getNote(date: string): Promise<Note | null> {
  return invoke("get_note", { date });
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
