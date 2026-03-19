import { useState, useEffect, useCallback } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "settings_theme";

function readStored(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string;
      if (parsed === "light") return "light";
    }
  } catch { /* noop */ }
  return "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStored);

  // Apply on mount (covers page reload before React hydrates)
  useEffect(() => { applyTheme(theme); }, []);

  // Sync attribute + storage whenever theme changes
  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(theme)); } catch { /* noop */ }
  }, [theme]);

  // Listen for changes from Settings page (different component tree)
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<Theme>).detail;
      if (next === "dark" || next === "light") setThemeState(next);
    };
    window.addEventListener("studio:theme-change", handler);
    return () => window.removeEventListener("studio:theme-change", handler);
  }, []);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = useCallback(() => {
    setThemeState(prev => prev === "dark" ? "light" : "dark");
  }, []);

  return { theme, setTheme, toggleTheme } as const;
}
