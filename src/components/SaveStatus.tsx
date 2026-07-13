import type { SaveStatus } from "../hooks/useNoteSession";
import { Button } from "./ui/Button";
import { StatusBadge } from "./ui/StatusBadge";

const LABELS: Record<SaveStatus, string> = {
  saved: "已保存",
  dirty: "未保存",
  saving: "正在保存",
  error: "保存失败",
};

export function SaveStatusIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  return (
    <div className="save-status">
      <StatusBadge status={status}>{LABELS[status]}</StatusBadge>
      {status === "error" && <Button variant="subtle" onClick={onRetry}>重试</Button>}
    </div>
  );
}
