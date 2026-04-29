import { useState, useEffect, useCallback, useRef } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";
import { ChatPane } from "./ChatPane";
import { IssuesPage } from "./IssuesPage";
import { AgentsPage } from "./AgentsPage";
import { ScanPage } from "./ScanPage";
import { SettingsPanel } from "./SettingsPanel";
import { TerminalPanel } from "./Terminal";
import { FileExplorer } from "./FileExplorer";
import { CommandPalette, type PaletteItem } from "./CommandPalette";
import { SkillsPanel } from "./SkillsPanel";
import { UsagePage } from "./UsagePage";
import { WelcomeScreen } from "./WelcomeScreen";
import { ConnectModal } from "./ConnectModal";
import { WorkflowsPanel } from "./WorkflowsPanel";
import { TemplatesPage } from "./TemplatesPage";
import { ProjectPicker } from "./ProjectPicker";
import { ShortcutsModal } from "./ShortcutsModal";
import { HistoryView, type ClaudeSession } from "./HistoryView";
import { SessionSidebar } from "./SessionSidebar";
import { PreviewPane } from "./PreviewPane";
import type { Session } from "../types";
import type { ViewMode } from "./MessageBubble";

type Overlay = "files" | "issues" | "agents" | "scan" | "settings" | "terminal" | "history" | "skills" | "usage" | "workflows" | "templates" | null;

// These open as a side panel alongside chat; everything else is a full overlay
const SIDE_PANELS = new Set<Overlay>(["files", "issues", "history", "agents", "skills", "templates"]);
const OVERLAY_LABELS: Record<string, string> = {
  files: "Files", issues: "Issues", agents: "Agents", scan: "Generate Agents",
  history: "History", skills: "Skills", usage: "Usage", workflows: "Workflows",
  templates: "Templates", settings: "Settings",
};

export function Shell() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeIds, setActiveIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("activeSessionIds") ?? "[]") as string[]; } catch { return []; }
  });
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [panelWidth, setPanelWidth] = useState(280);
  const [panelDragging, setPanelDragging] = useState(false);
  const [termHeight, setTermHeight] = useState(280);
  const [dragging, setDragging] = useState(false);
  const [pendingChatText, setPendingChatText] = useState<string | null>(null);
  const [pendingSkill, setPendingSkill] = useState<{ id: string; name: string; content: string } | null>(null);
  const [projectDir, setProjectDir] = useState("");
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [claudeHistory, setClaudeHistory] = useState<ClaudeSession[]>([]);
  const [claudeHistoryLoading, setClaudeHistoryLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light" | "oxide">(() => {
    return (localStorage.getItem("theme") as "dark" | "light" | "oxide") || "dark";
  });
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem("viewMode") as ViewMode) || "verbose";
  });

  const toggleViewMode = () => {
    setViewMode(prev => {
      const next: ViewMode = prev === "verbose" ? "normal" : prev === "normal" ? "summary" : "verbose";
      localStorage.setItem("viewMode", next);
      return next;
    });
  };
  const [showPreview, setShowPreview] = useState(false);
  const [sideSession, setSideSession] = useState<import("../types").Session | null>(null);
  const [showSideChat, setShowSideChat] = useState(false);
  const [rightTray, setRightTray] = useState<"files" | "terminal" | "git" | "notes" | null>(null);
  const [rightTrayWidth, setRightTrayWidth] = useState(480);
  const [rightDragging, setRightDragging] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : theme === "light" ? "oxide" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };

  const loadSessions = useCallback(async () => {
    try {
      const data = await fetchApi<Session[]>("/api/sessions");
      data.sort((a, b) => (b.pinned ?? 0) - (a.pinned ?? 0) || b.updated_at - a.updated_at);
      setSessions(data);
      const ids = new Set(data.map(s => s.id));
      setActiveIds(prev => {
        const valid = prev.filter(id => ids.has(id));
        if (valid.length > 0) return valid;
        return data.length > 0 ? [data[0].id] : [];
      });
    } catch { toast.error("Failed to load sessions"); }
  }, []);

  useEffect(() => {
    void loadSessions();
    fetchApi<{ projectDir: string; hasProviderKey: boolean }>("/api/info").then(d => {
      setProjectDir(d.projectDir);
      if (!d.hasProviderKey) setShowConnectModal(true);
    }).catch(() => {});
  }, [loadSessions]);

  // Refresh session list once when all running sessions finish (catches background dispatch agents)
  const hadRunning = useRef(false);
  useEffect(() => {
    const hasRunning = sessions.some(s => s.status === "running");
    if (hasRunning) { hadRunning.current = true; return; }
    if (hadRunning.current) { hadRunning.current = false; void loadSessions(); }
  }, [sessions, loadSessions]);

  useEffect(() => {
    localStorage.setItem("activeSessionIds", JSON.stringify(activeIds));
  }, [activeIds]);


  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "k") { e.preventDefault(); setShowPalette(v => !v); return; }
      if (mod && e.key === "n") { e.preventDefault(); void newSession(); return; }
      if (mod && e.key === "w") {
        e.preventDefault();
        if (activeIds.length > 0) doDeleteSession(activeIds[activeIds.length - 1]);
        return;
      }
      if (mod && (e.key === "[" || e.key === "]")) {
        e.preventDefault();
        setSessions(prev => {
          const idx = prev.findIndex(s => s.id === activeIds[0]);
          if (idx === -1 || prev.length < 2) return prev;
          const next = e.key === "[" ? prev[Math.max(0, idx - 1)] : prev[Math.min(prev.length - 1, idx + 1)];
          if (next && next.id !== activeIds[0]) setActiveIds([next.id]);
          return prev;
        });
        return;
      }
      if (mod && e.key === "b") { e.preventDefault(); setSidebarCollapsed(v => !v); return; }
      if (mod && e.key === "e") { e.preventDefault(); setRightTray(v => v === "files" ? null : "files"); return; }
      if (mod && e.key === ";") { e.preventDefault(); void openSideChat(); return; }
      if (mod && e.key === "/") { e.preventDefault(); setShowShortcuts(v => !v); return; }
      if (e.key === "?" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) { setShowShortcuts(v => !v); return; }
      if (e.key === "Escape") {
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (showPalette) { setShowPalette(false); return; }
        if (overlay) { setOverlay(null); return; }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds, overlay, showPalette, showShortcuts]);

  const commitDelete = async (id: string) => {
    try { await fetchApi(`/api/sessions/${id}`, { method: "DELETE" }); }
    catch { toast.error("Failed to delete"); }
  };

  const doDeleteSession = (id: string) => {
    if (pendingDelete) {
      clearTimeout(pendingDelete.timer);
      void commitDelete(pendingDelete.id);
    }
    const session = sessions.find(s => s.id === id);
    setSessions(prev => prev.filter(s => s.id !== id));
    setActiveIds(prev => {
      const next = prev.filter(i => i !== id);
      if (next.length === 0) {
        const remaining = sessions.filter(s => s.id !== id);
        return remaining.length > 0 ? [remaining[0].id] : [];
      }
      return next;
    });
    const timer = setTimeout(() => {
      void commitDelete(id);
      setPendingDelete(null);
    }, 5000);
    setPendingDelete({ id, title: session?.title ?? "Session", timer });
  };

  const renameSession = async (id: string, title: string) => {
    const t = title.trim();
    if (!t) return;
    setRenamingId(null);
    try {
      await fetchApi(`/api/sessions/${id}`, { method: "PATCH", body: JSON.stringify({ title: t }) });
      updateSession(id, { title: t });
    } catch { toast.error("Failed to rename"); }
  };

  const newSession = async () => {
    try {
      const s = await fetchApi<Session>("/api/sessions", { method: "POST", body: JSON.stringify({ title: "New Session" }) });
      setSessions(prev => [s, ...prev]);
      setActiveIds([s.id]);
      setOverlay(null);
    } catch { toast.error("Failed to create session"); }
  };

  const selectSession = (id: string) => {
    setActiveIds(prev => {
      if (prev.includes(id)) {
        return prev.length > 1 ? prev.filter(i => i !== id) : prev;
      }
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
    setOverlay(null);
  };

  const updateSession = (id: string, updates: Partial<Session>) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const createMergeSession = async (sessionA: Session, sessionB: Session) => {
    try {
      const mergePrompt = `You are a merge agent. Two parallel agents worked on the same codebase and may have conflicting changes.

Session A: "${sessionA.title}"
Session B: "${sessionB.title}"

Your job:
1. Review what each agent accomplished (check git log, git diff, file changes)
2. Identify any conflicts between their changes
3. Produce a clean merged result that incorporates both agents' work
4. Resolve any conflicts favoring the more complete or correct implementation
5. Commit the final merged state

Start by running: git log --oneline -10 to see recent changes from both sessions.`;

      const s = await fetchApi<Session>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          title: `Merge: ${sessionA.title.slice(0, 20)} + ${sessionB.title.slice(0, 20)}`,
          system_prompt: mergePrompt,
        }),
      });
      setSessions(prev => [s, ...prev]);
      setActiveIds([s.id]);
    } catch {
      toast.error("Failed to create merge session");
    }
  };

  const openSideChat = async () => {
    if (showSideChat) { setShowSideChat(false); return; }
    if (!sideSession) {
      try {
        const s = await fetchApi<Session>("/api/sessions", { method: "POST", body: JSON.stringify({ title: "Side chat" }) });
        setSessions(prev => [s, ...prev]);
        setSideSession(s);
      } catch { toast.error("Failed to create side session"); return; }
    }
    setShowSideChat(true);
  };

  const toggleOverlay = (o: Overlay) => {
    setOverlay(prev => prev === o ? null : o);
    if (o === "history") {
      setClaudeHistoryLoading(true);
      fetchApi<{ sessions: ClaudeSession[] }>("/api/claude-history")
        .then(d => setClaudeHistory(d.sessions))
        .catch(() => {})
        .finally(() => setClaudeHistoryLoading(false));
    }
  };

  const resumeClaudeSession = async (s: ClaudeSession) => {
    try {
      const session = await fetchApi<Session>(`/api/claude-history/${s.sessionId}/resume`, { method: "POST" });
      await fetchApi(`/api/sessions/${session.id}`, { method: "PATCH", body: JSON.stringify({ title: s.title.slice(0, 50) }) });
      session.title = s.title.slice(0, 50);
      setSessions(prev => {
        const exists = prev.find(x => x.id === session.id);
        return exists ? prev : [session, ...prev];
      });
      setActiveIds([session.id]);
      setOverlay(null);
    } catch { toast.error("Failed to resume session"); }
  };

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const startY = e.clientY;
    const startH = termHeight;
    const onMove = (me: MouseEvent) => setTermHeight(Math.max(120, Math.min(600, startH + (startY - me.clientY))));
    const onUp = () => { setDragging(false); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startRightDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    setRightDragging(true);
    const startX = e.clientX;
    const startW = rightTrayWidth;
    const onMove = (me: MouseEvent) => setRightTrayWidth(Math.max(300, Math.min(800, startW + (startX - me.clientX))));
    const onUp = () => { setRightDragging(false); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startPanelDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    setPanelDragging(true);
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (me: MouseEvent) => setPanelWidth(Math.max(200, Math.min(520, startW + (me.clientX - startX))));
    const onUp = () => { setPanelDragging(false); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const activeSessions = activeIds.map(id => sessions.find(s => s.id === id)).filter(Boolean) as Session[];

  const paletteItems: PaletteItem[] = [
    ...sessions.map(s => ({
      id: `session-${s.id}`,
      label: s.title,
      sublabel: `${s.model} · ${s.status}`,
      group: "Sessions",
      icon: activeIds.includes(s.id) ? "●" : "○",
      action: () => selectSession(s.id),
    })),
    { id: "view-files",     label: "Open Files",       group: "Views", icon: "◫", action: () => toggleOverlay("files") },
    { id: "view-issues",    label: "Open Issues",      group: "Views", icon: "!", action: () => toggleOverlay("issues") },
    { id: "view-agents",    label: "Open Agents",      group: "Views", icon: "⬡", action: () => toggleOverlay("agents") },
    { id: "view-scan",      label: "Generate Agents",  group: "Views", icon: "⊞", action: () => toggleOverlay("scan") },
    { id: "view-skills",    label: "Browse Skills",    group: "Views", icon: "✦", action: () => toggleOverlay("skills") },
    { id: "view-usage",     label: "View Usage",       group: "Views", icon: "~", action: () => toggleOverlay("usage") },
    { id: "view-terminal",  label: "Open Terminal",    group: "Views", icon: ">", action: () => toggleOverlay("terminal") },
    { id: "view-settings",  label: "Open Settings",    group: "Views", icon: "⚙", action: () => toggleOverlay("settings") },
    { id: "action-connect", label: "Connect Provider", group: "Views", icon: "⊕", action: () => setShowConnectModal(true) },
    { id: "action-new",     label: "New Session",      sublabel: "⌘N", group: "Actions", icon: "+", action: () => void newSession() },
    { id: "action-project", label: "Switch Project",   sublabel: projectDir, group: "Actions", icon: "⊘", action: () => setShowProjectPicker(true) },
  ];

  return (
    <div className="shell" style={{ userSelect: dragging || panelDragging || rightDragging ? "none" : undefined }}>

      {/* ── Shell body ── */}
      <div className="shell-body">

        {/* ── Sidebar (nav + sessions) — collapsible via ⌘B ── */}
        {!sidebarCollapsed && (
          <SessionSidebar
            sessions={sessions}
            activeIds={activeIds}
            projectDir={projectDir}
            renamingId={renamingId}
            setRenamingId={setRenamingId}
            overlay={overlay}
            onNewSession={() => void newSession()}
            onSelectSession={selectSession}
            onDeleteSession={doDeleteSession}
            onRenameSession={renameSession}
            onPalette={() => setShowPalette(true)}
            onToggleOverlay={toggleOverlay}
            onPickProject={() => setShowProjectPicker(true)}
            onToggleTerminal={() => toggleOverlay("terminal")}
            onToggleTheme={toggleTheme}
            onToggleViewMode={toggleViewMode}
            onOpenConnect={() => setShowConnectModal(true)}
            setSessions={setSessions}
            terminalOpen={overlay === "terminal"}
            theme={theme}
            viewMode={viewMode}
          />
        )}

        {/* ── Side panel (Files, Issues, Agents, etc.) ── */}
        {overlay && SIDE_PANELS.has(overlay) && (
          <div className="side-panel" style={{ width: panelWidth, flexShrink: 0 }}>
            <div className="side-panel-header">
              <span>{OVERLAY_LABELS[overlay] ?? overlay}</span>
              <div style={{ flex: 1 }} />
              <button onClick={() => setOverlay(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1, padding: "0 2px" }}>×</button>
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              {overlay === "files" && <FileExplorer onSendToChat={(text) => { setPendingChatText(text); setOverlay(null); if (activeIds.length === 0) void newSession(); }} />}
              {overlay === "issues" && <IssuesPage />}
              {overlay === "agents" && (
                <AgentsPage onRunAgent={async (agent) => {
                  try {
                    const s = await fetchApi<Session>("/api/sessions", { method: "POST", body: JSON.stringify({ title: agent.name, system_prompt: agent.system_prompt }) });
                    setSessions(prev => [s, ...prev]);
                    setActiveIds([s.id]);
                    setOverlay(null);
                  } catch { toast.error("Failed to create session"); }
                }} />
              )}
              {overlay === "skills" && <SkillsPanel onInject={(skill) => { setPendingSkill(skill); if (activeIds.length === 0) void newSession(); }} />}
              {overlay === "templates" && (
                <TemplatesPage onCreateSession={(session) => { setSessions(prev => [session, ...prev]); setActiveIds([session.id]); setOverlay(null); }} />
              )}
              {overlay === "history" && (
                <HistoryView
                  sessions={sessions}
                  claudeHistory={claudeHistory}
                  claudeHistoryLoading={claudeHistoryLoading}
                  onResume={resumeClaudeSession}
                  onOpen={(id) => { selectSession(id); setOverlay(null); }}
                />
              )}
            </div>
            {/* Resize handle on right edge */}
            <div className="side-panel-resize" onMouseDown={startPanelDrag} />
          </div>
        )}

        {/* ── Main content ── */}
        <div className="main-content">

          {/* Chat sessions + optional preview pane */}
          <div style={{ flex: 1, display: "flex", overflow: "hidden", opacity: overlay && !SIDE_PANELS.has(overlay) && overlay !== "terminal" ? 0 : 1, pointerEvents: overlay && !SIDE_PANELS.has(overlay) && overlay !== "terminal" ? "none" : "auto" }}>
            {activeSessions.length === 0 ? (
              sessions.length === 0 && overlay === null
                ? <WelcomeScreen onNew={() => void newSession()} onPalette={() => setShowPalette(true)} onSettings={() => toggleOverlay("settings")} onConnect={() => setShowConnectModal(true)} />
                : <EmptyState onNew={() => void newSession()} />
            ) : (
              <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
                {activeSessions.length === 2 && (
                  <div style={{
                    position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)",
                    zIndex: 20, display: "flex", gap: 4,
                  }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      title="Create a merge session to resolve conflicts between these two agents"
                      onClick={() => void createMergeSession(activeSessions[0], activeSessions[1])}
                    >
                      ⇄ Merge
                    </button>
                  </div>
                )}
                {activeSessions.map((session, i) => (
                  <div
                    key={session.id}
                    style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", borderLeft: i > 0 ? "1px solid var(--border)" : "none", minWidth: 0 }}
                  >
                    <ChatPane
                      session={session}
                      onSessionUpdate={(updates) => updateSession(session.id, updates)}
                      pendingText={i === 0 ? pendingChatText : null}
                      onPendingTextConsumed={() => setPendingChatText(null)}
                      pendingSkill={i === 0 ? pendingSkill : null}
                      onPendingSkillConsumed={() => setPendingSkill(null)}
                      onDispatch={(newSessions) => {
                        setSessions(prev => [...newSessions, ...prev]);
                        setActiveIds(newSessions.map(s => s.id).slice(0, 2));
                      }}
                      viewMode={viewMode}
                      sidebarCollapsed={sidebarCollapsed}
                      onToggleSidebar={i === 0 ? () => setSidebarCollapsed(v => !v) : undefined}
                      filesOpen={rightTray === "files"}
                      onToggleFiles={i === 0 ? () => setRightTray(v => v === "files" ? null : "files") : undefined}
                    />
                  </div>
                ))}
              </div>
            )}
            {showPreview && (
              <div style={{ flex: "0 0 400px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <PreviewPane onClose={() => setShowPreview(false)} />
              </div>
            )}
          </div>

          {/* Terminal (inline at bottom) */}
          {overlay === "terminal" && (
            <div className="terminal-panel" style={{ flexShrink: 0 }}>
              <div className="drag-handle" onMouseDown={startDrag} />
              <div className="terminal-header">
                <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Terminal</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => setOverlay(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14 }}>×</button>
              </div>
              <TerminalPanel height={termHeight} theme={theme} />
            </div>
          )}

          {/* Full overlays (Settings, Workflows, Scan, Usage) */}
          {overlay && !SIDE_PANELS.has(overlay) && overlay !== "terminal" && (
            <div className="overlay-view">
              <div className="overlay-header">
                <span>{OVERLAY_LABELS[overlay] ?? overlay}</span>
                <div style={{ flex: 1 }} />
                {overlay === "settings" && (
                  <button onClick={() => setShowConnectModal(true)} className="btn btn-primary btn-sm" style={{ marginRight: 8 }}>
                    + Connect provider
                  </button>
                )}
                <button onClick={() => setOverlay(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16 }}>×</button>
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                {overlay === "scan" && <ScanPage />}
                {overlay === "settings" && <SettingsPanel onClose={() => setOverlay(null)} />}
                {overlay === "usage" && <UsagePage />}
                {overlay === "workflows" && <WorkflowsPanel />}
              </div>
            </div>
          )}
        </div>

        {/* ── Right tray panel ── */}
        {rightTray && (
          <div style={{
            width: rightTrayWidth, flexShrink: 0, display: "flex", flexDirection: "column",
            borderLeft: "1px solid var(--border)", background: "var(--bg-panel)",
            position: "relative", overflow: "hidden",
          }}>
            {/* Drag handle on left edge */}
            <div
              onMouseDown={startRightDrag}
              style={{ position: "absolute", top: 0, left: -3, width: 6, height: "100%", cursor: "col-resize", zIndex: 5 }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-dim)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            />
            {/* Tray header */}
            <div style={{
              height: 38, display: "flex", alignItems: "center", padding: "0 12px",
              borderBottom: "1px solid var(--border)", flexShrink: 0, gap: 8,
            }}>
              <div style={{ display: "flex", gap: 1 }}>
                {(["files", "terminal", "git", "notes"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setRightTray(t)}
                    style={{
                      padding: "2px 10px", fontSize: 11, background: rightTray === t ? "var(--bg-elevated)" : "none",
                      border: "none", borderRadius: 4, cursor: "pointer",
                      color: rightTray === t ? "var(--text)" : "var(--text-muted)",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => setRightTray(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
              >×</button>
            </div>
            {/* Tray content */}
            <div style={{ flex: 1, overflow: "hidden" }}>
              {rightTray === "files" && (
                <FileExplorer onSendToChat={(text) => { setPendingChatText(text); if (activeIds.length === 0) void newSession(); }} />
              )}
              {rightTray === "terminal" && <TerminalPanel height={rightTrayWidth} theme={theme} />}
              {rightTray === "git" && (
                <div style={{ padding: 16, fontSize: 12, color: "var(--text-muted)" }}>
                  Git panel — diff view coming soon
                </div>
              )}
              {rightTray === "notes" && (
                <div style={{ padding: 12, display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
                  <textarea
                    placeholder="Scratch notes..."
                    style={{
                      flex: 1, background: "none", border: "none", outline: "none", resize: "none",
                      fontSize: 12, color: "var(--text)", fontFamily: "var(--font-sans)", lineHeight: 1.6,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}


      </div>

      {/* ── Side chat panel (⌘;) ── */}
      {showSideChat && sideSession && (
        <div style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: 380,
          background: "var(--bg-panel)", borderLeft: "1px solid var(--border)",
          display: "flex", flexDirection: "column", zIndex: 40,
          boxShadow: "-4px 0 24px rgba(0,0,0,0.25)",
          animation: "gc-fade-in 0.2s both",
        }}>
          <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, background: "var(--bg-elevated)" }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>Side chat</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>⌘;</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setShowSideChat(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
          <ChatPane
            session={sideSession}
            onSessionUpdate={(updates) => setSideSession(prev => prev ? { ...prev, ...updates } : prev)}
            viewMode={viewMode}
          />
        </div>
      )}

      {showPalette && <CommandPalette items={paletteItems} onClose={() => setShowPalette(false)} />}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {showConnectModal && <ConnectModal onClose={() => setShowConnectModal(false)} />}
      {showProjectPicker && (
        <ProjectPicker
          current={projectDir}
          onSwitch={(dir) => { setProjectDir(dir); setShowProjectPicker(false); setSessions([]); setActiveIds([]); void loadSessions(); }}
          onClose={() => setShowProjectPicker(false)}
        />
      )}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, color: "var(--text-muted)" }}>
      <div style={{ fontSize: 28, opacity: 0.3 }}>✦</div>
      <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Start a new session to begin</div>
      <button
        onClick={onNew}
        style={{ padding: "8px 20px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer", fontSize: 12, color: "var(--text)" }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
      >
        New Session
      </button>
    </div>
  );
}
