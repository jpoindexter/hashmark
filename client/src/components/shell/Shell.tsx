import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

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
import ErrorBoundary from "../ErrorBoundary";
import ShortcutsHelp from "../ShortcutsHelp";
import AboutDialog from "../shared/AboutDialog";
import { useProjectInfo } from "../../hooks/useProjectInfo";
import { useKeyboardNav } from "../../hooks/useKeyboardNav";
import { useTheme } from "../../hooks/useTheme";

function persist(key: string, val: unknown) {
  try { localStorage.setItem(`studio:${key}`, JSON.stringify(val)); } catch { /* noop */ }
}
function restore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`studio:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

const ALL_MODELS: Array<{ id: string; label: string; provider: string }> = [
  { id: "auto", label: "Auto", provider: "Smart Routing" },
  { id: "claude-opus-4-6", label: "Opus 4.6", provider: "Claude" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", provider: "Claude" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", provider: "Claude" },
  { id: "o3", label: "o3", provider: "Codex" },
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { id: "gemini-2.0-flash", label: "2.0 Flash", provider: "Gemini" },
  { id: "amp-default", label: "Default", provider: "Amp" },
];

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

export default function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();

  const isHome = location.pathname === "/" || location.pathname === "/sessions";

  const [boardView, setBoardView] = useState(true);
  const [termOpen, setTermOpen] = useState(() => restore("termOpen", false));
  const [termBig, setTermBig] = useState(false);
  const [activeTab, setActiveTab] = useState<"TERMINAL" | "OUTPUT">("TERMINAL");
  const [selectedModel, setSelectedModel] = useState(() => restore("selectedModel", "claude-sonnet-4-6"));
  const [thinking, setThinking] = useState(() => restore("thinking", false));
  const [planMode, setPlanMode] = useState(() => restore("planMode", false));
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    () => localStorage.getItem("studio_active_session_id") ?? null
  );

  const [streamText, setStreamText] = useState("");
  const [streamingState, setStreamingState] = useState<StreamingState | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [chatHasMessages, setChatHasMessages] = useState(false);
  const [contextPercent, setContextPercent] = useState<number | null>(null);
  const [terminalCwd, setTerminalCwd] = useState("");
  const [sessionError, setSessionError] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [driftDismissed, setDriftDismissed] = useState<boolean>(isDismissed);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<"commands" | "files">("files");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: string }>>([]);

  const onDiffShouldOpen = useCallback(() => setDiffOpen(true), []);
  const { info, git, drift, changedFiles, refreshGit } = useProjectInfo(streaming, onDiffShouldOpen);

  useKeyboardNav({ navigate, setCmdOpen, setPaletteMode, shortcutsOpen, setShortcutsOpen, setTermOpen, setSidebarOpen: () => {} });

  useEffect(() => { persist("termOpen", termOpen); }, [termOpen]);
  useEffect(() => { persist("selectedModel", selectedModel); }, [selectedModel]);
  useEffect(() => { persist("thinking", thinking); }, [thinking]);
  useEffect(() => { persist("planMode", planMode); }, [planMode]);
  useEffect(() => {
    if (activeSessionId) localStorage.setItem("studio_active_session_id", activeSessionId);
    else localStorage.removeItem("studio_active_session_id");
  }, [activeSessionId]);

  // Session restore / create on mount
  const sessionValidated = useRef(false);
  const sessionRetryCount = useRef(0);
  useEffect(() => {
    if (activeSessionId && !sessionValidated.current) {
      sessionValidated.current = true;
      sessionRetryCount.current = 0;
      setSessionError(false);
      fetch(`/api/sessions/${activeSessionId}`)
        .then((r) => { if (!r.ok) { setActiveSessionId(null); return; } return r.json(); })
        .then((data: { messages?: unknown[] } | undefined) => {
          if (data?.messages && data.messages.length > 0) setChatHasMessages(true);
        })
        .catch(() => setActiveSessionId(null));
      return;
    }

    if (!activeSessionId) {
      sessionValidated.current = false;
      setSessionError(false);
      const attemptCreate = () => {
        createSession()
          .then((id) => { sessionValidated.current = true; sessionRetryCount.current = 0; setActiveSessionId(id); })
          .catch(() => {
            sessionRetryCount.current += 1;
            if (sessionRetryCount.current < 3) setTimeout(attemptCreate, 2000);
            else { sessionRetryCount.current = 0; setSessionError(true); }
          });
      };
      attemptCreate();
    }
  }, [activeSessionId]);

  // Session switching
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) { sessionValidated.current = false; setChatHasMessages(true); setActiveSessionId(id); }
    };
    window.addEventListener("studio:switch-session", handler);
    return () => window.removeEventListener("studio:switch-session", handler);
  }, []);

  // Mission board navigation
  useEffect(() => {
    const openHandler = (e: Event) => {
      const { sessionId } = (e as CustomEvent<{ sessionId: string }>).detail;
      sessionValidated.current = false;
      setChatHasMessages(true);
      setActiveSessionId(sessionId);
      setBoardView(false);
    };
    const backHandler = () => setBoardView(true);
    window.addEventListener("studio:open-mission", openHandler);
    window.addEventListener("studio:back-to-board", backHandler);
    return () => {
      window.removeEventListener("studio:open-mission", openHandler);
      window.removeEventListener("studio:back-to-board", backHandler);
    };
  }, []);

  // Emit streaming state to board
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("studio:streaming-change", {
      detail: { streaming, sessionId: activeSessionId },
    }));
  }, [streaming, activeSessionId]);

  // Navigation events
  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (typeof path === "string") navigate(path);
    };
    window.addEventListener("studio:navigate", handler);
    return () => window.removeEventListener("studio:navigate", handler);
  }, [navigate]);

  // Toast listener
  useEffect(() => {
    const handler = (e: Event) => {
      const { message, type } = (e as CustomEvent<{ message: string; type?: string }>).detail;
      const id = Date.now().toString();
      setToasts((prev) => [...prev, { id, message, type: type || "info" }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    };
    window.addEventListener("studio:toast", handler);
    return () => window.removeEventListener("studio:toast", handler);
  }, []);

  // Agent nav events
  useEffect(() => {
    const openHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const id = typeof detail === "string" ? detail : detail?.id;
      if (id && !location.pathname.startsWith("/agents")) navigate(`/agents?agent=${id}`);
    };
    const runHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const id = typeof detail === "string" ? detail : detail?.id;
      if (id) navigate(`/run?agent=${id}`);
    };
    window.addEventListener("studio:open-agent", openHandler);
    window.addEventListener("studio:run-agent", runHandler);
    return () => { window.removeEventListener("studio:open-agent", openHandler); window.removeEventListener("studio:run-agent", runHandler); };
  }, [navigate, location.pathname]);

  const handleNewSession = useCallback(() => {
    setChatHasMessages(false);
    createSession().then(setActiveSessionId).catch(() => {
      window.dispatchEvent(new CustomEvent("studio:toast", { detail: { message: "Failed to create session", type: "error" } }));
    });
  }, []);

  // Global studio events
  useEffect(() => {
    const handlers: Array<[string, () => void]> = [
      ["studio:toggle-thinking", () => setThinking((v) => !v)],
      ["studio:toggle-plan", () => setPlanMode((v) => !v)],
      ["studio:toggle-sidebar", () => {}],
      ["studio:toggle-terminal", () => setTermOpen((v) => !v)],
      ["studio:refresh-git", refreshGit],
      ["studio:open-diff", () => setDiffOpen(true)],
      ["studio:new-session", handleNewSession],
      ["studio:toggle-theme", toggleTheme],
    ];
    handlers.forEach(([event, handler]) => window.addEventListener(event, handler));
    return () => handlers.forEach(([event, handler]) => window.removeEventListener(event, handler));
  }, [refreshGit, handleNewSession, toggleTheme]);

  // Plan mode
  useEffect(() => {
    const approve = () => { setPlanMode(false); window.dispatchEvent(new CustomEvent("studio:toast", { detail: { message: "Plan approved -- executing...", type: "success" } })); };
    const deny = () => { window.dispatchEvent(new CustomEvent("studio:toast", { detail: { message: "Plan denied", type: "info" } })); };
    window.addEventListener("studio:plan-approve", approve);
    window.addEventListener("studio:plan-deny", deny);
    return () => { window.removeEventListener("studio:plan-approve", approve); window.removeEventListener("studio:plan-deny", deny); };
  }, []);

  // Notification permission
  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "default") return;
    const handler = () => { Notification.requestPermission().catch(() => {}); };
    window.addEventListener("click", handler, { capture: true, once: true });
    return () => window.removeEventListener("click", handler, { capture: true });
  }, []);

  // Dock badge
  const unreadCount = useRef(0);
  useEffect(() => {
    const unsub = window.studio?.onWindowFocus?.(() => { unreadCount.current = 0; window.studio?.setDockBadge?.(""); });
    return () => { unsub?.(); };
  }, []);

  // Post-stream: context + notification
  const prevStreaming = useRef(streaming);
  useEffect(() => {
    const wasStreaming = prevStreaming.current;
    prevStreaming.current = streaming;
    if (wasStreaming && !streaming) {
      setChatHasMessages(true);
      if (document.visibilityState !== "visible") {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("hashmark studio", { body: "Agent finished working", icon: "/assets/icon.png" });
        }
        unreadCount.current += 1;
        window.studio?.setDockBadge?.(String(unreadCount.current));
      }
      if (activeSessionId) {
        fetch(`/api/sessions/${activeSessionId}/tokens`)
          .then((r) => r.json())
          .then((data: { pct?: number }) => { if (typeof data.pct === "number") setContextPercent(data.pct); })
          .catch(() => {});
      }
    }
  }, [streaming, activeSessionId]);

  // Settings sync
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

  // Native menu
  useEffect(() => {
    if (typeof window.studio?.onMenu !== "function") return;
    const dispatch = (name: string, detail?: unknown) =>
      window.dispatchEvent(new CustomEvent(name, detail !== undefined ? { detail } : undefined));
    const subs = [
      window.studio.onMenu("menu:navigate", (p: unknown) => { if (typeof p === "string") navigate(p); }),
      window.studio.onMenu("menu:new-session", () => handleNewSession()),
      window.studio.onMenu("menu:toggle-terminal", () => setTermOpen((v) => !v)),
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
      window.studio.onMenu("menu:find", () => setCmdOpen(true)),
      window.studio.onMenu("menu:about", () => setAboutOpen(true)),
      window.studio.onMenu("deep-link:navigate", (p: unknown) => { if (typeof p === "string") navigate(p); }),
      window.studio.onMenu("deep-link:open-project", (dir: unknown) => {
        if (typeof dir === "string") window.studio?.setProjectDir?.(dir);
      }),
    ];
    return () => subs.forEach((unsub) => unsub?.());
  }, [navigate, handleNewSession]);

  const currentModelEntry = ALL_MODELS.find((m) => m.id === selectedModel);
  const modelLabel = currentModelEntry?.label ?? "Sonnet 4.6";

  const handleSessionSelect = useCallback((id: string) => {
    sessionValidated.current = false;
    setChatHasMessages(true);
    setActiveSessionId(id);
  }, []);

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

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <Rail />

        {/* Mission board: full canvas, no sidepanels */}
        {isHome && boardView && (
          <ErrorBoundary>
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0 }}>
              <Outlet />
            </div>
          </ErrorBoundary>
        )}

        {/* Mission canvas: sessions panel + chat */}
        {isHome && !boardView && (
          <>
            <SessionsPanel
              activeSessionId={activeSessionId}
              onSessionSelect={handleSessionSelect}
              onNewSession={handleNewSession}
              streaming={streaming}
              streamingSessionId={streaming ? activeSessionId : null}
            />

            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
              {/* Back to board breadcrumb */}
              <div style={{
                height: 34, borderBottom: "0.5px solid var(--border-dim)",
                display: "flex", alignItems: "center", padding: "0 14px", flexShrink: 0,
                background: "var(--bg)",
              }}>
                <button
                  onClick={() => setBoardView(true)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontFamily: "var(--font)", fontSize: 10, color: "var(--text-dimmer)",
                    display: "flex", alignItems: "center", gap: 6,
                    letterSpacing: "0.04em", padding: 0,
                  }}
                >
                  ← missions
                </button>
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
                {sessionError && (
                  <div style={{ padding: 20, textAlign: "center", color: "var(--red)" }}>
                    <div>Failed to create session</div>
                    <button
                      onClick={() => { setSessionError(false); sessionRetryCount.current = 0; handleNewSession(); }}
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
                  onSessionCreated={setActiveSessionId}
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

      {toasts.length > 0 && (
        <div style={{ position: "fixed", bottom: 30, right: 12, zIndex: 9999, display: "flex", flexDirection: "column", gap: 6 }}>
          {toasts.map((t) => (
            <div key={t.id} style={{
              padding: "8px 16px", borderRadius: "var(--radius)", fontSize: 12,
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
