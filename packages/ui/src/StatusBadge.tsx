import type { ReactNode } from "react";
import { cn } from "./cn.js";
import { toneClass, type Tone } from "./tone.js";

export interface StatusBadgeProps {
  tone: Tone;
  className?: string;
  children: ReactNode;
}

export default function StatusBadge({
  tone,
  className,
  children,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium",
        toneClass(tone),
        className
      )}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full bg-current"
      ></span>
      {children}
    </span>
  );
}
