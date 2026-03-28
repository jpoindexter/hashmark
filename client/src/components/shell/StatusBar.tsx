import { useState, type CSSProperties } from "react";
import { GitBranch, Sparkles, Gauge } from "lucide-react";

interface StatusBarProps {
  branch?: string;
  changedFiles: number;
  projectName?: string;
  modelName?: string;
  providerName?: string;
  contextPercent: number | null;
}

function StatusItem({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title?: string;
  onClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 5px",
        margin: "0 3px",
        cursor: onClick ? "pointer" : "default",
        background: hovered ? "rgba(0,0,0,0.12)" : "transparent",
        borderRadius: "var(--radius-sm)",
        height: "100%",
        transition: "background 0.1s ease",
      }}
    >
      {children}
    </div>
  );
}

const containerStyle: CSSProperties = {
  height: "var(--status-bar-height)",
  background: "var(--accent)",
  color: "var(--bg)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontSize: 12,
  fontFamily: "var(--font-ui)",
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0,
  paddingLeft: 8,
  paddingRight: 8,
  WebkitAppRegion: "no-drag",
} as CSSProperties;

function contextColor(pct: number): string {
  if (pct > 90) return "var(--red)";
  if (pct > 70) return "var(--yellow)";
  return "inherit";
}

export default function StatusBar({
  branch,
  changedFiles,
  projectName,
  modelName,
  providerName,
  contextPercent,
}: StatusBarProps) {
  return (
    <div className="status-bar" style={containerStyle}>
      {/* Left: branch + changes + context usage */}
      <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
        <StatusItem title="Current branch">
          <GitBranch size={11} />
          <span>{branch || "no branch"}</span>
        </StatusItem>
        {changedFiles > 0 && (
          <StatusItem title="Changed files">
            <span>+{changedFiles}</span>
          </StatusItem>
        )}
        {contextPercent != null && (
          <StatusItem title={`Context window: ${contextPercent}% used`}>
            <Gauge size={10} style={{ color: contextColor(contextPercent) }} />
            <span style={{ color: contextColor(contextPercent) }}>{contextPercent}% context</span>
          </StatusItem>
        )}
      </div>

      {/* Right: provider + model + project */}
      <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
        {(providerName || modelName) && (
          <StatusItem title={`Active: ${providerName ?? ""} ${modelName ?? ""}`}>
            <Sparkles size={10} />
            {providerName && <span>{providerName}</span>}
            {providerName && modelName && (
              <span style={{ opacity: 0.5 }}>/</span>
            )}
            {modelName && <span>{modelName}</span>}
          </StatusItem>
        )}
        {projectName && <StatusItem title="Project name">{projectName}</StatusItem>}
      </div>
    </div>
  );
}
