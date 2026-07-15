// ── Data Types ─────────────────────────────────────────────────

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  date?: string; // "YYYY-MM-DD"
  time?: string; // "HH:MM"
}

export interface Note {
  date: string; // "YYYY-MM-DD"
  content: string; // HTML
  todos: string; // JSON string of TodoItem[]
  created_at: string;
  updated_at: string;
}

export interface EmailSettings {
  smtp_host: string;
  smtp_port: number;
  username: string;
  password: string;
  recipient: string;
  send_time: string; // "HH:MM"
  weekdays_only: boolean;
  enabled: boolean;
}

export interface AppSettings {
  email: EmailSettings;
  theme: "light" | "dark" | "system";
  font_size: number;
}

// ── Helper ──────────────────────────────────────────────────────

export function parseTodos(todosJson: string): TodoItem[] {
  try {
    const parsed: unknown = JSON.parse(todosJson);
    return Array.isArray(parsed) ? parsed as TodoItem[] : [];
  } catch {
    return [];
  }
}

export function formatTodoSchedule(todo: TodoItem): string {
  const schedule = [todo.date, todo.time].filter(Boolean).join(" ");
  return schedule ? `（截止：${schedule}）` : "";
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateDisplay(dateStr: string): string {
  const date = parseDate(dateStr);
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = weekdays[date.getDay()];
  return `${y}年${m}月${d}日 ${w}`;
}

export function getToday(): string {
  return formatDate(new Date());
}

export function getPrevDate(dateStr: string): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() - 1);
  return formatDate(date);
}

export function getNextDate(dateStr: string): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + 1);
  return formatDate(date);
}
