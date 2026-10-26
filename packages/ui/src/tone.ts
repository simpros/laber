export type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-text-secondary",
};

const TONE_BG: Record<Tone, string> = {
  success: "bg-success/10",
  warning: "bg-warning/10",
  danger: "bg-danger/10",
  neutral: "bg-surface-3",
};

const TONE_BORDER: Record<Tone, string> = {
  success: "border-success/20",
  warning: "border-warning/20",
  danger: "border-danger/20",
  neutral: "border-border",
};

export function toneClass(tone: Tone): string {
  return `${TONE_BG[tone]} ${TONE_TEXT[tone]}`;
}

export function toneSurface(tone: Tone): string {
  return `${TONE_BG[tone]} ${TONE_BORDER[tone]}`;
}

export function toneText(tone: Tone): string {
  return TONE_TEXT[tone];
}
