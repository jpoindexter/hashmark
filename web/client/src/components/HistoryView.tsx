import type { Session } from "../types";

export interface ClaudeSession {
  sessionId: string;
  title: string;
  msgCount: number;
  lastActivity: number;
  model: string;
}

function fmt(ts: number): string {
  const d = new Date(ts);
  const diffH = (Date.now() - d.getTime()) / 3600000;
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  if (diffH < 48) return "yesterday";
  return d.toLocaleDateString();
}

export function HistoryView({
  sessions,
  claudeHistory,
  claudeHistoryLoading,
  onResume,
  onOpen,
}: {
  sessions: Session[];
  claudeHistory: ClaudeSession[];
  claudeHistoryLoading: boolean;
  onResume: (s: ClaudeSession) => void;
  onOpen: (id: string) => void;
}) {
  const existingClaudeIds = new Set(
    sessions.map(s => (s as Session & { claude_session_id?: string }).claude_session_id).filter(Boolean)
  );
  const newNative = claudeHistory.filter(s => !existingClaudeIds.has(s.sessionId));

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Hashmark sessions */}
      <div style={{ flex: 1, overflow: "auto", borderRight: "1px solid var(--border)" }}>
        <div style={{ padding: "10px 16px 6px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
          This workspace — all providers
        </div>
        {sessions.length === 0 && (
          <div style={{ padding: "16px", fontSize: 12, color: "var(--text-muted)" }}>No sessions yet</div>
        )}
        {sessions.map(s => (
          <div
            key={s.id}
            onClick={() => onOpen(s.id)}
            style={{ padding: "10px 16px", cursor: "pointer", borderBottom: "1px solid var(--border)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <div style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 8 }}>
              <span>{s.provider}</span>
              <span>{s.model}</span>
              <span>{fmt(s.updated_at)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Claude Code native sessions */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ padding: "10px 16px 6px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
          Claude Code CLI — native sessions
        </div>
        {claudeHistoryLoading && (
          <div style={{ padding: "16px", fontSize: 12, color: "var(--text-muted)" }}>Loading...</div>
        )}
        {!claudeHistoryLoading && claudeHistory.length === 0 && (
          <div style={{ padding: "16px", fontSize: 12, color: "var(--text-muted)" }}>
            <div>No Claude Code sessions found.</div>
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-dim)" }}>Sessions appear here after you run Claude Code in a project.</div>
          </div>
        )}
        {newNative.map(s => (
          <div
            key={s.sessionId}
            onClick={() => onResume(s)}
            style={{ padding: "10px 16px", cursor: "pointer", borderBottom: "1px solid var(--border)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <div style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 8 }}>
              <span>{s.msgCount} msgs</span>
              {s.model && <span>{s.model}</span>}
              <span>{fmt(s.lastActivity)}</span>
              <span style={{ color: "var(--accent)", marginLeft: "auto" }}>Resume →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
