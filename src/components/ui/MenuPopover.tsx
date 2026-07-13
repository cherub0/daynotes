import { Children, cloneElement, isValidElement, useEffect, useId, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { IconButton } from "./Button";

type MenuItemProps = { role?: string; tabIndex?: number };
const MENU_ITEM_SELECTOR = "[role='menuitem']:not([disabled]):not([aria-disabled='true']), [role='menuitemcheckbox']:not([disabled]):not([aria-disabled='true']), [role='menuitemradio']:not([disabled]):not([aria-disabled='true'])";

function exposeMenuItems(children: ReactNode) {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const item = child as ReactElement<MenuItemProps>;
    const role = item.props.role ?? "menuitem";
    const isMenuItem = role === "menuitem" || role === "menuitemcheckbox" || role === "menuitemradio";
    return cloneElement(item, { role, tabIndex: isMenuItem ? (item.props.tabIndex ?? -1) : item.props.tabIndex });
  });
}

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
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();

  useEffect(() => () => {
    if (focusTimerRef.current !== null) clearTimeout(focusTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;

    const getItems = () => Array.from(containerRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? []);
    const restoreTriggerFocus = (deferred: boolean) => {
      const focusTrigger = () => containerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      if (!deferred) {
        focusTrigger();
        return;
      }
      if (focusTimerRef.current !== null) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => {
        focusTimerRef.current = null;
        focusTrigger();
      }, 0);
    };
    const closeAndRestoreFocus = (deferred = false) => {
      setOpen(false);
      restoreTriggerFocus(deferred);
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) closeAndRestoreFocus(true);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAndRestoreFocus();
        return;
      }
      if (!(["ArrowDown", "ArrowUp", "Home", "End"] as string[]).includes(event.key)) return;

      const items = getItems();
      if (items.length === 0) return;
      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      if (event.key === "Home") items[0].focus();
      else if (event.key === "End") items[items.length - 1].focus();
      else if (event.key === "ArrowDown") items[(currentIndex + 1 + items.length) % items.length].focus();
      else items[(currentIndex - 1 + items.length) % items.length].focus();
    };

    getItems()[0]?.focus();
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
        active={active}
        className={open ? "is-active" : ""}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        {triggerContent}
      </IconButton>
      {open && (
        <div id={menuId} role="menu" aria-label={label} className={`ui-menu-popover__menu ui-menu-popover__menu--${align}`}>
          {exposeMenuItems(children)}
        </div>
      )}
    </div>
  );
}
