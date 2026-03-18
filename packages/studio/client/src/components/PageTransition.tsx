import { useRef, useEffect, CSSProperties } from "react";
import { useLocation } from "react-router-dom";

// ---------------------------------------------------------------------------
// CSS keyframes injected once
// ---------------------------------------------------------------------------

const STYLE_ID = "hashmark-page-transition-keyframes";

function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes page-enter {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// PageTransition
// ---------------------------------------------------------------------------

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function PageTransition({ children, className, style }: PageTransitionProps) {
  const location = useLocation();
  const keyRef = useRef(location.key);
  const elRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    injectStyles();
  }, []);

  useEffect(() => {
    if (!elRef.current) return;
    if (location.key === keyRef.current) return;
    keyRef.current = location.key;

    const el = elRef.current;
    // Re-trigger animation on route change by forcing reflow
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "page-enter 120ms ease-out both";
  }, [location.key]);

  return (
    <div
      ref={elRef}
      className={className}
      style={{
        animation: "page-enter 120ms ease-out both",
        width: "100%",
        height: "100%",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default PageTransition;
