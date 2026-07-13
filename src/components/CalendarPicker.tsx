import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { formatDate, getToday, parseDate } from "../lib/types";

interface CalendarPickerProps {
  currentDate: string;
  noteDates: Set<string>;
  onSelect: (date: string) => void;
  onClose: () => void;
}

const WEEKDAY_HEADERS = ["一", "二", "三", "四", "五", "六", "日"];

function getYearMonth(dateStr: string) {
  const date = parseDate(dateStr);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function addDays(dateStr: string, amount: number) {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + amount);
  return formatDate(date);
}

function addMonths(dateStr: string, amount: number) {
  const date = parseDate(dateStr);
  const targetMonth = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  targetMonth.setDate(Math.min(date.getDate(), lastDay));
  return formatDate(targetMonth);
}

function getDateLabel(dateStr: string, isSelected: boolean, isToday: boolean, hasNote: boolean) {
  const states = [isSelected ? "已选择" : "", isToday ? "今天" : "", hasNote ? "有笔记" : ""].filter(Boolean);
  return states.length > 0 ? `${dateStr}，${states.join("，")}` : dateStr;
}

export function CalendarPicker({ currentDate, noteDates, onSelect, onClose }: CalendarPickerProps) {
  const today = getToday();
  const [viewDate, setViewDate] = useState(() => getYearMonth(currentDate));
  const [focusedDate, setFocusedDate] = useState(currentDate);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const { year, month } = viewDate;

  useEffect(() => {
    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown);
  }, [onClose]);

  useLayoutEffect(() => {
    dayRefs.current.get(focusedDate)?.focus();
  }, [focusedDate, year, month]);

  function moveFocus(nextDate: string) {
    setFocusedDate(nextDate);
    setViewDate(getYearMonth(nextDate));
  }

  function moveFocusByMonth(amount: number) {
    moveFocus(addMonths(focusedDate, amount));
  }

  function handleGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let nextDate: string | undefined;

    switch (event.key) {
      case "ArrowLeft":
        nextDate = addDays(focusedDate, -1);
        break;
      case "ArrowRight":
        nextDate = addDays(focusedDate, 1);
        break;
      case "ArrowUp":
        nextDate = addDays(focusedDate, -7);
        break;
      case "ArrowDown":
        nextDate = addDays(focusedDate, 7);
        break;
      case "PageUp":
        nextDate = addMonths(focusedDate, -1);
        break;
      case "PageDown":
        nextDate = addMonths(focusedDate, 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        onSelect(focusedDate);
        return;
      default:
        return;
    }

    event.preventDefault();
    moveFocus(nextDate);
  }

  const firstDay = new Date(year, month - 1, 1).getDay();
  const firstDayOffset = firstDay === 0 ? 6 : firstDay - 1;
  const gridStart = new Date(year, month - 1, 1 - firstDayOffset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      dateStr: formatDate(date),
      day: date.getDate(),
      isOtherMonth: date.getMonth() !== month - 1,
    };
  });

  return (
    <div className="calendar-popup" aria-label="选择日期">
      <div className="calendar-header">
        <button className="nav-btn" type="button" aria-label="上个月" onClick={() => moveFocusByMonth(-1)}>◀</button>
        <span id="calendar-month-label">{year}年 {month}月</span>
        <button className="nav-btn" type="button" aria-label="下个月" onClick={() => moveFocusByMonth(1)}>▶</button>
      </div>

      <div className="calendar-grid" role="grid" aria-labelledby="calendar-month-label" onKeyDown={handleGridKeyDown}>
        <div className="calendar-row" role="row">
          {WEEKDAY_HEADERS.map((header) => (
            <div key={header} className="calendar-day-header" role="columnheader">{header}</div>
          ))}
        </div>

        {Array.from({ length: 6 }, (_, rowIndex) => (
          <div className="calendar-row" role="row" key={rowIndex}>
            {days.slice(rowIndex * 7, rowIndex * 7 + 7).map((day) => {
              const isToday = day.dateStr === today;
              const isSelected = day.dateStr === currentDate;
              const hasNote = noteDates.has(day.dateStr);

              return (
                <button
                  key={day.dateStr}
                  ref={(element) => {
                    if (element) dayRefs.current.set(day.dateStr, element);
                    else dayRefs.current.delete(day.dateStr);
                  }}
                  type="button"
                  role="gridcell"
                  className={`calendar-day${day.isOtherMonth ? " other-month" : ""}${isToday ? " today" : ""}${isSelected ? " selected" : ""}${hasNote ? " has-note" : ""}`}
                  tabIndex={day.dateStr === focusedDate ? 0 : -1}
                  aria-label={getDateLabel(day.dateStr, isSelected, isToday, hasNote)}
                  aria-selected={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  onFocus={() => setFocusedDate(day.dateStr)}
                  onClick={() => onSelect(day.dateStr)}
                >
                  <span>{day.day}</span>
                  {hasNote && <span className="calendar-note-marker" aria-hidden="true">•</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
