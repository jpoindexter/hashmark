import { useCallback, useRef } from "react";

interface SidebarResizeProps {
  onResize: (width: number) => void;
  onReset: () => void;
  currentWidth: number;
}

const MIN_WIDTH = 170;

function getMaxWidth(): number {
  return Math.floor(window.innerWidth * 0.5);
}

function clamp(value: number): number {
  return Math.max(MIN_WIDTH, Math.min(value, getMaxWidth()));
}

export default function SidebarResize({
  onResize,
  onReset,
  currentWidth,
}: SidebarResizeProps) {
  const sashRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = currentWidth;
      const sash = sashRef.current;

      if (sash) sash.classList.add("active");

      // Full-screen overlay captures all mouse events during drag,
      // preventing iframes or other elements from stealing focus
      const overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:9999;cursor:col-resize";
      document.body.appendChild(overlay);
      overlayRef.current = overlay;

      function onMouseMove(ev: MouseEvent) {
        const delta = ev.clientX - startX;
        const next = clamp(startWidth + delta);
        onResize(next);

        if (sash) {
          sash.classList.toggle("at-min", next <= MIN_WIDTH);
          sash.classList.toggle("at-max", next >= getMaxWidth());
        }
      }

      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);

        if (sash) {
          sash.classList.remove("active", "at-min", "at-max");
        }

        if (overlayRef.current) {
          document.body.removeChild(overlayRef.current);
          overlayRef.current = null;
        }
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [currentWidth, onResize],
  );

  return (
    <div
      ref={sashRef}
      className="sash"
      onMouseDown={handleMouseDown}
      onDoubleClick={onReset}
      style={{
        width: 4,
        flexShrink: 0,
        alignSelf: "stretch",
      }}
    />
  );
}
