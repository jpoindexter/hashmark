import { useRef, useState, useEffect } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";
import {
  SettingsIcon, HistoryIcon, FilesIcon, IssuesIcon, AgentsIcon,
  ScanIcon, SkillsIcon, WorkflowIcon, TemplatesIcon, UsageIcon,
  SunIcon, MoonIcon, OxideIcon,
} from "./ShellIcons";
import type { ViewMode } from "./MessageBubble";
import type { Session } from "../types";

type Overlay = "files" | "issues" | "agents" | "scan" | "settings" | "terminal" | "history" | "skills" | "usage" | "workflows" | "templates" | null;

const NAV: Array<{ key: NonNullable<Overlay>; icon: React.ReactNode; label: string }> = [
  { key: "history",   icon: <HistoryIcon />,   label: "History" },
  { key: "files",     icon: <FilesIcon />,     label: "Files" },
  { key: "issues",    icon: <IssuesIcon />,    label: "Issues" },
  { key: "agents",    icon: <AgentsIcon />,    label: "Agents" },
  { key: "scan",      icon: <ScanIcon />,      label: "Generate" },
  { key: "skills",    icon: <SkillsIcon />,    label: "Skills" },
  { key: "workflows", icon: <WorkflowIcon />,  label: "Workflows" },
  { key: "templates", icon: <TemplatesIcon />, label: "Templates" },
  { key: "usage",     icon: <UsageIcon />,     label: "Usage" },
];

interface SessionSidebarProps {
  sessions: Session[];
  activeIds: string[];
  projectDir: string;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  overlay: Overlay;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onPalette: () => void;
  onToggleOverlay: (o: Overlay) => void;
  onPickProject: () => void;
  onToggleTerminal: () => void;
  onToggleTheme: () => void;
  onToggleViewMode: () => void;
  onOpenConnect: () => void;
  setSessions: (fn: (prev: Session[]) => Session[]) => void;
  terminalOpen: boolean;
  theme: "dark" | "light" | "oxide";
  viewMode: ViewMode;
}

function CtxItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{ padding: "6px 14px", fontSize: 12, cursor: "pointer", color: danger ? "var(--red)" : "var(--text-dim)" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {label}
    </div>
  );
}

export function SessionSidebar({
  sessions, activeIds, projectDir,
  renamingId, setRenamingId,
  overlay, onNewSession, onSelectSession, onDeleteSession, onRenameSession,
  onPalette, onToggleOverlay, onPickProject, onToggleTerminal, onToggleTheme, onToggleViewMode, onOpenConnect,
  setSessions, terminalOpen, theme, viewMode,
}: SessionSidebarProps) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const ctxRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const ctxSession = ctxMenu ? sessions.find(s => s.id === ctxMenu.id) : null;
  const projectName = projectDir ? projectDir.split("/").filter(Boolean).pop() ?? projectDir : "hashmark";
  const projectShort = projectDir ? projectDir.replace(/^\/Users\/[^/]+/, "~") : "";

  const sorted = [...sessions].sort((a, b) => {
    const aRun = a.status === "running" ? 1 : 0;
    const bRun = b.status === "running" ? 1 : 0;
    if (bRun !== aRun) return bRun - aRun;
    return b.updated_at - a.updated_at;
  });

  return (
    <>
      <div className="session-sidebar">
        {/* Header */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: "var(--accent)", opacity: 0.8 }}>
              <path d="M3 2v10M7 2v10M11 2v10M1 5h12M1 9h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span className="sidebar-logo-name">{projectName}</span>
          </div>
          <button
            onClick={onNewSession}
            title="New session (⌘N)"
            className="sidebar-new-btn"
          >
            + New
          </button>
        </div>

        {/* Hidden import input */}
        <input
          ref={importRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const text = await file.text();
              const data = JSON.parse(text) as unknown;
              const imported = await fetchApi<Session>("/api/sessions/import", { method: "POST", body: JSON.stringify(data) });
              setSessions(prev => [imported, ...prev]);
              onSelectSession(imported.id);
              toast("Session imported");
            } catch {
              toast("Failed to import session");
            } finally {
              e.target.value = "";
            }
          }}
        />

        {/* Session list */}
        <div className="sidebar-sessions">
          {sorted.length === 0 && (
            <div className="sidebar-empty">No sessions yet</div>
          )}
          {sorted.map(s => (
            <div
              key={s.id}
              className={`sidebar-session${activeIds.includes(s.id) ? " active" : ""}`}
              onClick={() => onSelectSession(s.id)}
              onDoubleClick={e => { e.preventDefault(); setRenamingId(s.id); }}
              onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, id: s.id }); }}
            >
              <span className={`session-status-dot ${s.status === "running" ? "running" : "idle"}`} />
              {renamingId === s.id ? (
                <input
                  autoFocus
                  defaultValue={s.title}
                  className="sidebar-session-rename"
                  onClick={e => e.stopPropagation()}
                  onBlur={e => void onRenameSession(s.id, e.target.value)}
                  onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === "Enter") void onRenameSession(s.id, e.currentTarget.value);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                />
              ) : (
                <span className="sidebar-session-title">{s.title}</span>
              )}
              {s.pinned ? (
                <svg width="8" height="8" viewBox="0 0 24 24" fill="var(--text-muted)" style={{ flexShrink: 0, opacity: 0.5 }}>
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              ) : null}
              <button
                className="sidebar-session-close"
                onClick={e => { e.stopPropagation(); onDeleteSession(s.id); }}
                title="Close"
              >×</button>
            </div>
          ))}
        </div>

        {/* Tools nav — collapsible section above footer */}
        <div style={{ borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <button
            onClick={() => setToolsOpen(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 6, width: "100%",
              padding: "0 12px", height: 28, background: "none", border: "none",
              cursor: "pointer", color: "var(--text-muted)", fontSize: 11,
              fontFamily: "var(--font-sans)",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >
            <span style={{ display: "inline-block", transform: toolsOpen ? "rotate(90deg)" : "none", transition: "transform 120ms", fontSize: 9, opacity: 0.5 }}>▸</span>
            <span style={{ opacity: 0.6, letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 10, fontWeight: 600 }}>Tools</span>
            {overlay && NAV.some(n => n.key === overlay) && (
              <span style={{ marginLeft: "auto", fontSize: 9, opacity: 0.5, color: "var(--accent)" }}>●</span>
            )}
          </button>
          {toolsOpen && (
            <div>
              {NAV.map(item => (
                <button
                  key={item.key}
                  className={`sidebar-nav-item${overlay === item.key ? " active" : ""}`}
                  onClick={() => onToggleOverlay(item.key)}
                  title={item.label}
                >
                  <span className="sidebar-nav-icon">{item.icon}</span>
                  <span className="sidebar-nav-label">{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          <button
            className="sidebar-footer-project"
            onClick={onPickProject}
            title={projectDir || "Switch project"}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0, opacity: 0.6 }}>
              <rect x="1" y="3" width="9" height="7" rx="1" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M1 5h9" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M3 1h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
            </svg>
            <span className="sidebar-footer-project-name">{projectShort || projectName}</span>
          </button>

          <div style={{ flex: 1 }} />

          <button
            className="sidebar-icon-btn"
            title="Toggle theme"
            onClick={onToggleTheme}
          >
            {theme === "dark" ? <SunIcon /> : theme === "light" ? <OxideIcon /> : <MoonIcon />}
          </button>

          <button
            className="sidebar-icon-btn"
            title={`View mode: ${viewMode} — click to cycle`}
            onClick={onToggleViewMode}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "-0.05em", width: "auto", padding: "0 4px" }}
          >
            {viewMode === "verbose" ? "≡≡" : viewMode === "normal" ? "≡" : "—"}
          </button>

          <button
            className="sidebar-icon-btn"
            title="Import session"
            onClick={() => importRef.current?.click()}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 8v2.5h10V8M6 1v6.5M3.5 5L6 7.5 8.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <button
            className={`sidebar-icon-btn${terminalOpen ? " active" : ""}`}
            title="Terminal"
            onClick={onToggleTerminal}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 4l3 2.5L2 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M7 9h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>

          <button
            onClick={onPalette}
            className="sidebar-icon-btn"
            title="Command palette (⌘K)"
            style={{ fontSize: 10, letterSpacing: "0.02em", width: "auto", padding: "0 8px" }}
          >
            ⌘K
          </button>

          <button
            className={`sidebar-icon-btn${overlay === "settings" ? " active" : ""}`}
            title="Settings"
            onClick={() => onToggleOverlay("settings")}
          >
            <SettingsIcon />
          </button>
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          style={{
            position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 200,
            background: "var(--bg-panel)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)", padding: "4px 0", minWidth: 140,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          <CtxItem label="Rename" onClick={() => { setRenamingId(ctxMenu.id); setCtxMenu(null); }} />
          <CtxItem
            label={ctxSession?.pinned ? "Unpin" : "Pin to top"}
            onClick={async () => {
              if (!ctxSession) return;
              const newVal = ctxSession.pinned ? 0 : 1;
              await fetchApi(`/api/sessions/${ctxMenu.id}`, { method: "PATCH", body: JSON.stringify({ pinned: newVal }) });
              setSessions(prev => {
                const updated = prev.map(x => x.id === ctxMenu.id ? { ...x, pinned: newVal } : x);
                return [...updated].sort((a, b) => (b.pinned ?? 0) - (a.pinned ?? 0) || b.updated_at - a.updated_at);
              });
              setCtxMenu(null);
            }}
          />
          <CtxItem label="Export" onClick={() => { window.open(`/api/sessions/${ctxMenu.id}/export`, "_blank"); setCtxMenu(null); }} />
          <CtxItem label="Delete" danger onClick={() => { onDeleteSession(ctxMenu.id); setCtxMenu(null); }} />
        </div>
      )}
    </>
  );
}
