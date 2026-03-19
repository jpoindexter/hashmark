import type { CSSProperties, ReactNode } from "react";

type BadgeVariant = "default" | "green" | "blue" | "yellow" | "red";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  style?: CSSProperties;
}

const variantColors: Record<BadgeVariant, { background: string; color: string }> = {
  default: {
    background: "var(--bg-4)",
    color: "var(--text-dim)",
  },
  green: {
    background: "var(--accent-bg)",
    color: "var(--accent)",
  },
  blue: {
    background: "var(--blue-bg)",
    color: "var(--blue)",
  },
  yellow: {
    background: "var(--yellow-bg)",
    color: "var(--yellow)",
  },
  red: {
    background: "var(--red-bg)",
    color: "var(--red)",
  },
};

const baseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 9,
  fontWeight: 600,
  fontFamily: "var(--font-ui)",
  minWidth: 12,
  borderRadius: 20,
  padding: "0 4px",
  lineHeight: "16px",
  whiteSpace: "nowrap",
};

export default function Badge({ children, variant = "default", style }: BadgeProps) {
  const colors = variantColors[variant];

  return (
    <span
      style={{
        ...baseStyle,
        background: colors.background,
        color: colors.color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
