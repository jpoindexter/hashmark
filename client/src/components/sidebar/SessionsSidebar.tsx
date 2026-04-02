import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "../shared/Skeleton.tsx";
import IconButton from "../shared/IconButton.tsx";
import ContextMenu, { type ContextMenuItem } from "../shared/ContextMenu.tsx";
import ConfirmDialog from "../shared/ConfirmDialog.tsx";
import { fetchApi } from "../../lib/api";
import {
  type ChatSession,
  type WorkspaceInfo,
  type DialogState,
  avatarBg,
  avatarColor,
  buildSessionMenuItems,
  buildWorkspaceMenuItems,
} from "./sessions/types.ts";
import SessionItem from "./sessions/SessionItem.tsx";

interface ContextMenuState {
  items: ContextMenuItem[];
  position: { x: number; y: number };
}

interface SessionsSidebarProps {
  activeSessionId: string | null;
  onSessionSelect?: (sessionId: string) => void;
  info?: { projectName: string; projectDir: string } | null;
  git?: { branch: string; files: { status: string; added?: number; removed?: number }[] } | null;
  streaming?: boolean;
  streamingSessionId?: string | null;
}

export default function SessionsSidebar({ activeSessionId, onSessionSelect, info, git, streaming, streamingSessionId }: SessionsSidebarProps) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [visible, setVisible] = useState(true);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const closeDialog = useCallback(() => setDialog(null), []);

  useEffect(() => {
    const handler = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const refreshSessions = useCallback(() => {
    fetchApi("/api/sessions")
      .then(r => r.json())
      .then((d: { sessions: ChatSession[] }) => setSessions((d.sessions ?? []).slice(0, 9)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshSessions();
    if (!visible) return;
    const id = setInterval(refreshSessions, 8000);
    return () => clearInterval(id);
  }, [visible, refreshSessions]);

  // Derive workspace display from props passed by Shell (avoids duplicate fetches)
  const workspace: WorkspaceInfo | null = info
    ? { name: info.projectName ?? "project", dir: info.projectDir ?? "", git: git ?? null }
    : null;

  const handleSessionClick = useCallback((id: string) => {
    if (onSessionSelect) {
      onSessionSelect(id);
    } else {
      navigate("/");
      window.dispatchEvent(new CustomEvent("studio:switch-session", { detail: id }));
    }
  }, [onSessionSelect, navigate]);

  // Cmd+1-9 session switching via custom event from useKeyboardNav
  useEffect(() => {
    const handler = (e: Event) => {
      const index = (e as CustomEvent<number>).detail;
      if (index >= 0 && index < sessions.length) {
        handleSessionClick(sessions[index].id);
      }
    };
    window.addEventListener("studio:switch-session-by-index", handler);
    return () => window.removeEventListener("studio:switch-session-by-index", handler);
  }, [sessions, handleSessionClick]);

  const handleNewSession = useCallback(() => {
    window.dispatchEvent(new CustomEvent("studio:new-session"));
  }, []);

  const handleSessionContextMenu = useCallback((e: React.MouseEvent, session: ChatSession) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      position: { x: e.clientX, y: e.clientY },
      items: buildSessionMenuItems(session, refreshSessions, setDialog),
    });
  }, [refreshSessions]);

  const handleWorkspaceContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!workspace) return;
    setCtxMenu({
      position: { x: e.clientX, y: e.clientY },
      items: buildWorkspaceMenuItems(workspace.dir, setDialog),
    });
  }, [workspace]);

  const totalAdded = workspace?.git?.files?.reduce((s, f) => s + (f.added ?? 0), 0) ?? 0;
  const totalRemoved = workspace?.git?.files?.reduce((s, f) => s + (f.removed ?? 0), 0) ?? 0;
  const shortName = workspace ? (workspace.name.split("/").pop() ?? workspace.name) : null;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      fontFamily: "var(--font-ui)",
      userSelect: "none",
      fontSize: 13,
    }}>
      <style>{`@keyframes session-dot-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`}</style>
      <SectionHeader onAdd={handleNewSession} />

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {workspace && shortName ? (
          <WorkspaceGroup
            name={shortName}
            branch={workspace.git?.branch ?? null}
            totalAdded={totalAdded}
            totalRemoved={totalRemoved}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSessionClick={handleSessionClick}
            streamingSessionId={streamingSessionId ?? null}
            onSessionContextMenu={handleSessionContextMenu}
            onWorkspaceContextMenu={handleWorkspaceContextMenu}
          />
        ) : (
          <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            <Skeleton width="55%" height={11} />
            <Skeleton width="70%" height={10} />
            <Skeleton width="60%" height={10} />
          </div>
        )}
      </div>

      <ContextMenu
        items={ctxMenu?.items ?? []}
        position={ctxMenu?.position ?? null}
        onClose={() => setCtxMenu(null)}
      />
      {dialog && (
        <ConfirmDialog
          open={dialog.open}
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          danger={dialog.danger}
          inputMode={dialog.inputMode}
          inputPlaceholder={dialog.inputPlaceholder}
          inputDefaultValue={dialog.inputDefaultValue}
          onConfirm={() => { dialog.onConfirm(); closeDialog(); }}
          onCancel={closeDialog}
          onConfirmWithValue={dialog.onConfirmWithValue}
        />
      )}
    </div>
  );
}

function SectionHeader({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      padding: "0 3px 0 20px",
      height: 22,
      flexShrink: 0,
      background: "var(--surface-muted)",
    }}>
      <span className="label" style={{ flex: 1 }}>
        Sessions
      </span>
      <IconButton title="New session" onClick={onAdd}>
        <Plus size={14} />
      </IconButton>
    </div>
  );
}

function WorkspaceGroup({
  name,
  branch,
  totalAdded,
  totalRemoved,
  sessions,
  activeSessionId,
  onSessionClick,
  streamingSessionId,
  onSessionContextMenu,
  onWorkspaceContextMenu,
}: {
  name: string;
  branch: string | null;
  totalAdded: number;
  totalRemoved: number;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSessionClick: (id: string) => void;
  streamingSessionId: string | null;
  onSessionContextMenu: (e: React.MouseEvent, session: ChatSession) => void;
  onWorkspaceContextMenu: (e: React.MouseEvent) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(v => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(v => !v); } }}
        onContextMenu={onWorkspaceContextMenu}
        className="hoverable"
        style={{
          display: "flex",
          alignItems: "center",
          height: 22,
          paddingLeft: 8,
          paddingRight: 8,
          gap: 4,
          background: "transparent",
        }}
      >
        <CollapseChevron expanded={expanded} />
        <LetterAvatar name={name} />
        <span style={{
          flex: 1,
          fontSize: 13,
          fontWeight: 400,
          color: "var(--text)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {name}
        </span>
        {branch && (
          <span style={{ fontSize: 11, color: "var(--text-dimmer)", flexShrink: 0 }}>
            {branch.length > 14 ? branch.slice(0, 13) + "\u2026" : branch}
          </span>
        )}
        {(totalAdded > 0 || totalRemoved > 0) && (
          <span style={{ display: "flex", gap: 3, fontFamily: "var(--font)", fontSize: 10, flexShrink: 0, opacity: 0.6 }}>
            {totalAdded > 0 && <span style={{ color: "var(--text-dim)" }}>+{totalAdded}</span>}
            {totalRemoved > 0 && <span style={{ color: "var(--text-dim)" }}>-{totalRemoved}</span>}
          </span>
        )}
      </div>

      {expanded && sessions.length > 0 && sessions.map((s, i) => (
        <SessionItem
          key={s.id}
          session={s}
          shortcut={i < 9 ? `\u2318${i + 1}` : undefined}
          active={s.id === activeSessionId}
          onClick={() => onSessionClick(s.id)}
          isStreaming={s.id === streamingSessionId}
          onContextMenu={(e) => onSessionContextMenu(e, s)}
        />
      ))}

      {expanded && sessions.length === 0 && (
        <div style={{
          paddingLeft: 44,
          height: 22,
          display: "flex",
          alignItems: "center",
          fontSize: 12,
          color: "var(--text-dimmer)",
        }}>
          No sessions
        </div>
      )}
    </div>
  );
}

function CollapseChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      style={{
        flexShrink: 0,
        color: "var(--text-dimmer)",
        transform: expanded ? "rotate(90deg)" : "none",
        transition: "transform 0.1s",
      }}
    >
      <path d="M6 4l4 4-4 4V4z" />
    </svg>
  );
}

function LetterAvatar({ name }: { name: string }) {
  return (
    <div style={{
      width: 16,
      height: 16,
      borderRadius: "var(--radius-sm)",
      background: avatarBg(name),
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 9,
      fontWeight: 600,
      color: avatarColor(),
      flexShrink: 0,
    }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
