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
  const [boardView, setBoardView] = useState(true);

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

  // Session switching via custom event
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
    boardView,
    setBoardView,
    handleNewSession,
    handleSessionSelect,
    handleRetry,
  };
}
