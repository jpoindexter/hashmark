import { type CSSProperties } from "react";

interface StatusDotProps {
  color?: string;
  pulse?: boolean;
  size?: number;
}

export default function StatusDot({ color = "var(--accent)", pulse = false, size = 6 }: StatusDotProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    background: color,
    flexShrink: 0,
    animation: pulse ? "pulse 1.4s ease-in-out infinite" : "none",
  };

  return <span style={style} />;
}
