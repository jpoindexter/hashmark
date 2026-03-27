import { useState, useEffect, useCallback, type CSSProperties } from "react";

interface ChatSession {
  id: string;
  title: string;
  message_count: number;
  updated_at: number;
}

interface SessionsPanelProps {
  activeSessionId: string | null;
  onSessionSelect: (id: string) => void;
  onNewSession: () => void;
  streaming: boolean;
  streamingSessionId: string | null;
}

const AGENT_COLORS = ["var(--accent)", "var(--blue)", "var(--yellow)", "#c084fc"];

function timeAgo(ts: number): string {
  const diff = Date.now() - ts * 1000;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function SessionsPanel({
  activeSessionId,
  onSessionSelect,
  onNewSession,
  streaming,
  streamingSessionId,
}: SessionsPanelProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  const fetchSessions = useCallback(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((d: { sessions?: ChatSession[] }) => setSessions(d.sessions ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchSessions();
    const id = setInterval(fetchSessions, 10000);
    return () => clearInterval(id);
  }, [fetchSessions]);

  useEffect(() => {
    if (!streaming) fetchSessions();
  }, [streaming, fetchSessions]);

  const panel: CSSProperties = {
    width: 196,
    borderRight: "0.5px solid var(--border-dim)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    overflow: "hidden",
    background: "var(--bg)",
  };

  const hdr: CSSProperties = {
    padding: "11px 14px 8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "0.5px solid var(--border-dim)",
    flexShrink: 0,
  };

  const lbl: CSSProperties = {
    fontFamily: "var(--font)",
    fontSize: 10,
    color: "var(--text-dimmer)",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };

  return (
    <div style={panel}>
      <div style={hdr}>
        <span style={lbl}>sessions</span>
        <button
          onClick={onNewSession}
          style={{
            fontSize: 16, color: "var(--text-dimmer)",
            cursor: "pointer", background: "none", border: "none",
            lineHeight: 1, padding: 0, fontFamily: "var(--font)",
          }}
          className="rail-item"
        >
          +
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {sessions.length === 0 && (
          <div style={{ padding: "9px 14px", borderBottom: "0.5px solid var(--border-dim)" }}>
            <div style={{
              fontFamily: "var(--font)", fontSize: 12,
              color: "var(--text-dimmer)",
            }}>
              — no active session —
            </div>
          </div>
        )}

        {sessions.map((s, i) => {
          const active = s.id === activeSessionId;
          const isStreaming = s.id === streamingSessionId && streaming;
          const dotCount = Math.min(Math.max(s.message_count || 1, 1), 4);

          return (
            <div
              key={s.id}
              onClick={() => onSessionSelect(s.id)}
              style={{
                padding: "9px 14px",
                paddingLeft: active ? 12 : 14,
                cursor: "pointer",
                borderBottom: "0.5px solid var(--border-dim)",
                borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                background: active ? "var(--bg-2)" : "transparent",
                display: "flex",
                flexDirection: "column",
                gap: 3,
                transition: "background 0.1s",
              }}
            >
              <div style={{
                fontFamily: "var(--font)",
                fontSize: 12,
                color: active ? "var(--text)" : "var(--text-dim)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {s.title || `session ${i + 1}`}
              </div>
              <div style={{
                fontSize: 10,
                color: "var(--text-dimmer)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "var(--font)",
              }}>
                <div style={{ display: "flex", gap: 3 }}>
                  {Array.from({ length: dotCount }).map((_, di) => (
                    <div
                      key={di}
                      style={{
                        width: 5, height: 5,
                        borderRadius: "50%",
                        background: AGENT_COLORS[di % AGENT_COLORS.length],
                        opacity: isStreaming ? 1 : 0.5,
                        animation: isStreaming && di === 0 ? "pdot 1.5s ease-in-out infinite" : "none",
                      }}
                    />
                  ))}
                </div>
                {isStreaming ? "running" : timeAgo(s.updated_at)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
