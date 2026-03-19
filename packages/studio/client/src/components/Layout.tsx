import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { GitBranch, TerminalSquare, ChevronRight, ChevronDown, AlertTriangle, ChevronLeft, RotateCcw, MessageSquare, FolderTree, Bot, PlayCircle, Settings, Zap, GitCompare, Shield } from "lucide-react";
import { NavLink } from "react-router-dom";
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

interface DiffFile { path: string; added: number; removed: number; status: string; }

function DiffDrawer({ open, onClose }: { open: boolean; onClose: () => void; projectDir: string }) {
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    fetch('/api/files/git')
      .then(r => r.json())
      .then((d: { files?: DiffFile[] }) => {
        const changed = (d.files ?? []).filter((f: DiffFile) => f.status !== '?');
        setFiles(changed);
        if (changed.length > 0) setSelectedFile(changed[0].path);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!selectedFile) return;
    fetch(`/api/files/diff?path=${encodeURIComponent(selectedFile)}`)
      .then(r => r.json())
      .then((d: { diff?: string }) => setDiff(d.diff ?? ''))
      .catch(() => {});
  }, [selectedFile]);

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: 480, background: '#111',
      borderLeft: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column',
      zIndex: 50,
      transform: open ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.2s ease',
      pointerEvents: open ? 'auto' : 'none',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--text-dim)' }}>
          Changes {files.length}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dimmer)', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>
      {/* File list + diff */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: 180, borderRight: '1px solid rgba(255,255,255,0.06)', overflow: 'auto', flexShrink: 0 }}>
          {files.map(f => (
            <button key={f.path} onClick={() => setSelectedFile(f.path)}
              style={{
                width: '100%', textAlign: 'left', padding: '6px 10px',
                background: selectedFile === f.path ? 'rgba(255,255,255,0.06)' : 'none',
                border: 'none', color: 'var(--text-dim)', fontSize: 11,
                fontFamily: 'var(--font)', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.path.split('/').pop()}
              </span>
              <span style={{ fontSize: 10, color: '#4ade80', flexShrink: 0 }}>+{f.added ?? 0}</span>
            </button>
          ))}
        </div>
        {/* Diff view */}
        <div style={{ flex: 1, overflow: 'auto', fontFamily: 'var(--font)', fontSize: 11, lineHeight: 1.5 }}>
          {diff.split('\n').map((line, i) => (
            <div key={i} style={{
              padding: '0 12px',
              background: line.startsWith('+') && !line.startsWith('+++') ? 'rgba(16,185,129,0.08)'
                : line.startsWith('-') && !line.startsWith('---') ? 'rgba(248,113,113,0.08)' : 'transparent',
              color: line.startsWith('+') && !line.startsWith('+++') ? '#4ade80'
                : line.startsWith('-') && !line.startsWith('---') ? '#f87171'
                : line.startsWith('@@') ? 'var(--blue)' : 'var(--text-dim)',
            }}>
              {line || '\u00a0'}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
  const [diffOpen,      setDiffOpen]      = useState(false);
  const [sidebarOpen,   setSidebarOpen]   = useState(() => restore("sidebarOpen", true));

  useEffect(() => persist("termOpen",    termOpen),    [termOpen]);
  useEffect(() => persist("termBig",     termBig),     [termBig]);
  useEffect(() => persist("sidebarOpen", sidebarOpen), [sidebarOpen]);

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

  // Poll git status during streaming so changed-files count stays live
  // When streaming stops, refresh git and auto-open diff drawer if files changed
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    if (!streaming) {
      fetch("/api/files/git")
        .then(r => r.json())
        .then((data: GitStatus) => {
          setGit(data);
          if (prevStreamingRef.current && (data.files?.length ?? 0) > 0) {
            setDiffOpen(true);
          }
        })
        .catch(() => {});
      prevStreamingRef.current = false;
      return;
    }
    prevStreamingRef.current = true;
    const id = setInterval(() => {
      fetch("/api/files/git")
        .then(r => r.json())
        .then((data: GitStatus) => setGit(data))
        .catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [streaming]);

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
  const routeTitle = location.pathname.slice(1) || "Chat";

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

      {/* ── Full-width titlebar (spans entire window, clears traffic lights) ── */}
      <div style={{
        height: 35, minHeight: 35, flexShrink: 0,
        background: "#111",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center",
        paddingLeft: 70,   // VS Code mac: window-controls-container is exactly 70px wide
        paddingRight: 8,
        gap: 6,
        fontFamily: "-apple-system, system-ui, sans-serif",
        fontSize: 12,
        color: "rgba(255,255,255,0.5)",
        WebkitAppRegion: "drag",
      } as React.CSSProperties}>

        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(v => !v)}
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.35)", padding: "2px 4px",
            display: "flex", alignItems: "center", borderRadius: 3,
            transition: "color 0.1s", WebkitAppRegion: "no-drag",
          } as React.CSSProperties}
          onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}
        >
          <ChevronLeft size={14} style={{ transform: sidebarOpen ? "none" : "rotate(180deg)", transition: "transform 0.18s" }} />
        </button>

        {/* Back / Forward */}
        <div style={{ display: "flex", gap: 2, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <button onClick={() => navigate(-1)} title="Back" style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.35)", padding: "2px 4px", display: "flex", alignItems: "center", borderRadius: 3, transition: "color 0.1s" }} onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")} onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}><ChevronLeft size={14} /></button>
          <button onClick={() => navigate(1)} title="Forward" style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.35)", padding: "2px 4px", display: "flex", alignItems: "center", borderRadius: 3, transition: "color 0.1s" }} onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")} onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}><ChevronRight size={14} /></button>
        </div>

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <span style={{ color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap" }}>{info?.projectName ?? "…"}</span>
          {drift && <DriftBadge drift={drift} navigate={navigate} />}
          {git?.branch !== undefined && (
            <>
              <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>›</span>
              <BranchPicker currentBranch={git.branch ?? ""} />
            </>
          )}
          {changedFiles > 0 && (
            <button onClick={() => setDiffOpen(true)} title="View changed files" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 4, padding: "2px 8px", fontSize: 11, color: "#10b981", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, animation: streaming ? "changes-pulse 1.5s ease-in-out infinite" : "none" } as React.CSSProperties}>
              Changes {changedFiles}
            </button>
          )}
          <button onClick={() => { fetch("/api/files/git").then(r => r.json()).then(setGit).catch(() => {}); }} title="Refresh" style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: "2px 4px", display: "flex", alignItems: "center", borderRadius: 3, transition: "color 0.1s" } as React.CSSProperties} onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")} onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}><RotateCcw size={11} /></button>
        </div>

        <div style={{ flex: 1 }} />

        {/* Right: route badge */}
        <span style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "2px 8px", fontSize: 11, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap", WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          {routeTitle}
        </span>
      </div>

      {/* ── Body row ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

      {/* ── Activity Bar (VS Code icon rail, 48px) ─────────────────── */}
      <aside style={{
        width: 48,
        minWidth: 48,
        background: "#181818",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 6,
        flexShrink: 0,
        borderRight: "1px solid rgba(255,255,255,0.06)",
        zIndex: 10,
      }}>
        <nav style={{ display: "flex", flexDirection: "column", gap: 0, width: "100%", flex: 1 }}>
          {[
            { to: "/",                icon: <MessageSquare size={20} />,  title: "Chat",           end: true },
            { to: "/files",           icon: <FolderTree size={20} />,     title: "Explorer" },
            { to: "/source-control",  icon: <GitCompare size={20} />,     title: "Source Control" },
            { to: "/agents",          icon: <Bot size={20} />,            title: "Agents" },
            { to: "/run",             icon: <PlayCircle size={20} />,     title: "Run" },
            { to: "/generate",        icon: <Zap size={20} />,            title: "Generate" },
            { to: "/governance",      icon: <Shield size={20} />,         title: "Governance" },
          ].map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={item.title}
              style={({ isActive }) => ({
                display: "flex", alignItems: "center", justifyContent: "center",
                height: 48, width: 48, position: "relative",
                color: isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
                background: "transparent",
                transition: "color 0.1s", textDecoration: "none",
                borderLeft: isActive ? "2px solid rgba(255,255,255,0.9)" : "2px solid transparent",
              })}
            >
              {item.icon}
            </NavLink>
          ))}
        </nav>
        {/* Bottom icons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0, width: "100%", paddingBottom: 8 }}>
          <NavLink
            to="/settings"
            title="Settings"
            style={({ isActive }) => ({
              display: "flex", alignItems: "center", justifyContent: "center",
              height: 48, width: 48,
              color: isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
              transition: "color 0.1s", textDecoration: "none",
              borderLeft: isActive ? "2px solid rgba(255,255,255,0.9)" : "2px solid transparent",
            })}
          >
            <Settings size={20} />
          </NavLink>
        </div>
      </aside>

      {/* ── Sidebar Panel (tray) ───────────────────────────────────── */}
      <div style={{
        width: sidebarOpen ? 240 : 0,
        minWidth: 0,
        flexShrink: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.18s ease",
        borderRight: sidebarOpen ? "1px solid rgba(255,255,255,0.06)" : "none",
      }}>
        <ActivitySidebar onToggle={() => setSidebarOpen(false)} />
      </div>

      {/* ── Main column ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Drift warning banner */}
        {drift && !driftDismissed && (
          <DriftBanner
            drift={drift}
            onDismiss={() => { dismissFor24h(); setDriftDismissed(true); }}
          />
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
      {!location.pathname.startsWith("/settings") && !location.pathname.startsWith("/setup") && (
        <>
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
        </>
      )}

      {/* ── Status bar (VS Code style — colored background) ─────────── */}
      <div style={{
        height: 22, minHeight: 22, flexShrink: 0,
        background: "#10b981",
        display: "flex", alignItems: "center",
        padding: "0 8px",
        fontSize: 11, fontFamily: "var(--font-ui)",
        color: "rgba(0,0,0,0.8)",
        userSelect: "none",
        WebkitAppRegion: "no-drag",
        zIndex: 10,
        gap: 2,
      } as React.CSSProperties}>
        <button onClick={() => setSidebarOpen(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", gap: 4, padding: "0 4px", borderRadius: 3, fontSize: 11, fontFamily: "var(--font-ui)" }}>
          <GitBranch size={11} />
          {git?.branch ?? "unknown"}
          {changedFiles > 0 && <span style={{ marginLeft: 2 }}>+{changedFiles}</span>}
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ opacity: 0.7, fontSize: 11 }}>{info?.projectName ?? "hashmark studio"}</span>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      {shortcutsOpen && <ShortcutsHelp onClose={() => setShortcutsOpen(false)} />}
      <DiffDrawer open={diffOpen} onClose={() => setDiffOpen(false)} projectDir={info?.projectDir ?? ''} />
    </div>
  );
}

function signalLabel(s: DriftSignal): string {
  if (s.type === "age_days") return `Age: ${s.days ?? "?"} days old`;
  if (s.type === "commit_mismatch") return `Commit mismatch: ${(s.fileCommit ?? "?").slice(0, 7)} vs ${(s.headCommit ?? "?").slice(0, 7)}`;
  if (s.type === "file_count_delta") return `File count delta: ${s.delta != null ? (s.delta > 0 ? "+" : "") + s.delta : "?"}`;
  return s.type;
}

function DriftBadge({ drift, navigate }: { drift: DriftResult; navigate: (to: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isMajor = drift.driftLevel === "major";
  const dotColor = isMajor ? "#f85149" : "#d29922";
  const tooltipText = isMajor
    ? "Context is significantly stale"
    : "Context is slightly stale — consider rescanning";

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        onClick={() => setOpen(v => !v)}
        title={open ? undefined : tooltipText}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0 4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
            animation: isMajor ? "drift-pulse 1.4s ease-in-out infinite" : "none",
          } as CSSProperties}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            background: "var(--bg-4)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            width: 220,
            fontSize: 11,
            fontFamily: "var(--font-ui)",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "8px 10px 6px",
            borderBottom: "1px solid var(--border-dim)",
            color: dotColor,
            fontWeight: 600,
            fontSize: 10,
            letterSpacing: "0.06em",
          }}>
            {isMajor ? "CONTEXT SIGNIFICANTLY STALE" : "CONTEXT SLIGHTLY STALE"}
          </div>

          {/* Signals */}
          <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-dim)" }}>
            {drift.signals.map((s, i) => (
              <div key={i} style={{ color: "var(--text-dim)", marginBottom: i < drift.signals.length - 1 ? 3 : 0 }}>
                · {signalLabel(s)}
              </div>
            ))}
          </div>

          {/* Recommendation */}
          <div style={{ padding: "6px 10px 8px", color: "var(--text-dimmer)", borderBottom: "1px solid var(--border-dim)" }}>
            {drift.recommendation}
          </div>

          {/* Rescan button */}
          <div style={{ padding: "6px 10px" }}>
            <button
              onClick={() => { setOpen(false); navigate("/generate"); }}
              style={{
                width: "100%",
                background: "var(--bg-3)",
                border: `1px solid ${dotColor}`,
                color: dotColor,
                padding: "4px 8px",
                fontSize: 11,
                fontFamily: "var(--font-ui)",
                fontWeight: 600,
                cursor: "pointer",
                borderRadius: 0,
                textAlign: "center",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = isMajor ? "rgba(248,81,73,0.1)" : "rgba(210,153,34,0.1)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--bg-3)")}
            >
              Rescan now
            </button>
          </div>
        </div>
      )}
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

function BranchPicker({ currentBranch }: { currentBranch: string }) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  const loadBranches = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/files/git/branches");
      const d = await r.json() as { branches?: string[] };
      setBranches(d.branches ?? []);
    } finally {
      setLoading(false);
    }
  };

  const switchBranch = async (branch: string) => {
    if (branch === currentBranch) { setOpen(false); return; }
    setSwitching(true);
    try {
      await fetch("/api/files/git/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch }),
      });
      setOpen(false);
      window.location.reload();
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => { setOpen(v => !v); if (!open) loadBranches(); }}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          background: "none", border: "none", cursor: "pointer",
          color: "rgba(255,255,255,0.5)", fontSize: 12,
          fontFamily: "var(--font-ui)", padding: "2px 4px",
          borderRadius: 4,
        }}
      >
        <GitBranch size={12} />
        <span>{currentBranch || "no branch"}</span>
        <ChevronDown size={10} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
          <div style={{
            position: "absolute", top: "100%", left: 0, zIndex: 100,
            background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6, minWidth: 200, maxHeight: 280,
            overflow: "auto", marginTop: 4,
          }}>
            {loading && (
              <div style={{ padding: "8px 12px", color: "rgba(255,255,255,0.3)", fontSize: 11 }}>Loading...</div>
            )}
            {branches.map(branch => (
              <button
                key={branch}
                onClick={() => void switchBranch(branch)}
                disabled={switching}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "7px 12px", background: "none", border: "none",
                  color: branch === currentBranch ? "#10b981" : "rgba(255,255,255,0.7)",
                  fontSize: 12, fontFamily: "var(--font)", cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <GitBranch size={11} style={{ opacity: 0.5, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{branch}</span>
                {branch === currentBranch && <span style={{ fontSize: 10, opacity: 0.5 }}>current</span>}
              </button>
            ))}
          </div>
        </>
      )}
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
