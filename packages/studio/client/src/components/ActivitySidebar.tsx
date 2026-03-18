import { useState, useEffect } from "react";
import { Plus, HelpCircle, Settings, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";

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

const INITIAL = (name: string) => name.charAt(0).toUpperCase();
const INITIAL_COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#ec4899"];
const nameColor = (name: string) => INITIAL_COLORS[name.charCodeAt(0) % INITIAL_COLORS.length];

export default function ActivitySidebar() {
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<WorkspaceEntry | null>(null);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    () => localStorage.getItem("studio_active_session_id") ?? null
  );

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

  const totalAdded = workspace?.git?.files?.reduce((s, f) => s + (f.added ?? 0), 0) ?? 0;
  const totalRemoved = workspace?.git?.files?.reduce((s, f) => s + (f.removed ?? 0), 0) ?? 0;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--bg-2)",
      borderRight: "1px solid var(--border-dim)",
      fontFamily: "var(--font)",
      userSelect: "none",
    }}>
      {/* Activity header */}
      <div style={{
        height: 38,
        display: "flex",
        alignItems: "center",
        padding: "0 14px",
        WebkitAppRegion: "drag",
        flexShrink: 0,
      } as React.CSSProperties}>
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-dim)",
          letterSpacing: "-0.01em",
        }}>
          Activity
        </span>
      </div>

      {/* Workspaces section */}
      <div style={{
        display: "flex",
        alignItems: "center",
        padding: "0 10px 0 14px",
        height: 28,
        flexShrink: 0,
      }}>
        <span style={{
          flex: 1,
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-dim)",
        }}>
          Workspaces
        </span>
        <SidebarIconBtn title="Add workspace" onClick={() => navigate("/setup")}>
          <Plus size={13} />
        </SidebarIconBtn>
      </div>

      {/* Workspace entries + sessions */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {workspace && (
          <WorkspaceItem
            workspace={workspace}
            totalAdded={totalAdded}
            totalRemoved={totalRemoved}
            activeSession={activeSession}
            onSelectSession={setActiveSession}
          />
        )}

        {!workspace && (
          <div style={{ padding: "20px 14px", fontSize: 11, color: "var(--text-dimmer)", textAlign: "center" }}>
            loading...
          </div>
        )}

        {/* Chat history section */}
        {sessions.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <SectionHeader label="Recent Chats" />
            {sessions.map(s => (
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
        height: 40,
        borderTop: "1px solid var(--border-dim)",
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        gap: 4,
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate("/setup")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            background: "none",
            border: "1px solid var(--border-dim)",
            borderRadius: 4,
            color: "var(--text-dimmer)",
            fontSize: 11,
            cursor: "pointer",
            transition: "all 0.1s",
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

function WorkspaceItem({
  workspace,
  totalAdded,
  totalRemoved,
  activeSession,
  onSelectSession,
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
      {/* Workspace row */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 14px",
          cursor: "pointer",
          transition: "background 0.1s",
        }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
      >
        {/* Letter avatar */}
        <div style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          background: `${color}22`,
          border: `1px solid ${color}44`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 700,
          color: color,
          flexShrink: 0,
        }}>
          {INITIAL(shortName)}
        </div>
        <span style={{
          flex: 1,
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {shortName}
        </span>
        {(totalAdded > 0 || totalRemoved > 0) && (
          <span style={{ display: "flex", gap: 4, fontSize: 10 }}>
            {totalAdded > 0 && <span style={{ color: "#10b981" }}>+{totalAdded}</span>}
            {totalRemoved > 0 && <span style={{ color: "#ef4444" }}>-{totalRemoved}</span>}
          </span>
        )}
      </div>

      {/* Branch line */}
      {workspace.git?.branch && (
        <div style={{
          paddingLeft: 42,
          paddingRight: 14,
          paddingBottom: 2,
          fontSize: 10,
          color: "var(--text-dimmer)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {workspace.git.branch}
        </div>
      )}

      {/* Agent rows */}
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
        <div style={{
          paddingLeft: 42,
          paddingBottom: 8,
          fontSize: 11,
          color: "var(--text-dimmer)",
          fontStyle: "italic",
        }}>
          No agents
        </div>
      )}
    </div>
  );
}

function AgentRow({
  agent,
  shortcut,
  active,
  onClick,
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
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 14px 4px 42px",
        cursor: "pointer",
        background: active
          ? "rgba(16,185,129,0.08)"
          : hovered ? "rgba(255,255,255,0.04)" : "transparent",
        borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
        transition: "background 0.1s",
      }}
    >
      {/* Status dot */}
      <div style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: active ? "var(--accent)" : "#f59e0b",
        flexShrink: 0,
        boxShadow: active ? "0 0 6px var(--accent)" : undefined,
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 500,
          color: active ? "var(--accent)" : "var(--text)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {displayName}
        </div>
        {sub && (
          <div style={{
            fontSize: 10,
            color: "var(--text-dimmer)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {sub}
          </div>
        )}
      </div>

      {shortcut && (
        <span style={{
          fontSize: 10,
          color: "var(--text-dimmer)",
          flexShrink: 0,
          opacity: hovered ? 1 : 0.5,
        }}>
          {shortcut}
        </span>
      )}
    </div>
  );
}

function SidebarIconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--text-dimmer)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        padding: 0,
        borderRadius: 3,
        transition: "color 0.1s, background 0.1s",
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
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "0 10px 0 14px", height: 26, flexShrink: 0,
    }}>
      <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "var(--text-dim)" }}>{label}</span>
    </div>
  );
}

function SessionRow({
  session, active, onClick,
}: { session: ChatSession; active: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "5px 14px 5px 16px",
        cursor: "pointer",
        background: active ? "rgba(16,185,129,0.08)" : hovered ? "rgba(255,255,255,0.04)" : "transparent",
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
