import { useEffect, useId, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";
import { IconButton } from "./Button";
import { getFocusableElements, loopFocus } from "./focus";

export interface ModalShellProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: "compact" | "default" | "wide";
  closeOnBackdrop?: boolean;
}

export function ModalShell({
  title,
  children,
  onClose,
  footer,
  size = "default",
  closeOnBackdrop = true,
}: ModalShellProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    openerRef.current = document.activeElement as HTMLElement | null;
    (getFocusableElements(dialog)[0] ?? dialog).focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      else loopFocus(event, dialog);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      openerRef.current?.focus();
    };
  }, []);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && event.target === event.currentTarget) onClose();
  };

  return (
    <div className="ui-modal-backdrop" onMouseDown={handleBackdropClick}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`ui-modal ui-modal--${size}`}
      >
        <header className="ui-modal__header">
          <h2 id={titleId}>{title}</h2>
          <IconButton label="关闭" variant="subtle" onClick={onClose}>×</IconButton>
        </header>
        <div className="ui-modal__content">{children}</div>
        {footer && <footer className="ui-modal__footer">{footer}</footer>}
      </div>
    </div>
  );
}
