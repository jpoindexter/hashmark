import { type CSSProperties } from "react";

interface MissionBarProps {
  streaming: boolean;
  agentCount?: number;
  taskCount?: number;
  findingCount?: number;
  tokenCount?: string;
  model?: string;
  projectName?: string;
}

const mono: CSSProperties = { fontFamily: "var(--font)" };

export default function MissionBar({
  streaming,
  agentCount = 0,
  taskCount,
  findingCount,
  tokenCount,
  model = "sonnet 4.6",
  projectName,
}: MissionBarProps) {
  const bar: CSSProperties = {
    height: 38,
    borderBottom: "0.5px solid var(--border-dim)",
    display: "flex",
    alignItems: "center",
    padding: "0 16px",
    gap: 12,
    flexShrink: 0,
    background: "var(--bg)",
  };

  const statusStyle: CSSProperties = {
    ...mono,
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    color: "var(--text-dim)",
  };

  const dotStyle: CSSProperties = {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: streaming ? "var(--accent)" : "var(--text-dimmer)",
    flexShrink: 0,
    animation: streaming ? "pdot 2s ease-in-out infinite" : "none",
  };

  const sep: CSSProperties = {
    width: 0.5,
    height: 14,
    background: "var(--border)",
    flexShrink: 0,
  };

  const stat: CSSProperties = {
    ...mono,
    fontSize: 10,
    color: "var(--text-dimmer)",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  const statVal: CSSProperties = { color: "var(--text-dim)" };

  const pill: CSSProperties = {
    ...mono,
    fontSize: 10,
    color: "var(--text-dimmer)",
    border: "0.5px solid var(--border)",
    padding: "3px 8px",
    borderRadius: 4,
    display: "flex",
    alignItems: "center",
    gap: 5,
  };

  const label = streaming
    ? agentCount > 0
      ? `${agentCount} agent${agentCount !== 1 ? "s" : ""} running`
      : "running"
    : projectName || "ready";

  const showStats = streaming && (taskCount !== undefined || findingCount !== undefined || tokenCount);

  return (
    <div style={bar}>
      <div style={statusStyle}>
        <div style={dotStyle} />
        {label}
      </div>

      {showStats && <div style={sep} />}
      {showStats && taskCount !== undefined && (
        <div style={stat}>tasks <span style={statVal}>{taskCount}</span></div>
      )}
      {showStats && findingCount !== undefined && (
        <div style={stat}>findings <span style={statVal}>{findingCount}</span></div>
      )}
      {showStats && tokenCount && (
        <div style={stat}>tokens <span style={statVal}>{tokenCount}</span></div>
      )}

      <div style={{ marginLeft: "auto" }}>
        <div style={pill}>
          <div style={{
            width: 5, height: 5,
            borderRadius: "50%",
            background: "var(--accent)",
            opacity: 0.6,
          }} />
          {model}
        </div>
      </div>
    </div>
  );
}
