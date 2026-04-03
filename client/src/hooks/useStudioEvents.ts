import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "../components/Toasts";
import { fetchApi } from "../lib/api";

interface UseStudioEventsParams {
  streaming: boolean;
  activeSessionId: string | null;
  setChatHasMessages: (v: boolean) => void;
  setContextPercent: (v: number | null) => void;
  setThinking: React.Dispatch<React.SetStateAction<boolean>>;
  setPlanMode: React.Dispatch<React.SetStateAction<boolean>>;
  setTermOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  setCmdOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPaletteMode: React.Dispatch<React.SetStateAction<"commands" | "files">>;
  setAboutOpen: React.Dispatch<React.SetStateAction<boolean>>;
  refreshGit: () => void;
  handleNewSession: () => void;
  toggleTheme: () => void;
}

export function useStudioEvents({
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
}: UseStudioEventsParams) {
  const navigate = useNavigate();
  const location = useLocation();

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

  // Bridge studio:toast custom events into the unified ToastContainer
  useEffect(() => {
    const handler = (e: Event) => {
      const { message, type } = (e as CustomEvent<{ message: string; type?: string }>).detail;
      const variant = type === "error" ? "error" : type === "success" ? "success" : type === "warning" ? "warning" : "info";
      toast(message, { variant });
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

  // Global studio events
  useEffect(() => {
    const handlers: Array<[string, () => void]> = [
      ["studio:toggle-thinking", () => setThinking((v) => !v)],
      ["studio:toggle-plan", () => setPlanMode((v) => !v)],
      ["studio:toggle-sidebar", () => {}],
      ["studio:toggle-terminal", () => setTermOpen((v) => !v)],
      ["studio:refresh-git", refreshGit],
      ["studio:open-diff", () => {}], // handled externally
      ["studio:new-session", handleNewSession],
      ["studio:toggle-theme", toggleTheme],
    ];
    handlers.forEach(([event, handler]) => window.addEventListener(event, handler));
    return () => handlers.forEach(([event, handler]) => window.removeEventListener(event, handler));
  }, [refreshGit, handleNewSession, toggleTheme, setThinking, setPlanMode, setTermOpen]);

  // Plan mode
  useEffect(() => {
    const approve = () => { setPlanMode(false); toast.success("Plan approved -- executing..."); };
    const deny = () => { toast.info("Plan denied"); };
    window.addEventListener("studio:plan-approve", approve);
    window.addEventListener("studio:plan-deny", deny);
    return () => { window.removeEventListener("studio:plan-approve", approve); window.removeEventListener("studio:plan-deny", deny); };
  }, [setPlanMode]);

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
        fetchApi(`/api/sessions/${activeSessionId}/tokens`)
          .then((r) => r.json())
          .then((data: { pct?: number }) => { if (typeof data.pct === "number") setContextPercent(data.pct); })
          .catch(() => {});
      }
    }
  }, [streaming, activeSessionId, setChatHasMessages, setContextPercent]);

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
  }, [setSelectedModel, setThinking, setPlanMode]);

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
      window.studio.onMenu("menu:start-agent", () => navigate("/agents")),
      window.studio.onMenu("menu:stop-agent", () => dispatch("studio:stop-agent")),
      window.studio.onMenu("menu:find", () => setCmdOpen(true)),
      window.studio.onMenu("menu:about", () => setAboutOpen(true)),
      window.studio.onMenu("deep-link:navigate", (p: unknown) => { if (typeof p === "string") navigate(p); }),
      window.studio.onMenu("deep-link:open-project", (dir: unknown) => {
        if (typeof dir === "string") window.studio?.setProjectDir?.(dir);
      }),
    ];
    return () => subs.forEach((unsub) => unsub?.());
  }, [navigate, handleNewSession, setTermOpen, setCmdOpen, setPaletteMode, setAboutOpen]);
}
