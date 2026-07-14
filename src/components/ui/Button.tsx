import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

export type ButtonVariant = "primary" | "secondary" | "subtle" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  return <button className={`ui-button ui-button--${variant} ${className}`.trim()} {...props} />;
}

export interface IconButtonProps extends Omit<ButtonProps, "aria-label" | "title"> {
  label: string;
  children: ReactNode;
  active?: boolean;
}

export function IconButton({ label, active, className = "", ...props }: IconButtonProps) {
  return (
    <Button
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`ui-icon-button ${active ? "is-active" : ""} ${className}`.trim()}
      {...props}
    />
  );
}
