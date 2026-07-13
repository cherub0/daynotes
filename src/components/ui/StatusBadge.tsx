import type { ReactNode } from "react";

export type StatusTone = "saved" | "dirty" | "saving" | "warning" | "error";

export function StatusBadge({ status, children }: { status: StatusTone; children: ReactNode }) {
  return (
    <span className={`ui-status ui-status--${status}`} role={status === "error" ? "alert" : "status"}>
      {children}
    </span>
  );
}
