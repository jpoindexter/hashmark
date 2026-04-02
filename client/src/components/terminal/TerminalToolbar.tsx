import type React from "react";

export function ToolbarBtn({
  onClick,
  title,
  children,
  danger,
}: {
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={danger ? "btn-icon-danger" : "btn-icon"}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        borderRadius: 4,
        border: "none",
        background: "none",
        color: "var(--text-dimmer)",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

export function MoreMenuItem({
  label,
  shortcut,
  onClick,
  danger,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className="hoverable"
      style={{
        padding: "5px 12px",
        fontSize: 12,
        fontFamily: "var(--font-ui)",
        color: danger ? "var(--red)" : "var(--text)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <span>{label}</span>
      {shortcut && (
        <span style={{ fontSize: 10, color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
          {shortcut}
        </span>
      )}
    </div>
  );
}
