import { type CSSProperties } from "react";

interface ContextPanelProps {
  streaming: boolean;
  model?: string;
  branch?: string;
  projectName?: string;
}

const AGENTS = [
  { name: "scanner", color: "var(--accent)", state: "running" as const },
  { name: "reviewer", color: "var(--yellow)", state: "running" as const },
  { name: "guard", color: "#c084fc", state: "done" as const },
  { name: "fixer", color: "var(--blue)", state: "idle" as const },
];

const QUICK_CMDS = ["/scan", "/audit", "/fix all", "/review"];

export default function ContextPanel({ streaming, model = "sonnet 4.6", branch, projectName }: ContextPanelProps) {
  const panel: CSSProperties = {
    width: 184,
    borderLeft: "0.5px solid var(--border-dim)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    overflowY: "auto",
    background: "var(--bg)",
  };

  const sLbl: CSSProperties = {
    fontFamily: "var(--font)",
    fontSize: 10,
    color: "var(--text-dimmer)",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    padding: "11px 14px 7px",
  };

  const sect: CSSProperties = {
    borderBottom: "0.5px solid var(--border-dim)",
    paddingBottom: 6,
  };

  const footer: CSSProperties = {
    marginTop: "auto",
    padding: "10px 14px",
    borderTop: "0.5px solid var(--border-dim)",
  };

  const footRow: CSSProperties = {
    fontFamily: "var(--font)",
    fontSize: 10,
    color: "var(--text-dimmer)",
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 4,
  };

  return (
    <div style={panel}>
      {streaming ? (
        <div style={sect}>
          <div style={sLbl}>agents</div>
          {AGENTS.map((ag) => (
            <div
              key={ag.name}
              style={{
                padding: "6px 14px",
                display: "flex", alignItems: "center", gap: 8,
                cursor: "pointer",
              }}
              className="rail-item"
            >
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: ag.color,
                opacity: ag.state === "idle" ? 0.2 : ag.state === "done" ? 0.4 : 1,
                flexShrink: 0,
                animation: ag.state === "running" ? "pdot 1.5s ease-in-out infinite" : "none",
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--font)", fontSize: 11,
                  color: "var(--text-dim)",
                  opacity: ag.state === "idle" ? 0.3 : 1,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {ag.name}
                </div>
                <div style={{
                  fontFamily: "var(--font)", fontSize: 10,
                  color: "var(--text-dimmer)", marginTop: 1,
                }}>
                  {ag.state}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={sect}>
          <div style={sLbl}>recent</div>
          {[projectName, "gripe-pipeline", "reasonops-eval"].filter(Boolean).map((name) => (
            <div
              key={name}
              style={{ padding: "6px 14px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
              className="rail-item"
            >
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--text-dimmer)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--font)", fontSize: 11,
                  color: "var(--text-dim)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {name}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={sect}>
        <div style={sLbl}>quick start</div>
        {QUICK_CMDS.map((cmd) => (
          <div
            key={cmd}
            style={{ padding: "5px 14px", cursor: "pointer" }}
            className="rail-item"
          >
            <div style={{ fontFamily: "var(--font)", fontSize: 10, color: "var(--text-dimmer)" }}>→ {cmd}</div>
          </div>
        ))}
      </div>

      <div style={footer}>
        <div style={footRow}><span>model</span><span>{model}</span></div>
        {branch && (
          <div style={footRow}>
            <span>branch</span>
            <span style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {branch}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
