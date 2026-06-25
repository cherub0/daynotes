import { useState, useEffect, useCallback, useRef } from "react";
import { getToday, getPrevDate, getNextDate, parseTodos } from "./lib/types";
import type { Note, AppSettings, TodoItem } from "./lib/types";
import * as api from "./lib/tauri";
import { DateHeader } from "./components/DateHeader";
import { Editor } from "./components/Editor";
import { TodoPanel } from "./components/TodoPanel";
import { ShareModal } from "./components/ShareModal";
import { SettingsModal } from "./components/SettingsModal";
import "./App.css";

export default function App() {
  const [currentDate, setCurrentDate] = useState(getToday());
  const [, setNote] = useState<Note | null>(null);
  const [content, setContent] = useState("");
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [noteDates, setNoteDates] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const contentRef = useRef(content);
  const todosRef = useRef(todos);
  const dateRef = useRef(currentDate);

  // Keep refs in sync
  contentRef.current = content;
  todosRef.current = todos;
  dateRef.current = currentDate;

  // ── Init ──

  useEffect(() => {
    loadSettings();
    loadNoteDates();
    loadNote(currentDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load note when date changes
  useEffect(() => {
    loadNote(currentDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  // Auto-save: 2s after last change
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      doSave();
    }, 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clean up save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        doSaveNow();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Data ──

  async function loadSettings() {
    try {
      const s = await api.getSettings();
      setSettings(s);
      applyTheme(s.theme);
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  async function loadNoteDates() {
    try {
      const dates = await api.getNotesDates();
      setNoteDates(new Set(dates));
    } catch (e) {
      console.error("Failed to load note dates:", e);
    }
  }

  async function loadNote(date: string) {
    // Save current first if dirty
    if (dirty) {
      await doSaveNow();
    }
    try {
      const n = await api.getNote(date);
      setNote(n);
      setContent(n?.content || "");
      setTodos(parseTodos(n?.todos || "[]"));
      setDirty(false);
    } catch (e) {
      console.error("Failed to load note:", e);
      setNote(null);
      setContent("");
      setTodos([]);
      setDirty(false);
    }
  }

  async function doSave() {
    if (!dirty) return;
    await doSaveNow();
  }

  async function doSaveNow() {
    try {
      const todosJson = JSON.stringify(todosRef.current);
      await api.saveNote(dateRef.current, contentRef.current, todosJson);
      setDirty(false);
      // Refresh note dates
      const dates = await api.getNotesDates();
      setNoteDates(new Set(dates));
    } catch (e) {
      console.error("Failed to save:", e);
      showToast("保存失败");
    }
  }

  // ── Navigation ──

  function goToPrevDay() {
    setCurrentDate((d) => getPrevDate(d));
  }

  function goToNextDay() {
    setCurrentDate((d) => getNextDate(d));
  }

  function goToToday() {
    setCurrentDate(getToday());
  }

  function goToDate(date: string) {
    setCurrentDate(date);
  }

  // ── Keyboard shortcuts ──

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrevDay();
      } else if (e.ctrlKey && e.key === "ArrowRight") {
        e.preventDefault();
        goToNextDay();
      } else if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        doSaveNow().then(() => showToast("已保存"));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ──

  function handleContentChange(html: string) {
    setContent(html);
    setDirty(true);
    scheduleSave();
  }

  function handleTodosChange(newTodos: TodoItem[]) {
    setTodos(newTodos);
    setDirty(true);
    scheduleSave();
  }

  function handleSettingsSave(newSettings: AppSettings) {
    setSettings(newSettings);
    applyTheme(newSettings.theme);
    api.saveSettings(newSettings);
    setShowSettings(false);
    showToast("设置已保存");
  }

  function applyTheme(theme: string) {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else if (theme === "light") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      // system
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  function handleSendEmail() {
    api.sendDailyEmail()
      .then((msg) => showToast(msg))
      .catch((e) => showToast("发送失败: " + e));
  }

  // ── Render ──

  return (
    <div className="app-container">
      <DateHeader
        currentDate={currentDate}
        noteDates={noteDates}
        emailSettings={settings?.email}
        onPrev={goToPrevDay}
        onNext={goToNextDay}
        onToday={goToToday}
        onSelectDate={goToDate}
        onShare={() => setShowShare(true)}
        onSettings={() => setShowSettings(true)}
        onSendEmail={handleSendEmail}
      />

      <div className="main-content">
        <div className="editor-pane">
          <Editor content={content} onChange={handleContentChange} />
        </div>
        <TodoPanel todos={todos} onChange={handleTodosChange} />
      </div>

      {showShare && (
        <ShareModal
          currentDate={currentDate}
          content={content}
          todos={todos}
          onClose={() => setShowShare(false)}
          onToast={showToast}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={handleSettingsSave}
          onClose={() => setShowSettings(false)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
