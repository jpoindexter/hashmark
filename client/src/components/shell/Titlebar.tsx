import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { RefreshCw, Terminal, GitPullRequest, ArrowDownToLine, PanelLeft, Columns2, FileDiff } from "lucide-react";
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
  onToggleSidebar?: () => void;
  termOpen?: boolean;
  onToggleTerm?: () => void;
  splitOpen?: boolean;
  changedFiles: number;
  onDiffOpen: () => void;
  streaming: boolean;
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
  fontSize: 13,
  fontFamily: "var(--font-ui)",
  color: "var(--text-dim)",
  WebkitAppRegion: "drag",
  paddingLeft: 78,
  paddingRight: 12,
} as CSSProperties;

function LayoutToggle({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="hoverable-strong"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        padding: 0,
        border: "none",
        background: "none",
        color: active ? "var(--text)" : "var(--text-dimmer)",
        borderRadius: 4,
      }}
    >
      {children}
    </button>
  );
}

function PrButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="hoverable"
      title="Create Pull Request"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 7px",
        border: "1px solid var(--accent)",
        background: "transparent",
        color: "var(--accent)",
        fontSize: 11,
        fontFamily: "var(--font)",
        fontWeight: 600,
        letterSpacing: "0.03em",
        borderRadius: 10,
        lineHeight: "18px",
        marginRight: 4,
      }}
    >
      <GitPullRequest size={11} />
      PR
    </button>
  );
}

type UpdateStatus = "idle" | "available" | "downloaded";

function UpdatePill({ status, version, onClick }: {
  status: UpdateStatus;
  version: string;
  onClick: () => void;
}) {
  if (status === "idle") return null;

  const ready = status === "downloaded";
  const label = ready ? `v${version} ready` : `v${version} downloading`;

  return (
    <button
      className={ready ? "hoverable" : undefined}
      title={ready ? "Restart to update" : "Update downloading..."}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 7px",
        border: `1px solid ${ready ? "var(--accent)" : "var(--text-dimmer)"}`,
        background: "transparent",
        color: ready ? "var(--accent)" : "var(--text-dim)",
        fontSize: 11,
        fontFamily: "var(--font)",
        fontWeight: 600,
        letterSpacing: "0.03em",
        cursor: ready ? "pointer" : "default",
        borderRadius: 10,
        lineHeight: "18px",
      }}
    >
      <ArrowDownToLine size={11} />
      {label}
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
  splitOpen,
  changedFiles,
  onDiffOpen,
  streaming,
  onRefreshGit,
}: TitlebarProps) {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateVersion, setUpdateVersion] = useState("");

  useEffect(() => {
    const unsubs: Array<(() => void) | undefined> = [];
    unsubs.push(
      window.studio?.onUpdateAvailable?.((info) => {
        setUpdateStatus("available");
        setUpdateVersion(info.version);
      })
    );
    unsubs.push(
      window.studio?.onUpdateDownloaded?.((info) => {
        setUpdateStatus("downloaded");
        setUpdateVersion(info.version);
      })
    );
    return () => unsubs.forEach((fn) => fn?.());
  }, []);

  const handleUpdateClick = useCallback(() => {
    if (updateStatus === "downloaded") {
      window.studio?.installUpdate?.();
    }
  }, [updateStatus]);

  return (
    <div style={containerStyle}>
      {/* Center section -- draggable, shows project info */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          minWidth: 0,
        }}
      >
        {projectName && (
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160, fontWeight: 500 }}>
            {projectName}
          </span>
        )}
        {projectName && git?.branch && (
          <span style={{ color: "var(--text-dimmer)", fontSize: 9 }}>{"/"}</span>
        )}
        {git?.branch && (
          <span style={noDrag}>
            <BranchPicker currentBranch={git.branch} />
          </span>
        )}
        {streaming && (
          <span style={{
            fontSize: 11, color: "var(--green)",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: "var(--green)",
              animation: "pulse 1.5s ease-in-out infinite",
            }} />
            Working...
          </span>
        )}
      </div>

      {/* Right section */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingRight: 8,
          gap: 6,
          ...noDrag,
        }}
      >
        {/* Drift badge */}
        {drift && drift.driftLevel !== "none" && (
          <DriftBadge drift={drift} navigate={(to: string) => {
            window.dispatchEvent(new CustomEvent("studio:navigate", { detail: to }));
          }} />
        )}

        {/* Changes badge */}
        {changedFiles > 0 && (
          <button
            title="View changed files"
            onClick={onDiffOpen}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
          >
            <Badge variant="blue">{changedFiles}</Badge>
          </button>
        )}

        {/* Refresh */}
        <IconButton title="Refresh git status" onClick={onRefreshGit}>
          <RefreshCw size={12} style={{ animation: streaming ? "spin 1s linear infinite" : "none", opacity: 0.6 }} />
        </IconButton>

        <UpdatePill status={updateStatus} version={updateVersion} onClick={handleUpdateClick} />

        {changedFiles > 0 && (
          <PrButton onClick={() => window.dispatchEvent(
            new CustomEvent("studio:navigate", { detail: "/source-control" })
          )} />
        )}

        {/* Layout toggle group */}
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {onToggleSidebar && (
            <LayoutToggle
              title="Toggle sidebar"
              active={sidebarOpen}
              onClick={onToggleSidebar}
            >
              <PanelLeft size={15} />
            </LayoutToggle>
          )}
          <LayoutToggle
            title="Toggle terminal"
            active={!!termOpen}
            onClick={() => onToggleTerm?.()}
          >
            <Terminal size={15} />
          </LayoutToggle>
          <LayoutToggle
            title="View changes"
            active={!!splitOpen}
            onClick={onDiffOpen}
          >
            <FileDiff size={15} />
          </LayoutToggle>
        </div>
      </div>
    </div>
  );
}
