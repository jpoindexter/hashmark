import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { GitBranch, TerminalSquare, ChevronRight, ChevronDown, AlertTriangle, ChevronLeft, RotateCcw, MessageSquare, FolderTree, Bot, PlayCircle, Settings, Zap, GitCompare, Shield } from "lucide-react";
import { NavLink } from "react-router-dom";
import CommandPalette from "./CommandPalette.tsx";
import ActivitySidebar from "./ActivitySidebar.tsx";
import ChatMessages from "./ChatMessages.tsx";
import ChatInputBar from "./ChatInputBar.tsx";
import { ContextBar } from "./ContextBar.tsx";
import TerminalTabs from "./TerminalTabs.tsx";
import ResizableDrawer from "./ResizableDrawer.tsx";
import DiffDrawer from "./DiffDrawer.tsx";
import BranchPicker from "./BranchPicker.tsx";
import { DriftBadge, DriftBanner, isDismissed, dismissFor24h } from "./DriftIndicator.tsx";
import type { DriftResult, DriftResponse } from "./DriftIndicator.tsx";
import ShortcutsHelp from "./ShortcutsHelp.tsx";

interface ProjectInfo { projectName: string; projectDir: string; }
interface GitStatus { branch: string; files: { status: string }[]; }

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
