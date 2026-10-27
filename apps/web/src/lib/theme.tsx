import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";
const ORDER: ThemePreference[] = ["system", "light", "dark"];
const query = () => window.matchMedia("(prefers-color-scheme: dark)");

const ThemeContext = createContext<{
  preference: ThemePreference;
  theme: Theme;
  cycle: () => void;
}>({
  preference: "system",
  theme: "dark",
  cycle: () => {},
});

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // storage unavailable: fall through to the OS default
  }
  return "system";
}

function resolve(preference: ThemePreference): Theme {
  if (preference !== "system") return preference;
  return query().matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] =
    useState<ThemePreference>(readPreference);
  const [theme, setTheme] = useState<Theme>(() => resolve(preference));

  useEffect(() => {
    const sync = () => setTheme(resolve(preference));
    sync();
    if (preference !== "system") return;
    const mq = query();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [preference]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // persistence is best-effort
    }
  }, [preference]);

  const cycle = useCallback(() => {
    setPreference((p) => ORDER[(ORDER.indexOf(p) + 1) % ORDER.length]!);
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, theme, cycle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
