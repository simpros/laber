import { twMerge, type ClassNameValue } from "tailwind-merge";

export function cn(...inputs: ClassNameValue[]): string {
  return twMerge(...inputs);
}
