import { useState, useEffect, useRef } from "react";

export const PICKER_CONTAINER_STYLE: React.CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  left: 0,
  right: 0,
  background: "var(--bg-3)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-lg)",
  zIndex: 500,
  overflow: "auto",
};

export const PICKER_FOOTER_STYLE: React.CSSProperties = {
  padding: "4px 12px 6px",
  fontSize: 10,
  color: "var(--text-dimmer)",
  borderTop: "1px solid var(--border-dim)",
  display: "flex",
  gap: 10,
  fontFamily: "var(--font-ui)",
};

export const PICKER_GROUP_LABEL_STYLE: React.CSSProperties = {
  padding: "6px 12px 3px",
  fontSize: 10,
  fontWeight: 600,
  color: "var(--text-dimmer)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  userSelect: "none",
  fontFamily: "var(--font-ui)",
};

export function pickerRowStyle(isActive: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
    background: isActive ? "var(--accent-bg)" : "transparent",
    borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
    transition: "background 0.05s",
  };
}

export function usePicker<T>(
  query: string,
  filtered: T[],
  onSelect: (item: T) => void,
  onDismiss: () => void,
) {
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setActiveIdx(0); }, [query]);
  useEffect(() => {
    const el = listRef.current?.querySelector("[data-active='true']") as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape")    { e.preventDefault(); onDismiss(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Tab" || e.key === "Enter") {
        if (filtered.length === 0) return;
        e.preventDefault();
        onSelect(filtered[activeIdx]);
      }
    };
    window.addEventListener("keydown", h, { capture: true });
    return () => window.removeEventListener("keydown", h, { capture: true });
  }, [filtered, activeIdx, onSelect, onDismiss]);

  return { activeIdx, setActiveIdx, listRef };
}
