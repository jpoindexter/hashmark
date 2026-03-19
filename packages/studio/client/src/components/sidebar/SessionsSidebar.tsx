import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SkeletonLine } from "../Skeleton.tsx";
import IconButton from "../shared/IconButton.tsx";
import ContextMenu, { type ContextMenuItem } from "../shared/ContextMenu.tsx";
import ConfirmDialog from "../shared/ConfirmDialog.tsx";

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

// Avatar background colors keyed by first letter
const AVATAR_COLORS: Record<string, string> = {
  a: "rgba(139,92,246,0.18)", b: "rgba(59,130,246,0.18)", c: "rgba(16,185,129,0.18)",
  d: "rgba(245,158,11,0.18)", e: "rgba(239,68,68,0.18)", f: "rgba(6,182,212,0.18)",
  g: "rgba(236,72,153,0.18)", h: "rgba(139,92,246,0.18)", i: "rgba(59,130,246,0.18)",
  j: "rgba(16,185,129,0.18)", k: "rgba(245,158,11,0.18)", l: "rgba(239,68,68,0.18)",
  m: "rgba(6,182,212,0.18)", n: "rgba(236,72,153,0.18)", o: "rgba(139,92,246,0.18)",
  p: "rgba(59,130,246,0.18)", q: "rgba(16,185,129,0.18)", r: "rgba(245,158,11,0.18)",
  s: "rgba(239,68,68,0.18)", t: "rgba(6,182,212,0.18)", u: "rgba(236,72,153,0.18)",
  v: "rgba(139,92,246,0.18)", w: "rgba(59,130,246,0.18)", x: "rgba(16,185,129,0.18)",
  y: "rgba(245,158,11,0.18)", z: "rgba(239,68,68,0.18)",
};

const AVATAR_TEXT_COLORS: Record<string, string> = {
  a: "rgba(167,139,250,0.8)", b: "rgba(147,197,253,0.8)", c: "rgba(110,231,183,0.8)",
  d: "rgba(252,211,77,0.8)", e: "rgba(252,165,165,0.8)", f: "rgba(103,232,249,0.8)",
  g: "rgba(249,168,212,0.8)", h: "rgba(167,139,250,0.8)", i: "rgba(147,197,253,0.8)",
  j: "rgba(110,231,183,0.8)", k: "rgba(252,211,77,0.8)", l: "rgba(252,165,165,0.8)",
  m: "rgba(103,232,249,0.8)", n: "rgba(249,168,212,0.8)", o: "rgba(167,139,250,0.8)",
  p: "rgba(147,197,253,0.8)", q: "rgba(110,231,183,0.8)", r: "rgba(252,211,77,0.8)",
  s: "rgba(252,165,165,0.8)", t: "rgba(103,232,249,0.8)", u: "rgba(249,168,212,0.8)",
  v: "rgba(167,139,250,0.8)", w: "rgba(147,197,253,0.8)", x: "rgba(110,231,183,0.8)",
  y: "rgba(252,211,77,0.8)", z: "rgba(252,165,165,0.8)",
};

function avatarBg(name: string): string {
  const key = name.charAt(0).toLowerCase();
  return AVATAR_COLORS[key] ?? "var(--avatar-fallback-bg)";
}

function avatarColor(name: string): string {
  const key = name.charAt(0).toLowerCase();
  return AVATAR_TEXT_COLORS[key] ?? "var(--avatar-fallback-text)";
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
    fetch("/api/sessions")
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

  const handleNewSession = useCallback(() => {
    navigate("/setup");
  }, [navigate]);

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
      items: buildWorkspaceMenuItems(workspace.dir),
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
            <SkeletonLine width="55%" height={11} />
            <SkeletonLine width="70%" height={10} />
            <SkeletonLine width="60%" height={10} />
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
        fontWeight: 700,
        color: "var(--text-dim)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}>
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
  const [hovered, setHovered] = useState(false);

  return (
    <div>
      <div
        onClick={() => setExpanded(v => !v)}
        onContextMenu={onWorkspaceContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          height: 22,
          paddingLeft: 8,
          paddingRight: 8,
          gap: 4,
          cursor: "pointer",
          background: hovered ? "var(--hover-bg)" : "transparent",
          transition: "background 0.1s",
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
          <span style={{ display: "flex", gap: 3, fontFamily: "var(--font)", fontSize: 10, flexShrink: 0 }}>
            {totalAdded > 0 && <span style={{ color: "var(--accent)" }}>+{totalAdded}</span>}
            {totalRemoved > 0 && <span style={{ color: "var(--red)" }}>-{totalRemoved}</span>}
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
      fontWeight: 700,
      color: avatarColor(name),
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
  const [hovered, setHovered] = useState(false);
  const title = session.title || "Untitled";

  const dotColor = isStreaming
    ? "var(--yellow)"
    : active
    ? "var(--blue)"
    : "var(--text-dimmer)";

  const dotShadow = isStreaming ? "0 0 4px var(--yellow)" : undefined;

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 22,
        padding: "0 8px 0 28px",
        cursor: "pointer",
        background: active
          ? "var(--active-bg)"
          : hovered
          ? "var(--hover-bg)"
          : "transparent",
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
      {(hovered || active) && shortcut && (
        <span style={{
          fontSize: 10,
          color: "var(--text-dimmer)",
          flexShrink: 0,
        }}>
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
          title: "Rename session",
          inputMode: true,
          inputPlaceholder: "Session name",
          inputDefaultValue: session.title || "Untitled",
          confirmLabel: "Rename",
          onConfirm: () => {},
          onConfirmWithValue: (newTitle: string) => {
            if (!newTitle.trim()) return;
            fetch(`/api/sessions/${session.id}`, {
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
        fetch("/api/sessions", {
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
          message: "This will permanently delete this session and all its messages.",
          confirmLabel: "Delete",
          danger: true,
          onConfirm: () => {
            fetch(`/api/sessions/${session.id}`, { method: "DELETE" })
              .then(() => { onRefresh(); setDialog(null); })
              .catch(() => setDialog(null));
          },
        });
      },
    },
  ];
}

// Builds context menu items for the workspace row
function buildWorkspaceMenuItems(dir: string): ContextMenuItem[] {
  return [
    {
      label: "Open in Finder",
      onClick: () => {
        if (window.studio?.showInFinder) {
          void window.studio.showInFinder(dir);
        } else {
          alert("Open in Finder is only available in the desktop app.");
        }
      },
    },
    {
      label: "Copy Path",
      onClick: () => {
        void navigator.clipboard.writeText(dir);
      },
    },
    { label: "", onClick: () => {}, separator: true },
    {
      label: "Remove",
      danger: true,
      onClick: () => {
        alert("Remove workspace is not implemented yet.");
      },
    },
  ];
}
