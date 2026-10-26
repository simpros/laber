import { StatusBadge as KitStatusBadge } from "@laber/ui";
import type { Tone } from "@laber/ui";
import type { ActivityStatus, StackStatus } from "@laber/api-client";

type BadgeStatus = StackStatus | ActivityStatus;

const TONE: Record<BadgeStatus, Tone> = {
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
    <KitStatusBadge tone={TONE[status]} className={className}>
      {status}
    </KitStatusBadge>
  );
}
