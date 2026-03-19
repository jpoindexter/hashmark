import { useState, type CSSProperties } from "react";
import { GitBranch } from "lucide-react";

interface StatusBarProps {
  branch?: string;
  changedFiles: number;
  projectName?: string;
  modelName?: string;
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
  height: 22,
  background: "var(--accent)",
  color: "rgba(0,0,0,0.8)",
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

export default function StatusBar({
  branch,
  changedFiles,
  projectName,
  modelName,
}: StatusBarProps) {
  return (
    <div className="status-bar" style={containerStyle}>
      {/* Left: branch + changes */}
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
      </div>

      {/* Right: model + project */}
      <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
        {modelName && <StatusItem title="Active model">{modelName}</StatusItem>}
        {projectName && <StatusItem title="Project name">{projectName}</StatusItem>}
      </div>
    </div>
  );
}
