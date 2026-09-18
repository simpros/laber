import { twMerge, type ClassNameValue } from "tailwind-merge";

/** Resolves Tailwind conflicts (last wins). */
export function cn(...inputs: ClassNameValue[]): string {
  return twMerge(...inputs);
}
