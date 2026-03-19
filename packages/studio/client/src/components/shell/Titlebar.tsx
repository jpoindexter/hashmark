import { useState, type CSSProperties } from "react";
import { ChevronLeft, RefreshCw, PanelBottom, GitCompare, Sidebar, Columns2, GitPullRequest } from "lucide-react";
import type { GitStatus, DriftResult } from "../../hooks/useProjectInfo";
import BranchPicker from "../BranchPicker";
import { DriftBadge } from "../DriftIndicator";
import IconButton from "../shared/IconButton";
import Badge from "../shared/Badge";

interface TitlebarProps {
  projectName?: string;
  git: GitStatus | null;
  drift: DriftResult | null;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  termOpen?: boolean;
  onToggleTerm?: () => void;
  changedFiles: number;
  onDiffOpen: () => void;
  streaming: boolean;
  routeTitle: string;
  onRefreshGit: () => void;
}

const noDrag: CSSProperties = {
  WebkitAppRegion: "no-drag",
} as CSSProperties;

const containerStyle: CSSProperties = {
  height: "var(--titlebar-height)",
  background: "var(--bg-2)",
  borderBottom: "1px solid var(--border-dim)",
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  fontSize: 12,
  fontFamily: "var(--font-ui)",
  color: "var(--text-dim)",
  WebkitAppRegion: "drag",
  paddingLeft: 70,
} as CSSProperties;

function PrButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      title="Create Pull Request"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 7px",
        border: "1px solid var(--accent)",
        background: hovered ? "var(--accent-bg)" : "transparent",
        color: "var(--accent)",
        fontSize: 11,
        fontFamily: "var(--font)",
        fontWeight: 600,
        letterSpacing: "0.03em",
        cursor: "pointer",
        borderRadius: 10,
        lineHeight: "18px",
        marginRight: 4,
        transition: "background 0.1s ease",
      }}
    >
      <GitPullRequest size={11} />
      PR
    </button>
  );
}

export default function Titlebar({
  projectName,
  git,
  drift,
  sidebarOpen,
  onToggleSidebar,
  termOpen,
  onToggleTerm,
  changedFiles,
  onDiffOpen,
  streaming,
  routeTitle,
  onRefreshGit,
}: TitlebarProps) {
  const [refreshHovered, setRefreshHovered] = useState(false);

  return (
    <div style={containerStyle}>
      {/* Left section */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flex: "2 1 0%",
          justifyContent: "flex-start",
          minWidth: 0,
          ...noDrag,
        }}
      >
        {/* Sidebar toggle */}
        <IconButton
          title={`Toggle sidebar (\u2318B)`}
          onClick={onToggleSidebar}
        >
          <ChevronLeft
            size={14}
            style={{
              transition: "transform 0.18s ease",
              transform: sidebarOpen ? "rotate(0deg)" : "rotate(180deg)",
            }}
          />
        </IconButton>

        {/* Project name */}
        {projectName && (
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 140,
            }}
          >
            {projectName}
          </span>
        )}

        {/* Separator */}
        {projectName && git?.branch && (
          <span style={{ color: "var(--text-dimmer)", fontSize: 10 }}>
            {">"}
          </span>
        )}

        {/* Branch picker */}
        {git?.branch && <BranchPicker currentBranch={git.branch} />}

        {/* Drift badge */}
        {drift && drift.driftLevel !== "none" && (
          <DriftBadge drift={drift} navigate={(to: string) => { window.location.href = to; }} />
        )}

        {/* Changes badge */}
        {changedFiles > 0 && (
          <button
            title="View changed files"
            onClick={onDiffOpen}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
            }}
          >
            <Badge variant="blue">{changedFiles}</Badge>
          </button>
        )}

        {/* Refresh git */}
        <IconButton
          title="Refresh git status"
          onClick={onRefreshGit}
        >
          <RefreshCw
            size={12}
            onMouseEnter={() => setRefreshHovered(true)}
            onMouseLeave={() => setRefreshHovered(false)}
            style={{
              animation: streaming ? "spin 1s linear infinite" : "none",
              opacity: refreshHovered ? 1 : 0.6,
            }}
          />
        </IconButton>
      </div>

      {/* Center section -- draggable region */}
      <div
        style={{
          display: "flex",
          width: "fit-content",
          justifyContent: "center",
        }}
      />

      {/* Right section */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flex: "2 1 0%",
          justifyContent: "flex-end",
          paddingRight: 8,
          gap: 2,
          ...noDrag,
        }}
      >
        {changedFiles > 0 && (
          <PrButton onClick={() => window.dispatchEvent(
            new CustomEvent("studio:navigate", { detail: "/source-control" })
          )} />
        )}

        <IconButton
          title={`Toggle sidebar (\u2318B)`}
          onClick={onToggleSidebar}
          style={{ color: sidebarOpen ? "var(--text-dim)" : "var(--text-dimmer)" }}
        >
          <Sidebar size={14} />
        </IconButton>

        <IconButton
          title="Toggle terminal (⌃`)"
          onClick={onToggleTerm}
          style={{ color: termOpen ? "var(--text-dim)" : "var(--text-dimmer)" }}
        >
          <PanelBottom size={14} />
        </IconButton>

        <IconButton
          title="Open diff panel"
          onClick={onDiffOpen}
          style={{ color: changedFiles > 0 ? "var(--text-dim)" : "var(--text-dimmer)" }}
        >
          <GitCompare size={14} />
        </IconButton>

        <IconButton
          title="Split View"
          onClick={() => console.log("split view not implemented yet")}
          style={{ color: "var(--text-dimmer)" }}
        >
          <Columns2 size={14} />
        </IconButton>

        <div style={{ width: 8 }} />
        <Badge>{routeTitle}</Badge>
      </div>
    </div>
  );
}
