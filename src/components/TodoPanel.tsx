import { useState } from "react";
import type { TodoItem } from "../lib/types";
import { Button, IconButton } from "./ui/Button";
import { StatusBadge } from "./ui/StatusBadge";
import { Surface } from "./ui/Surface";

interface TodoPanelProps {
  todos: TodoItem[];
  onChange: (todos: TodoItem[]) => void;
}

export function TodoPanel({ todos, onChange }: TodoPanelProps) {
  const [newText, setNewText] = useState("");

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
    };
    onChange([...todos, newTodo]);
    setNewText("");
  }

  function toggleTodo(id: string) {
    onChange(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function updateText(id: string, text: string) {
    onChange(todos.map((t) => (t.id === id ? { ...t, text } : t)));
  }

  function updateTime(id: string, time: string) {
    onChange(todos.map((t) => (t.id === id ? { ...t, time: time || undefined } : t)));
  }

  function removeTodo(id: string) {
    onChange(todos.filter((t) => t.id !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTodo();
    }
  }

  const doneCount = todos.filter((t) => t.done).length;
  const total = todos.length;
  const pending = todos.filter((t) => !t.done);
  const completed = todos.filter((t) => t.done);
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
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button variant="primary" onClick={addTodo}>
          添加
        </Button>
      </div>

      <div className="todo-list">
        {pending.length > 0 && (
          <section className="todo-group" aria-labelledby="todo-pending-heading">
            <h3 id="todo-pending-heading" className="todo-group-title">进行中</h3>
            {pending.map((todo) => (
              <div key={todo.id} className="todo-item">
                <IconButton
                  label={`完成待办：${todo.text}`}
                  className="todo-check"
                  onClick={() => toggleTodo(todo.id)}
                >
                  <span aria-hidden="true">○</span>
                </IconButton>
                <input
                  className="todo-text"
                  aria-label={`待办内容：${todo.text}`}
                  value={todo.text}
                  onChange={(e) => updateText(todo.id, e.target.value)}
                />
                <input
                  className="todo-time"
                  type="text"
                  aria-label={`提醒时间：${todo.text}`}
                  placeholder="时间"
                  value={todo.time || ""}
                  onChange={(e) => updateTime(todo.id, e.target.value)}
                  title="设置提醒时间（如 14:00）"
                />
                <IconButton
                  label={`删除待办：${todo.text}`}
                  className="todo-remove"
                  onClick={() => removeTodo(todo.id)}
                >
                  <span aria-hidden="true">×</span>
                </IconButton>
              </div>
            ))}
          </section>
        )}

        {completed.length > 0 && (
          <section className="todo-group todo-group--completed" aria-labelledby="todo-completed-heading">
            <h3 id="todo-completed-heading" className="todo-group-title">已完成</h3>
            {completed.map((todo) => (
              <div key={todo.id} className="todo-item completed">
                <IconButton
                  label={`恢复待办：${todo.text}`}
                  className="todo-check done"
                  active
                  onClick={() => toggleTodo(todo.id)}
                >
                  <span aria-hidden="true">✓</span>
                </IconButton>
                <span className="todo-text done">{todo.text}</span>
                <IconButton
                  label={`删除待办：${todo.text}`}
                  className="todo-remove"
                  onClick={() => removeTodo(todo.id)}
                >
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
