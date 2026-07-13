import { Children, cloneElement, Fragment, isValidElement, useEffect, useId, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { IconButton } from "./Button";
import { isElementVisible } from "./focus";

type MenuItemProps = { role?: string; tabIndex?: number };
const MENU_ITEM_SELECTOR = "[role='menuitem']:not([disabled]):not([aria-disabled='true']), [role='menuitemcheckbox']:not([disabled]):not([aria-disabled='true']), [role='menuitemradio']:not([disabled]):not([aria-disabled='true'])";
const MENU_ITEM_ROLES = new Set(["menuitem", "menuitemcheckbox", "menuitemradio"]);
const DIRECT_ACTION_ELEMENTS = new Set(["button", "a"]);

function normalizeMenuItems(children: ReactNode): ReactElement<MenuItemProps>[] {
  const items: ReactElement<MenuItemProps>[] = [];
  const append = (nodes: ReactNode) => Children.forEach(nodes, (child) => {
    if (child === null || child === undefined || typeof child === "boolean") return;
    if (!isValidElement(child)) {
      throw new Error("MenuPopover children must be direct DOM action elements or Fragments of them.");
    }
    if (child.type === Fragment) {
      append((child.props as { children?: ReactNode }).children);
      return;
    }
    if (typeof child.type !== "string") {
      throw new Error("MenuPopover children must be direct DOM action elements; component wrappers must forward a rendered action element directly instead.");
    }

    const item = child as ReactElement<MenuItemProps>;
    const role = item.props.role ?? (DIRECT_ACTION_ELEMENTS.has(child.type) ? "menuitem" : undefined);
    if (!role || !MENU_ITEM_ROLES.has(role)) {
      throw new Error("MenuPopover children must be direct DOM action elements with a valid menu item role.");
    }
    items.push(cloneElement(item, {
      key: item.key ?? `menu-item-${items.length}`,
      role,
      tabIndex: item.props.tabIndex ?? -1,
    }));
  });
  append(children);
  return items;
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
  const initialFocusRef = useRef<"first" | "last">("first");
  const menuId = useId();
  const menuItems = normalizeMenuItems(children);

  useEffect(() => () => {
    if (focusTimerRef.current !== null) clearTimeout(focusTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;

    const getItems = () => Array.from(containerRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? []).filter(isElementVisible);
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
      if (event.key === "Tab") {
        setOpen(false);
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

    const items = getItems();
    items[initialFocusRef.current === "last" ? items.length - 1 : 0]?.focus();
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
        onClick={() => {
          initialFocusRef.current = "first";
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (open || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
          event.preventDefault();
          initialFocusRef.current = event.key === "ArrowUp" ? "last" : "first";
          setOpen(true);
        }}
      >
        {triggerContent}
      </IconButton>
      {open && (
        <div id={menuId} role="menu" aria-label={label} className={`ui-menu-popover__menu ui-menu-popover__menu--${align}`}>
          {menuItems}
        </div>
      )}
    </div>
  );
}
