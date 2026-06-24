import { useState } from "react";
import { formatDateDisplay, getToday } from "../lib/types";
import type { EmailSettings } from "../lib/types";
import { CalendarPicker } from "./CalendarPicker";

interface DateHeaderProps {
  currentDate: string;
  noteDates: Set<string>;
  emailSettings?: EmailSettings;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelectDate: (date: string) => void;
  onShare: () => void;
  onSettings: () => void;
  onSendEmail: () => void;
}

export function DateHeader({
  currentDate,
  noteDates,
  emailSettings,
  onPrev,
  onNext,
  onToday,
  onSelectDate,
  onShare,
  onSettings,
  onSendEmail,
}: DateHeaderProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  const isToday = currentDate === getToday();

  return (
    <>
      <div className="top-bar">
        <div className="top-bar-left">
          <span className="app-title">📝 DayNotes</span>

          <button className="nav-btn" onClick={onPrev} title="前一天 (Ctrl+←)">
            ◀
          </button>
          <span className="date-display">{formatDateDisplay(currentDate)}</span>
          <button className="nav-btn" onClick={onNext} title="后一天 (Ctrl+→)">
            ▶
          </button>

          <button
            className="nav-btn"
            onClick={() => setShowCalendar(!showCalendar)}
            title="选择日期"
          >
            📅
          </button>

          {!isToday && (
            <button className="today-btn" onClick={onToday}>
              回到今天
            </button>
          )}
        </div>

        <div className="top-bar-right">
          {emailSettings?.enabled && (
            <span className="email-indicator" title="每日邮件已开启">
              🔔 {emailSettings.send_time} → {emailSettings.recipient}
            </span>
          )}

          <button className="tool-btn" onClick={onSendEmail} title="立即发送今日邮件">
            📧
          </button>
          <button className="tool-btn" onClick={onShare} title="分享">
            📤
          </button>
          <button className="tool-btn" onClick={onSettings} title="设置">
            ⚙
          </button>
        </div>
      </div>

      {showCalendar && (
        <div className="calendar-overlay">
          <div className="calendar-backdrop" onClick={() => setShowCalendar(false)} />
          <CalendarPicker
            currentDate={currentDate}
            noteDates={noteDates}
            onSelect={(date) => {
              onSelectDate(date);
              setShowCalendar(false);
            }}
            onClose={() => setShowCalendar(false)}
          />
        </div>
      )}
    </>
  );
}
