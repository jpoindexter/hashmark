const cardBase: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "space-between",
  width: 152,
  height: 110,
  background: "var(--bg-2)",
  border: "1px solid var(--border-dim)",
  borderRadius: "var(--radius-lg)",
  padding: 18,
  cursor: "pointer",
  transition: "background 0.12s, border-color 0.12s",
  textAlign: "left",
  boxSizing: "border-box",
};

export default function ActionCard({
  icon,
  label,
  sub,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...cardBase,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : "pointer",
        background: "var(--bg-2)",
        borderColor: "var(--border-dim)",
      }}
      className={disabled ? "" : "hoverable"}
    >
      <div style={{ color: "var(--text-dim)" }}>{icon}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>
          {label}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-dimmer)", lineHeight: 1.4 }}>
          {sub}
        </div>
      </div>
    </button>
  );
}

export function FolderIcon({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke={color} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="11" height="11" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      style={{
        flexShrink: 0,
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.15s",
        color: "var(--text-dimmer)",
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function ClockIcon({ size = 28, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function TerminalIcon({ size = 28, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}
