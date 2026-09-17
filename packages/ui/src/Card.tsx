import type { ReactNode } from "react";
import { cn } from "./cn.js";

export interface CardProps {
  className?: string;
  children: ReactNode;
}

export default function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        "bg-surface-2 border-border rounded-xl border",
        className
      )}
    >
      {children}
    </div>
  );
}
