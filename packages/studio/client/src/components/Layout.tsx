import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { Home, FolderTree, GitBranch, Bot, Zap, Settings, TerminalSquare, Play, Building2, ChevronRight, AlertTriangle, Shield, PlayCircle } from "lucide-react";
import CommandPalette from "./CommandPalette.tsx";
import ActivitySidebar from "./ActivitySidebar.tsx";
import ChatMessages from "./ChatMessages.tsx";
import ChatInputBar from "./ChatInputBar.tsx";
import { ContextBar } from "./ContextBar.tsx";
import TerminalTabs from "./TerminalTabs.tsx";
import ResizableDrawer from "./ResizableDrawer.tsx";

interface ProjectInfo { projectName: string; projectDir: string; }
interface GitStatus { branch: string; files: { status: string }[]; }

type DriftLevel = "none" | "minor" | "major";
interface DriftSignal {
  type: "file_count_delta" | "age_days" | "commit_mismatch";
  current?: number;
  baseline?: number;
  delta?: number;
  days?: number;
  fileCommit?: string;
  headCommit?: string;
}
interface DriftResult {
  hasContextFile: true;
  fileName: string;
  driftLevel: DriftLevel;
  signals: DriftSignal[];
  recommendation: string;
}
interface NoDriftResult { hasContextFile: false; }
type DriftResponse = DriftResult | NoDriftResult;

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem("studio:drift_dismissed_until");
    if (!raw) return false;
    return Date.now() < parseInt(raw, 10);
  } catch { return false; }
}
function dismissFor24h() {
  try { localStorage.setItem("studio:drift_dismissed_until", String(Date.now() + 86400000)); } catch {}
}

const NAV = [
  { to: "/",         icon: <Home size={18} />,        title: "Home",     end: true },
  { to: "/files",    icon: <FolderTree size={18} />,  title: "Files"              },
  { to: "/agents",   icon: <Bot size={18} />,         title: "Agents"             },
  { to: "/generate", icon: <Zap size={18} />,         title: "Generate"           },
  { to: "/run",        icon: <PlayCircle size={18} />, title: "Run"                },
  { to: "/company",    icon: <Building2 size={18} />,  title: "Company"            },
  { to: "/governance", icon: <Shield size={18} />,    title: "Governance"         },
  { to: "/setup",      icon: <Play size={18} />,      title: "Setup"              },
  { to: "/settings",   icon: <Settings size={18} />,  title: "Settings"           },
];

function persist(key: string, val: unknown) {
  try { localStorage.setItem(`studio:${key}`, JSON.stringify(val)); } catch {}
}
function restore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`studio:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

const PANEL_TABS = ["TERMINAL", "OUTPUT"] as const;
type PanelTab = typeof PANEL_TABS[number];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [git, setGit] = useState<GitStatus | null>(null);
  const [drift, setDrift] = useState<DriftResult | null>(null);
  const [driftDismissed, setDriftDismissed] = useState<boolean>(isDismissed);

  const [cmdOpen, setCmdOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutsOpenRef = useRef(false);
  const lastKeyRef = useRef<string | null>(null);
  const lastKeyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { shortcutsOpenRef.current = shortcutsOpen; }, [shortcutsOpen]);
  const [termOpen,  setTermOpen]  = useState(() => restore("termOpen",  false));
  const [termBig,   setTermBig]   = useState(() => restore("termBig",   false));
  const [activeTab, setActiveTab] = useState<PanelTab>("TERMINAL");

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() =>
    localStorage.getItem("studio_active_session_id") ?? null
  );
  const [streamText,    setStreamText]    = useState("");
  const [streaming,     setStreaming]     = useState(false);
  const [terminalCwd,   setTerminalCwd]   = useState("");

  useEffect(() => persist("termOpen", termOpen), [termOpen]);
  useEffect(() => persist("termBig",  termBig),  [termBig]);

  useEffect(() => {
    if (activeSessionId) localStorage.setItem("studio_active_session_id", activeSessionId);
    else localStorage.removeItem("studio_active_session_id");
  }, [activeSessionId]);

  // Auto-create session on mount
  useEffect(() => {
    if (activeSessionId) return;
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).then(r => r.json()).then((d: { session: { id: string } }) => setActiveSessionId(d.session.id)).catch(() => {});
  }, [activeSessionId]);

  useEffect(() => {
    fetch("/api/info").then(r => r.json()).then(setInfo).catch(() => {});
    fetch("/api/files/git").then(r => r.json()).then(setGit).catch(() => {});
    fetch("/api/drift/check")
      .then(r => r.json())
      .then((d: DriftResponse) => {
        if (d.hasContextFile && d.driftLevel !== "none") setDrift(d);
      })
      .catch(() => {});
  }, []);

  const clearLastKey = useCallback(() => {
    lastKeyRef.current = null;
    if (lastKeyTimer.current) { clearTimeout(lastKeyTimer.current); lastKeyTimer.current = null; }
  }, []);

  useEffect(() => {
    const G_NAV: Record<string, string> = {
      s: "/",
      r: "/run",
      c: "/company",
      a: "/agents",
      g: "/git",
      f: "/files",
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === "`") { e.preventDefault(); setTermOpen(v => !v); return; }
      if (mod && e.key === "j") { e.preventDefault(); setTermOpen(v => !v); return; }
      if (mod && (e.key === "k" || (e.key === "p" && e.shiftKey))) { e.preventDefault(); setCmdOpen(v => !v); return; }

      // ? → toggle shortcuts overlay
      if (!mod && e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(v => !v);
        clearLastKey();
        return;
      }

      // Esc → close shortcuts overlay
      if (e.key === "Escape" && shortcutsOpenRef.current) {
        setShortcutsOpen(false);
        clearLastKey();
        return;
      }

      // g then X navigation
      if (!mod && lastKeyRef.current === "g") {
        const dest = G_NAV[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          navigate(dest);
          clearLastKey();
          return;
        }
      }

      if (!mod && e.key.toLowerCase() === "g") {
        lastKeyRef.current = "g";
        if (lastKeyTimer.current) clearTimeout(lastKeyTimer.current);
        lastKeyTimer.current = setTimeout(clearLastKey, 1000);
        return;
      }

      clearLastKey();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, clearLastKey]);

  // Listen for sidebar session switches
  useEffect(() => {
    const h = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) setActiveSessionId(id);
    };
    window.addEventListener("studio:switch-session", h);
    return () => window.removeEventListener("studio:switch-session", h);
  }, []);

  // Wire up Electron menu events
  useEffect(() => {
    if (typeof window.studio?.onMenu !== "function") return;
    const subs = [
      window.studio.onMenu("menu:navigate", (path: unknown) => { if (typeof path === "string") navigate(path); }),
      window.studio.onMenu("menu:toggle-terminal", () => setTermOpen(v => !v)),
      window.studio.onMenu("menu:toggle-sidebar", () => {
        window.dispatchEvent(new CustomEvent("studio:toggle-sidebar"));
      }),
      window.studio.onMenu("menu:new-terminal", () => {
        setTermOpen(true);
        window.dispatchEvent(new CustomEvent("studio:new-terminal"));
      }),
      window.studio.onMenu("menu:command-palette", () => setCmdOpen(true)),
    ];
    return () => subs.forEach(unsub => unsub?.());
  }, [navigate]);

  const handleNewSession = () => {
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).then(r => r.json()).then((d: { session: { id: string } }) => setActiveSessionId(d.session.id)).catch(() => {});
  };

  const changedFiles = git?.files?.length ?? 0;
  const isHome = location.pathname === "/" || location.pathname === "/sessions";
  const routeTitle = NAV.find(n => n.to === location.pathname)?.title ?? location.pathname.slice(1);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      overflow: "hidden",
      background: "var(--bg)",
      WebkitAppRegion: "no-drag",
      fontFamily: "var(--font-ui)",
    } as React.CSSProperties}>

      {/* Main body row */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

      {/* ── Left: narrow icon rail ─────────────────────────────────── */}
      <aside style={{
        width: 48,
        minWidth: 48,
        background: "var(--bg-2)",
        borderRight: "1px solid var(--border-dim)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 44,
        flexShrink: 0,
        zIndex: 10,
      }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: "var(--accent)", marginBottom: 16, letterSpacing: "-0.02em", lineHeight: 1 }}>
          #
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 0, width: "100%", flex: 1 }}>
          {NAV.map(item => (
            <div key={item.to} className="nav-tooltip-wrap">
              <NavLink
                to={item.to}
                end={item.end}
                style={({ isActive }) => ({
                  display: "flex", alignItems: "center", justifyContent: "center",
                  height: 40, position: "relative",
                  color: isActive ? "var(--text)" : "var(--text-dimmer)",
                  background: isActive ? "var(--accent-bg)" : "transparent",
                  borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  transition: "all 0.1s", textDecoration: "none",
                })}
              >
                {item.icon}
                {item.to === "/source-control" && changedFiles > 0 && (
                  <span style={{
                    position: "absolute", top: 5, right: 4,
                    background: "var(--accent)", color: "#000",
                    fontSize: 8, fontWeight: 700, borderRadius: 8,
                    padding: "0 3px", minWidth: 12, textAlign: "center", lineHeight: "12px",
                  }}>
                    {changedFiles}
                  </span>
                )}
              </NavLink>
              <span className="nav-tooltip">{item.title}</span>
            </div>
          ))}

          {/* Git changes */}
          <div className="nav-tooltip-wrap">
            <NavLink
              to="/git"
              style={({ isActive }) => ({
                display: "flex", alignItems: "center", justifyContent: "center",
                height: 40, position: "relative",
                color: isActive ? "var(--text)" : changedFiles > 0 ? "var(--text-dim)" : "var(--text-dimmer)",
                background: isActive ? "var(--accent-bg)" : "transparent",
                borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                transition: "all 0.1s", textDecoration: "none",
              })}
            >
              <GitBranch size={18} />
              {changedFiles > 0 && (
                <span style={{
                  position: "absolute", top: 5, right: 4,
                  background: "var(--accent)", color: "#000",
                  fontSize: 8, fontWeight: 700, borderRadius: 8,
                  padding: "0 3px", minWidth: 12, textAlign: "center", lineHeight: "12px",
                }}>
                  {changedFiles}
                </span>
              )}
            </NavLink>
            <span className="nav-tooltip">Git</span>
          </div>
        </nav>

        {/* Terminal toggle */}
        <div className="nav-tooltip-wrap" style={{ marginBottom: 8 }}>
          <button
            onClick={() => setTermOpen(v => !v)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: termOpen ? "var(--accent)" : "var(--text-dimmer)",
              height: 36, width: 48,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "color 0.1s",
            }}
          >
            <TerminalSquare size={18} />
          </button>
          <span className="nav-tooltip">Terminal  ⌃`</span>
        </div>
      </aside>

      {/* ── Activity Sidebar ─────────────────────────────────────────── */}
      <div style={{
        width: 240,
        minWidth: 240,
        flexShrink: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}>
        <ActivitySidebar />
      </div>

      {/* ── Main column ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Breadcrumb / titlebar */}
        <div style={{
          height: 38, minHeight: 38,
          background: "var(--bg-2)",
          borderBottom: "1px solid var(--border-dim)",
          display: "flex", alignItems: "center",
          padding: "0 14px",
          gap: 6, flexShrink: 0,
          WebkitAppRegion: "drag",
        } as React.CSSProperties}>
          <span style={{ fontSize: 11, color: "var(--text-dimmer)", marginLeft: 60 }}>
            {info?.projectName ?? "…"}
          </span>
          {git?.branch && (
            <>
              <ChevronRight size={12} style={{ color: "var(--text-dimmer)", opacity: 0.4 }} />
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{git.branch}</span>
            </>
          )}
          {!isHome && (
            <>
              <ChevronRight size={12} style={{ color: "var(--text-dimmer)", opacity: 0.4 }} />
              <span style={{ fontSize: 11, color: "var(--text)" }}>{routeTitle}</span>
            </>
          )}
          <div style={{ flex: 1 }} />

          {/* Project switcher (Electron only) */}
          {typeof window.studio !== "undefined" && (
            <ProjectSwitcher projectName={info?.projectName ?? null} />
          )}
        </div>

        {/* Drift warning banner */}
        {drift && !driftDismissed && (
          <DriftBanner
            drift={drift}
            onDismiss={() => { dismissFor24h(); setDriftDismissed(true); }}
          />
        )}

        {/* Tab bar (home view only) */}
        {isHome && (
          <div style={{
            height: 34, minHeight: 34, flexShrink: 0,
            background: "var(--bg-2)",
            borderBottom: "1px solid var(--border-dim)",
            display: "flex", alignItems: "stretch",
            WebkitAppRegion: "no-drag",
            paddingLeft: 2,
          } as React.CSSProperties}>
            <MainTab active icon="◎" label="Chat" />
            <button
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 30, background: "none", border: "none",
                color: "var(--text-dimmer)", cursor: "pointer",
                borderRight: "1px solid var(--border-dim)",
                fontSize: 16, transition: "color 0.1s",
              }}
              title="New tab"
              onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dimmer)")}
            >
              +
            </button>
          </div>
        )}

        {/* Content area: chat or page */}
        <div style={{
          flex: termBig ? 0 : 1,
          overflow: "hidden",
          display: termBig ? "none" : "flex",
          flexDirection: "column",
          minHeight: 0,
        }}>
          {isHome ? (
            <ChatMessages sessionId={activeSessionId} streamText={streamText} streaming={streaming} />
          ) : (
            <div style={{ flex: 1, overflow: "auto" }}>
              <Outlet />
            </div>
          )}
        </div>

        {/* Terminal panel */}
        <ResizableDrawer
          open={termOpen}
          onToggle={() => setTermOpen(v => !v)}
          defaultHeight={280}
        >
          <div style={{
            flex: termBig ? 1 : undefined,
            height: termBig ? "100%" : undefined,
            display: "flex", flexDirection: "column",
            background: "var(--bg)", overflow: "hidden",
          }}>
            <div style={{
              height: 30, background: "var(--bg-3)",
              borderBottom: "1px solid var(--border-dim)",
              display: "flex", alignItems: "stretch", flexShrink: 0,
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
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dimmer)", fontSize: 13, padding: "0 10px" }}
              >
                {termBig ? "⊡" : "⊞"}
              </button>
              <button
                onClick={() => setTermOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dimmer)", fontSize: 14, padding: "0 10px" }}
              >
                ×
              </button>
            </div>

            <div style={{ flex: 1, overflow: "hidden", display: activeTab === "TERMINAL" ? "flex" : "none", flexDirection: "column" }}>
              <TerminalTabs onCwdChange={setTerminalCwd} />
            </div>
            {activeTab === "OUTPUT" && (
              <div style={{ flex: 1, padding: "12px 16px", overflow: "auto", fontSize: 12, color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
                No output yet.
              </div>
            )}
          </div>
        </ResizableDrawer>

      </div>

      </div>{/* end main body row */}

      {/* ── Full-width chat bar ──────────────────────────────────────── */}
      <ContextBar sessionId={activeSessionId} streaming={streaming} />
      <ChatInputBar
        sessionId={activeSessionId}
        onNewSession={handleNewSession}
        onSessionCreated={setActiveSessionId}
        onStreamText={setStreamText}
        onStreamingChange={setStreaming}
        streaming={streaming}
        terminalCwd={terminalCwd || undefined}
      />

      {/* ── Status bar ───────────────────────────────────────────────── */}
      <div style={{
        height: 22, minHeight: 22, flexShrink: 0,
        background: "var(--bg-2)",
        borderTop: "1px solid var(--border-dim)",
        display: "flex", alignItems: "center",
        padding: "0 8px",
        fontSize: 11, fontFamily: "var(--font-ui)",
        userSelect: "none",
        WebkitAppRegion: "no-drag",
        zIndex: 10,
      } as React.CSSProperties}>
        <StatusItem title="Branch">
          <GitBranch size={11} style={{ opacity: 0.7 }} />
          {git?.branch ?? "—"}
          {changedFiles > 0 && <span style={{ marginLeft: 4, opacity: 0.8 }}>+{changedFiles}</span>}
        </StatusItem>
        <div style={{ flex: 1 }} />
        <StatusItem>{info?.projectName ?? "hashmark studio"}</StatusItem>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      {shortcutsOpen && <ShortcutsHelp onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}

function DriftBanner({ drift, onDismiss }: { drift: DriftResult; onDismiss: () => void }) {
  const isMajor = drift.driftLevel === "major";
  const accentColor = isMajor ? "#ef4444" : "#eab308";
  const bgColor = isMajor ? "rgba(239,68,68,0.08)" : "rgba(234,179,8,0.08)";
  const borderColor = isMajor ? "rgba(239,68,68,0.3)" : "rgba(234,179,8,0.3)";
  const signalCount = drift.signals.length;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "6px 14px",
      background: bgColor,
      borderBottom: `1px solid ${borderColor}`,
      flexShrink: 0,
      fontSize: 11,
      fontFamily: "var(--font-ui)",
    }}>
      <AlertTriangle size={13} style={{ color: accentColor, flexShrink: 0 }} />
      <span style={{ color: "var(--text-dim)", flex: 1 }}>
        <span style={{ color: accentColor, fontWeight: 600 }}>{drift.fileName}</span>
        {" "}may be stale — {signalCount} signal{signalCount !== 1 ? "s" : ""}.{" "}
        {drift.recommendation}
      </span>
      <a
        href="/generate"
        onClick={() => { window.location.href = "/generate"; }}
        style={{
          color: accentColor, textDecoration: "none", fontWeight: 600,
          padding: "2px 8px", border: `1px solid ${borderColor}`,
          borderRadius: 3, whiteSpace: "nowrap", cursor: "pointer",
          transition: "background 0.1s",
        }}
        onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.background = bgColor}
        onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.background = "transparent"}
      >
        Regenerate
      </a>
      <button
        onClick={onDismiss}
        title="Dismiss for 24h"
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--text-dimmer)", fontSize: 14, padding: "0 4px",
          lineHeight: 1, flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

function MainTab({ active, icon, label }: { active?: boolean; icon: string; label: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "0 14px",
      fontSize: 12,
      color: active ? "var(--text)" : "var(--text-dimmer)",
      borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
      borderRight: "1px solid var(--border-dim)",
      cursor: "default",
      userSelect: "none",
      whiteSpace: "nowrap",
    }}>
      <span style={{ color: active ? "var(--accent)" : "var(--text-dimmer)", fontSize: 11 }}>{icon}</span>
      {label}
    </div>
  );
}

function StatusItem({ children, title, onClick }: { children: React.ReactNode; title?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      title={title}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "0 8px", height: "100%",
        color: "var(--text-dim)",
        cursor: onClick ? "pointer" : "default",
        whiteSpace: "nowrap",
        transition: "background 0.1s",
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = "var(--accent-bg)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      {children}
    </div>
  );
}

function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["g s", "Sessions"],
    ["g r", "Run"],
    ["g c", "Company"],
    ["g a", "Agents"],
    ["g g", "Git"],
    ["g f", "Files"],
  ];
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: "20px 28px",
          minWidth: 280,
          fontFamily: "var(--font)",
          fontSize: 12,
          color: "var(--text-dim)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ fontSize: 10, letterSpacing: "0.1em", color: "var(--text-dimmer)", marginBottom: 16 }}>
          KEYBOARD SHORTCUTS
        </div>

        <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--text-dimmer)", marginBottom: 8 }}>
          NAVIGATION
        </div>
        <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 16 }}>
          <tbody>
            {rows.map(([keys, label]) => (
              <tr key={keys}>
                <td style={{ padding: "3px 16px 3px 0", color: "var(--accent)", whiteSpace: "nowrap" }}>{keys}</td>
                <td style={{ padding: "3px 0", color: "var(--text-dim)" }}>{label}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--text-dimmer)", marginBottom: 8 }}>
          ACTIONS
        </div>
        <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 20 }}>
          <tbody>
            <tr>
              <td style={{ padding: "3px 16px 3px 0", color: "var(--accent)", whiteSpace: "nowrap" }}>⌘K</td>
              <td style={{ padding: "3px 0", color: "var(--text-dim)" }}>Command palette</td>
            </tr>
            <tr>
              <td style={{ padding: "3px 16px 3px 0", color: "var(--accent)", whiteSpace: "nowrap" }}>?</td>
              <td style={{ padding: "3px 0", color: "var(--text-dim)" }}>This help</td>
            </tr>
          </tbody>
        </table>

        <div style={{ fontSize: 10, color: "var(--text-dimmer)" }}>
          Press <span style={{ color: "var(--accent)" }}>Esc</span> or <span style={{ color: "var(--accent)" }}>?</span> to close
        </div>
      </div>
    </div>
  );
}

function ProjectSwitcher({ projectName }: { projectName: string | null }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    window.studio?.getRecentProjects?.().then(r => setRecent(r ?? [])).catch(() => {});
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const openRecent = async (path: string) => { setOpen(false); await window.studio?.setProjectDir(path); };
  const pickFolder = async () => { setOpen(false); const d = await window.studio?.pickFolder(); if (d) await window.studio?.setProjectDir(d); };

  const lastName = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

  return (
    <div ref={ref} style={{ position: "relative", height: "100%", display: "flex", alignItems: "center" }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "2px 8px", height: 22, borderRadius: 3,
          background: open ? "rgba(255,255,255,0.06)" : "transparent",
          cursor: "pointer", fontSize: 11, color: "var(--text-dim)",
          transition: "background 0.1s", whiteSpace: "nowrap",
        }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.06)"}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
      >
        {projectName ?? "project"}
        <ChevronRight size={10} style={{ transform: open ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.1s", opacity: 0.5 }} />
      </div>

      {open && (
        <div style={{
          position: "fixed", bottom: 38, right: 8,
          zIndex: 9999,
          background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6,
          minWidth: 280, maxWidth: 380,
          boxShadow: "0 -4px 16px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}>
          {recent.length > 0 && (
            <>
              <div style={{ padding: "6px 12px 4px", fontSize: 10, color: "var(--text-dimmer)", letterSpacing: "0.08em" }}>
                RECENT PROJECTS
              </div>
              {recent.map(path => (
                <div
                  key={path}
                  onClick={() => void openRecent(path)}
                  style={{ display: "flex", flexDirection: "column", padding: "6px 12px", cursor: "pointer", borderBottom: "1px solid var(--border-dim)", transition: "background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--accent-bg)"}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{lastName(path)}</span>
                  <span style={{ fontSize: 10, color: "var(--text-dimmer)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path}</span>
                </div>
              ))}
            </>
          )}
          <div
            onClick={() => void pickFolder()}
            style={{ padding: "8px 12px", fontSize: 12, color: "var(--accent)", cursor: "pointer", transition: "background 0.1s" }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--accent-bg)"}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
          >
            Open Different Project...
          </div>
        </div>
      )}
    </div>
  );
}
