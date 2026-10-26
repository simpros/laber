export type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-surface-3 text-text-secondary",
};

export function toneClass(tone: Tone): string {
  return TONE_CLASS[tone];
}
