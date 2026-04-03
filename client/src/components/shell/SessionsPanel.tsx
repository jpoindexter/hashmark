import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import ContextMenu, { type ContextMenuItem } from "../shared/ContextMenu";
import ConfirmDialog from "../shared/ConfirmDialog";
import { fetchApi } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { useMultiSelect } from "../../hooks/useMultiSelect";

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
  git?: { branch: string; files: { status: string }[] } | null;
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
  git,
}: SessionsPanelProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [ctxMenu, setCtxMenu] = useState<CtxState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ChatSession | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
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

  const sessionIds = sessions.map(s => s.id);
  const sel = useMultiSelect(sessionIds);

  const bulkDelete = useCallback(async () => {
    const ids = Array.from(sel.selected);
    if (ids.length === 0) return;
    for (const id of ids) {
      try { await deleteSession(id); } catch { /* ignore */ }
    }
    sel.clear();
    setConfirmBulkDelete(false);
    fetchSessions();
  }, [sel, fetchSessions]);

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
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "var(--sidebar-background)",
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
      {git && (
        <div style={{
          padding: "6px 14px",
          fontSize: 10,
          fontFamily: "var(--font)",
          color: "var(--text-dimmer)",
          borderBottom: "0.5px solid var(--border-dim)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
        }}>
          <span style={{ color: "var(--accent)" }}>{git.branch}</span>
          {git.files?.length > 0 && (
            <span style={{ color: "var(--yellow)" }}>{git.files.length} changed</span>
          )}
        </div>
      )}
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
              onClick={(e) => {
                if (isRenaming) return;
                sel.handleClick(s.id, e);
                if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
                  onSessionSelect(s.id);
                }
              }}
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
                borderLeft: active ? "2px solid var(--accent)" : sel.selected.has(s.id) ? "2px solid var(--blue)" : "2px solid transparent",
                background: active ? "var(--bg-2)" : sel.selected.has(s.id) ? "var(--bg-3)" : "transparent",
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

      {sel.selected.size > 0 && (
        <div style={{
          padding: "6px 10px",
          borderTop: "1px solid var(--border-dim)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10,
          fontFamily: "var(--font)",
          color: "var(--text-dimmer)",
          flexShrink: 0,
        }}>
          <span>{sel.selected.size} selected</span>
          <button className="btn btn-sm" onClick={() => setConfirmBulkDelete(true)} style={{ fontSize: 10, color: "var(--red)" }}>Delete</button>
          <button className="btn btn-sm" onClick={() => sel.clear()} style={{ fontSize: 10 }}>Clear</button>
        </div>
      )}

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

      {confirmBulkDelete && (
        <ConfirmDialog
          open={true}
          title={`Delete ${sel.selected.size} sessions`}
          message={`Delete ${sel.selected.size} sessions? This can't be undone.`}
          confirmLabel="Delete All"
          danger
          onConfirm={() => void bulkDelete()}
          onCancel={() => setConfirmBulkDelete(false)}
        />
      )}
    </div>
  );
}
