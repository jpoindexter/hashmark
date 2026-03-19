import { useState, useEffect, useRef, useCallback } from "react";

const MIN_HEIGHT = 160;
const DEFAULT_HEIGHT = 280;

export interface ResizableDrawerProps {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  defaultHeight?: number;
}

export default function ResizableDrawer({
  open,
  onToggle,
  children,
  defaultHeight = DEFAULT_HEIGHT,
}: ResizableDrawerProps) {
  const [height, setHeight] = useState(defaultHeight);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const maxHeight = () => window.innerHeight * 0.6;

  const clamp = useCallback((h: number) => Math.max(MIN_HEIGHT, Math.min(maxHeight(), h)), []);

  // Clamp on viewport resize
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      setHeight(h => clamp(h));
    });
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, [clamp]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragging.current = true;
    startY.current = e.clientY;
    startH.current = height;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const delta = startY.current - e.clientY;
    setHeight(clamp(startH.current + delta));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        height: open ? height : 0,
        minHeight: 0,
        overflow: "hidden",
        transition: dragging.current ? "none" : "height 0.18s ease",
        borderTop: open ? "1px solid var(--border-dim)" : "none",
      }}
    >
      {/* Drag handle */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onToggle}
        style={{
          height: 8,
          minHeight: 8,
          flexShrink: 0,
          cursor: "ns-resize",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-3)",
          borderBottom: "1px solid var(--border-dim)",
          userSelect: "none",
          touchAction: "none",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-bg)")}
        onMouseLeave={e => (e.currentTarget.style.background = "var(--bg-3)")}
      >
        <span style={{ color: "var(--text-dimmer)", fontSize: 10, lineHeight: 1, letterSpacing: 2, opacity: 0.5 }}>
          ···
        </span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}
