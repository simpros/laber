import { StatusBadge as KitStatusBadge, type StatusTone } from "@laber/ui";
import type { ActivityStatus, StackStatus } from "@laber/api-client";

type BadgeStatus = StackStatus | ActivityStatus;

const TONE: Record<BadgeStatus, StatusTone> = {
  discovered: "neutral",
  deployed: "success",
  stopped: "warning",
  running: "warning",
  success: "success",
  error: "danger",
};

export default function StatusBadge({
  status,
  className,
}: {
  status: BadgeStatus;
  className?: string;
}) {
  return (
    <KitStatusBadge
      status={status}
      tone={TONE[status]}
      className={className}
    />
  );
}
