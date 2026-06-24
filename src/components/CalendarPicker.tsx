import { useState } from "react";
import { getToday, formatDate } from "../lib/types";

interface CalendarPickerProps {
  currentDate: string;
  noteDates: Set<string>;
  onSelect: (date: string) => void;
  onClose: () => void;
}

const WEEKDAY_HEADERS = ["一", "二", "三", "四", "五", "六", "日"];

export function CalendarPicker({ currentDate, noteDates, onSelect }: CalendarPickerProps) {
  const today = getToday();
  const [viewDate, setViewDate] = useState(() => {
    const [y, m] = currentDate.split("-").map(Number);
    return { year: y, month: m };
  });

  const { year, month } = viewDate;

  function goToPrevMonth() {
    setViewDate((d) => (d.month === 1 ? { year: d.year - 1, month: 12 } : { ...d, month: d.month - 1 }));
  }

  function goToNextMonth() {
    setViewDate((d) => (d.month === 12 ? { year: d.year + 1, month: 1 } : { ...d, month: d.month + 1 }));
  }

  // First day of month (0=Sunday in JS, we use 1=Monday)
  const firstDay = new Date(year, month - 1, 1).getDay();
  const firstDayOffset = firstDay === 0 ? 6 : firstDay - 1; // Convert to Monday=0

  const daysInMonth = new Date(year, month, 0).getDate();
  const prevMonthDays = new Date(year, month - 1, 0).getDate();

  const days: { day: number; type: "prev" | "current" | "next" }[] = [];

  // Previous month days
  for (let i = firstDayOffset - 1; i >= 0; i--) {
    days.push({ day: prevMonthDays - i, type: "prev" });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ day: i, type: "current" });
  }

  // Next month days to fill grid
  const remaining = 42 - days.length; // 6 rows × 7
  for (let i = 1; i <= remaining; i++) {
    days.push({ day: i, type: "next" });
  }

  function getDateStr(day: number, type: "prev" | "current" | "next"): string {
    if (type === "prev") {
      const m = month === 1 ? 12 : month - 1;
      const y = month === 1 ? year - 1 : year;
      return formatDate(new Date(y, m - 1, day));
    } else if (type === "next") {
      const m = month === 12 ? 1 : month + 1;
      const y = month === 12 ? year + 1 : year;
      return formatDate(new Date(y, m - 1, day));
    }
    return formatDate(new Date(year, month - 1, day));
  }

  return (
    <div className="calendar-popup">
      <div className="calendar-header">
        <button className="nav-btn" onClick={goToPrevMonth}>◀</button>
        <span>{year}年 {month}月</span>
        <button className="nav-btn" onClick={goToNextMonth}>▶</button>
      </div>

      <div className="calendar-grid">
        {WEEKDAY_HEADERS.map((h) => (
          <div key={h} className="calendar-day-header">{h}</div>
        ))}

        {days.map((d, i) => {
          const dateStr = getDateStr(d.day, d.type);
          const isToday = dateStr === today;
          const isSelected = dateStr === currentDate;
          const hasNote = noteDates.has(dateStr);

          return (
            <div
              key={i}
              className={`calendar-day ${d.type === "prev" || d.type === "next" ? "other-month" : ""} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${hasNote ? "has-note" : ""}`}
              onClick={() => onSelect(dateStr)}
              title={dateStr}
            >
              {d.day}
            </div>
          );
        })}
      </div>
    </div>
  );
}
