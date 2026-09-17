import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const base =
  "rounded-lg font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent hover:bg-accent-hover text-white",
  secondary: "border-border hover:bg-surface-3 border",
  danger: "bg-danger/10 text-danger hover:bg-danger/20",
  ghost: "text-text-secondary hover:text-text-primary",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

export default function Button({
  variant = "secondary",
  size = "md",
  children,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {children}
    </button>
  );
}
