import type { ReactNode } from "react";
import { cn } from "./cn.js";

export type IconSize = "sm" | "md" | "lg";

export interface IconProps {
  size?: IconSize;
  className?: string;
  children: ReactNode;
}

const sizes: Record<IconSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export default function Icon({
  size = "md",
  children,
  className,
}: IconProps) {
  return (
    <svg
      className={cn(sizes[size], "shrink-0", className)}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      {children}
    </svg>
  );
}
