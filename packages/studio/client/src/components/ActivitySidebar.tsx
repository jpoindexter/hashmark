import { useState, useEffect } from "react";
import { AlignJustify, Plus, HelpCircle, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SkeletonLine } from "./Skeleton.tsx";

interface ChatSession {
  id: string;
  title: string;
  message_count: number;
  updated_at: number;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  department: string;
  path: string;
}

interface GitStatus {
  branch: string;
  files: { status: string; added: number; removed: number }[];
}

interface WorkspaceEntry {
  name: string;
  dir: string;
  agents: Agent[];
  git: GitStatus | null;
}

interface Run {
  id: string;
  task: string;
  status: string;
  created_at: number;
  worktree_branch: string | null;
}

interface ScanSnapshot {
  scannedAt: number;
  totalFiles: number;
  totalLines: number;
}

interface ActivitySidebarProps {
  onSessionSelect?: (sessionId: string) => void;
}

// Avatar background colors keyed by first letter — muted, not saturated
const AVATAR_COLORS: Record<string, string> = {
  a: "rgba(139,92,246,0.18)", b: "rgba(59,130,246,0.18)", c: "rgba(16,185,129,0.18)",
  d: "rgba(245,158,11,0.18)", e: "rgba(239,68,68,0.18)", f: "rgba(6,182,212,0.18)",
  g: "rgba(236,72,153,0.18)", h: "rgba(139,92,246,0.18)", i: "rgba(59,130,246,0.18)",
  j: "rgba(16,185,129,0.18)", k: "rgba(245,158,11,0.18)", l: "rgba(239,68,68,0.18)",
  m: "rgba(6,182,212,0.18)", n: "rgba(236,72,153,0.18)", o: "rgba(139,92,246,0.18)",
  p: "rgba(59,130,246,0.18)", q: "rgba(16,185,129,0.18)", r: "rgba(245,158,11,0.18)",
  s: "rgba(239,68,68,0.18)", t: "rgba(6,182,212,0.18)", u: "rgba(236,72,153,0.18)",
  v: "rgba(139,92,246,0.18)", w: "rgba(59,130,246,0.18)", x: "rgba(16,185,129,0.18)",
  y: "rgba(245,158,11,0.18)", z: "rgba(239,68,68,0.18)",
};

const AVATAR_TEXT_COLORS: Record<string, string> = {
  a: "rgba(167,139,250,0.8)", b: "rgba(147,197,253,0.8)", c: "rgba(110,231,183,0.8)",
  d: "rgba(252,211,77,0.8)", e: "rgba(252,165,165,0.8)", f: "rgba(103,232,249,0.8)",
  g: "rgba(249,168,212,0.8)", h: "rgba(167,139,250,0.8)", i: "rgba(147,197,253,0.8)",
  j: "rgba(110,231,183,0.8)", k: "rgba(252,211,77,0.8)", l: "rgba(252,165,165,0.8)",
  m: "rgba(103,232,249,0.8)", n: "rgba(249,168,212,0.8)", o: "rgba(167,139,250,0.8)",
  p: "rgba(147,197,253,0.8)", q: "rgba(110,231,183,0.8)", r: "rgba(252,211,77,0.8)",
  s: "rgba(252,165,165,0.8)", t: "rgba(103,232,249,0.8)", u: "rgba(249,168,212,0.8)",
  v: "rgba(167,139,250,0.8)", w: "rgba(147,197,253,0.8)", x: "rgba(110,231,183,0.8)",
  y: "rgba(252,211,77,0.8)", z: "rgba(252,165,165,0.8)",
};

function avatarBg(name: string): string {
  const key = name.charAt(0).toLowerCase();
  return AVATAR_COLORS[key] ?? "rgba(255,255,255,0.08)";
}

function avatarColor(name: string): string {
  const key = name.charAt(0).toLowerCase();
  return AVATAR_TEXT_COLORS[key] ?? "rgba(255,255,255,0.5)";
}

function isRecent(ts: number): boolean {
  return Date.now() - ts < 5 * 60 * 1000;
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span style={{
      display: "inline-block",
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: active ? "#facc15" : "rgba(255,255,255,0.2)",
      flexShrink: 0,
      boxShadow: active ? "0 0 4px #facc15" : undefined,
    }} />
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "rgba(255,255,255,0.07)" : "none",
        border: "none",
        cursor: "pointer",
        color: hovered ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        padding: 0,
        borderRadius: 3,
        transition: "color 0.1s, background 0.1s",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {children}
    </button>
  );
}

export default function ActivitySidebar({ onSessionSelect }: ActivitySidebarProps) {
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<WorkspaceEntry | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    () => localStorage.getItem("studio_active_session_id") ?? null
  );
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [scans, setScans] = useState<ScanSnapshot[] | null>(null);

  useEffect(() => {
    const load = () => {
      fetch("/api/sessions")
        .then(r => r.json())
        .then((d: { sessions: ChatSession[] }) => setSessions((d.sessions ?? []).slice(0, 9)))
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const load = () => {
      Promise.all([
        fetch("/api/info").then(r => r.json()),
        fetch("/api/agents").then(r => r.json()),
        fetch("/api/files/git").then(r => r.json()).catch(() => null),
      ]).then(([info, agentsData, git]) => {
        setWorkspace({
          name: info.projectName ?? "project",
          dir: info.projectDir ?? "",
          agents: agentsData.agents ?? [],
          git: git as GitStatus | null,
        });
      }).catch(() => {});
    };
    load();
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const load = () => {
      fetch("/api/runs")
        .then(r => r.json())
        .then((d: { runs?: Run[] }) => setRuns((d.runs ?? []).slice(0, 5)))
        .catch(() => setRuns([]));
    };
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch("/api/scan/history")
      .then(r => r.json())
      .then((d: { snapshots?: ScanSnapshot[] }) => setScans(d.snapshots ?? []))
      .catch(() => setScans([]));
  }, []);

  const totalAdded = workspace?.git?.files?.reduce((s, f) => s + (f.added ?? 0), 0) ?? 0;
  const totalRemoved = workspace?.git?.files?.reduce((s, f) => s + (f.removed ?? 0), 0) ?? 0;
  const shortName = workspace ? (workspace.name.split("/").pop() ?? workspace.name) : null;

  const handleSessionClick = (id: string) => {
    localStorage.setItem("studio_active_session_id", id);
    setActiveSessionId(id);
    if (onSessionSelect) {
      onSessionSelect(id);
    } else {
      navigate("/");
      window.dispatchEvent(new CustomEvent("studio:switch-session", { detail: id }));
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      width: 220,
      minWidth: 220,
      maxWidth: 220,
      background: "#111",
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      userSelect: "none",
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        height: 38,
        display: "flex",
        alignItems: "center",
        padding: "0 8px 0 12px",
        flexShrink: 0,
        WebkitAppRegion: "drag",
      } as React.CSSProperties}>
        <span style={{
          flex: 1,
          fontSize: 12,
          fontWeight: 600,
          color: "rgba(255,255,255,0.5)",
          letterSpacing: "0.02em",
          textTransform: "uppercase",
        }}>
          Activity
        </span>
        <div style={{ display: "flex", gap: 2, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <IconBtn title="Filter" onClick={() => {}}>
            <AlignJustify size={12} />
          </IconBtn>
          <IconBtn title="Add" onClick={() => navigate("/setup")}>
            <Plus size={12} />
          </IconBtn>
        </div>
      </div>

      {/* Workspaces section header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        padding: "0 8px 0 12px",
        height: 26,
        flexShrink: 0,
      }}>
        <span style={{
          flex: 1,
          fontSize: 10,
          fontWeight: 600,
          color: "rgba(255,255,255,0.3)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}>
          Workspaces
        </span>
        <div style={{ display: "flex", gap: 2 }}>
          <IconBtn title="Sort" onClick={() => {}}>
            <AlignJustify size={11} />
          </IconBtn>
          <IconBtn title="Add workspace" onClick={() => navigate("/setup")}>
            <Plus size={11} />
          </IconBtn>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>

        {/* Workspace group */}
        {workspace && shortName ? (
          <WorkspaceGroup
            name={shortName}
            branch={workspace.git?.branch ?? null}
            totalAdded={totalAdded}
            totalRemoved={totalRemoved}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSessionClick={handleSessionClick}
          />
        ) : (
          <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            <SkeletonLine width="55%" height={11} />
            <SkeletonLine width="70%" height={10} />
            <SkeletonLine width="60%" height={10} />
          </div>
        )}

      </div>

      {/* Bottom bar */}
      <div style={{
        height: 36,
        borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        padding: "0 8px 0 10px",
        flexShrink: 0,
        gap: 4,
      }}>
        <button
          onClick={() => navigate("/setup")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.35)",
            fontSize: 12,
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            padding: "3px 6px",
            borderRadius: 3,
            transition: "color 0.1s",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}
        >
          <Plus size={11} />
          Add
        </button>
        <div style={{ flex: 1 }} />
        <IconBtn title="Help" onClick={() => {}}>
          <HelpCircle size={13} />
        </IconBtn>
        <IconBtn title="Settings" onClick={() => navigate("/settings")}>
          <Settings size={13} />
        </IconBtn>
      </div>
    </div>
  );
}

function WorkspaceGroup({
  name,
  branch,
  totalAdded,
  totalRemoved,
  sessions,
  activeSessionId,
  onSessionClick,
}: {
  name: string;
  branch: string | null;
  totalAdded: number;
  totalRemoved: number;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSessionClick: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);

  return (
    <div>
      {/* Workspace row */}
      <div
        onClick={() => setExpanded(v => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 10px",
          cursor: "pointer",
          background: hovered ? "rgba(255,255,255,0.04)" : "transparent",
          transition: "background 0.1s",
        }}
      >
        {/* Letter avatar */}
        <div style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          background: avatarBg(name),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 700,
          color: avatarColor(name),
          flexShrink: 0,
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        }}>
          {name.charAt(0).toUpperCase()}
        </div>
        <span style={{
          flex: 1,
          fontSize: 12,
          fontWeight: 500,
          color: "rgba(255,255,255,0.75)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {name}
        </span>
        {(totalAdded > 0 || totalRemoved > 0) && (
          <span style={{ display: "flex", gap: 4, fontFamily: "monospace", fontSize: 10 }}>
            {totalAdded > 0 && (
              <span style={{ color: "#4ade80" }}>+{totalAdded}</span>
            )}
            {totalRemoved > 0 && (
              <span style={{ color: "#f87171" }}>-{totalRemoved}</span>
            )}
          </span>
        )}
      </div>

      {/* Branch label */}
      {branch && (
        <div style={{
          paddingLeft: 38,
          paddingRight: 10,
          paddingBottom: 2,
          fontSize: 10,
          color: "rgba(255,255,255,0.2)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {branch}
        </div>
      )}

      {/* Session rows */}
      {expanded && sessions.length > 0 && sessions.map((s, i) => (
        <SessionRow
          key={s.id}
          session={s}
          shortcut={i < 9 ? `⌘${i + 1}` : undefined}
          active={s.id === activeSessionId}
          onClick={() => onSessionClick(s.id)}
        />
      ))}

      {expanded && sessions.length === 0 && (
        <div style={{
          paddingLeft: 38,
          paddingBottom: 8,
          fontSize: 11,
          color: "rgba(255,255,255,0.2)",
          fontStyle: "italic",
        }}>
          No sessions
        </div>
      )}
    </div>
  );
}

function SessionRow({
  session,
  shortcut,
  active,
  onClick,
}: {
  session: ChatSession;
  shortcut?: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const recent = isRecent(session.updated_at);
  const title = session.title || "Untitled";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        height: 32,
        padding: "4px 10px 4px 20px",
        cursor: "pointer",
        background: active
          ? "rgba(255,255,255,0.06)"
          : hovered
          ? "rgba(255,255,255,0.03)"
          : "transparent",
        transition: "background 0.1s",
      }}
    >
      <StatusDot active={recent} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12,
          fontWeight: active ? 500 : 400,
          color: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {title}
        </div>
        <div style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.2)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginTop: 1,
        }}>
          {session.message_count} msgs
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <span style={{
          fontFamily: "monospace",
          fontSize: 11,
          color: "#4ade80",
        }}>
          +{session.message_count}
        </span>
        {shortcut && (
          <span style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.25)",
            opacity: hovered || active ? 1 : 0.6,
            transition: "opacity 0.1s",
          }}>
            {shortcut}
          </span>
        )}
      </div>
    </div>
  );
}
