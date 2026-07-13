import { useRef, useState } from "react";
import type { LoadStatus } from "../hooks/useNoteSession";
import { formatDateDisplay, getToday } from "../lib/types";
import type { EmailSettings } from "../lib/types";
import { Button, IconButton } from "./ui/Button";
import { CalendarPicker } from "./CalendarPicker";

export interface DateHeaderProps {
  currentDate: string;
  noteDates: Set<string>;
  emailSettings?: EmailSettings;
  loadStatus: LoadStatus;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelectDate: (date: string) => void;
  onShare: () => void;
  onSettings: () => void;
  onSendEmail: () => void;
  onRetryLoad: () => void;
}

export function DateHeader({
  currentDate,
  noteDates,
  emailSettings,
  loadStatus,
  onPrev,
  onNext,
  onToday,
  onSelectDate,
  onShare,
  onSettings,
  onSendEmail,
  onRetryLoad,
}: DateHeaderProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarTriggerRef = useRef<HTMLButtonElement>(null);
  const isToday = currentDate === getToday();

  function closeCalendar(restoreFocus = true) {
    setShowCalendar(false);
    if (restoreFocus) requestAnimationFrame(() => calendarTriggerRef.current?.focus());
  }

  return (
    <header className="date-header">
      <div className="app-bar">
        <div className="app-identity" aria-label="DayNotes">
          <span aria-hidden="true">✦</span>
          <span>DayNotes</span>
        </div>

        <div className="app-actions">
          {emailSettings?.enabled && (
            <span className="email-indicator" title="每日邮件已开启">
              {emailSettings.send_time} → {emailSettings.recipient}
            </span>
          )}
          <IconButton label="立即发送今日邮件" onClick={onSendEmail}>✉</IconButton>
          <IconButton label="分享" onClick={onShare}>↗</IconButton>
          <IconButton label="设置" onClick={onSettings}>⚙</IconButton>
        </div>
      </div>

      <div className="date-hero">
        <div className="date-navigation">
          <IconButton label="前一天" onClick={onPrev}>‹</IconButton>
          <h1 className="date-display">{formatDateDisplay(currentDate)}</h1>
          <IconButton label="后一天" onClick={onNext}>›</IconButton>
        </div>

        <div className="date-tools">
          <IconButton
            label="选择日期"
            active={showCalendar}
            aria-expanded={showCalendar}
            onClick={(event) => {
              calendarTriggerRef.current = event.currentTarget;
              setShowCalendar((visible) => !visible);
            }}
          >
            ▦
          </IconButton>
          {!isToday && (
            <Button
              variant="subtle"
              className="date-today-action"
              aria-label="回到今天"
              onClick={onToday}
            >
              <span className="date-today-label">回到今天</span>
              <span className="date-today-compact" aria-hidden="true">今天</span>
            </Button>
          )}
        </div>

        <div className={`load-state load-state--${loadStatus}`} aria-live="polite">
          {loadStatus === "loading" && <span>正在加载笔记</span>}
          {loadStatus === "error" && (
            <>
              <span>加载笔记失败</span>
              <Button variant="subtle" onClick={onRetryLoad}>重试</Button>
            </>
          )}
        </div>
      </div>

      {showCalendar && (
        <div className="calendar-overlay">
          <div className="calendar-backdrop" onClick={() => closeCalendar()} />
          <CalendarPicker
            currentDate={currentDate}
            noteDates={noteDates}
            onSelect={(date) => {
              onSelectDate(date);
              closeCalendar(false);
            }}
            onClose={() => closeCalendar()}
          />
        </div>
      )}
    </header>
  );
}
