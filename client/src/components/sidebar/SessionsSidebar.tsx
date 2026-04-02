import { useState, useEffect, useCallback, useRef } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "../shared/Skeleton.tsx";
import IconButton from "../shared/IconButton.tsx";
import ContextMenu, { type ContextMenuItem } from "../shared/ContextMenu.tsx";
import ConfirmDialog from "../shared/ConfirmDialog.tsx";
import { fetchApi } from "../../lib/api";

interface ContextMenuState {
  items: ContextMenuItem[];
  position: { x: number; y: number };
}

interface DialogState {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  inputMode?: boolean;
  inputPlaceholder?: string;
  inputDefaultValue?: string;
  onConfirm: () => void;
  onConfirmWithValue?: (value: string) => void;
}

interface ChatSession {
  id: string;
  title: string;
  message_count: number;
  updated_at: number;
}

interface GitStatus {
  branch: string;
  files: { status: string; added: number; removed: number }[];
}

interface WorkspaceInfo {
  name: string;
  dir: string;
  git: GitStatus | null;
}

interface SessionsSidebarProps {
  activeSessionId: string | null;
  onSessionSelect?: (sessionId: string) => void;
  info?: { projectName: string; projectDir: string } | null;
  git?: { branch: string; files: { status: string; added?: number; removed?: number }[] } | null;
  streaming?: boolean;
  streamingSessionId?: string | null;
}

// 4 neutral grey avatar backgrounds using design tokens (theme-safe)
const AVATAR_BG_VARIANTS = [
  "var(--surface-muted)",
  "var(--surface-subtle)",
  "var(--surface-dim)",
  "var(--surface-input)",
];

function avatarBg(name: string): string {
  return AVATAR_BG_VARIANTS[name.charCodeAt(0) % 4];
}

function avatarColor(): string {
  return "var(--text)";
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
      <span style={{
        flex: 1,
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text-dim)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}>
        Missions
      </span>
      <IconButton title="New mission" onClick={onAdd}>
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
        <SessionRow
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

function SessionRow({
  session,
  shortcut,
  active,
  onClick,
  isStreaming,
  onContextMenu,
}: {
  session: ChatSession;
  shortcut?: string;
  active: boolean;
  onClick: () => void;
  isStreaming: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const shortcutRef = useRef<HTMLSpanElement>(null);
  const title = session.title || "Untitled";

  const dotColor = isStreaming
    ? "var(--yellow)"
    : active
    ? "var(--accent)"
    : "var(--text-dimmer)";

  const dotShadow = isStreaming ? "0 0 4px var(--yellow)" : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      onContextMenu={onContextMenu}
      className={active ? undefined : "hoverable"}
      onMouseEnter={() => {
        if (shortcutRef.current && shortcut) shortcutRef.current.style.visibility = "visible";
      }}
      onMouseLeave={() => {
        if (shortcutRef.current && !active) shortcutRef.current.style.visibility = "hidden";
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 22,
        padding: "0 8px 0 28px",
        cursor: "pointer",
        background: active ? "var(--active-bg)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <span style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: dotColor,
        flexShrink: 0,
        boxShadow: dotShadow,
        animation: isStreaming ? "session-dot-pulse 1.5s ease-in-out infinite" : undefined,
      }} />
      <span style={{
        flex: 1,
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? "var(--text)" : "var(--text-dim)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        lineHeight: "22px",
      }}>
        {title}
      </span>
      {shortcut && (
        <span
          ref={shortcutRef}
          style={{
            fontSize: 10,
            color: "var(--text-dimmer)",
            flexShrink: 0,
            visibility: active ? "visible" : "hidden",
          }}
        >
          {shortcut}
        </span>
      )}
    </div>
  );
}

// Builds context menu items for a session row (uses setDialog for confirm/prompt)
function buildSessionMenuItems(
  session: ChatSession,
  onRefresh: () => void,
  setDialog: (d: DialogState | null) => void,
): ContextMenuItem[] {
  return [
    {
      label: "Rename",
      onClick: () => {
        setDialog({
          open: true,
          title: "Rename mission",
          inputMode: true,
          inputPlaceholder: "Mission name",
          inputDefaultValue: session.title || "Untitled",
          confirmLabel: "Rename",
          onConfirm: () => {},
          onConfirmWithValue: (newTitle: string) => {
            if (!newTitle.trim()) return;
            fetchApi(`/api/sessions/${session.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: newTitle.trim() }),
            }).then(() => { onRefresh(); setDialog(null); }).catch(() => setDialog(null));
          },
        });
      },
    },
    {
      label: "Duplicate",
      onClick: () => {
        fetchApi("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: `${session.title || "Untitled"} (copy)` }),
        }).then(() => onRefresh()).catch(() => {});
      },
    },
    { label: "", onClick: () => {}, separator: true },
    {
      label: "Delete",
      danger: true,
      onClick: () => {
        setDialog({
          open: true,
          title: `Delete "${session.title || "Untitled"}"?`,
          message: "This will permanently delete this mission and all its messages.",
          confirmLabel: "Delete",
          danger: true,
          onConfirm: () => {
            fetchApi(`/api/sessions/${session.id}`, { method: "DELETE" })
              .then(() => { onRefresh(); setDialog(null); })
              .catch(() => setDialog(null));
          },
        });
      },
    },
  ];
}

// Builds context menu items for the workspace row
function buildWorkspaceMenuItems(
  dir: string,
  setDialog: (d: DialogState | null) => void,
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];

  if (typeof window.studio?.showInFinder === "function") {
    items.push({
      label: "Open in Finder",
      onClick: () => { void window.studio!.showInFinder(dir); },
    });
  }

  items.push({
    label: "Copy Path",
    onClick: () => {
      void navigator.clipboard.writeText(dir);
    },
  });

  items.push({ label: "", onClick: () => {}, separator: true });

  items.push({
    label: "Remove",
    danger: true,
    onClick: () => {
      setDialog({
        open: true,
        title: "Remove workspace?",
        message: "This will remove the workspace from the sidebar. Your files will not be deleted.",
        confirmLabel: "Remove",
        danger: true,
        onConfirm: () => {
          // Workspace removal is not yet supported on the backend
          setDialog(null);
        },
      });
    },
  });

  return items;
}
