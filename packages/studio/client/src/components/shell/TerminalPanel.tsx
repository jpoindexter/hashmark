import TerminalTabs from "../TerminalTabs";

const PANEL_TABS = ["TERMINAL", "OUTPUT"] as const;
type PanelTab = (typeof PANEL_TABS)[number];

interface TerminalPanelProps {
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  termBig: boolean;
  onToggleBig: () => void;
  onClose: () => void;
  onCwdChange: (cwd: string) => void;
}

export default function TerminalPanel({
  activeTab,
  onTabChange,
  termBig,
  onToggleBig,
  onClose,
  onCwdChange,
}: TerminalPanelProps) {
  return (
    <div style={{
      flex: termBig ? 1 : undefined,
      height: termBig ? "100%" : undefined,
      display: "flex",
      flexDirection: "column",
      background: "var(--bg)",
      overflow: "hidden",
    }}>
      {/* Tab bar */}
      <div style={{
        height: 30,
        background: "var(--bg-3)",
        borderBottom: "1px solid var(--border-dim)",
        display: "flex",
        alignItems: "stretch",
        flexShrink: 0,
      }}>
        {PANEL_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0 14px",
              fontSize: 11,
              fontFamily: "var(--font)",
              color: activeTab === tab ? "var(--text)" : "var(--text-dimmer)",
              borderBottom: activeTab === tab ? "1px solid var(--accent)" : "1px solid transparent",
              letterSpacing: "0.05em",
              transition: "color 0.1s",
            }}
          >
            {tab}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          title={termBig ? "Restore terminal" : "Maximize terminal"}
          onClick={onToggleBig}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dimmer)", fontSize: 13, padding: "0 10px" }}
        >
          {termBig ? "\u2291" : "\u229E"}
        </button>
        <button
          title="Close terminal (\u2318`)"
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dimmer)", fontSize: 14, padding: "0 10px" }}
        >
          x
        </button>
      </div>

      {/* Terminal content */}
      <div style={{ flex: 1, overflow: "hidden", display: activeTab === "TERMINAL" ? "flex" : "none", flexDirection: "column" }}>
        <TerminalTabs onCwdChange={onCwdChange} />
      </div>
      {activeTab === "OUTPUT" && (
        <div style={{ flex: 1, padding: "12px 16px", overflow: "auto", fontSize: 12, color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
          No output yet.
        </div>
      )}
    </div>
  );
}
