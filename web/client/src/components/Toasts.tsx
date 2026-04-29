import { useState, useEffect, useCallback } from "react";

interface Toast { id: number; message: string; type: "success" | "error" | "info"; }

let _addToast: ((msg: string, type: Toast["type"]) => void) | null = null;

export const toast = {
  success: (msg: string) => _addToast?.(msg, "success"),
  error:   (msg: string) => _addToast?.(msg, "error"),
  info:    (msg: string) => _addToast?.(msg, "info"),
};

let _nextId = 0;

export function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((message: string, type: Toast["type"]) => {
    const id = _nextId++;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  useEffect(() => { _addToast = add; return () => { _addToast = null; }; }, [add]);

  if (!toasts.length) return null;

  return (
    <div style={{
      position: "fixed", bottom: 20, right: 20, zIndex: 9999,
      display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: "8px 14px",
          borderRadius: 6,
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          background: t.type === "error" ? "#3d1515" : t.type === "success" ? "#0f2d1f" : "#1a1a2e",
          color: t.type === "error" ? "var(--red)" : t.type === "success" ? "var(--green)" : "var(--text)",
          border: `1px solid ${t.type === "error" ? "#6b1e1e" : t.type === "success" ? "#1f5c3e" : "var(--border)"}`,
          maxWidth: 320,
          pointerEvents: "auto",
        }}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
