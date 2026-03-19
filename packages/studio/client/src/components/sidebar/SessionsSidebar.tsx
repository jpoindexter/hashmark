import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SkeletonLine } from "../Skeleton.tsx";
import IconButton from "../shared/IconButton.tsx";

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
  return AVATAR_COLORS[key] ?? "rgba(255,255,255,0.08)";
}

function avatarColor(name: string): string {
  const key = name.charAt(0).toLowerCase();
  return AVATAR_TEXT_COLORS[key] ?? "rgba(255,255,255,0.5)";
}

function isRecent(ts: number): boolean {
  return Date.now() - ts < 5 * 60 * 1000;
}

export default function SessionsSidebar({ activeSessionId, onSessionSelect, info, git }: SessionsSidebarProps) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  useEffect(() => {
    const load = () => {
      fetch("/api/sessions")
        .then(r => r.json())
        .then((d: { sessions: ChatSession[] }) => setSessions((d.sessions ?? []).slice(0, 9)))
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

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
      {/* Section header: "Sessions" with + button */}
      <SectionHeader onAdd={handleNewSession} />

      {/* Scrollable content */}
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
          />
        ) : (
          <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            <SkeletonLine width="55%" height={11} />
            <SkeletonLine width="70%" height={10} />
            <SkeletonLine width="60%" height={10} />
          </div>
        )}
      </div>
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
      background: "rgba(255,255,255,0.02)",
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
}: {
  name: string;
  branch: string | null;
  totalAdded: number;
  totalRemoved: number;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSessionClick: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);

  return (
    <div>
      {/* Workspace row: 22px, chevron + avatar + name + branch + diff stats */}
      <div
        onClick={() => setExpanded(v => !v)}
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
          background: hovered ? "rgba(255,255,255,0.04)" : "transparent",
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

      {/* Session rows */}
      {expanded && sessions.length > 0 && sessions.map((s, i) => (
        <SessionRow
          key={s.id}
          session={s}
          shortcut={i < 9 ? `\u2318${i + 1}` : undefined}
          active={s.id === activeSessionId}
          onClick={() => onSessionClick(s.id)}
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
      borderRadius: 2,
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
}: {
  session: ChatSession;
  shortcut?: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const recent = isRecent(session.updated_at);
  const title = session.title || "Untitled";

  // Status dot color: yellow = recent/running, blue = active, dim = idle
  const dotColor = recent
    ? "var(--yellow)"
    : active
    ? "var(--blue)"
    : "var(--text-dimmer)";

  const dotShadow = recent ? "0 0 4px var(--yellow)" : undefined;

  return (
    <div
      onClick={onClick}
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
          ? "rgba(255,255,255,0.06)"
          : hovered
          ? "rgba(255,255,255,0.04)"
          : "transparent",
        transition: "background 0.1s",
      }}
    >
      {/* Status dot */}
      <span style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: dotColor,
        flexShrink: 0,
        boxShadow: dotShadow,
      }} />
      {/* Session title */}
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
      {/* Keyboard shortcut on hover */}
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
