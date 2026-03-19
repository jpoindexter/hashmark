import { useState, type CSSProperties, type ReactNode, type MouseEvent } from "react";

interface IconButtonProps {
  children: ReactNode;
  title: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  style?: CSSProperties;
}

const baseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  padding: 0,
  border: "none",
  background: "none",
  color: "var(--text-dimmer)",
  borderRadius: 3,
  cursor: "pointer",
  transition: "color 0.1s ease",
};

const hoverBg = "rgba(255,255,255,0.08)";

export default function IconButton({ children, title, onClick, style }: IconButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...baseStyle,
        background: hovered ? hoverBg : "none",
        color: hovered ? "var(--text-dim)" : "var(--text-dimmer)",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
