import { twMerge, type ClassNameValue } from "tailwind-merge";

/** Merge class names, resolving Tailwind conflicts (last wins). */
export function cn(...inputs: ClassNameValue[]): string {
  return twMerge(...inputs);
}
