import { useState, useEffect } from "react";
import { Plus, HelpCircle, Settings, MessageSquare, Play, Search, Eye } from "lucide-react";
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

const INITIAL_COLORS = ["var(--blue)","var(--accent)","var(--yellow)","#8b5cf6","var(--red)","#06b6d4","#ec4899"];
const nameColor = (name: string) => INITIAL_COLORS[name.charCodeAt(0) % INITIAL_COLORS.length];

function reltime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusDot({ status }: { status: string }) {
  const color = status === "complete" ? "var(--accent)"
    : status === "running" ? "var(--yellow)"
    : status === "error" ? "var(--red)"
    : "var(--text-dimmer)";
  return (
    <span style={{
      display: "inline-block", width: 6, height: 6, borderRadius: "50%",
      background: color, flexShrink: 0,
      boxShadow: status === "running" ? `0 0 5px ${color}` : undefined,
    }} />
  );
}

export default function ActivitySidebar() {
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<WorkspaceEntry | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    () => localStorage.getItem("studio_active_session_id") ?? null
  );
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [scans, setScans] = useState<ScanSnapshot[] | null>(null);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [runsExpanded, setRunsExpanded] = useState(true);
  const [scansExpanded, setScansExpanded] = useState(true);
  const [chatsExpanded, setChatsExpanded] = useState(true);

  useEffect(() => {
    const load = () => {
      fetch("/api/sessions").then(r => r.json()).then((d: { sessions: ChatSession[] }) => {
        setSessions((d.sessions ?? []).slice(0, 8));
      }).catch(() => {});
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
      fetch("/api/runs").then(r => r.json()).then((d: { runs?: Run[] }) => {
        setRuns((d.runs ?? []).slice(0, 5));
      }).catch(() => setRuns([]));
    };
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch("/api/scan/history").then(r => r.json()).then((d: { snapshots?: ScanSnapshot[] }) => {
      setScans(d.snapshots ?? []);
    }).catch(() => setScans([]));
  }, []);

  const totalAdded = workspace?.git?.files?.reduce((s, f) => s + (f.added ?? 0), 0) ?? 0;
  const totalRemoved = workspace?.git?.files?.reduce((s, f) => s + (f.removed ?? 0), 0) ?? 0;

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: "var(--bg-2)", borderRight: "1px solid var(--border-dim)",
      fontFamily: "var(--font-ui)", userSelect: "none",
    }}>
      {/* Header */}
      <div style={{
        height: 38, display: "flex", alignItems: "center", padding: "0 14px",
        WebkitAppRegion: "drag", flexShrink: 0,
      } as React.CSSProperties}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", letterSpacing: "-0.01em" }}>
          Activity
        </span>
      </div>

      {/* Workspace header */}
      <div style={{ display: "flex", alignItems: "center", padding: "0 10px 0 14px", height: 28, flexShrink: 0 }}>
        <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "var(--text-dim)" }}>Workspaces</span>
        <SidebarIconBtn title="Add workspace" onClick={() => navigate("/setup")}>
          <Plus size={13} />
        </SidebarIconBtn>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: "auto" }}>

        {/* Workspace entry */}
        {workspace ? (
          <WorkspaceItem
            workspace={workspace}
            totalAdded={totalAdded}
            totalRemoved={totalRemoved}
            activeSession={activeSession}
            onSelectSession={setActiveSession}
          />
        ) : (
          <div style={{ padding: "8px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
            <SkeletonLine width="60%" height={12} />
            <SkeletonLine width="40%" height={10} />
          </div>
        )}

        {/* Quick Actions */}
        <div style={{ marginTop: 12 }}>
          <SectionHeader label="Quick Actions" />
          <div style={{ padding: "6px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
            <QuickActionBtn
              icon={<Play size={11} />}
              label="New run"
              onClick={() => navigate("/")}
            />
            <QuickActionBtn
              icon={<Search size={11} />}
              label="New scan"
              onClick={() => {
                fetch("/api/scan", { method: "POST" }).catch(() => {});
                navigate("/");
              }}
            />
            <QuickActionBtn
              icon={<Eye size={11} />}
              label="Watch mode"
              onClick={() => navigate("/settings")}
            />
          </div>
        </div>

        {/* Recent Runs */}
        <div style={{ marginTop: 8 }}>
          <CollapsibleSectionHeader
            label="Recent Runs"
            expanded={runsExpanded}
            onToggle={() => setRunsExpanded(v => !v)}
          />
          {runsExpanded && (
            runs === null ? (
              <div style={{ padding: "6px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                <SkeletonLine width="80%" height={11} />
                <SkeletonLine width="65%" height={11} />
                <SkeletonLine width="72%" height={11} />
              </div>
            ) : runs.length === 0 ? (
              <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--text-dimmer)", fontStyle: "italic" }}>
                No runs yet
              </div>
            ) : (
              runs.map(run => (
                <RunRow key={run.id} run={run} onClick={() => navigate("/")} />
              ))
            )
          )}
        </div>

        {/* Recent Scans */}
        <div style={{ marginTop: 8 }}>
          <CollapsibleSectionHeader
            label="Recent Scans"
            expanded={scansExpanded}
            onToggle={() => setScansExpanded(v => !v)}
          />
          {scansExpanded && (
            scans === null ? (
              <div style={{ padding: "6px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                <SkeletonLine width="70%" height={11} />
                <SkeletonLine width="55%" height={11} />
              </div>
            ) : scans.length === 0 ? (
              <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--text-dimmer)", fontStyle: "italic" }}>
                No scans yet
              </div>
            ) : (
              scans.map((snap, i) => (
                <ScanRow key={i} snap={snap} />
              ))
            )
          )}
        </div>

        {/* Chat history */}
        {sessions.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <CollapsibleSectionHeader
              label="Recent Chats"
              expanded={chatsExpanded}
              onToggle={() => setChatsExpanded(v => !v)}
            />
            {chatsExpanded && sessions.map(s => (
              <SessionRow
                key={s.id}
                session={s}
                active={s.id === activeSessionId}
                onClick={() => {
                  localStorage.setItem("studio_active_session_id", s.id);
                  setActiveSessionId(s.id);
                  navigate("/");
                  window.dispatchEvent(new CustomEvent("studio:switch-session", { detail: s.id }));
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div style={{
        height: 40, borderTop: "1px solid var(--border-dim)",
        display: "flex", alignItems: "center", padding: "0 10px", gap: 4, flexShrink: 0,
      }}>
        <button
          onClick={() => navigate("/setup")}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 10px", background: "none",
            border: "1px solid var(--border-dim)", borderRadius: 4,
            color: "var(--text-dimmer)", fontSize: 11, cursor: "pointer", transition: "all 0.1s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-dim)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)";
          }}
        >
          <Plus size={11} />
          Add
        </button>
        <div style={{ flex: 1 }} />
        <SidebarIconBtn title="Help" onClick={() => {}}>
          <HelpCircle size={14} />
        </SidebarIconBtn>
        <SidebarIconBtn title="Settings" onClick={() => navigate("/settings")}>
          <Settings size={14} />
        </SidebarIconBtn>
      </div>
    </div>
  );
}

function QuickActionBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "5px 8px", width: "100%", textAlign: "left",
        background: hovered ? "rgba(255,255,255,0.05)" : "transparent",
        border: "none", borderRadius: "var(--radius-sm)",
        color: hovered ? "var(--text)" : "var(--text-dim)",
        fontSize: 11, cursor: "pointer", transition: "all 0.1s",
      }}
    >
      <span style={{ color: "var(--accent)", flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  );
}

function RunRow({ run, onClick }: { run: Run; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const snippet = run.task.length > 40 ? run.task.slice(0, 40) + "…" : run.task;
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "flex-start", gap: 8,
        padding: "5px 14px 5px 16px", cursor: "pointer",
        background: hovered ? "rgba(255,255,255,0.04)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <StatusDot status={run.status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, color: "var(--text-dim)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {snippet || `run/${run.id}`}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-dimmer)", marginTop: 1 }}>
          {reltime(run.created_at)}
        </div>
      </div>
    </div>
  );
}

function ScanRow({ snap }: { snap: ScanSnapshot }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "5px 14px 5px 16px",
    }}>
      <span style={{ fontSize: 10, color: "var(--accent)", flexShrink: 0 }}>⬡</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
          {snap.totalFiles} files · {snap.totalLines.toLocaleString()} lines
        </div>
        <div style={{ fontSize: 10, color: "var(--text-dimmer)", marginTop: 1 }}>
          {reltime(snap.scannedAt)}
        </div>
      </div>
    </div>
  );
}

function WorkspaceItem({
  workspace, totalAdded, totalRemoved, activeSession, onSelectSession,
}: {
  workspace: WorkspaceEntry;
  totalAdded: number;
  totalRemoved: number;
  activeSession: string | null;
  onSelectSession: (id: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const color = nameColor(workspace.name);
  const shortName = workspace.name.split("/").pop() ?? workspace.name;

  return (
    <div>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "5px 14px",
          cursor: "pointer", transition: "background 0.1s",
        }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
      >
        <div style={{
          width: 20, height: 20, borderRadius: 4,
          background: `${color}22`, border: `1px solid ${color}44`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700, color: color, flexShrink: 0,
        }}>
          {shortName.charAt(0).toUpperCase()}
        </div>
        <span style={{
          flex: 1, fontSize: 12, fontWeight: 600, color: "var(--text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {shortName}
        </span>
        {(totalAdded > 0 || totalRemoved > 0) && (
          <span style={{ display: "flex", gap: 4, fontSize: 10 }}>
            {totalAdded > 0 && <span style={{ color: "var(--accent)" }}>+{totalAdded}</span>}
            {totalRemoved > 0 && <span style={{ color: "var(--red)" }}>-{totalRemoved}</span>}
          </span>
        )}
      </div>

      {workspace.git?.branch && (
        <div style={{
          paddingLeft: 42, paddingRight: 14, paddingBottom: 2,
          fontSize: 10, color: "var(--text-dimmer)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {workspace.git.branch}
        </div>
      )}

      {expanded && workspace.agents.length > 0 && (
        <div style={{ paddingBottom: 4 }}>
          {workspace.agents.slice(0, 20).map((agent, i) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              shortcut={i < 9 ? `⌘${i + 1}` : undefined}
              active={activeSession === agent.id}
              onClick={() => onSelectSession(agent.id)}
            />
          ))}
        </div>
      )}

      {expanded && workspace.agents.length === 0 && (
        <div style={{ paddingLeft: 42, paddingBottom: 8, fontSize: 11, color: "var(--text-dimmer)", fontStyle: "italic" }}>
          No agents
        </div>
      )}
    </div>
  );
}

function AgentRow({
  agent, shortcut, active, onClick,
}: {
  agent: Agent;
  shortcut?: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const displayName = agent.name || agent.id;
  const sub = agent.path ? agent.path.split("/").pop() ?? agent.path : agent.department;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "4px 14px 4px 42px",
        cursor: "pointer",
        background: active ? "var(--accent-bg)" : hovered ? "rgba(255,255,255,0.04)" : "transparent",
        borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
        transition: "background 0.1s",
      }}
    >
      <div style={{
        width: 6, height: 6, borderRadius: "50%",
        background: active ? "var(--accent)" : "var(--yellow)", flexShrink: 0,
        boxShadow: active ? "0 0 6px var(--accent)" : undefined,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 500,
          color: active ? "var(--accent)" : "var(--text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {displayName}
        </div>
        {sub && (
          <div style={{
            fontSize: 10, color: "var(--text-dimmer)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {sub}
          </div>
        )}
      </div>
      {shortcut && (
        <span style={{ fontSize: 10, color: "var(--text-dimmer)", flexShrink: 0, opacity: hovered ? 1 : 0.5 }}>
          {shortcut}
        </span>
      )}
    </div>
  );
}

function SidebarIconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: "none", border: "none", cursor: "pointer",
        color: "var(--text-dimmer)", display: "flex", alignItems: "center", justifyContent: "center",
        width: 24, height: 24, padding: 0, borderRadius: 3, transition: "color 0.1s, background 0.1s",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)";
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 10px 0 14px", height: 26, flexShrink: 0 }}>
      <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "var(--text-dim)" }}>{label}</span>
    </div>
  );
}

function CollapsibleSectionHeader({ label, expanded, onToggle }: { label: string; expanded: boolean; onToggle: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "0 10px 0 14px", height: 26, flexShrink: 0,
        cursor: "pointer", background: hovered ? "rgba(255,255,255,0.03)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <span style={{
        fontSize: 9, color: "var(--text-dimmer)", transition: "transform 0.1s",
        display: "inline-block", transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
      }}>
        ▶
      </span>
      <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "var(--text-dim)" }}>{label}</span>
    </div>
  );
}

function SessionRow({ session, active, onClick }: { session: ChatSession; active: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "5px 14px 5px 16px",
        cursor: "pointer",
        background: active ? "var(--accent-bg)" : hovered ? "rgba(255,255,255,0.04)" : "transparent",
        borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
        transition: "background 0.1s",
      }}
    >
      <MessageSquare size={12} style={{ color: active ? "var(--accent)" : "var(--text-dimmer)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, color: active ? "var(--text)" : "var(--text-dim)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {session.title || "Untitled"}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-dimmer)" }}>
          {session.message_count} msgs
        </div>
      </div>
    </div>
  );
}
