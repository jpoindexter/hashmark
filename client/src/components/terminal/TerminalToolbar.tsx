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
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? "rgba(248, 81, 73, 0.15)" : "var(--hover-bg-strong)";
        e.currentTarget.style.color = danger ? "var(--red)" : "var(--text)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "none";
        e.currentTarget.style.color = "var(--text-dimmer)";
      }}
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
        transition: "background 0.1s, color 0.1s",
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
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--active-bg)"}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
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
