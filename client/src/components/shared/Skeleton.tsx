import type { CSSProperties } from "react";

// @keyframes skeleton-pulse is defined in reset.css

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: CSSProperties;
}

export function Skeleton({
  width = "100%",
  height = 12,
  borderRadius = "var(--radius-sm)",
  style,
}: SkeletonProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: "var(--bg-4)",
        animation: "skeleton-pulse 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

export function SkeletonText({
  lines = 3,
  gap = 6,
  style,
}: {
  lines?: number;
  gap?: number;
  style?: CSSProperties;
}) {
  const widths = [80, 65, 70, 55, 60, 75, 50, 85];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap, ...style }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={`${widths[i % widths.length]}%`} height={12} />
      ))}
    </div>
  );
}

export function SkeletonCard({
  width = "100%",
  height = 60,
  style,
}: {
  width?: string | number;
  height?: string | number;
  style?: CSSProperties;
}) {
  return (
    <Skeleton
      width={width}
      height={height}
      borderRadius="var(--radius)"
      style={style}
    />
  );
}

export function SkeletonAvatar({
  size = 24,
  style,
}: {
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <Skeleton
      width={size}
      height={size}
      borderRadius="50%"
      style={{ flexShrink: 0, ...style }}
    />
  );
}
