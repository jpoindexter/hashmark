import { useRef } from "react";
import { SplitSquareHorizontal } from "lucide-react";

export interface TerminalTab {
  id: string;
  label: string;
  shell: string;
  splitId: string | null;
}

function InfoRow({
  label,
  value,
  title,
  accent,
}: {
  label: string;
  value: string;
  title?: string;
  accent?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span className="label" style={{ flexShrink: 0 }}>
        {label}
      </span>
      <span
        title={title}
        style={{
          color: accent ? "var(--accent)" : "var(--text-dim)",
          fontFamily: "var(--font)",
          fontSize: 11,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 160,
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function TabItem({
  tab,
  active,
  onSelect,
  onClose,
  onContextMenu,
  showClose,
  isSplit,
  showInfoPopup,
  onInfoEnter,
  onInfoLeave,
  cwd,
  shellIntegration,
}: {
  tab: TerminalTab;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  showClose: boolean;
  isSplit: boolean;
  showInfoPopup: boolean;
  onInfoEnter: () => void;
  onInfoLeave: () => void;
  cwd?: string;
  shellIntegration: boolean;
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const tabRef = useRef<HTMLDivElement>(null);

  // Shortened CWD for display: show last 2 segments
  const shortCwd = cwd
    ? cwd.split("/").filter(Boolean).slice(-2).join("/")
    : null;

  return (
    <div
      ref={tabRef}
      role="tab"
      tabIndex={0}
      aria-selected={active}
      aria-label={`Terminal: ${tab.label}`}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      onContextMenu={onContextMenu}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--surface-subtle)";
        if (closeBtnRef.current && showClose) closeBtnRef.current.style.visibility = "visible";
        onInfoEnter();
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
        if (closeBtnRef.current && !active) closeBtnRef.current.style.visibility = "hidden";
        onInfoLeave();
      }}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "0 8px 0 10px",
        cursor: "pointer",
        fontSize: 12,
        fontFamily: "var(--font)",
        color: active ? "var(--text)" : "var(--text-dimmer)",
        borderRight: "1px solid var(--border-dim)",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        background: active ? "var(--bg-3)" : "transparent",
        flexShrink: 0,
        userSelect: "none",
        minWidth: 80,
        height: "100%",
        transition: "background 0.1s",
      }}
    >
      {/* Shell icon */}
      <span style={{
        fontSize: 10,
        color: active ? "var(--accent)" : "var(--text-dimmer)",
        fontWeight: 600,
        fontFamily: "var(--font)",
      }}>
        {tab.shell === "node" ? "\u2B21" : tab.shell === "python" ? "\u2B22" : "$"}
      </span>
      <span style={{ flex: 1 }}>{tab.label}</span>
      {isSplit && (
        <SplitSquareHorizontal
          size={10}
          style={{ color: "var(--text-dimmer)", flexShrink: 0 }}
        />
      )}
      {showClose && (
        <button
          ref={closeBtnRef}
          onClick={e => { e.stopPropagation(); onClose(); }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 16,
            height: 16,
            borderRadius: 3,
            border: "none",
            background: "none",
            color: "var(--text-dimmer)",
            cursor: "pointer",
            padding: 0,
            fontSize: 12,
            lineHeight: 1,
            flexShrink: 0,
            visibility: active ? "visible" : "hidden",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-strong)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "none";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)";
          }}
        >
          {"\u00d7"}
        </button>
      )}

      {/* Info popup */}
      {showInfoPopup && (
        <div
          onMouseEnter={onInfoEnter}
          onMouseLeave={onInfoLeave}
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            minWidth: 200,
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "8px 10px",
            zIndex: 1100,
            boxShadow: "var(--shadow-md)",
            fontSize: 11,
            fontFamily: "var(--font-ui)",
            color: "var(--text)",
            display: "flex",
            flexDirection: "column",
            gap: 5,
            animation: "dropdownIn 0.12s ease-out",
          }}
        >
          <InfoRow label="Shell" value={tab.shell} />
          <InfoRow label="Tab" value={tab.label} />
          {shortCwd && <InfoRow label="CWD" value={shortCwd} title={cwd} />}
          <InfoRow
            label="Shell integration"
            value={shellIntegration ? "active" : "inactive"}
            accent={shellIntegration}
          />
        </div>
      )}
    </div>
  );
}
