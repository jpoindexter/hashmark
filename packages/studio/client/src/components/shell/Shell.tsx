import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
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
import { useTheme } from "../../hooks/useTheme";
import FileContentViewer from "./FileContentViewer";
import DiffContentViewer from "./DiffContentViewer";
import AgentDetailViewer from "./AgentDetailViewer";

function persist(key: string, val: unknown) {
  try { localStorage.setItem(`studio:${key}`, JSON.stringify(val)); } catch { /* noop */ }
}
function restore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`studio:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

// Model-to-label + provider mapping for StatusBar display
const ALL_MODELS: Array<{ id: string; label: string; provider: string }> = [
  { id: "claude-opus-4-6", label: "Opus 4.6", provider: "Claude" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", provider: "Claude" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", provider: "Claude" },
  { id: "o3", label: "o3", provider: "Codex" },
  { id: "o3-mini", label: "o3 mini", provider: "Codex" },
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", provider: "OpenAI" },
  { id: "gemini-2.0-flash", label: "2.0 Flash", provider: "Gemini" },
  { id: "gemini-1.5-pro", label: "1.5 Pro", provider: "Gemini" },
  { id: "amp-default", label: "Default", provider: "Amp" },
  { id: "goose-default", label: "Default", provider: "Goose" },
  { id: "copilot-default", label: "Default", provider: "Copilot" },
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

  // Theme -- applies data-theme attribute on <html>, syncs with Settings
  const { toggleTheme } = useTheme();

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

  // Toast state
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: string }>>([]);

  // Ephemeral state
  const [activeTab, setActiveTab] = useState<"TERMINAL" | "OUTPUT">("TERMINAL");
  const [streamText, setStreamText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [contextPercent, setContextPercent] = useState<number | null>(null);
  const [terminalCwd, setTerminalCwd] = useState("");
  const [sessionError, setSessionError] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [driftDismissed, setDriftDismissed] = useState<boolean>(isDismissed);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<"commands" | "files">("files");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [activityBarVisible, setActivityBarVisible] = useState(() => restore("activityBarVisible", true));

  // Hooks
  const onDiffShouldOpen = useCallback(() => setDiffOpen(true), []);
  const { info, git, drift, changedFiles, refreshGit } = useProjectInfo(streaming, onDiffShouldOpen);

  useKeyboardNav({
    navigate,
    setCmdOpen,
    setPaletteMode,
    shortcutsOpen,
    setShortcutsOpen,
    setTermOpen,
    setSidebarOpen,
  });

  // Persist each value independently to avoid writes on unrelated changes
  useEffect(() => { persist("sidebarOpen", sidebarOpen); }, [sidebarOpen]);
  useEffect(() => { persist("sidebarWidth", sidebarWidth); }, [sidebarWidth]);
  useEffect(() => { persist("termOpen", termOpen); }, [termOpen]);
  useEffect(() => { persist("termBig", termBig); }, [termBig]);
  useEffect(() => { persist("selectedModel", selectedModel); }, [selectedModel]);
  useEffect(() => { persist("thinking", thinking); }, [thinking]);
  useEffect(() => { persist("planMode", planMode); }, [planMode]);
  useEffect(() => {
    if (activeSessionId) localStorage.setItem("studio_active_session_id", activeSessionId);
    else localStorage.removeItem("studio_active_session_id");
  }, [activeSessionId]);

  // Auto-create session on mount
  useEffect(() => {
    if (activeSessionId) return;
    setSessionError(false);
    createSession()
      .then(setActiveSessionId)
      .catch(() => setSessionError(true));
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

  // Navigation via custom event (used by Titlebar PR button)
  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (typeof path === "string") navigate(path);
    };
    window.addEventListener("studio:navigate", handler);
    return () => window.removeEventListener("studio:navigate", handler);
  }, [navigate]);

  // Toast listener -- dispatched by git push/pull, agent runs, errors, etc.
  useEffect(() => {
    const handler = (e: Event) => {
      const { message, type } = (e as CustomEvent<{ message: string; type?: string }>).detail;
      const id = Date.now().toString();
      setToasts(prev => [...prev, { id, message, type: type || "info" }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    };
    window.addEventListener("studio:toast", handler);
    return () => window.removeEventListener("studio:toast", handler);
  }, []);

  // Agent open/run events -- dispatched by sidebar, command palette, etc.
  useEffect(() => {
    const openHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const id = typeof detail === "string" ? detail : detail?.id;
      if (id) navigate(`/agents?agent=${id}`);
    };
    const runHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const id = typeof detail === "string" ? detail : detail?.id;
      if (id) navigate(`/run?agent=${id}`);
    };
    window.addEventListener("studio:open-agent", openHandler);
    window.addEventListener("studio:run-agent", runHandler);
    return () => {
      window.removeEventListener("studio:open-agent", openHandler);
      window.removeEventListener("studio:run-agent", runHandler);
    };
  }, [navigate]);

  // Command palette + slash command events
  useEffect(() => {
    const handlers: Array<[string, () => void]> = [
      ["studio:toggle-thinking", () => setThinking(v => !v)],
      ["studio:toggle-plan", () => setPlanMode(v => !v)],
      ["studio:refresh-git", refreshGit],
      ["studio:open-diff", () => setDiffOpen(true)],
      ["studio:new-session", handleNewSession],
      ["studio:toggle-theme", toggleTheme],
    ];
    handlers.forEach(([event, handler]) => window.addEventListener(event, handler));
    return () => handlers.forEach(([event, handler]) => window.removeEventListener(event, handler));
  }, [refreshGit, handleNewSession, toggleTheme]);

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Fetch context usage after each chat response completes + OS notification
  const prevStreaming = useRef(streaming);
  useEffect(() => {
    const wasStreaming = prevStreaming.current;
    prevStreaming.current = streaming;
    if (wasStreaming && !streaming) {
      // OS notification when agent finishes while app is in background
      if (document.visibilityState !== "visible") {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("hashmark studio", {
            body: "Agent finished working",
            icon: "/assets/icon.png",
          });
        }
      }
      // Fetch context usage
      if (activeSessionId) {
        fetch(`/api/sessions/${activeSessionId}/tokens`)
          .then(r => r.json())
          .then((data: { pct?: number }) => {
            if (typeof data.pct === "number") setContextPercent(data.pct);
          })
          .catch(() => {});
      }
    }
  }, [streaming, activeSessionId]);

  // Sync settings changed from Settings page while Shell is mounted
  useEffect(() => {
    const handler = (e: Event) => {
      const { key, value } = (e as CustomEvent<{ key: string; value: unknown }>).detail;
      if (key === "selectedModel" && typeof value === "string") setSelectedModel(value);
      if (key === "thinking" && typeof value === "boolean") setThinking(value);
      if (key === "planMode" && typeof value === "boolean") setPlanMode(value);
    };
    window.addEventListener("studio:settings-change", handler);
    return () => window.removeEventListener("studio:settings-change", handler);
  }, []);

  // Electron menu events
  useEffect(() => {
    if (typeof window.studio?.onMenu !== "function") return;
    const dispatch = (name: string, detail?: unknown) =>
      window.dispatchEvent(new CustomEvent(name, detail !== undefined ? { detail } : undefined));

    const subs = [
      window.studio.onMenu("menu:navigate", (p: unknown) => { if (typeof p === "string") navigate(p); }),
      window.studio.onMenu("menu:toggle-terminal", () => setTermOpen(v => !v)),
      window.studio.onMenu("menu:toggle-sidebar", () => dispatch("studio:toggle-sidebar")),
      window.studio.onMenu("menu:toggle-activity-bar", () => setActivityBarVisible(v => !v)),
      window.studio.onMenu("menu:new-terminal", () => { setTermOpen(true); dispatch("studio:new-terminal"); }),
      window.studio.onMenu("menu:split-terminal", () => { setTermOpen(true); dispatch("studio:split-terminal"); }),
      window.studio.onMenu("menu:kill-terminal", () => dispatch("studio:kill-terminal")),
      window.studio.onMenu("menu:kill-all-terminals", () => dispatch("studio:kill-all-terminals")),
      window.studio.onMenu("menu:clear-terminal", () => dispatch("studio:clear-terminal")),
      window.studio.onMenu("menu:command-palette", () => { setPaletteMode("commands"); setCmdOpen(true); }),
      window.studio.onMenu("menu:go-to-file", () => { setPaletteMode("files"); setCmdOpen(true); }),
      window.studio.onMenu("menu:run-scan", () => navigate("/generate")),
      window.studio.onMenu("menu:start-agent", () => navigate("/run")),
      window.studio.onMenu("menu:stop-agent", () => dispatch("studio:stop-agent")),
      // Edit menu: find/selection/line operations
      window.studio.onMenu("menu:find", () => setCmdOpen(true)),
      window.studio.onMenu("menu:find-next", () => console.log("menu:find-next not implemented yet")),
      window.studio.onMenu("menu:find-prev", () => console.log("menu:find-prev not implemented yet")),
      window.studio.onMenu("menu:expand-selection", () => console.log("menu:expand-selection not implemented yet")),
      window.studio.onMenu("menu:shrink-selection", () => console.log("menu:shrink-selection not implemented yet")),
      window.studio.onMenu("menu:copy-line-up", () => console.log("menu:copy-line-up not implemented yet")),
      window.studio.onMenu("menu:copy-line-down", () => console.log("menu:copy-line-down not implemented yet")),
      window.studio.onMenu("menu:move-line-up", () => console.log("menu:move-line-up not implemented yet")),
      window.studio.onMenu("menu:move-line-down", () => console.log("menu:move-line-down not implemented yet")),
      // Go menu
      window.studio.onMenu("menu:go-to-symbol", () => console.log("menu:go-to-symbol not implemented yet")),
      window.studio.onMenu("menu:go-to-line", () => console.log("menu:go-to-line not implemented yet")),
    ];
    return () => subs.forEach(unsub => unsub?.());
  }, [navigate]);

  const handleNewSession = useCallback(() => {
    createSession().then(setActiveSessionId).catch(() => {});
  }, []);
  const handleSidebarReset = useCallback(() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH), []);

  const currentModelEntry = ALL_MODELS.find(m => m.id === selectedModel);
  const modelLabel = currentModelEntry?.label;
  const providerName = currentModelEntry?.provider;

  // Render
  return (
    <div style={rootStyle}>
      <Titlebar
        projectName={info?.projectName}
        git={git}
        drift={drift}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(v => !v)}
        termOpen={termOpen}
        onToggleTerm={() => setTermOpen(v => !v)}
        changedFiles={changedFiles}
        onDiffOpen={() => setDiffOpen(true)}
        streaming={streaming}
        routeTitle={routeTitle}
        onRefreshGit={refreshGit}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {activityBarVisible && (
          <ActivityBar
            activeView={activeView}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(v => !v)}
          />
        )}

        {/* Sidebar shows for chat, files, source-control, agents */}
        {["chat", "files", "source-control", "agents"].includes(activeView) && sidebarOpen && (
          <>
            <SidebarPanel
              activeView={activeView}
              width={sidebarWidth}
              open={sidebarOpen}
              sessionsSidebar={
                <SessionsSidebar
                  activeSessionId={activeSessionId}
                  onSessionSelect={setActiveSessionId}
                  info={info}
                  git={git}
                  streaming={streaming}
                  streamingSessionId={streaming ? activeSessionId : null}
                />
              }
            />

            <SidebarResize
              onResize={setSidebarWidth}
              onReset={handleSidebarReset}
              currentWidth={sidebarWidth}
            />
          </>
        )}

        {/* Main content column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {/* Drift banner */}
          {drift && !driftDismissed && (
            <DriftBanner
              drift={drift}
              onDismiss={() => { dismissFor24h(); setDriftDismissed(true); }}
            />
          )}

          {/* Session error state */}
          {sessionError && (
            <div style={{ padding: 20, textAlign: "center", color: "var(--red)" }}>
              <div>Failed to create session</div>
              <button
                onClick={() => {
                  setSessionError(false);
                  createSession()
                    .then(setActiveSessionId)
                    .catch(() => setSessionError(true));
                }}
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

          {/* Content area */}
          <div style={{
            flex: termBig ? 0 : 1,
            overflow: "hidden",
            display: termBig ? "none" : "flex",
            flexDirection: "column",
            minHeight: 0,
          }}>
            {isHome ? (
              <ChatMessages sessionId={activeSessionId} streamText={streamText} streaming={streaming} modelLabel={modelLabel ?? "Sonnet 4.6"} />
            ) : activeView === "files" ? (
              <FileContentViewer />
            ) : activeView === "source-control" ? (
              <DiffContentViewer />
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
                selectedModel={selectedModel}
                thinking={thinking}
                planMode={planMode}
              />
              <ModelBar
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                thinking={thinking}
                onToggleThinking={() => setThinking(v => !v)}
                planMode={planMode}
                onTogglePlan={() => setPlanMode(v => !v)}
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
        providerName={providerName}
        contextPercent={contextPercent}
      />

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} mode={paletteMode} />
      {shortcutsOpen && <ShortcutsHelp onClose={() => setShortcutsOpen(false)} />}
      <DiffDrawer open={diffOpen} onClose={() => setDiffOpen(false)} projectDir={info?.projectDir ?? ""} />

      {/* Toast notifications -- positioned above status bar */}
      {toasts.length > 0 && (
        <div style={{
          position: "fixed", bottom: 30, right: 12, zIndex: 9999,
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              padding: "8px 16px",
              borderRadius: "var(--radius)",
              fontSize: 12,
              fontFamily: "var(--font-ui)",
              background: t.type === "error" ? "var(--red)" : t.type === "success" ? "var(--accent)" : "var(--bg-4)",
              color: t.type === "error" || t.type === "success" ? "#fff" : "var(--text)",
              border: "1px solid var(--border)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              animation: "fadeIn 0.2s ease",
            }}>
              {t.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
