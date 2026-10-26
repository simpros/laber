import type { ReactNode } from "react";
import { cn } from "./cn.js";
import { toneText } from "./tone.js";

export type AlertVariant = "success" | "error" | "warning";

export interface AlertProps {
  variant: AlertVariant;
  mono?: boolean;
  className?: string;
  children: ReactNode;
}

// Alerts keep their fainter surface; only the text colour is shared.
const styles: Record<AlertVariant, string> = {
  success: `bg-success/5 ${toneText("success")} border-success/20`,
  error: `bg-danger/5 ${toneText("danger")} border-danger/20`,
  warning: `bg-warning/5 ${toneText("warning")} border-warning/20`,
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
