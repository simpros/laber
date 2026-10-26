import { TONE_TOKENS, type StatusTone } from "@laber/ui";

export function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Container states are docker's vocabulary, not stack/activity statuses,
// so they get their own state→tone map. An unclassifiable container
// state renders danger (needs attention); an unknown status label
// renders neutral instead (see StatusBadge).
const CONTAINER_TONE: Record<string, StatusTone> = {
  running: "success",
  exited: "warning",
  stopped: "warning",
};

function containerTone(state: string): StatusTone {
  return CONTAINER_TONE[state] ?? "danger";
}

export function statusColor(state: string) {
  return TONE_TOKENS[containerTone(state)].text;
}

export function containerStatusBg(state: string) {
  return TONE_TOKENS[containerTone(state)].surface;
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
