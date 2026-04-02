import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import ContextMenu, { type ContextMenuItem } from "../shared/ContextMenu";
import ConfirmDialog from "../shared/ConfirmDialog";
import { fetchApi } from "../../lib/api";
import { timeAgo } from "../../lib/format";

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

interface CtxState {
  items: ContextMenuItem[];
  position: { x: number; y: number };
}

const AGENT_COLORS = ["var(--accent)", "var(--blue)", "var(--yellow)", "var(--purple)"];

async function renameSession(id: string, title: string) {
  await fetchApi(`/api/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

async function deleteSession(id: string) {
  await fetchApi(`/api/sessions/${id}`, { method: "DELETE" });
}

async function archiveSession(id: string) {
  await fetchApi(`/api/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived: true }),
  });
}

export default function SessionsPanel({
  activeSessionId,
  onSessionSelect,
  onNewSession,
  streaming,
  streamingSessionId,
}: SessionsPanelProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [ctxMenu, setCtxMenu] = useState<CtxState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ChatSession | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  const fetchSessions = useCallback(() => {
    fetchApi("/api/sessions")
      .then((r) => r.json())
      .then((d: { sessions?: ChatSession[] }) => setSessions(d.sessions ?? []))
      .catch(() => {});
  }, []);

  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  useEffect(() => {
    const h = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);

  useEffect(() => {
    fetchSessions();
    if (!visible) return;
    const id = setInterval(fetchSessions, 10000);
    return () => clearInterval(id);
  }, [fetchSessions, visible]);

  useEffect(() => {
    if (!streaming) fetchSessions();
  }, [streaming, fetchSessions]);

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  const handleContextMenu = useCallback((e: React.MouseEvent, session: ChatSession) => {
    e.preventDefault();
    e.stopPropagation();
    const items: ContextMenuItem[] = [
      {
        label: "Rename",
        onClick: () => { setRenameValue(session.title || ""); setRenaming(session.id); },
      },
      {
        label: "Archive",
        onClick: () => archiveSession(session.id).then(fetchSessions).catch(() => {}),
      },
      { label: "", onClick: () => {}, separator: true },
      {
        label: "Delete",
        danger: true,
        onClick: () => setConfirmDelete(session),
      },
    ];
    setCtxMenu({ items, position: { x: e.clientX, y: e.clientY } });
  }, [fetchSessions]);

  const commitRename = useCallback(() => {
    if (!renaming) return;
    const trimmed = renameValue.trim();
    if (trimmed) renameSession(renaming, trimmed).then(fetchSessions).catch(() => {});
    setRenaming(null);
  }, [renaming, renameValue, fetchSessions]);

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

  return (
    <div style={panel}>
      <div style={hdr}>
        <span className="label">sessions</span>
        <button
          aria-label="New session"
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
            <div style={{ fontFamily: "var(--font)", fontSize: 12, color: "var(--text-dimmer)" }}>
              — no active session —
            </div>
          </div>
        )}

        {sessions.map((s, i) => {
          const active = s.id === activeSessionId;
          const isStreaming = s.id === streamingSessionId && streaming;
          const dotCount = Math.min(Math.max(s.message_count || 1, 1), 4);
          const isRenaming = renaming === s.id;

          return (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              aria-current={active ? "true" : undefined}
              aria-label={s.title || `session ${i + 1}`}
              onClick={() => !isRenaming && onSessionSelect(s.id)}
              onKeyDown={(e) => {
                if (!isRenaming && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onSessionSelect(s.id);
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, s)}
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
              {isRenaming ? (
                <input
                  ref={renameRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenaming(null);
                    e.stopPropagation();
                  }}
                  style={{
                    fontFamily: "var(--font)", fontSize: 12,
                    color: "var(--text)", background: "var(--bg-4)",
                    border: "1px solid var(--accent)", borderRadius: "var(--radius-sm)",
                    padding: "1px 4px", outline: "none", width: "100%",
                  }}
                />
              ) : (
                <div style={{
                  fontFamily: "var(--font)", fontSize: 12,
                  color: active ? "var(--text)" : "var(--text-dim)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {s.title || `session ${i + 1}`}
                </div>
              )}

              <div style={{
                fontSize: 10, color: "var(--text-dimmer)",
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: "var(--font)",
              }}>
                <div style={{ display: "flex", gap: 3 }}>
                  {Array.from({ length: dotCount }).map((_, di) => (
                    <div
                      key={di}
                      style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: AGENT_COLORS[di % AGENT_COLORS.length],
                        opacity: isStreaming ? 1 : 0.5,
                        animation: isStreaming && di === 0 ? "pdot 1.5s ease-in-out infinite" : "none",
                      }}
                    />
                  ))}
                </div>
                {isStreaming ? "running" : timeAgo(s.updated_at * 1000)}
              </div>
            </div>
          );
        })}
      </div>

      <ContextMenu
        items={ctxMenu?.items ?? []}
        position={ctxMenu?.position ?? null}
        onClose={() => setCtxMenu(null)}
      />

      {confirmDelete && (
        <ConfirmDialog
          open={true}
          title="Delete session"
          message={`Delete "${confirmDelete.title || "this session"}"? This can't be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            deleteSession(confirmDelete.id).then(fetchSessions).catch(() => {});
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
