import { useEffect, useMemo, useState } from "react";
import type { ToastTone } from "./Toast";
import type { Note, NoteRevision } from "../lib/types";
import { parseTodos } from "../lib/types";
import { getNoteRevisions, restoreNoteRevision } from "../lib/tauri";
import { Button } from "./ui/Button";
import { ModalShell } from "./ui/ModalShell";

export interface NoteHistoryModalProps {
  currentDate: string;
  onClose: () => void;
  onRestored: (note: Note) => void;
  onToast: (message: string, tone?: ToastTone) => void;
}

function plainTextFromHtml(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container.textContent?.trim() || "无正文内容";
}

function revisionSummary(revision: NoteRevision): string {
  const text = plainTextFromHtml(revision.content);
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

export function NoteHistoryModal({
  currentDate,
  onClose,
  onRestored,
  onToast,
}: NoteHistoryModalProps) {
  const [revisions, setRevisions] = useState<NoteRevision[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setSelectedId(null);
    void getNoteRevisions(currentDate)
      .then((items) => {
        if (cancelled) return;
        setRevisions(items);
        setSelectedId(items[0]?.id ?? null);
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus("error");
        onToast(`加载历史版本失败: ${String(error)}`, "error");
      });
    return () => {
      cancelled = true;
    };
  }, [currentDate, onToast]);

  const selected = useMemo(
    () => revisions.find((revision) => revision.id === selectedId) ?? null,
    [revisions, selectedId],
  );

  async function handleRestore() {
    if (!selected || isRestoring) return;
    if (!window.confirm("确认恢复此历史版本？当前内容会先进入新的历史版本。")) return;
    setIsRestoring(true);
    try {
      const note = await restoreNoteRevision(selected.id);
      onRestored(note);
      onToast("已恢复历史版本");
      onClose();
    } catch (error) {
      onToast(`恢复历史版本失败: ${String(error)}`, "error");
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <ModalShell
      title="历史版本"
      onClose={onClose}
      closeLabel="关闭历史版本"
      size="wide"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={handleRestore} disabled={!selected || isRestoring}>
            {isRestoring ? "恢复中…" : "恢复此版本"}
          </Button>
        </>
      )}
    >
      <div className="note-history-modal">
        {status === "loading" && <p className="note-history-empty">正在加载历史版本…</p>}
        {status === "error" && <p className="note-history-empty">历史版本加载失败</p>}
        {status === "ready" && revisions.length === 0 && (
          <p className="note-history-empty">暂无历史版本</p>
        )}
        {status === "ready" && revisions.length > 0 && (
          <div className="note-history-layout">
            <div className="note-history-list" aria-label="历史版本列表">
              {revisions.map((revision) => (
                <button
                  key={revision.id}
                  type="button"
                  className={`note-history-item ${revision.id === selectedId ? "is-selected" : ""}`}
                  onClick={() => setSelectedId(revision.id)}
                >
                  <span>{revision.created_at}</span>
                  <small>{revisionSummary(revision)}</small>
                </button>
              ))}
            </div>
            <div className="note-history-preview" aria-label="历史版本预览">
              {selected && (
                <>
                  <div className="note-history-meta">
                    <span>{selected.created_at}</span>
                    <span>待办 {parseTodos(selected.todos).length} 项</span>
                  </div>
                  <div className="note-history-content">{plainTextFromHtml(selected.content)}</div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      <style>{`
        .note-history-layout {
          display: grid;
          grid-template-columns: minmax(180px, 240px) 1fr;
          gap: 16px;
          min-height: 280px;
        }
        .note-history-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .note-history-item {
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--surface);
          color: var(--text);
          cursor: pointer;
          padding: 10px;
          text-align: left;
        }
        .note-history-item.is-selected {
          border-color: var(--accent);
          box-shadow: 0 0 0 1px var(--accent);
        }
        .note-history-item span,
        .note-history-item small {
          display: block;
        }
        .note-history-item small {
          color: var(--text-muted);
          margin-top: 4px;
        }
        .note-history-preview {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 14px;
          min-height: 220px;
        }
        .note-history-meta {
          color: var(--text-muted);
          display: flex;
          gap: 12px;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .note-history-content {
          line-height: 1.7;
          white-space: pre-wrap;
        }
        .note-history-empty {
          color: var(--text-muted);
          margin: 8px 0;
        }
        @media (max-width: 719px) {
          .note-history-layout {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </ModalShell>
  );
}

export default NoteHistoryModal;
