import type { StatusTone } from "@laber/ui";

export function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function statusColor(state: string) {
  if (state === "running") return "text-success";
  if (state === "exited" || state === "stopped") return "text-warning";
  return "text-danger";
}

export function containerStatusBg(state: string) {
  if (state === "running") return "bg-success/10 border-success/20";
  if (state === "exited") return "bg-warning/10 border-warning/20";
  return "bg-danger/10 border-danger/20";
}

// Badge tones live in one table: stack statuses (deployed/stopped/
// discovered) and deployment-log statuses (running/success/error) map
// to a kit tone here, so @laber/ui stays free of domain vocabulary.
// Container text colors above are a separate scale on purpose: a
// running container reads green inline but amber as a badge.
const STATUS_TONE: Record<string, StatusTone> = {
  success: "success",
  deployed: "success",
  running: "warning",
  stopped: "warning",
  error: "danger",
  discovered: "neutral",
};

export function statusTone(status: string): StatusTone {
  return STATUS_TONE[status] ?? "neutral";
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
