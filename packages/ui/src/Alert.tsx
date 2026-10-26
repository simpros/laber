import type { ReactNode } from "react";
import { cn } from "./cn.js";
import { toneClass } from "./tone.js";

export type AlertVariant = "success" | "error" | "warning";

export interface AlertProps {
  variant: AlertVariant;
  mono?: boolean;
  className?: string;
  children: ReactNode;
}

const styles: Record<AlertVariant, string> = {
  success: `${toneClass("success")} border-success/20`,
  error: `${toneClass("danger")} border-danger/20`,
  warning: `${toneClass("warning")} border-warning/20`,
};

export default function Alert({
  variant,
  mono = false,
  children,
  className,
}: AlertProps) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 text-sm",
        styles[variant],
        mono && "font-mono text-xs whitespace-pre-wrap",
        className
      )}
    >
      {children}
    </div>
  );
}
