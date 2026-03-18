import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { Home, FolderTree, GitBranch, MessageSquare, Bot, Zap, Settings, TerminalSquare, Play, Clock } from "lucide-react";
import { basename } from "../lib/path.js";
import WorkspaceSidebar from "./WorkspaceSidebar.tsx";
import ChatMessages from "./ChatMessages.tsx";
import ChatInputBar from "./ChatInputBar.tsx";
import { ContextBar } from "./ContextBar.tsx";
import CheckpointPanel from "./CheckpointPanel.tsx";

import TerminalTabs from "./TerminalTabs.tsx";

interface ProjectInfo { projectName: string; projectDir: string; }
interface GitStatus { branch: string; files: { status: string }[]; }

const NAV = [
  { to: "/",         icon: <Home size={20} />,          title: "Home",     end: true },
  { to: "/files",    icon: <FolderTree size={20} />,    title: "Explorer"            },
  { to: "/sessions", icon: <MessageSquare size={20} />, title: "Chat"                },
  { to: "/agents",   icon: <Bot size={20} />,           title: "Agents"              },
  { to: "/generate", icon: <Zap size={20} />,           title: "Generate"            },
  { to: "/setup",    icon: <Play size={20} />,          title: "Workspace"           },
  { to: "/settings", icon: <Settings size={20} />,      title: "Settings"            },
];

const PANEL_TABS = ["TERMINAL", "OUTPUT"] as const;
type PanelTab = typeof PANEL_TABS[number];

function persist(key: string, val: unknown) {
  try { localStorage.setItem(`studio:${key}`, JSON.stringify(val)); } catch {}
}
function restore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`studio:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

export default function Layout() {
  const location = useLocation();
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [git, setGit] = useState<GitStatus | null>(null);

  // Panel state — persisted
  const [termOpen,      setTermOpen]      = useState(() => restore("termOpen",      false));
  const [termHeight,    setTermHeight]    = useState(() => restore("termHeight",    220));
  const [termBig,       setTermBig]       = useState(() => restore("termBig",       false));
  const [activeTab,     setActiveTab]     = useState<PanelTab>("TERMINAL");
  const [workspaceOpen, setWorkspaceOpen] = useState(() => restore("workspaceOpen", false));
  const [checkpointOpen, setCheckpointOpen] = useState(() => restore("checkpointOpen", false));

  // Active chat session — persisted to dedicated key
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() =>
    localStorage.getItem("studio_active_session_id") ?? null
  );
  const [streamText, setStreamText] = useState("");
  const [streaming,  setStreaming]  = useState(false);

  // Persist panel state
  useEffect(() => persist("termOpen",      termOpen),      [termOpen]);
  useEffect(() => persist("termHeight",    termHeight),    [termHeight]);
  useEffect(() => persist("termBig",       termBig),       [termBig]);
  useEffect(() => persist("workspaceOpen", workspaceOpen), [workspaceOpen]);
  useEffect(() => persist("checkpointOpen", checkpointOpen), [checkpointOpen]);

  // Persist active session
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem("studio_active_session_id", activeSessionId);
    } else {
      localStorage.removeItem("studio_active_session_id");
    }
  }, [activeSessionId]);

  // Auto-create a session on mount if none exists
  useEffect(() => {
    if (activeSessionId) return;
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((r) => r.json())
      .then((d: { session: { id: string } }) => setActiveSessionId(d.session.id))
      .catch(() => {});
  }, [activeSessionId]);

  // Load project info + git branch
  useEffect(() => {
    fetch("/api/info").then(r => r.json()).then(setInfo).catch(() => {});
    fetch("/api/files/git").then(r => r.json()).then(setGit).catch(() => {});
  }, []);

  // Keyboard shortcut: terminal toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        setTermOpen(v => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Drag refs — terminal only
  const draggingTerm = useRef(false);
  const dragStartY   = useRef(0);
  const dragStartH   = useRef(0);

  const onTermDragStart = (e: React.MouseEvent) => {
    draggingTerm.current = true;
    dragStartY.current   = e.clientY;
    dragStartH.current   = termHeight;
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingTerm.current) {
        const delta = dragStartY.current - e.clientY;
        setTermHeight(Math.max(80, Math.min(600, dragStartH.current + delta)));
      }
    };
    const onUp = () => { draggingTerm.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const handleNewSession = () => {
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((r) => r.json())
      .then((d: { session: { id: string } }) => setActiveSessionId(d.session.id))
      .catch(() => {});
  };

  const [runActive, setRunActive] = useState(false);

  useEffect(() => {
    const check = () => {
      fetch("/api/workspace/status")
        .then(r => r.json())
        .then((d: { running: string[] }) => setRunActive(d.running.includes("run")))
        .catch(() => {});
    };
    check();
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, []);

  const changedFiles = git?.files?.length ?? 0;

  const routeTitle = NAV.find(n => n.to === location.pathname)?.title
    ?? location.pathname.slice(1).toUpperCase()
    ?? "HOME";

  const isSessionsRoute = location.pathname === "/sessions";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      overflow: "hidden",
      background: "var(--bg)",
      WebkitAppRegion: "no-drag",
    } as React.CSSProperties}>

      {/* TOP: activity bar + content area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* Activity bar */}
        <aside style={{
          width: 52,
          minWidth: 52,
          background: "var(--bg-2)",
          borderRight: "1px solid var(--border-dim)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 40,
          overflow: "visible",
          zIndex: 100,
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "var(--accent)", marginBottom: 16, letterSpacing: "-0.02em" }}>
            #
          </div>

          <nav style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%" }}>
            {NAV.map(item => (
              <div key={item.to} className="nav-tooltip-wrap">
                <NavLink
                  to={item.to}
                  end={item.end}
                  style={({ isActive }) => ({
                    display: "flex", alignItems: "center", justifyContent: "center",
                    height: 44, fontSize: 20, position: "relative",
                    color: isActive ? "var(--text)" : "var(--text-dimmer)",
                    background: isActive ? "var(--accent-bg)" : "transparent",
                    borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                    transition: "all 0.1s", textDecoration: "none",
                  })}
                >
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{item.icon}</span>
                  {item.to === "/source-control" && changedFiles > 0 && (
                    <span style={{
                      position: "absolute", top: 6, right: 4,
                      background: "var(--accent)", color: "var(--bg)",
                      fontSize: 9, fontWeight: 700, borderRadius: 8,
                      padding: "0 4px", minWidth: 14, textAlign: "center", lineHeight: "14px",
                    }}>
                      {changedFiles}
                    </span>
                  )}
                </NavLink>
                <span className="nav-tooltip">{item.title}</span>
              </div>
            ))}
          </nav>

          {/* Workspace sidebar toggle */}
          <div className="nav-tooltip-wrap" style={{ marginTop: 4 }}>
            <button
              onClick={() => setWorkspaceOpen(v => !v)}
              style={{
                background: workspaceOpen ? "var(--accent-bg)" : "transparent",
                border: "none",
                cursor: "pointer",
                color: workspaceOpen ? "var(--text)" : "var(--text-dimmer)",
                borderLeft: workspaceOpen ? "2px solid var(--accent)" : "2px solid transparent",
                fontSize: 20, height: 44, width: 52,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.1s",
                position: "relative",
              }}
            >
              <GitBranch size={20} />
              {changedFiles > 0 && (
                <span style={{
                  position: "absolute", top: 6, right: 4,
                  background: "var(--accent)", color: "var(--bg)",
                  fontSize: 9, fontWeight: 700, borderRadius: 8,
                  padding: "0 4px", minWidth: 14, textAlign: "center", lineHeight: "14px",
                }}>
                  {changedFiles}
                </span>
              )}
            </button>
            <span className="nav-tooltip">Source Control</span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Checkpoints toggle */}
          <div className="nav-tooltip-wrap" style={{ marginBottom: 2 }}>
            <button
              onClick={() => setCheckpointOpen(v => !v)}
              style={{
                background: checkpointOpen ? "var(--accent-bg)" : "none",
                border: "none", cursor: "pointer",
                color: checkpointOpen ? "var(--accent)" : "var(--text-dimmer)",
                borderLeft: checkpointOpen ? "2px solid var(--accent)" : "2px solid transparent",
                fontSize: 20, height: 44, width: 52,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.1s",
              }}
            ><Clock size={20} /></button>
            <span className="nav-tooltip">Checkpoints</span>
          </div>

          {/* Terminal toggle */}
          <div className="nav-tooltip-wrap" style={{ marginBottom: 8 }}>
            <button
              onClick={() => setTermOpen(v => !v)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: termOpen ? "var(--accent)" : "var(--text-dimmer)",
                fontSize: 20, height: 44, width: 52,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            ><TerminalSquare size={20} /></button>
            <span className="nav-tooltip">Terminal  ⌃`</span>
          </div>
        </aside>

        {/* Workspace sidebar panel */}
        {workspaceOpen && (
          <div style={{
            width: 260,
            minWidth: 260,
            borderRight: "1px solid var(--border-dim)",
            background: "var(--bg-2)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}>
            <WorkspaceSidebar onClose={() => setWorkspaceOpen(false)} />
          </div>
        )}

        {/* Content column: titlebar + page/messages + terminal + chat input */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* Titlebar / breadcrumb */}
          <div style={{
            height: 38, minHeight: 38,
            background: "var(--bg-2)",
            borderBottom: "1px solid var(--border-dim)",
            display: "flex", alignItems: "center",
            padding: "0 12px",
            WebkitAppRegion: "drag",
            gap: 8, flexShrink: 0,
          } as React.CSSProperties}>
            <span style={{ fontSize: 11, color: "var(--text-dimmer)", marginLeft: 60, fontFamily: "var(--font)" }}>
              {info?.projectName ?? "…"}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-dimmer)", opacity: 0.4 }}>›</span>
            <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font)" }}>
              {routeTitle}
            </span>
          </div>

          {/* Page content — sessions route shows message history, others show Outlet */}
          <div style={{
            flex: termBig ? 0 : 1,
            overflow: "hidden",
            minHeight: termBig ? 0 : undefined,
            display: termBig ? "none" : "flex",
            flexDirection: "column",
          }}>
            {isSessionsRoute ? (
              <ChatMessages
                sessionId={activeSessionId}
                streamText={streamText}
                streaming={streaming}
              />
            ) : (
              <div style={{ flex: 1, overflow: "auto" }}>
                <Outlet />
              </div>
            )}
          </div>

          {/* Bottom terminal panel */}
          {termOpen && (
            <>
              {!termBig && (
                <div
                  onMouseDown={onTermDragStart}
                  style={{ height: 4, background: "var(--border-dim)", cursor: "ns-resize", flexShrink: 0, transition: "background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--accent)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "var(--border-dim)")}
                />
              )}
              <div style={{
                height: termBig ? "100%" : `${termHeight}px`,
                flex: termBig ? 1 : undefined,
                minHeight: 80, background: "var(--bg)", flexShrink: 0,
                display: "flex", flexDirection: "column",
                borderTop: "1px solid var(--border-dim)",
              }}>
                <div style={{
                  height: 30, background: "var(--bg-3)",
                  borderBottom: "1px solid var(--border-dim)",
                  display: "flex", alignItems: "stretch",
                  flexShrink: 0, userSelect: "none",
                }}>
                  {PANEL_TABS.map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        padding: "0 14px", fontSize: 11, fontFamily: "var(--font)",
                        color: activeTab === tab ? "var(--text)" : "var(--text-dimmer)",
                        borderBottom: activeTab === tab ? "1px solid var(--accent)" : "1px solid transparent",
                        letterSpacing: "0.05em", transition: "color 0.1s",
                      }}
                    >
                      {tab}
                    </button>
                  ))}
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => setTermBig(v => !v)}
                    title={termBig ? "Restore panel" : "Maximize panel"}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: termBig ? "var(--accent)" : "var(--text-dimmer)",
                      fontSize: 13, padding: "0 10px",
                      transition: "color 0.1s",
                    }}
                  >
                    {termBig ? "⊡" : "⊞"}
                  </button>
                  <button
                    onClick={() => setTermOpen(false)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--text-dimmer)", fontSize: 14,
                      padding: "0 10px", lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ flex: 1, overflow: "hidden", display: activeTab === "TERMINAL" ? "flex" : "none", flexDirection: "column" }}>
                  <TerminalTabs />
                </div>

                {activeTab === "OUTPUT" && (
                  <div style={{
                    flex: 1, padding: "12px 16px", overflow: "auto",
                    fontSize: 12, color: "var(--text-dimmer)", fontFamily: "var(--font)",
                  }}>
                    No output yet.
                  </div>
                )}
              </div>
            </>
          )}

          {/* Context usage indicator */}
          <ContextBar sessionId={activeSessionId} streaming={streaming} />

          {/* Bottom chat input bar — always visible */}
          <ChatInputBar
            sessionId={activeSessionId}
            onNewSession={handleNewSession}
            onSessionCreated={setActiveSessionId}
            onStreamText={setStreamText}
            onStreamingChange={setStreaming}
            streaming={streaming}
          />
        </div>

        {/* Checkpoint panel (right side) */}
        {checkpointOpen && (
          <div style={{
            width: 260,
            minWidth: 260,
            borderLeft: "1px solid var(--border-dim)",
            background: "var(--bg-2)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}>
            <CheckpointPanel onClose={() => setCheckpointOpen(false)} />
          </div>
        )}
      </div>

      {/* STATUS BAR */}
      <div style={{
        height: 22, minHeight: 22,
        background: "#0d1f17",
        borderTop: "1px solid #0a1910",
        display: "flex", alignItems: "center",
        padding: "0 8px", gap: 0,
        fontSize: 11, fontFamily: "var(--font)",
        flexShrink: 0, userSelect: "none",
        WebkitAppRegion: "no-drag",
        zIndex: 200,
      } as React.CSSProperties}>
        <StatusItem
          onClick={() => { window.location.hash = "/git"; }}
          title="Source Control"
        >
          <GitBranch size={12} style={{ opacity: 0.7 }} />
          {git?.branch ?? "—"}
          {changedFiles > 0 && (
            <span style={{ marginLeft: 4, opacity: 0.8 }}>+{changedFiles}</span>
          )}
        </StatusItem>

        {runActive && (
          <StatusItem onClick={() => { window.location.hash = "/setup"; }} title="Workspace running">
            <span style={{
              display: "inline-block",
              width: 6, height: 6,
              borderRadius: "50%",
              background: "var(--accent)",
              animation: "blink 1s step-end infinite",
              flexShrink: 0,
            }} />
            running
          </StatusItem>
        )}

        <div style={{ flex: 1 }} />

        <ProjectSwitcher projectName={info?.projectName ?? null} />

        <StatusItem>
          Ln 1, Col 1
        </StatusItem>

        <StatusItem>
          Spaces: 2
        </StatusItem>

        <StatusItem>
          UTF-8
        </StatusItem>

        <StatusItem>
          TS
        </StatusItem>
      </div>
    </div>
  );
}

function StatusItem({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <div
      onClick={onClick}
      title={title}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "0 8px", height: "100%",
        color: "rgba(16,185,129,0.75)",
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.1s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = "rgba(16,185,129,0.12)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      {children}
    </div>
  );
}

function ProjectSwitcher({ projectName }: { projectName: string | null }) {
  const isElectron = typeof window.studio !== "undefined";
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const loadRecent = useCallback(() => {
    window.studio?.getRecentProjects?.().then(r => setRecent(r ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isElectron || !open) return;
    loadRecent();
  }, [isElectron, open, loadRecent]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const handleOpenRecent = async (path: string) => {
    setOpen(false);
    await window.studio?.setProjectDir(path);
  };

  const handlePickFolder = async () => {
    setOpen(false);
    const dir = await window.studio?.pickFolder();
    if (dir) await window.studio?.setProjectDir(dir);
  };

  if (!isElectron) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "0 8px", height: "100%",
        color: "rgba(16,185,129,0.75)",
        whiteSpace: "nowrap",
      }}>
        {projectName ?? "hashmark studio"}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative", height: "100%" }}>
      <div
        onClick={() => setOpen(v => !v)}
        title="Switch project"
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "0 8px", height: "100%",
          color: "rgba(16,185,129,0.75)",
          cursor: "pointer",
          transition: "background 0.1s",
          whiteSpace: "nowrap",
          background: open ? "rgba(16,185,129,0.12)" : "transparent",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(16,185,129,0.12)"; }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
      >
        {projectName ?? "hashmark studio"}
        <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2 }}>▲</span>
      </div>

      {open && (
        <div style={{
          position: "fixed",
          bottom: 22,
          right: 0,
          zIndex: 9999,
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          minWidth: 280,
          maxWidth: 400,
          boxShadow: "0 -4px 16px rgba(0,0,0,0.4)",
          fontFamily: "var(--font)",
          overflow: "hidden",
        }}>
          {recent.length > 0 && (
            <>
              <div style={{
                padding: "6px 12px 4px",
                fontSize: 10,
                color: "var(--text-dimmer)",
                letterSpacing: "0.08em",
                borderBottom: "1px solid var(--border-dim)",
              }}>
                RECENT PROJECTS
              </div>
              {recent.map(path => (
                <div
                  key={path}
                  onClick={() => void handleOpenRecent(path)}
                  style={{
                    display: "flex", flexDirection: "column",
                    padding: "7px 12px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--border-dim)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--accent-bg)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {basename(path)}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-dimmer)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
                    {path}
                  </span>
                </div>
              ))}
            </>
          )}
          <div
            onClick={() => void handlePickFolder()}
            style={{
              padding: "8px 12px",
              fontSize: 12,
              color: "var(--accent)",
              cursor: "pointer",
              transition: "background 0.1s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--accent-bg)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
          >
            &gt; Open Different Project...
          </div>
        </div>
      )}
    </div>
  );
}
