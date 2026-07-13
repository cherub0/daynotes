import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { IconButton } from "./Button";

export interface MenuPopoverProps {
  label: string;
  triggerContent: ReactNode;
  children: ReactNode;
  active?: boolean;
  align?: "start" | "end";
  className?: string;
}

export function MenuPopover({
  label,
  triggerContent,
  children,
  active = false,
  align = "start",
  className = "",
}: MenuPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const closeAndRestoreFocus = () => {
      setOpen(false);
      containerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) closeAndRestoreFocus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAndRestoreFocus();
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`ui-menu-popover ${className}`.trim()}>
      <IconButton
        label={label}
        active={active || open}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        {triggerContent}
      </IconButton>
      {open && (
        <div id={menuId} role="menu" aria-label={label} className={`ui-menu-popover__menu ui-menu-popover__menu--${align}`}>
          {children}
        </div>
      )}
    </div>
  );
}
