import { useRef, useState, useEffect } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";
import type { Session } from "../types";

type PendingDelete = { id: string; title: string; timer: ReturnType<typeof setTimeout> };

interface SessionTabBarProps {
  sessions: Session[];
  activeIds: string[];
  renamingId: string | null;
  pendingDelete: PendingDelete | null;
  setSessions: (fn: (prev: Session[]) => Session[]) => void;
  setActiveIds: (fn: (prev: string[]) => string[]) => void;
  setRenamingId: (id: string | null) => void;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onUndoDelete: () => void;
  onRenameSession: (id: string, title: string) => void;
  onPalette: () => void;
}

export function SessionTabBar({
  sessions, activeIds, renamingId, pendingDelete,
  setSessions, setActiveIds, setRenamingId,
  onNewSession, onSelectSession, onDeleteSession, onUndoDelete, onRenameSession, onPalette,
}: SessionTabBarProps) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Scroll active tab into view
  useEffect(() => {
    if (!scrollRef.current || activeIds.length === 0) return;
    const activeTab = scrollRef.current.querySelector(".session-tab.active") as HTMLElement | null;
    activeTab?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [activeIds]);

  const ctxSession = ctxMenu ? sessions.find(s => s.id === ctxMenu.id) : null;

  return (
    <>
      <div className="session-tab-bar">
        {/* Logo mark */}
        <div className="tab-logo" title="hashmark">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 2v10M7 2v10M11 2v10M1 5h12M1 9h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>

        {/* Undo-delete notice */}
        {pendingDelete && (
          <div className="tab-undo-notice">
            <span>Deleted "{pendingDelete.title}"</span>
            <button onClick={onUndoDelete}>Undo</button>
          </div>
        )}

        {/* Import hidden input */}
        <input
          ref={importRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const text = await file.text();
              const data = JSON.parse(text) as unknown;
              const imported = await fetchApi<Session>("/api/sessions/import", { method: "POST", body: JSON.stringify(data) });
              setSessions(prev => [imported, ...prev]);
              setActiveIds(() => [imported.id]);
              toast("Session imported");
            } catch {
              toast("Failed to import session");
            } finally {
              e.target.value = "";
            }
          }}
        />

        {/* Scrollable tabs */}
        <div className="session-tabs-scroll" ref={scrollRef}>
          {sessions.length === 0 && (
            <div style={{ padding: "0 12px", fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center" }}>
              No sessions
            </div>
          )}
          {(() => {
            const distinctProjects = new Set(sessions.map(s => s.project_dir ?? ""));
            const multiProject = distinctProjects.size > 1;
            const groups: Array<{ key: string; label: string; sessions: Session[] }> = [];
            for (const dir of distinctProjects) {
              const label = dir ? dir.split("/").filter(Boolean).pop() ?? dir : "";
              groups.push({ key: dir, label, sessions: sessions.filter(s => (s.project_dir ?? "") === dir) });
            }
            return groups.flatMap(({ key, label, sessions: groupSessions }) => [
              ...(multiProject ? [
                <div key={`group-${key}`} style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 6px", flexShrink: 0, borderRight: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap", userSelect: "none" }}>{label || "—"}</span>
                </div>,
              ] : []),
              ...groupSessions.map(s => (
                <div
                  key={s.id}
                  className={`session-tab${activeIds.includes(s.id) ? " active" : ""}${s.status === "running" ? " running" : ""}`}
                  onClick={() => onSelectSession(s.id)}
                  onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, id: s.id }); }}
                  onDoubleClick={e => { e.preventDefault(); setRenamingId(s.id); }}
                >
                  <span className={`session-status-dot ${s.status === "running" ? "running" : "idle"}`} style={{ marginTop: 0 }} />
                  {renamingId === s.id ? (
                    <input
                      autoFocus
                      defaultValue={s.title}
                      className="session-tab-rename"
                      onClick={e => e.stopPropagation()}
                      onBlur={e => void onRenameSession(s.id, e.target.value)}
                      onKeyDown={e => {
                        e.stopPropagation();
                        if (e.key === "Enter") void onRenameSession(s.id, e.currentTarget.value);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                    />
                  ) : (
                    <span className="session-tab-title">{s.title}</span>
                  )}
                  {s.pinned && (
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="var(--text-muted)" style={{ flexShrink: 0, opacity: 0.5 }}>
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  )}
                  <button
                    className="session-tab-close"
                    onClick={e => { e.stopPropagation(); onDeleteSession(s.id); }}
                    title="Close"
                  >×</button>
                </div>
              )),
            ]);
          })()}
        </div>

        {/* Actions at right */}
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0, borderLeft: "1px solid var(--border)" }}>
          <button
            className="tab-action-btn"
            onClick={onPalette}
            title="Command palette (⌘K)"
            style={{ gap: 3, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.01em", paddingInline: 10, width: "auto" }}
          >
            <span>⌘K</span>
          </button>
          <button
            className="tab-action-btn"
            onClick={() => importRef.current?.click()}
            title="Import session"
            style={{ borderLeft: "1px solid var(--border)" }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 8v2.5h10V8M6 1v6.5M3.5 5L6 7.5 8.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="tab-action-btn tab-new-btn" onClick={onNewSession} title="New session (⌘N)">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 2v9M2 6.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          style={{
            position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 200,
            background: "var(--bg-panel)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)", padding: "4px 0", minWidth: 140,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          <CtxItem label="Rename" onClick={() => { setRenamingId(ctxMenu.id); setCtxMenu(null); }} />
          <CtxItem
            label={ctxSession?.pinned ? "Unpin" : "Pin to top"}
            onClick={async () => {
              if (!ctxSession) return;
              const newVal = ctxSession.pinned ? 0 : 1;
              await fetchApi(`/api/sessions/${ctxMenu.id}`, { method: "PATCH", body: JSON.stringify({ pinned: newVal }) });
              setSessions(prev => {
                const updated = prev.map(x => x.id === ctxMenu.id ? { ...x, pinned: newVal } : x);
                return [...updated].sort((a, b) => (b.pinned ?? 0) - (a.pinned ?? 0) || b.updated_at - a.updated_at);
              });
              setCtxMenu(null);
            }}
          />
          <CtxItem label="Export" onClick={() => { window.open(`/api/sessions/${ctxMenu.id}/export`, "_blank"); setCtxMenu(null); }} />
          <CtxItem label="Delete" danger onClick={() => { onDeleteSession(ctxMenu.id); setCtxMenu(null); }} />
        </div>
      )}
    </>
  );
}

function CtxItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{ padding: "6px 14px", fontSize: 12, cursor: "pointer", color: danger ? "var(--red)" : "var(--text-dim)" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {label}
    </div>
  );
}
