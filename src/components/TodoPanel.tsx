import { useRef, useState } from "react";
import { formatTodoSchedule, isTodoOverdue } from "../lib/types";
import type { TodoItem } from "../lib/types";
import { Button, IconButton } from "./ui/Button";
import { CalendarPicker } from "./CalendarPicker";
import { StatusBadge } from "./ui/StatusBadge";
import { Surface } from "./ui/Surface";

interface TodoPanelProps {
  currentDate: string;
  todos: TodoItem[];
  onChange: (todos: TodoItem[]) => void;
}

export function TodoPanel({ currentDate, todos, onChange }: TodoPanelProps) {
  const [newText, setNewText] = useState("");
  const [openCalendarTodoId, setOpenCalendarTodoId] = useState<string | null>(null);
  const dateButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  function restoreDateButtonFocus(todoId: string) {
    queueMicrotask(() => dateButtonRefs.current.get(todoId)?.focus());
  }

  function closeCalendar(todoId: string) {
    setOpenCalendarTodoId(null);
    restoreDateButtonFocus(todoId);
  }

  function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function addTodo() {
    const text = newText.trim();
    if (!text) return;
    const newTodo: TodoItem = {
      id: generateId(),
      text,
      done: false,
      date: currentDate,
      time: undefined,
    };
    onChange([...todos, newTodo]);
    setNewText("");
  }

  function updateTodo(id: string, changes: Partial<TodoItem>) {
    onChange(todos.map((todo) => (todo.id === id ? { ...todo, ...changes } : todo)));
  }

  function toggleTodo(id: string) {
    onChange(todos.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo)));
  }

  function removeTodo(id: string) {
    onChange(todos.filter((todo) => todo.id !== id));
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      addTodo();
    }
  }

  const doneCount = todos.filter((todo) => todo.done).length;
  const total = todos.length;
  const pending = todos.filter((todo) => !todo.done);
  const completed = todos.filter((todo) => todo.done);
  const progress = total === 0 ? 0 : (doneCount / total) * 100;

  return (
    <Surface variant="raised" className="todo-pane">
      <div className="todo-header">
        <div>
          <h2 className="todo-title">待办清单</h2>
          <p className="todo-subtitle">把今天要紧的事放在手边</p>
        </div>
        <StatusBadge status={total > 0 && doneCount === total ? "saved" : "dirty"}>
          <span
            className="todo-progress"
            role="progressbar"
            aria-label="待办完成进度"
            aria-valuemin={0}
            aria-valuemax={Math.max(total, 1)}
            aria-valuenow={doneCount}
            aria-valuetext={`已完成 ${doneCount} / ${total}`}
          >
            已完成 {doneCount} / {total}
          </span>
        </StatusBadge>
      </div>

      <div className="todo-progress-bar" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="todo-add">
        <input
          type="text"
          aria-label="新待办"
          placeholder="添加待办…"
          value={newText}
          onChange={(event) => setNewText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button variant="primary" onClick={addTodo}>添加</Button>
      </div>

      <div className="todo-list">
        {pending.length > 0 && (
          <section className="todo-group" aria-labelledby="todo-pending-heading">
            <h3 id="todo-pending-heading" className="todo-group-title">进行中</h3>
            {pending.map((todo) => {
              const overdue = isTodoOverdue(todo);
              return (
                <div key={todo.id} className={`todo-item${overdue ? " todo-item--overdue" : ""}`}>
                  <IconButton label={`完成待办：${todo.text}`} className="todo-check" onClick={() => toggleTodo(todo.id)}>
                    <span aria-hidden="true">○</span>
                  </IconButton>
                  <input
                    className="todo-text"
                    aria-label={`待办内容：${todo.text}`}
                    value={todo.text}
                    onChange={(event) => updateTodo(todo.id, { text: event.target.value })}
                  />
                  <div className="todo-schedule">
                    <Button
                      ref={(element) => {
                        if (element) dateButtonRefs.current.set(todo.id, element);
                        else dateButtonRefs.current.delete(todo.id);
                      }}
                      variant="subtle"
                      className="todo-date"
                      aria-label={`截止日期：${todo.text}`}
                      onClick={() => setOpenCalendarTodoId((openId) => openId === todo.id ? null : todo.id)}
                    >
                      {todo.date || "选择日期"}
                    </Button>
                    {todo.date && (
                      <IconButton
                        label={`清除截止日期：${todo.text}`}
                        className="todo-date-clear"
                        onClick={() => {
                          updateTodo(todo.id, { date: undefined });
                          restoreDateButtonFocus(todo.id);
                        }}
                      >
                        <span aria-hidden="true">×</span>
                      </IconButton>
                    )}
                    <input
                      className="todo-time"
                      type="time"
                      aria-label={`截止时间：${todo.text}`}
                      value={todo.time || ""}
                      onChange={(event) => updateTodo(todo.id, { time: event.target.value || undefined })}
                      title="设置截止时间"
                    />
                    {openCalendarTodoId === todo.id && (
                      <div className="todo-date-popover">
                        <CalendarPicker
                          currentDate={todo.date || currentDate}
                          noteDates={new Set()}
                          label={`选择截止日期：${todo.text}`}
                          onSelect={(date) => {
                            updateTodo(todo.id, { date });
                            closeCalendar(todo.id);
                          }}
                          onClose={() => closeCalendar(todo.id)}
                        />
                      </div>
                    )}
                  </div>
                  {overdue && <span className="todo-overdue">已逾期</span>}
                  <IconButton label={`删除待办：${todo.text}`} className="todo-remove" onClick={() => removeTodo(todo.id)}>
                    <span aria-hidden="true">×</span>
                  </IconButton>
                </div>
              );
            })}
          </section>
        )}

        {completed.length > 0 && (
          <section className="todo-group todo-group--completed" aria-labelledby="todo-completed-heading">
            <h3 id="todo-completed-heading" className="todo-group-title">已完成</h3>
            {completed.map((todo) => (
              <div key={todo.id} className="todo-item completed">
                <IconButton label={`恢复待办：${todo.text}`} className="todo-check done" active onClick={() => toggleTodo(todo.id)}>
                  <span aria-hidden="true">✓</span>
                </IconButton>
                <span className="todo-text done">{todo.text}</span>
                {(todo.date || todo.time) && <span className="todo-schedule-summary">{formatTodoSchedule(todo)}</span>}
                <IconButton label={`删除待办：${todo.text}`} className="todo-remove" onClick={() => removeTodo(todo.id)}>
                  <span aria-hidden="true">×</span>
                </IconButton>
              </div>
            ))}
          </section>
        )}

        {todos.length === 0 && (
          <div className="todo-empty">
            <span className="todo-empty-icon" aria-hidden="true">✓</span>
            <strong>今天还没有待办</strong>
            <span>写下一件小事，从容开始。</span>
          </div>
        )}
      </div>
    </Surface>
  );
}
