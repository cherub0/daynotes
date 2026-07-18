import { useCallback, useEffect, useRef, useState } from "react";
import { DateHeader } from "./components/DateHeader";
import { Editor } from "./components/Editor";
import { createRetryableLazy, LazyModalBoundary } from "./components/LazyModalBoundary";
import { TodoPanel } from "./components/TodoPanel";
import { Toast } from "./components/Toast";
import type { ToastTone } from "./components/Toast";
import { useNoteSession } from "./hooks/useNoteSession";
import * as api from "./lib/tauri";
import { getNextDate, getPrevDate, getToday, parseTodos } from "./lib/types";
import type { AppSettings, Note } from "./lib/types";
import "./App.css";

const LazyShareModal = createRetryableLazy(() => import("./components/ShareModal"));
const LazySettingsModal = createRetryableLazy(() => import("./components/SettingsModal"));
const LazyNoteHistoryModal = createRetryableLazy(() => import("./components/NoteHistoryModal"));

export default function App() {
  const showToastRef = useRef<(message: string, tone?: ToastTone) => void>(() => undefined);
  const session = useNoteSession({
    initialDate: getToday(),
    onError: (message) => showToastRef.current(message, "error"),
  });
  const {
    currentDate,
    content,
    todos,
    noteDates,
    changeDate,
    saveNow,
    setContent,
    setTodos,
    saveStatus,
    loadStatus,
    retryLoad,
  } = session;
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [shareRetryKey, setShareRetryKey] = useState(0);
  const [settingsRetryKey, setSettingsRetryKey] = useState(0);
  const [historyRetryKey, setHistoryRetryKey] = useState(0);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, tone?: ToastTone) => {
    const inferredTone = message.includes("失败") || message.includes("错误")
      ? "error"
      : message.includes("未能") || message.includes("未打包")
        ? "warning"
        : "success";
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    setToast({ message, tone: tone ?? inferredTone });
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, 2_000);
  }, []);
  showToastRef.current = showToast;

  useEffect(() => () => {
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
  }, []);

  const applyTheme = useCallback((theme: string) => {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else if (theme === "light") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
    }
  }, []);

  useEffect(() => {
    void api.getSettings()
      .then((loadedSettings) => {
        setSettings(loadedSettings);
        applyTheme(loadedSettings.theme);
      })
      .catch((error) => console.error("Failed to load settings:", error));
  }, [applyTheme]);

  const goToPrevDay = useCallback(() => {
    void changeDate(getPrevDate(currentDate));
  }, [changeDate, currentDate]);

  const goToNextDay = useCallback(() => {
    void changeDate(getNextDate(currentDate));
  }, [changeDate, currentDate]);

  const goToToday = useCallback(() => {
    void changeDate(getToday());
  }, [changeDate]);

  const goToDate = useCallback((date: string) => {
    void changeDate(date);
  }, [changeDate]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && event.key === "ArrowLeft") {
        event.preventDefault();
        goToPrevDay();
      } else if (event.ctrlKey && event.key === "ArrowRight") {
        event.preventDefault();
        goToNextDay();
      } else if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNow().then((saved) => {
          if (saved) showToast("已保存");
        });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNextDay, goToPrevDay, saveNow, showToast]);

  function handleSettingsSave(newSettings: AppSettings) {
    setSettings(newSettings);
    applyTheme(newSettings.theme);
    void api.saveSettings(newSettings);
    setShowSettings(false);
    showToast("设置已保存");
  }

  function handleSendEmail() {
    void api.sendDailyEmail()
      .then((message) => showToast(message))
      .catch((error) => showToast(`发送失败: ${error}`));
  }

  function handleNoteRestored(note: Note) {
    setContent(note.content);
    setTodos(parseTodos(note.todos));
    showToast("已恢复历史版本");
  }

  return (
    <div className="app-container">
      <DateHeader
        currentDate={currentDate}
        noteDates={noteDates}
        emailSettings={settings?.email}
        loadStatus={loadStatus}
        onPrev={goToPrevDay}
        onNext={goToNextDay}
        onToday={goToToday}
        onSelectDate={goToDate}
        onHistory={() => {
          setHistoryRetryKey((key) => key + 1);
          setShowHistory(true);
        }}
        onShare={() => {
          setShareRetryKey((key) => key + 1);
          setShowShare(true);
        }}
        onSettings={() => {
          setSettingsRetryKey((key) => key + 1);
          setShowSettings(true);
        }}
        onSendEmail={handleSendEmail}
        onRetryLoad={() => void retryLoad()}
      />

      <div className="daily-scroll">
        <main className="daily-flow">
          <section className="editor-paper" aria-label="今日笔记">
            <Editor
              content={content}
              onChange={setContent}
              saveStatus={saveStatus}
              onRetrySave={() => { void saveNow(); }}
            />
          </section>
          <TodoPanel currentDate={currentDate} todos={todos} onChange={setTodos} />
        </main>
      </div>

      {showShare && (
        <LazyModalBoundary
          onClose={() => setShowShare(false)}
          retryKey={shareRetryKey}
        >
          <LazyShareModal
            retryKey={shareRetryKey}
            currentDate={currentDate}
            content={content}
            todos={todos}
            onClose={() => setShowShare(false)}
            onToast={showToast}
          />
        </LazyModalBoundary>
      )}

      {showSettings && (
        <LazyModalBoundary
          onClose={() => setShowSettings(false)}
          retryKey={settingsRetryKey}
        >
          <LazySettingsModal
            retryKey={settingsRetryKey}
            settings={settings}
            onSave={handleSettingsSave}
            onClose={() => setShowSettings(false)}
            onDatabaseRestored={() => {
              void retryLoad();
              void api.getSettings().then((loadedSettings) => {
                setSettings(loadedSettings);
                applyTheme(loadedSettings.theme);
              });
              showToast("数据库已恢复");
            }}
          />
        </LazyModalBoundary>
      )}

      {showHistory && (
        <LazyModalBoundary
          onClose={() => setShowHistory(false)}
          retryKey={historyRetryKey}
        >
          <LazyNoteHistoryModal
            retryKey={historyRetryKey}
            currentDate={currentDate}
            onClose={() => setShowHistory(false)}
            onRestored={handleNoteRestored}
            onToast={showToast}
          />
        </LazyModalBoundary>
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  );
}
