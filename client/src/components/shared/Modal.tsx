import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: number;
  children: ReactNode;
}

export default function Modal({ open, onClose, title, width = 540, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-overlay)" as unknown as number,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--overlay-bg)",
        backdropFilter: "blur(2px)",
        animation: "fadeIn 0.1s ease",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Dialog"}
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          width,
          maxWidth: "90vw",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
          fontFamily: "var(--font-ui)",
          animation: "dropdownIn 0.15s ease-out",
          overflow: "hidden",
        }}
      >
        {title && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: "1px solid var(--border-dim)",
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text)",
            }}>
              {title}
            </span>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 24,
                height: 24,
                background: "transparent",
                border: "none",
                borderRadius: "var(--radius)",
                color: "var(--text-dimmer)",
                cursor: "pointer",
                transition: "color 0.1s, background 0.1s",
                padding: 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = "var(--text)";
                e.currentTarget.style.background = "var(--hover-bg-strong)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = "var(--text-dimmer)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div style={{
          padding: "20px",
          overflowY: "auto",
          flex: 1,
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}
