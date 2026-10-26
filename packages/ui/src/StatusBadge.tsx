import { cn } from "./cn.js";

export interface StatusBadgeProps {
  status: string;
  className?: string;
}

// Stack and activity statuses share one tone scale. Unknown values fall
// back to neutral so unrecognized statuses never read as a warning.
const TONE: Record<string, string> = {
  success: "bg-success/10 text-success",
  deployed: "bg-success/10 text-success",
  error: "bg-danger/10 text-danger",
  stopped: "bg-warning/10 text-warning",
  discovered: "bg-surface-3 text-text-secondary",
};

const NEUTRAL_TONE = "bg-surface-3 text-text-secondary";

function statusColorClass(s: string): string {
  return TONE[s] ?? NEUTRAL_TONE;
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
