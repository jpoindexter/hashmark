import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import Titlebar from "./Titlebar";
import ActivityBar from "./ActivityBar";
import SidebarPanel from "./SidebarPanel";
import SidebarResize from "./SidebarResize";
import StatusBar from "./StatusBar";
import ModelBar from "./ModelBar";
import TerminalPanel from "./TerminalPanel";
import ChatMessages from "../ChatMessages";
import ChatInputBar from "../ChatInputBar";
import { ContextBar } from "../ContextBar";
import ResizableDrawer from "../ResizableDrawer";
import CommandPalette from "../CommandPalette";
import DiffDrawer from "../DiffDrawer";
import { DriftBanner, isDismissed, dismissFor24h } from "../DriftIndicator";
import ShortcutsHelp from "../ShortcutsHelp";
import SessionsSidebar from "../sidebar/SessionsSidebar";
import { useProjectInfo } from "../../hooks/useProjectInfo";
import { useKeyboardNav } from "../../hooks/useKeyboardNav";

function persist(key: string, val: unknown) {
  try { localStorage.setItem(`studio:${key}`, JSON.stringify(val)); } catch { /* noop */ }
}
function restore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`studio:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

const MODELS = [
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

const DEFAULT_SIDEBAR_WIDTH = 240;

async function createSession(): Promise<string> {
  const r = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const d: { session: { id: string } } = await r.json();
  return d.session.id;
}

const rootStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  overflow: "hidden",
  background: "var(--bg)",
  fontFamily: "var(--font-ui)",
};

function deriveActiveView(pathname: string): string {
  if (pathname === "/" || pathname === "/sessions") return "chat";
  const segment = pathname.split("/")[1];
  return segment || "chat";
}

function deriveRouteTitle(pathname: string): string {
  const segment = pathname.slice(1);
  if (!segment || segment === "sessions") return "Chat";
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export default function Shell() {
  const location = useLocation();
  const navigate = useNavigate();

  // Derived from route
  const activeView = deriveActiveView(location.pathname);
  const routeTitle = deriveRouteTitle(location.pathname);
  const isHome = location.pathname === "/" || location.pathname === "/sessions";
  const showChatBar =
    !location.pathname.startsWith("/settings") &&
    !location.pathname.startsWith("/setup");

  // Persisted state
  const [sidebarOpen, setSidebarOpen] = useState(() => restore("sidebarOpen", true));
  const [sidebarWidth, setSidebarWidth] = useState(() => restore("sidebarWidth", DEFAULT_SIDEBAR_WIDTH));
  const [termOpen, setTermOpen] = useState(() => restore("termOpen", false));
  const [termBig, setTermBig] = useState(() => restore("termBig", false));
  const [selectedModel, setSelectedModel] = useState(() => restore("selectedModel", "claude-sonnet-4-6"));
  const [thinking, setThinking] = useState(() => restore("thinking", false));
  const [planMode, setPlanMode] = useState(() => restore("planMode", false));
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    () => localStorage.getItem("studio_active_session_id") ?? null,
  );

  // Ephemeral state
  const [activeTab, setActiveTab] = useState<"TERMINAL" | "OUTPUT">("TERMINAL");
  const [streamText, setStreamText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [terminalCwd, setTerminalCwd] = useState("");
  const [diffOpen, setDiffOpen] = useState(false);
  const [driftDismissed, setDriftDismissed] = useState<boolean>(isDismissed);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Hooks
  const onDiffShouldOpen = useCallback(() => setDiffOpen(true), []);
  const { info, git, drift, changedFiles, refreshGit } = useProjectInfo(streaming, onDiffShouldOpen);

  useKeyboardNav({
    navigate,
    setCmdOpen,
    shortcutsOpen,
    setShortcutsOpen,
    setTermOpen,
    setSidebarOpen,
  });

  // Persist all state changes to localStorage
  useEffect(() => {
    persist("sidebarOpen", sidebarOpen);
    persist("sidebarWidth", sidebarWidth);
    persist("termOpen", termOpen);
    persist("termBig", termBig);
    persist("selectedModel", selectedModel);
    persist("thinking", thinking);
    persist("planMode", planMode);
    if (activeSessionId) localStorage.setItem("studio_active_session_id", activeSessionId);
    else localStorage.removeItem("studio_active_session_id");
  }, [sidebarOpen, sidebarWidth, termOpen, termBig, selectedModel, thinking, planMode, activeSessionId]);

  // Auto-create session on mount
  useEffect(() => {
    if (activeSessionId) return;
    createSession().then(setActiveSessionId).catch(() => {});
  }, [activeSessionId]);

  // Session switching via custom event
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) setActiveSessionId(id);
    };
    window.addEventListener("studio:switch-session", handler);
    return () => window.removeEventListener("studio:switch-session", handler);
  }, []);

  // Electron menu events
  useEffect(() => {
    if (typeof window.studio?.onMenu !== "function") return;
    const subs = [
      window.studio.onMenu("menu:navigate", (p: unknown) => { if (typeof p === "string") navigate(p); }),
      window.studio.onMenu("menu:toggle-terminal", () => setTermOpen(v => !v)),
      window.studio.onMenu("menu:toggle-sidebar", () => window.dispatchEvent(new CustomEvent("studio:toggle-sidebar"))),
      window.studio.onMenu("menu:new-terminal", () => { setTermOpen(true); window.dispatchEvent(new CustomEvent("studio:new-terminal")); }),
      window.studio.onMenu("menu:command-palette", () => setCmdOpen(true)),
    ];
    return () => subs.forEach(unsub => unsub?.());
  }, [navigate]);

  const handleNewSession = useCallback(() => {
    createSession().then(setActiveSessionId).catch(() => {});
  }, []);
  // ActivityBar handles navigation internally; this satisfies the required prop
  const handleViewChange = useCallback((_path: string) => {}, []);
  const handleSidebarReset = useCallback(() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH), []);

  const modelLabel = MODELS.find(m => m.id === selectedModel)?.label;

  // Render
  return (
    <div style={rootStyle}>
      <Titlebar
        projectName={info?.projectName}
        git={git}
        drift={drift}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(v => !v)}
        changedFiles={changedFiles}
        onDiffOpen={() => setDiffOpen(true)}
        streaming={streaming}
        routeTitle={routeTitle}
        onRefreshGit={refreshGit}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <ActivityBar
          activeView={activeView}
          onViewChange={handleViewChange}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(v => !v)}
        />

        <SidebarPanel
          activeView={activeView}
          width={sidebarWidth}
          open={sidebarOpen}
          onToggle={() => setSidebarOpen(v => !v)}
          sessionsSidebar={
            <SessionsSidebar
              activeSessionId={activeSessionId}
              onSessionSelect={setActiveSessionId}
            />
          }
        />

        <SidebarResize
          onResize={setSidebarWidth}
          onReset={handleSidebarReset}
          currentWidth={sidebarWidth}
        />

        {/* Main content column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {/* Drift banner */}
          {drift && !driftDismissed && (
            <DriftBanner
              drift={drift}
              onDismiss={() => { dismissFor24h(); setDriftDismissed(true); }}
            />
          )}

          {/* Content area */}
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

          {/* Terminal drawer */}
          <ResizableDrawer open={termOpen} onToggle={() => setTermOpen(v => !v)} defaultHeight={280}>
            <TerminalPanel
              activeTab={activeTab}
              onTabChange={setActiveTab}
              termBig={termBig}
              onToggleBig={() => setTermBig(v => !v)}
              onClose={() => setTermOpen(false)}
              onCwdChange={setTerminalCwd}
            />
          </ResizableDrawer>

          {/* Chat bar -- hidden on settings/setup */}
          {showChatBar && (
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
                modelName={selectedModel}
              />
              <ModelBar
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                thinking={thinking}
                onToggleThinking={() => setThinking(v => !v)}
                planMode={planMode}
                onTogglePlan={() => setPlanMode(v => !v)}
                canSend={!streaming}
                onSend={() => {
                  // Send is handled internally by ChatInputBar on Enter
                }}
              />
            </>
          )}
        </div>
      </div>

      <StatusBar
        branch={git?.branch}
        changedFiles={changedFiles}
        projectName={info?.projectName}
        modelName={modelLabel}
      />

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      {shortcutsOpen && <ShortcutsHelp onClose={() => setShortcutsOpen(false)} />}
      <DiffDrawer open={diffOpen} onClose={() => setDiffOpen(false)} projectDir={info?.projectDir ?? ""} />
    </div>
  );
}
