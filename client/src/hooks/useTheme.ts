import { useState, useEffect, useCallback } from "react";

type ThemeSetting = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "studio:theme";

function readStored(): ThemeSetting {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string;
      if (parsed === "light" || parsed === "system") return parsed as ThemeSetting;
    }
  } catch { /* noop */ }
  return "dark";
}

function resolveTheme(setting: ThemeSetting): ResolvedTheme {
  if (setting === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return setting;
}

function applyTheme(theme: ResolvedTheme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function useTheme() {
  const [setting, setSettingState] = useState<ThemeSetting>(readStored);
  const [theme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(readStored()));

  // Apply on mount
  useEffect(() => { applyTheme(theme); }, []);

  // Sync attribute + storage whenever setting changes
  useEffect(() => {
    const resolved = resolveTheme(setting);
    setResolvedTheme(resolved);
    applyTheme(resolved);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(setting)); } catch { /* noop */ }
  }, [setting]);

  // Listen for OS theme changes when in system mode
  useEffect(() => {
    if (setting !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => {
      const resolved = resolveTheme("system");
      setResolvedTheme(resolved);
      applyTheme(resolved);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [setting]);

  // Listen for changes from Settings page
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<string>).detail;
      if (next === "dark" || next === "light" || next === "system") setSettingState(next);
    };
    window.addEventListener("studio:theme-change", handler);
    return () => window.removeEventListener("studio:theme-change", handler);
  }, []);

  const setTheme = useCallback((t: ThemeSetting) => setSettingState(t), []);
  const toggleTheme = useCallback(() => {
    setSettingState(prev => {
      if (prev === "dark") return "light";
      if (prev === "light") return "system";
      return "dark";
    });
  }, []);

  return { theme, setting, setTheme, toggleTheme } as const;
}
