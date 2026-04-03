import { useState, useCallback, useEffect } from "react";

export interface SessionTab {
  id: string;
  title: string;
}

const STORAGE_KEY = "studio_open_tabs";

function loadTabs(): SessionTab[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTabs(tabs: SessionTab[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
}

export function useSessionTabs(activeSessionId: string | null) {
  const [tabs, setTabs] = useState<SessionTab[]>(loadTabs);

  // Persist on change
  useEffect(() => { saveTabs(tabs); }, [tabs]);

  // Ensure active session is always in tabs
  useEffect(() => {
    if (!activeSessionId) return;
    setTabs(prev => {
      if (prev.some(t => t.id === activeSessionId)) return prev;
      return [...prev, { id: activeSessionId, title: "New Session" }];
    });
  }, [activeSessionId]);

  const openTab = useCallback((id: string, title?: string) => {
    setTabs(prev => {
      if (prev.some(t => t.id === id)) return prev;
      return [...prev, { id, title: title || "New Session" }];
    });
  }, []);

  const closeTab = useCallback((id: string): string | null => {
    // Compute next-active synchronously from current tabs before the async setState
    const idx = tabs.findIndex(t => t.id === id);
    const remaining = tabs.filter(t => t.id !== id);
    const nextActive = id === activeSessionId && remaining.length > 0
      ? remaining[Math.min(idx, remaining.length - 1)]?.id ?? null
      : null;
    setTabs(remaining);
    return nextActive;
  }, [tabs, activeSessionId]);

  const updateTitle = useCallback((id: string, title: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, title } : t));
  }, []);

  return { tabs, openTab, closeTab, updateTitle };
}
