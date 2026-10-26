import { cn } from "./cn.js";

export interface StatusBadgeProps {
  status: string;
  className?: string;
}

// Stack and activity statuses share one tone scale. Unknown values fall
// back to neutral so unrecognized statuses never read as a warning.
type BadgeStatus =
  | "success"
  | "error"
  | "running"
  | "deployed"
  | "stopped"
  | "discovered";

const TONE = {
  success: "bg-success/10 text-success",
  deployed: "bg-success/10 text-success",
  error: "bg-danger/10 text-danger",
  running: "bg-warning/10 text-warning",
  stopped: "bg-warning/10 text-warning",
  discovered: "bg-surface-3 text-text-secondary",
} satisfies Record<BadgeStatus, string>;

const NEUTRAL_TONE = "bg-surface-3 text-text-secondary";

// Runtime values are open, so the unknown-status cast stays in one place.
const toneOf = (s: string) => TONE[s as BadgeStatus] ?? NEUTRAL_TONE;

export default function StatusBadge({
  status,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs font-medium",
        toneOf(status),
        className
      )}
    >
      {status}
    </span>
  );
}
