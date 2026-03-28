import { type CSSProperties, type ReactNode, type MouseEvent } from "react";

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

export default function IconButton({ children, title, onClick, style }: IconButtonProps) {
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--hover-bg-strong)";
        e.currentTarget.style.color = "var(--text-dim)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "none";
        e.currentTarget.style.color = "var(--text-dimmer)";
      }}
      style={{ ...baseStyle, ...style }}
    >
      {children}
    </button>
  );
}
