import { useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";

interface ScrollToBottomProps {
  visible: boolean;
  onClick: () => void;
}

const containerStyle: CSSProperties = {
  position: "sticky",
  bottom: 0,
  display: "flex",
  justifyContent: "center",
  padding: "8px 0",
  pointerEvents: "none",
};

const buttonBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 12px",
  border: "1px solid var(--border)",
  borderRadius: 20,
  background: "var(--bg-3)",
  color: "var(--text-dim)",
  fontSize: 11,
  fontFamily: "var(--font-ui)",
  fontWeight: 500,
  cursor: "pointer",
  pointerEvents: "auto",
  transition: "background 0.1s ease, border-color 0.1s ease",
};

const hoverStyle: Partial<CSSProperties> = {
  background: "var(--bg-4)",
  borderColor: "var(--border)",
  color: "var(--text)",
};

export default function ScrollToBottom({ visible, onClick }: ScrollToBottomProps) {
  const [hovered, setHovered] = useState(false);

  if (!visible) return null;

  return (
    <div style={containerStyle}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          ...buttonBase,
          ...(hovered ? hoverStyle : {}),
        }}
      >
        <ChevronDown size={14} />
        Scroll to bottom
      </button>
    </div>
  );
}
