import type { ReactNode } from "react";
import { cn } from "./cn.js";

export type AlertVariant = "success" | "error" | "warning";

export interface AlertProps {
  variant: AlertVariant;
  mono?: boolean;
  className?: string;
  children: ReactNode;
}

const styles: Record<AlertVariant, string> = {
  success: "bg-success/5 border-success/20 text-success",
  error: "bg-danger/5 border-danger/20 text-danger",
  warning: "bg-warning/5 border-warning/20 text-warning",
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
