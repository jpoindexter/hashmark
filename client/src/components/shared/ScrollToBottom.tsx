import { type CSSProperties } from "react";
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
  // Fade-in entrance
  animation: "scrollBtnFadeIn 0.15s ease forwards",
};

const buttonBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 16px",
  border: "1px solid var(--border)",
  borderRadius: 20,
  background: "var(--bg-3)",
  color: "var(--text-dim)",
  fontSize: 12,
  fontFamily: "var(--font-ui)",
  fontWeight: 500,
  cursor: "pointer",
  pointerEvents: "auto",
  transition: "background 0.1s ease, border-color 0.1s ease, color 0.1s ease",
};

const hoverStyle: Partial<CSSProperties> = {
  background: "var(--bg-4)",
  borderColor: "var(--border)",
  color: "var(--text)",
};

export default function ScrollToBottom({ visible, onClick }: ScrollToBottomProps) {
  if (!visible) return null;

  return (
    <div style={containerStyle}>
      <style>{`@keyframes scrollBtnFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <button
        onClick={onClick}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = hoverStyle.background as string;
          e.currentTarget.style.color = hoverStyle.color as string;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = buttonBase.background as string;
          e.currentTarget.style.color = buttonBase.color as string;
        }}
        style={{ ...buttonBase }}
      >
        <ChevronDown size={14} />
        Scroll to bottom
      </button>
    </div>
  );
}
