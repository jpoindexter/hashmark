import type { Agent, SecurityFinding } from "./types";

interface SecurityBannerProps {
  findings: SecurityFinding[] | null;
  dismissed: boolean;
  onDismiss: () => void;
  agents: Agent[];
  onOpenAgent: (agent: Agent) => void;
}

export default function SecurityBanner({ findings, dismissed, onDismiss, agents, onOpenAgent }: SecurityBannerProps) {
  if (findings === null || dismissed) return null;
  return (
    <div style={{
      background: findings.length === 0 ? "rgba(63,185,80,0.06)" : "rgba(248,81,73,0.06)",
      border: `1px solid ${findings.length === 0 ? "rgba(63,185,80,0.25)" : "rgba(248,81,73,0.25)"}`,
      borderRadius: "var(--radius)", marginBottom: "20px", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px",
        borderBottom: findings.length > 0 ? "1px solid var(--border-dim)" : "none",
      }}>
        <span style={{ fontSize: 11, fontFamily: "var(--font)", fontWeight: 600, color: findings.length === 0 ? "var(--accent)" : "var(--red)" }}>
          {findings.length === 0 ? "✓ No security issues found" : `✕ ${findings.length} issue${findings.length !== 1 ? "s" : ""} found`}
        </span>
        <button aria-label="Dismiss" onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dimmer)", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
      </div>
      {findings.length > 0 && (
        <div style={{ maxHeight: 240, overflowY: "auto" }}>
          {findings.map((f, i) => (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => { const a = agents.find((ag) => ag.id === f.agentId); if (a) onOpenAgent(a); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const a = agents.find((ag) => ag.id === f.agentId); if (a) onOpenAgent(a); } }}
              className="hoverable"
              style={{
                padding: "8px 12px", borderBottom: i < findings.length - 1 ? "1px solid var(--border-dim)" : "none",
                display: "flex", gap: 10, alignItems: "flex-start",
              }}
            >
              <span style={{
                fontSize: 9, fontFamily: "var(--font)", fontWeight: 700, letterSpacing: "0.06em",
                padding: "2px 5px", borderRadius: 2, flexShrink: 0, marginTop: 1,
                background: f.severity === "critical" ? "rgba(248,81,73,0.15)" : f.severity === "high" ? "rgba(210,153,34,0.15)" : "rgba(56,139,253,0.1)",
                color: f.severity === "critical" ? "var(--red)" : f.severity === "high" ? "var(--yellow)" : "var(--blue)",
              }}>
                {f.severity.toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "var(--text)", marginBottom: 2 }}>{f.message}</div>
                <div style={{ fontSize: 10, color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
                  {f.agentName} · line {f.line} · <span style={{ opacity: 0.7 }}>{f.snippet}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
