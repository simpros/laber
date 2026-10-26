import type { StatusTone } from "@laber/ui";

export function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Container states are a different domain from stack/activity statuses,
// so they get their own state→tone map; the tone→class tables below are
// the single place those tones turn into classes.
const CONTAINER_TONE: Record<string, StatusTone> = {
  running: "success",
  exited: "warning",
  stopped: "warning",
};

function containerTone(state: string): StatusTone {
  return CONTAINER_TONE[state] ?? "danger";
}

const TONE_TEXT: Record<StatusTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-text-secondary",
};

const TONE_BG: Record<StatusTone, string> = {
  success: "bg-success/10 border-success/20",
  warning: "bg-warning/10 border-warning/20",
  danger: "bg-danger/10 border-danger/20",
  neutral: "bg-surface-3 border-border",
};

export function statusColor(state: string) {
  return TONE_TEXT[containerTone(state)];
}

export function containerStatusBg(state: string) {
  return TONE_BG[containerTone(state)];
}

export function timeAgo(date: Date | string | null) {
  if (!date) return "never";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
