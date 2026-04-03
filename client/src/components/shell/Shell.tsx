import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { Outlet, useLocation } from "react-router-dom";

import Titlebar from "./Titlebar";
import Rail from "./Rail";
import SessionsPanel from "./SessionsPanel";
import SessionTabs from "./SessionTabs";
import TerminalPanel from "./TerminalPanel";
import ChatMessages, { type StreamingState } from "../ChatMessages";
import ChatInputBar from "../ChatInputBar";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import ResizableDrawer from "../ResizableDrawer";
import CommandPalette from "../CommandPalette";
import DiffPanel from "../DiffPanel";
import { DriftBanner, isDismissed, dismissFor24h } from "../DriftIndicator";
import ErrorBoundary from "../ErrorBoundary";
import ShortcutsHelp from "../ShortcutsHelp";
import AboutDialog from "../shared/AboutDialog";
import { useProjectInfo } from "../../hooks/useProjectInfo";
import { useKeyboardNav } from "../../hooks/useKeyboardNav";
import { useTheme } from "../../hooks/useTheme";
import { fetchApi } from "../../lib/api";
import { useSessionManager } from "../../hooks/useSessionManager";
import { useSessionTabs } from "../../hooks/useSessionTabs";
import { useStudioEvents } from "../../hooks/useStudioEvents";
import { MODELS } from "../../lib/models";

function persist(key: string, val: unknown) {
  try { localStorage.setItem(`studio:${key}`, JSON.stringify(val)); } catch { /* noop */ }
}
function restore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`studio:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

const rootStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  overflow: "hidden",
  background: "var(--bg)",
  fontFamily: "var(--font-ui)",
};

export default function Shell() {
  const location = useLocation();
  const { theme, setting, toggleTheme } = useTheme();

  const isHome = location.pathname === "/" || location.pathname === "/sessions";

  const [sessionsOpen, setSessionsOpen] = useState(() => restore("sessionsOpen", false));
  const [termOpen, setTermOpen] = useState(() => restore("termOpen", false));
  const [termBig, setTermBig] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => restore("selectedModel", "claude-sonnet-4-6"));
  const [thinking, setThinking] = useState(() => restore("thinking", false));
  const [planMode, setPlanMode] = useState(() => restore("planMode", false));

  const [streamText, setStreamText] = useState("");
  const [streamingState, setStreamingState] = useState<StreamingState | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [contextPercent, setContextPercent] = useState<number | null>(null);
  const [terminalCwd, setTerminalCwd] = useState("");
  const [diffOpen, setDiffOpen] = useState(false);
  const [driftDismissed, setDriftDismissed] = useState<boolean>(() => isDismissed());
  const [cmdOpen, setCmdOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<"commands" | "files">("files");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  // Session lifecycle
  const {
    activeSessionId,
    sessionError,
    chatHasMessages,
    setChatHasMessages,
    handleNewSession,
    handleSessionSelect,
    handleRetry,
  } = useSessionManager();

  const { tabs, openTab, closeTab, updateTitle } = useSessionTabs(activeSessionId);

  const onDiffShouldOpen = useCallback(() => setDiffOpen(true), []);
  const { info, git, drift, changedFiles, refreshGit } = useProjectInfo(streaming, onDiffShouldOpen);

  const onNewSession = useCallback(() => {
    handleNewSession();
    setSessionsOpen(true);
  }, [handleNewSession]);

  useKeyboardNav({ navigate: () => {}, setCmdOpen, setPaletteMode, shortcutsOpen, setShortcutsOpen, setTermOpen, setSidebarOpen: setSessionsOpen });

  // Update tab title when switching sessions
  useEffect(() => {
    if (!activeSessionId) return;
    fetchApi(`/api/sessions/${activeSessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { title?: string } | null) => {
        if (d?.title) updateTitle(activeSessionId, d.title);
      })
      .catch(() => {});
  }, [activeSessionId, updateTitle]);

  useEffect(() => { persist("sessionsOpen", sessionsOpen); }, [sessionsOpen]);
  useEffect(() => { persist("termOpen", termOpen); }, [termOpen]);
  useEffect(() => { persist("selectedModel", selectedModel); }, [selectedModel]);
  useEffect(() => { persist("thinking", thinking); }, [thinking]);
  useEffect(() => { persist("planMode", planMode); }, [planMode]);

  // All studio custom events + side effects
  useStudioEvents({
    streaming,
    activeSessionId,
    setChatHasMessages,
    setContextPercent,
    setThinking,
    setPlanMode,
    setTermOpen,
    setSelectedModel,
    setCmdOpen,
    setPaletteMode,
    setAboutOpen,
    refreshGit,
    handleNewSession: onNewSession,
    toggleTheme,
  });

  // studio:open-diff needs local diffOpen setter
  useEffect(() => {
    const handler = () => setDiffOpen(true);
    window.addEventListener("studio:open-diff", handler);
    return () => window.removeEventListener("studio:open-diff", handler);
  }, []);

  // When studio:suggest fires but the input bar isn't mounted (chatHasMessages is false),
  // ensure a session exists, show the input bar, then re-dispatch so ChatInputBar picks it up.
  useEffect(() => {
    const handler = (e: Event) => {
      if (chatHasMessages) return; // input bar is already mounted, it handles the event
      const text = (e as CustomEvent<{ text: string }>).detail?.text;
      if (!text) return;
      if (!activeSessionId) {
        handleNewSession();
      } else {
        setChatHasMessages(true);
      }
      // Re-dispatch after a tick so the now-mounted ChatInputBar catches it
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("studio:suggest", { detail: { text } }));
      });
    };
    window.addEventListener("studio:suggest", handler);
    return () => window.removeEventListener("studio:suggest", handler);
  }, [chatHasMessages, activeSessionId, handleNewSession, setChatHasMessages]);

  const currentModelEntry = MODELS.find((m) => m.id === selectedModel);
  const modelLabel = currentModelEntry?.label ?? "Sonnet 4.6";

  return (
    <div style={rootStyle}>
      <Titlebar
        projectName={info?.projectName}
        git={git}
        drift={drift}
        sidebarOpen={sessionsOpen}
        onToggleSidebar={() => setSessionsOpen(v => !v)}
        termOpen={termOpen}
        onToggleTerm={() => setTermOpen((v) => !v)}
        splitOpen={diffOpen}
        changedFiles={changedFiles}
        onDiffOpen={() => setDiffOpen(true)}
        streaming={streaming}
        onRefreshGit={refreshGit}
      />

      {drift && !driftDismissed && (
        <DriftBanner drift={drift} onDismiss={() => { dismissFor24h(); setDriftDismissed(true); }} />
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <Rail theme={theme === "light" ? "light" : "dark"} themeSetting={setting} />

        {isHome ? (
          <PanelGroup direction="horizontal" style={{ flex: 1 }}>
            {/* Sidebar panel */}
            {sessionsOpen && (
              <>
                <Panel defaultSize={20} minSize={12} maxSize={30} order={1}>
                  <SessionsPanel
                    activeSessionId={activeSessionId}
                    onSessionSelect={handleSessionSelect}
                    onNewSession={onNewSession}
                    streaming={streaming}
                    streamingSessionId={streaming ? activeSessionId : null}
                    git={git}
                  />
                </Panel>
                <PanelResizeHandle style={{ width: 1, background: "var(--border-dim)", cursor: "col-resize" }} />
              </>
            )}

            {/* Main chat panel */}
            <Panel defaultSize={diffOpen ? 60 : 80} minSize={30} order={2}>
              <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
                <SessionTabs
                  tabs={tabs}
                  activeId={activeSessionId}
                  streaming={streaming}
                  streamingSessionId={streaming ? activeSessionId : null}
                  onSelect={(id) => { handleSessionSelect(id); openTab(id); }}
                  onClose={(id) => {
                    const next = closeTab(id);
                    if (next) handleSessionSelect(next);
                    else handleSessionSelect("");
                  }}
                  onNew={onNewSession}
                />
                {sessionError && (
                  <div style={{ padding: 20, textAlign: "center", color: "var(--red)" }}>
                    <div>Failed to create session</div>
                    <button onClick={handleRetry} className="btn btn-sm" style={{ marginTop: 8 }}>Retry</button>
                  </div>
                )}
                <ErrorBoundary>
                  <div style={{ flex: termBig ? 0 : 1, overflow: "hidden", display: termBig ? "none" : "flex", flexDirection: "column", minHeight: 0 }}>
                    <ChatMessages
                      sessionId={activeSessionId}
                      streamText={streamText}
                      streaming={streaming}
                      streamingState={streamingState ?? undefined}
                      modelLabel={modelLabel}
                      planMode={planMode}
                      projectInfo={info ?? undefined}
                      gitStatus={git ?? undefined}
                      onNewSession={onNewSession}
                    />
                  </div>
                </ErrorBoundary>

                <ResizableDrawer open={termOpen} onToggle={() => setTermOpen((v) => !v)} defaultHeight={280}>
                  <TerminalPanel
                    termBig={termBig}
                    onToggleBig={() => setTermBig((v) => !v)}
                    onClose={() => setTermOpen(false)}
                    onCwdChange={setTerminalCwd}
                  />
                </ResizableDrawer>

                {activeSessionId && chatHasMessages && (
                  <ChatInputBar
                    sessionId={activeSessionId}
                    hasMessages={chatHasMessages}
                    onNewSession={onNewSession}
                    onSessionCreated={() => {}}
                    onStreamText={setStreamText}
                    onStreamingState={setStreamingState}
                    onStreamingChange={setStreaming}
                    streaming={streaming}
                    terminalCwd={terminalCwd || undefined}
                    selectedModel={selectedModel}
                    thinking={thinking}
                    planMode={planMode}
                  />
                )}
              </div>
            </Panel>

            {/* Right panel: diff/changes */}
            {diffOpen && (
              <>
                <PanelResizeHandle style={{ width: 1, background: "var(--border-dim)", cursor: "col-resize" }} />
                <Panel defaultSize={30} minSize={15} maxSize={50} order={3}>
                  <DiffPanel open={diffOpen} onClose={() => setDiffOpen(false)} />
                </Panel>
              </>
            )}
          </PanelGroup>
        ) : (
          <ErrorBoundary>
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0 }}>
              <Outlet />
            </div>
          </ErrorBoundary>
        )}
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} mode={paletteMode} />
      {shortcutsOpen && <ShortcutsHelp onClose={() => setShortcutsOpen(false)} />}
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <DiffPanel open={diffOpen} onClose={() => setDiffOpen(false)} />

    </div>
  );
}
