import { useEffect } from "react";

export interface Shortcut {
  key: string;
  mod?: boolean;
  shift?: boolean;
  description: string;
  action: () => void;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      const mod = e.metaKey || e.ctrlKey;
      for (const s of shortcuts) {
        if (s.key.toLowerCase() !== e.key.toLowerCase()) continue;
        if (s.mod && !mod) continue;
        if (!s.mod && mod) continue;
        if (s.shift && !e.shiftKey) continue;
        e.preventDefault();
        s.action();
        return;
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
