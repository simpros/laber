export type Theme = "light" | "dark";

let current = $state<Theme>("dark");

export const theme = {
  get value() {
    return current;
  },
  set value(t: Theme) {
    current = t;
    document.documentElement.classList.toggle("dark", t === "dark");
    document.cookie = `theme=${t};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
  },
  init(t: Theme) {
    current = t;
  },
  toggle() {
    theme.value = current === "dark" ? "light" : "dark";
  },
};
