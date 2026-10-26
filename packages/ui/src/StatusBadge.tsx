import { cn } from "./cn.js";

export interface StatusBadgeProps {
  status: string;
  className?: string;
}

function statusColorClass(s: string): string {
  if (s === "success" || s === "deployed")
    return "bg-success/10 text-success";
  if (s === "error") return "bg-danger/10 text-danger";
  if (s === "discovered") return "bg-surface-3 text-text-secondary";
  return "bg-warning/10 text-warning";
}

export default function StatusBadge({
  status,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs font-medium",
        statusColorClass(status),
        className
      )}
    >
      {status}
    </span>
  );
}
