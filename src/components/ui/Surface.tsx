import type { HTMLAttributes } from "react";

export type SurfaceVariant = "paper" | "raised" | "inset";

export function Surface({
  variant,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant: SurfaceVariant }) {
  return <div className={`ui-surface ui-surface--${variant} ${className}`.trim()} {...props} />;
}
