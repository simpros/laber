import type { ActivityStatus, StackStatus } from "@laber/api-client";
import type { Tone } from "@laber/ui";

const STACK_TONE: Record<StackStatus, Tone> = {
  discovered: "neutral",
  deployed: "success",
  stopped: "warning",
  error: "danger",
};

const LOG_TONE: Record<ActivityStatus, Tone> = {
  running: "warning",
  success: "success",
  error: "danger",
};

export const stackTone = (status: StackStatus): Tone => STACK_TONE[status];
export const logTone = (status: ActivityStatus): Tone => LOG_TONE[status];
