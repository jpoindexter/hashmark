import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { Outlet, useLocation } from "react-router-dom";

import Titlebar from "./Titlebar";
import Rail from "./Rail";
import SessionsPanel from "./SessionsPanel";
import TerminalPanel from "./TerminalPanel";
import ChatMessages, { type StreamingState } from "../ChatMessages";
import ChatInputBar from "../ChatInputBar";
import ResizableDrawer from "../ResizableDrawer";
import CommandPalette from "../CommandPalette";
import DiffDrawer from "../DiffDrawer";
import { DriftBanner, isDismissed, dismissFor24h } from "../DriftIndicator";
// ClaudeBanner removed -- false positives with aliases/npx shims make it more annoying than helpful
import ErrorBoundary from "../ErrorBoundary";
import ShortcutsHelp from "../ShortcutsHelp";
import AboutDialog from "../shared/AboutDialog";
import { useProjectInfo } from "../../hooks/useProjectInfo";
import { useKeyboardNav } from "../../hooks/useKeyboardNav";
import { useTheme } from "../../hooks/useTheme";
import { useSessionManager } from "../../hooks/useSessionManager";
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

  const [termOpen, setTermOpen] = useState(() => restore("termOpen", false));
  const [termBig, setTermBig] = useState(false);
  const [activeTab, setActiveTab] = useState<"TERMINAL" | "OUTPUT">("TERMINAL");
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

  const onDiffShouldOpen = useCallback(() => setDiffOpen(true), []);
  const { info, git, drift, changedFiles, refreshGit } = useProjectInfo(streaming, onDiffShouldOpen);

  useKeyboardNav({ navigate: () => {}, setCmdOpen, setPaletteMode, shortcutsOpen, setShortcutsOpen, setTermOpen, setSidebarOpen: () => {} });

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
    handleNewSession,
    toggleTheme,
  });

  // studio:open-diff needs local diffOpen setter
  useEffect(() => {
    const handler = () => setDiffOpen(true);
    window.addEventListener("studio:open-diff", handler);
    return () => window.removeEventListener("studio:open-diff", handler);
  }, []);

  const currentModelEntry = MODELS.find((m) => m.id === selectedModel);
  const modelLabel = currentModelEntry?.label ?? "Sonnet 4.6";

  return (
    <div style={rootStyle}>
      <Titlebar
        projectName={info?.projectName}
        git={git}
        drift={drift}
        sidebarOpen={false}
        onToggleSidebar={() => {}}
        termOpen={termOpen}
        onToggleTerm={() => setTermOpen((v) => !v)}
        splitOpen={false}
        changedFiles={changedFiles}
        onDiffOpen={() => setDiffOpen(true)}
        streaming={streaming}
        onRefreshGit={refreshGit}
      />

      {drift && !driftDismissed && (
        <DriftBanner drift={drift} onDismiss={() => { dismissFor24h(); setDriftDismissed(true); }} />
      )}

      {/* ClaudeBanner removed -- false positives with aliases/npx shims */}

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <Rail theme={theme === "light" ? "light" : "dark"} themeSetting={setting} />

        {/* Chat-first home: sessions panel + chat */}
        {isHome && (
          <>
            <SessionsPanel
              activeSessionId={activeSessionId}
              onSessionSelect={handleSessionSelect}
              onNewSession={handleNewSession}
              streaming={streaming}
              streamingSessionId={streaming ? activeSessionId : null}
              git={git}
            />

            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
              {sessionError && (
                <div style={{ padding: 20, textAlign: "center", color: "var(--red)" }}>
                  <div>Failed to create session</div>
                  <button
                    onClick={handleRetry}
                    style={{
                      marginTop: 8, padding: "4px 12px",
                      background: "var(--bg-3)", border: "1px solid var(--border)",
                      borderRadius: "var(--radius)", color: "var(--text-dim)", cursor: "pointer",
                      fontFamily: "var(--font-ui)", fontSize: 12,
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}
              <ErrorBoundary>
                <div style={{
                  flex: termBig ? 0 : 1,
                  overflow: "hidden",
                  display: termBig ? "none" : "flex",
                  flexDirection: "column",
                  minHeight: 0,
                }}>
                  <ChatMessages
                    sessionId={activeSessionId}
                    streamText={streamText}
                    streaming={streaming}
                    streamingState={streamingState ?? undefined}
                    modelLabel={modelLabel}
                    planMode={planMode}
                  />
                </div>
              </ErrorBoundary>

              <ResizableDrawer open={termOpen} onToggle={() => setTermOpen((v) => !v)} defaultHeight={280}>
                <TerminalPanel
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  termBig={termBig}
                  onToggleBig={() => setTermBig((v) => !v)}
                  onClose={() => setTermOpen(false)}
                  onCwdChange={setTerminalCwd}
                />
              </ResizableDrawer>

              <ChatInputBar
                sessionId={activeSessionId}
                hasMessages={chatHasMessages}
                onNewSession={handleNewSession}
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
            </div>
          </>
        )}

        {/* Non-home routes */}
        {!isHome && (
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
      <DiffDrawer open={diffOpen} onClose={() => setDiffOpen(false)} projectDir={info?.projectDir ?? ""} />

    </div>
  );
}
