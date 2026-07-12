import { useCallback, useEffect, useRef, useState } from "react";
import { DateHeader } from "./components/DateHeader";
import { Editor } from "./components/Editor";
import { SettingsModal } from "./components/SettingsModal";
import { ShareModal } from "./components/ShareModal";
import { TodoPanel } from "./components/TodoPanel";
import { useNoteSession } from "./hooks/useNoteSession";
import * as api from "./lib/tauri";
import { getNextDate, getPrevDate, getToday } from "./lib/types";
import type { AppSettings } from "./lib/types";
import "./App.css";

export default function App() {
  const showToastRef = useRef<(message: string) => void>(() => undefined);
  const session = useNoteSession({
    initialDate: getToday(),
    onError: (message) => showToastRef.current(message),
  });
  const { currentDate, content, todos, noteDates, changeDate, saveNow, setContent, setTodos } = session;
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2_000);
  }, []);
  showToastRef.current = showToast;

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
          <Editor content={content} onChange={setContent} />
        </div>
        <TodoPanel todos={todos} onChange={setTodos} />
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
