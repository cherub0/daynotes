export type ToastTone = "success" | "warning" | "error";

export interface ToastProps {
  message: string;
  tone: ToastTone;
}

export function Toast({ message, tone }: ToastProps) {
  const isError = tone === "error";

  return (
    <div
      className={`toast toast--${tone}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? undefined : "polite"}
    >
      {message}
    </div>
  );
}
