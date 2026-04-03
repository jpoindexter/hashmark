import { useState, useEffect, useCallback, useRef } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "../components/Toasts";

async function createSession(): Promise<string> {
  const r = await fetchApi("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const d: { session: { id: string } } = await r.json();
  return d.session.id;
}

export function useSessionManager() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const [chatHasMessages, setChatHasMessages] = useState(false);
  const initialized = useRef(false);

  // Persist active session
  useEffect(() => {
    if (activeSessionId) localStorage.setItem("studio_active_session_id", activeSessionId);
  }, [activeSessionId]);

  // One-time init: restore saved session or pick most recent
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const savedId = localStorage.getItem("studio_active_session_id");

    if (savedId) {
      // Validate the saved session still exists (suppress 404 console noise)
      fetchApi(`/api/sessions/${savedId}`)
        .then((r) => {
          if (r.ok) {
            setActiveSessionId(savedId);
            return r.json().then((data: { messages?: unknown[] }) => {
              if (data?.messages && data.messages.length > 0) setChatHasMessages(true);
            });
          }
          // Saved session gone -- clear stale reference, pick most recent
          localStorage.removeItem("studio_active_session_id");
          return pickMostRecent();
        })
        .catch(() => {
          localStorage.removeItem("studio_active_session_id");
          pickMostRecent();
        });
    } else {
      pickMostRecent();
    }

    function pickMostRecent() {
      fetchApi("/api/sessions")
        .then((r) => r.json())
        .then((d: { sessions?: { id: string; message_count: number }[] }) => {
          const recent = d.sessions?.[0];
          if (recent) {
            setActiveSessionId(recent.id);
            if (recent.message_count > 0) setChatHasMessages(true);
          }
          // No sessions at all -- don't auto-create, let user click +
        })
        .catch(() => {});
    }
  }, []);

  // Session switching via custom event
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) { setChatHasMessages(true); setActiveSessionId(id); }
    };
    window.addEventListener("studio:switch-session", handler);
    return () => window.removeEventListener("studio:switch-session", handler);
  }, []);

  const handleNewSession = useCallback(() => {
    setChatHasMessages(false);
    createSession().then((id) => {
      setActiveSessionId(id);
      setChatHasMessages(true);
    }).catch(() => {
      toast.error("Failed to create session");
    });
  }, []);

  const handleSessionSelect = useCallback((id: string) => {
    setChatHasMessages(true);
    setActiveSessionId(id);
  }, []);

  const handleRetry = useCallback(() => {
    setSessionError(false);
    handleNewSession();
  }, [handleNewSession]);

  return {
    activeSessionId,
    setActiveSessionId,
    sessionError,
    chatHasMessages,
    setChatHasMessages,
    handleNewSession,
    handleSessionSelect,
    handleRetry,
  };
}
