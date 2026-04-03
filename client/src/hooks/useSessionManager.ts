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
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    () => localStorage.getItem("studio_active_session_id") ?? null
  );
  const [sessionError, setSessionError] = useState(false);
  const [chatHasMessages, setChatHasMessages] = useState(false);

  // Persist active session
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
      fetchApi(`/api/sessions/${activeSessionId}`)
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
      // Try to select the most recent session before creating a new one
      fetchApi("/api/sessions?limit=1")
        .then((r) => r.json())
        .then((d: { sessions?: { id: string; message_count: number }[] }) => {
          const recent = d.sessions?.[0];
          if (recent) {
            sessionValidated.current = true;
            setActiveSessionId(recent.id);
            if (recent.message_count > 0) setChatHasMessages(true);
          } else {
            createSession()
              .then((id) => { sessionValidated.current = true; setActiveSessionId(id); })
              .catch(() => setSessionError(true));
          }
        })
        .catch(() => {
          createSession()
            .then((id) => { sessionValidated.current = true; setActiveSessionId(id); })
            .catch(() => setSessionError(true));
        });
    }
  }, [activeSessionId]);

  // Session switching via custom event
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) { sessionValidated.current = false; setChatHasMessages(true); setActiveSessionId(id); }
    };
    window.addEventListener("studio:switch-session", handler);
    return () => window.removeEventListener("studio:switch-session", handler);
  }, []);

  const handleNewSession = useCallback(() => {
    setChatHasMessages(false);
    createSession().then(setActiveSessionId).catch(() => {
      toast.error("Failed to create session");
    });
  }, []);

  const handleSessionSelect = useCallback((id: string) => {
    sessionValidated.current = false;
    setChatHasMessages(true);
    setActiveSessionId(id);
  }, []);

  const handleRetry = useCallback(() => {
    setSessionError(false);
    sessionRetryCount.current = 0;
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
