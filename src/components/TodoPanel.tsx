import { useState } from "react";
import type { TodoItem } from "../lib/types";

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

  return (
    <div className="todo-pane">
      <div className="todo-header">
        <span className="todo-title">📋 待办清单</span>
        {total > 0 && (
          <span className="todo-progress">
            {doneCount}/{total}
          </span>
        )}
      </div>

      <div className="todo-add">
        <input
          type="text"
          placeholder="添加待办…"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="btn btn-primary" onClick={addTodo} style={{ padding: "4px 10px", fontSize: 12 }}>
          +
        </button>
      </div>

      <div className="todo-list">
        {pending.map((todo) => (
          <div key={todo.id} className="todo-item">
            <button
              className={`todo-check ${todo.done ? "done" : ""}`}
              onClick={() => toggleTodo(todo.id)}
            >
              {todo.done ? "☑" : "☐"}
            </button>
            <input
              className="todo-text"
              value={todo.text}
              onChange={(e) => updateText(todo.id, e.target.value)}
            />
            <input
              className="todo-time"
              type="text"
              placeholder="时间"
              value={todo.time || ""}
              onChange={(e) => updateTime(todo.id, e.target.value)}
              title="设置提醒时间 (如 14:00)"
            />
            <button className="todo-remove" onClick={() => removeTodo(todo.id)} title="删除">
              ×
            </button>
          </div>
        ))}

        {completed.map((todo) => (
          <div key={todo.id} className="todo-item completed">
            <button
              className={`todo-check done`}
              onClick={() => toggleTodo(todo.id)}
            >
              ☑
            </button>
            <span className="todo-text done">{todo.text}</span>
            <button className="todo-remove" onClick={() => removeTodo(todo.id)} title="删除">
              ×
            </button>
          </div>
        ))}

        {todos.length === 0 && (
          <div className="todo-empty">暂无待办事项</div>
        )}
      </div>

      <style>{`
        .todo-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          border-bottom: 1px solid var(--border-color);
        }

        .todo-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .todo-progress {
          font-size: 11px;
          color: var(--accent);
          background: var(--accent-light);
          padding: 2px 8px;
          border-radius: 10px;
          font-weight: 600;
        }

        .todo-add {
          display: flex;
          gap: 6px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--border-color);
        }

        .todo-add input {
          flex: 1;
          padding: 5px 8px;
          font-size: 12px;
        }

        .todo-list {
          flex: 1;
          overflow-y: auto;
          padding: 6px 0;
        }

        .todo-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 14px;
          transition: background 0.15s;
        }
        .todo-item:hover {
          background: var(--bg-tertiary);
        }
        .todo-item.completed {
          opacity: 0.6;
        }

        .todo-check {
          font-size: 16px;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: var(--text-secondary);
        }
        .todo-check.done {
          color: var(--success);
        }

        .todo-text {
          flex: 1;
          font-size: 13px;
          border: none;
          background: transparent;
          padding: 3px 0;
          outline: none;
        }
        .todo-text:focus {
          border-bottom: 1px solid var(--accent);
        }
        .todo-text.done {
          text-decoration: line-through;
          color: var(--text-muted);
        }

        .todo-time {
          width: 48px;
          font-size: 11px;
          border: 1px solid var(--border-color);
          border-radius: 3px;
          padding: 2px 4px;
          text-align: center;
          background: var(--bg-primary);
        }

        .todo-remove {
          font-size: 16px;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          opacity: 0;
          transition: opacity 0.15s;
          flex-shrink: 0;
        }
        .todo-item:hover .todo-remove {
          opacity: 1;
        }
        .todo-remove:hover {
          color: var(--danger);
        }

        .todo-empty {
          text-align: center;
          padding: 20px;
          color: var(--text-muted);
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
