import { cn } from "./cn.js";

export type StatusTone = "success" | "warning" | "danger" | "neutral";

const TONE_CLASS: Record<StatusTone, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-surface-3 text-text-secondary",
};

export interface StatusBadgeProps {
  status: string;
  tone: StatusTone;
  className?: string;
}

export default function StatusBadge({
  status,
  tone,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs font-medium",
        TONE_CLASS[tone],
        className
      )}
    >
      {status}
    </span>
  );
}
