import type { CSSProperties, ReactNode } from "react";
import { cn } from "./cn.js";

export interface CardProps {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export default function Card({ children, className, style }: CardProps) {
  return (
    <div
      style={style}
      className={cn(
        "bg-surface-2 border-border rounded-xl border shadow-sm shadow-black/5",
        className
      )}
    >
      {children}
    </div>
  );
}
