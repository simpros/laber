import { toneSurface, toneText, type Tone } from "@laber/ui";

export function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Docker states are not stack/activity statuses; an unclassifiable
// container reads danger so it gets attention.
const CONTAINER_TONE = new Map<string, Tone>([
  ["running", "success"],
  ["exited", "warning"],
  ["stopped", "warning"],
]);

function containerTone(state: string): Tone {
  return CONTAINER_TONE.get(state) ?? "danger";
}

export function statusColor(state: string) {
  return toneText(containerTone(state));
}

export function containerStatusBg(state: string) {
  return toneSurface(containerTone(state));
}

export function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
