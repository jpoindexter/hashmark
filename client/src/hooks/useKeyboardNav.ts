import { useEffect, useRef, useCallback } from "react";

type PaletteMode = "commands" | "files";

interface UseKeyboardNavParams {
  navigate: (to: string | number) => void;
  setCmdOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPaletteMode: React.Dispatch<React.SetStateAction<PaletteMode>>;
  shortcutsOpen: boolean;
  setShortcutsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTermOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const G_NAV: Record<string, string> = {
  s: "/",
  a: "/agents",
  g: "/generate",
};

/**
 * Registers keyboard shortcuts for navigation and UI toggles.
 *
 * g+key: navigate to views (g s, g r, g c, g a, g g, g f)
 * ?: toggle shortcuts overlay
 * Cmd+K / Cmd+Shift+P: toggle command palette
 * Cmd+Shift+F: open search
 * Cmd+` / Cmd+J: toggle terminal
 * Cmd+B: toggle sidebar
 */
export function useKeyboardNav({
  navigate,
  setCmdOpen,
  setPaletteMode,
  shortcutsOpen,
  setShortcutsOpen,
  setTermOpen,
  setSidebarOpen,
}: UseKeyboardNavParams): void {
  const shortcutsOpenRef = useRef(false);
  const lastKeyRef = useRef<string | null>(null);
  const lastKeyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep ref in sync with external state so the keydown handler reads the
  // correct value without needing to re-register on every render
  useEffect(() => {
    shortcutsOpenRef.current = shortcutsOpen;
  }, [shortcutsOpen]);

  const clearLastKey = useCallback(() => {
    lastKeyRef.current = null;
    if (lastKeyTimer.current) {
      clearTimeout(lastKeyTimer.current);
      lastKeyTimer.current = null;
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Skip when typing in inputs
      if (
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement
      ) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;

      // Cmd+` or Cmd+J: toggle terminal
      if (mod && e.key === "`") {
        e.preventDefault();
        setTermOpen(v => !v);
        return;
      }
      if (mod && e.key === "j") {
        e.preventDefault();
        setTermOpen(v => !v);
        return;
      }

      // Cmd+P (no shift): open palette in file mode
      if (mod && e.key === "p" && !e.shiftKey) {
        e.preventDefault();
        setPaletteMode("files");
        setCmdOpen(true);
        return;
      }

      // Cmd+K or Cmd+Shift+P: open palette in command mode
      if (mod && (e.key === "k" || (e.key === "p" && e.shiftKey))) {
        e.preventDefault();
        setPaletteMode("commands");
        setCmdOpen(v => !v);
        return;
      }

      // Cmd+B: toggle sidebar
      if (mod && e.key === "b") {
        e.preventDefault();
        setSidebarOpen(v => !v);
        return;
      }

      // Cmd+1-9: switch session by index
      if (mod && !e.shiftKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("studio:switch-session-by-index", { detail: Number(e.key) - 1 }));
        return;
      }

      // Cmd+Shift+A: Agents
      if (mod && e.shiftKey && e.key === "A") { e.preventDefault(); navigate("/agents"); return; }
      // Cmd+,: Settings
      if (mod && e.key === ",") { e.preventDefault(); navigate("/settings"); return; }

      // ?: toggle shortcuts overlay
      if (!mod && e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(v => !v);
        clearLastKey();
        return;
      }

      // Esc: close shortcuts overlay
      if (e.key === "Escape" && shortcutsOpenRef.current) {
        setShortcutsOpen(false);
        clearLastKey();
        return;
      }

      // g then X: navigation
      if (!mod && lastKeyRef.current === "g") {
        const dest = G_NAV[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          navigate(dest);
          clearLastKey();
          return;
        }
      }

      // g pressed: start waiting for second key
      if (!mod && e.key.toLowerCase() === "g") {
        lastKeyRef.current = "g";
        if (lastKeyTimer.current) clearTimeout(lastKeyTimer.current);
        lastKeyTimer.current = setTimeout(clearLastKey, 1000);
        return;
      }

      clearLastKey();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, clearLastKey, setCmdOpen, setPaletteMode, setShortcutsOpen, setTermOpen, setSidebarOpen]);
}
