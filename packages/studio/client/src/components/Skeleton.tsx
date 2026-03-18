import { useEffect } from "react";

const STYLE_ID = "skeleton-keyframes";

function injectKeyframes() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes skeleton-pulse {
      0%   { background-color: var(--bg-3); }
      50%  { background-color: var(--bg-4); }
      100% { background-color: var(--bg-3); }
    }
  `;
  document.head.appendChild(style);
}

const pulseStyle: React.CSSProperties = {
  animation: "skeleton-pulse 1.5s ease-in-out infinite",
  borderRadius: 2,
};

export function SkeletonLine({
  width = "100%",
  height = 12,
  style,
}: {
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
}) {
  useEffect(() => { injectKeyframes(); }, []);
  return (
    <div style={{ width, height, ...pulseStyle, ...style }} />
  );
}

export function SkeletonBlock({
  width = "100%",
  height = 80,
  style,
}: {
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
}) {
  useEffect(() => { injectKeyframes(); }, []);
  return (
    <div style={{ width, height, ...pulseStyle, ...style }} />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  useEffect(() => { injectKeyframes(); }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 12,
            width: i === lines - 1 ? "60%" : "100%",
            ...pulseStyle,
          }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  useEffect(() => { injectKeyframes(); }, []);
  return (
    <div style={{
      background: "var(--bg-2)",
      border: "1px solid var(--border-dim)",
      borderRadius: "var(--radius)",
      padding: 14,
    }}>
      {/* Title line */}
      <div style={{ height: 12, width: "45%", ...pulseStyle, marginBottom: 12 }} />
      {/* 3 body lines */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ height: 10, width: "100%", ...pulseStyle }} />
        <div style={{ height: 10, width: "85%", ...pulseStyle }} />
        <div style={{ height: 10, width: "60%", ...pulseStyle }} />
      </div>
    </div>
  );
}
