import React from "react";

export interface ExpansionCommand {
  trigger: string;
  desc: string;
  expansion: string;
  isCustom?: boolean;
}

interface SlashExpansionPopoverProps {
  commands: ExpansionCommand[];
  activeIdx: number;
  onSelect: (cmd: ExpansionCommand) => void;
  onHover: (idx: number) => void;
  onManage: () => void;
}

export function SlashExpansionPopover({
  commands,
  activeIdx,
  onSelect,
  onHover,
  onManage,
}: SlashExpansionPopoverProps) {
  if (commands.length === 0) return null;

  return (
    <div style={{
      position: "absolute", zIndex: 50, right: 16, bottom: "100%", width: 340,
      background: "var(--bg-panel)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", overflow: "hidden",
      boxShadow: "var(--shadow-lg)",
    }}>
      <div style={{ maxHeight: 280, overflowY: "auto" }}>
        {commands.map((cmd, i) => (
          <div
            key={cmd.trigger}
            onMouseDown={e => { e.preventDefault(); onSelect(cmd); }}
            onMouseEnter={() => onHover(i)}
            style={{
              padding: "7px 12px", cursor: "pointer",
              display: "flex", gap: 10, alignItems: "baseline",
              background: i === activeIdx ? "var(--bg-active)" : "transparent",
            }}
          >
            <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>
              /{cmd.trigger}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {cmd.desc}
            </span>
            {cmd.isCustom && (
              <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0, opacity: 0.6 }}>custom</span>
            )}
          </div>
        ))}
      </div>
      <div style={{
        borderTop: "1px solid var(--border)", padding: "5px 8px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          ↑↓ navigate · Enter/Tab select · Esc dismiss
        </span>
        <button
          onMouseDown={e => { e.preventDefault(); onManage(); }}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 10, color: "var(--text-muted)", padding: "2px 6px",
            borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", gap: 3,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
            <circle cx="5" cy="5" r="1.2"/>
            <path d="M5 1v1M5 8v1M1 5h1M8 5h1M2.2 2.2l.7.7M7.1 7.1l.7.7M7.8 2.2l-.7.7M2.9 7.1l-.7.7"/>
          </svg>
          Manage
        </button>
      </div>
    </div>
  );
}
