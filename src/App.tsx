import { useState, useEffect, useCallback, useRef } from "react";
import { getToday, getPrevDate, getNextDate, parseTodos } from "./lib/types";
import type { Note, AppSettings, TodoItem } from "./lib/types";
import * as api from "./lib/tauri";
import { createLatestRequestGuard } from "./lib/latestRequest";
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
  const dirtyRef = useRef(dirty);
  const loadRequestGuard = useRef(createLatestRequestGuard());

  // Keep refs in sync
  contentRef.current = content;
  todosRef.current = todos;
  dateRef.current = currentDate;
  dirtyRef.current = dirty;

  // ── Init ──

  useEffect(() => {
    loadSettings();
    loadNoteDates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load note when date changes
  useEffect(() => {
    loadNote(currentDate);
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
    const requestToken = loadRequestGuard.current.begin();
    try {
      const n = await api.getNote(date);
      if (!loadRequestGuard.current.isLatest(requestToken)) return;
      setNote(n);
      setContent(n?.content || "");
      setTodos(parseTodos(n?.todos || "[]"));
      dirtyRef.current = false;
      setDirty(false);
    } catch (e) {
      if (!loadRequestGuard.current.isLatest(requestToken)) return;
      console.error("Failed to load note:", e);
      setNote(null);
      setContent("");
      setTodos([]);
      dirtyRef.current = false;
      setDirty(false);
    }
  }

  async function doSave() {
    if (!dirtyRef.current) return;
    await doSaveNow();
  }

  async function doSaveNow(
    dateSnapshot = dateRef.current,
    contentSnapshot = contentRef.current,
    todosSnapshot = todosRef.current,
  ) {
    const todosJson = JSON.stringify(todosSnapshot);
    try {
      await api.saveNote(dateSnapshot, contentSnapshot, todosJson);
      if (
        dateRef.current === dateSnapshot &&
        contentRef.current === contentSnapshot &&
        JSON.stringify(todosRef.current) === todosJson
      ) {
        dirtyRef.current = false;
        setDirty(false);
      }
      // Refresh note dates
      const dates = await api.getNotesDates();
      setNoteDates(new Set(dates));
    } catch (e) {
      console.error("Failed to save:", e);
      showToast("保存失败");
    }
  }

  // ── Navigation ──

  async function changeDate(nextDate: string) {
    const previousDate = dateRef.current;
    if (nextDate === previousDate) return;

    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
    }

    if (dirtyRef.current) {
      await doSaveNow(previousDate, contentRef.current, todosRef.current);
    }

    setCurrentDate(nextDate);
  }

  function goToPrevDay() {
    void changeDate(getPrevDate(dateRef.current));
  }

  function goToNextDay() {
    void changeDate(getNextDate(dateRef.current));
  }

  function goToToday() {
    void changeDate(getToday());
  }

  function goToDate(date: string) {
    void changeDate(date);
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
    dirtyRef.current = true;
    setDirty(true);
    scheduleSave();
  }

  function handleTodosChange(newTodos: TodoItem[]) {
    setTodos(newTodos);
    dirtyRef.current = true;
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
