import { useState, useEffect, useMemo, useCallback } from "react";
import { Play, Eye, Copy, Pencil, Trash2 } from "lucide-react";
import ContextMenu, { type ContextMenuItem } from "../shared/ContextMenu.tsx";
import ConfirmDialog from "../shared/ConfirmDialog.tsx";
import { Skeleton, SkeletonAvatar } from "../shared/Skeleton.tsx";
import { fetchApi } from "../../lib/api";

interface Agent {
  id: string;
  name: string;
  description: string;
  department: string;
  path: string;
}

const DEPT_COLORS: Record<string, string> = {
  engineering: "var(--accent)",
  design: "#8b5cf6",
  product: "var(--blue)",
  security: "var(--red)",
  ops: "var(--yellow)",
  data: "var(--cyan)",
  general: "var(--text-dimmer)",
};

function deptColor(dept: string): string {
  return DEPT_COLORS[dept.toLowerCase()] ?? "var(--text-dimmer)";
}

function DeptDot({ dept }: { dept: string }) {
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: deptColor(dept),
        flexShrink: 0,
      }}
    />
  );
}

function AgentRow({
  agent,
  isSelected,
  onClick,
  onContextMenu,
}: {
  agent: Agent;
  isSelected: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent, agent: Agent) => void;
}) {
  return (
    <div
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, agent); }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--hover-bg)"; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
      title={agent.description || agent.path}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 22,
        paddingLeft: 20,
        paddingRight: 8,
        cursor: "pointer",
        fontSize: 12,
        fontFamily: "var(--font)",
        color: "var(--text-dim)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        background: isSelected ? "var(--active-bg)" : "transparent",
        borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
      }}
    >
      <DeptDot dept={agent.department} />
      <span
        style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {agent.name || agent.id}
      </span>
    </div>
  );
}

function DeptSection({
  dept,
  agents,
  selectedId,
  onAgentClick,
  onContextMenu,
}: {
  dept: string;
  agents: Agent[];
  selectedId: string | null;
  onAgentClick: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, agent: Agent) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 12px",
          cursor: "pointer",
          userSelect: "none",
          fontSize: 10,
          fontFamily: "var(--font)",
          letterSpacing: "0.04em",
          color: "var(--text-dimmer)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.background =
            "var(--surface-subtle)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = "transparent";
        }}
      >
        <span
          style={{
            fontSize: 10,
            display: "inline-block",
            transition: "transform 0.1s",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          ▶
        </span>
        <DeptDot dept={dept} />
        <span style={{ flex: 1 }}>
          {dept.charAt(0).toUpperCase() + dept.slice(1)}
        </span>
        <span
          style={{
            fontSize: 10,
            color: "var(--text-dimmer)",
            background: "var(--bg-3)",
            borderRadius: 10,
            padding: "1px 5px",
          }}
        >
          {agents.length}
        </span>
      </div>
      {open &&
        agents.map((agent) => (
          <AgentRow
            key={agent.id}
            agent={agent}
            isSelected={selectedId === agent.id}
            onClick={() => onAgentClick(agent.id)}
            onContextMenu={onContextMenu}
          />
        ))}
    </div>
  );
}

interface DialogState {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

export default function AgentsSidebar() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; agent: Agent } | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const closeDialog = useCallback(() => setDialog(null), []);

  const refreshAgents = useCallback(() => {
    fetchApi("/api/agents")
      .then((r) => r.json())
      .then((d: { agents?: Agent[] }) => setAgents(d.agents ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchApi("/api/agents")
      .then((r) => r.json())
      .then((d: { agents?: Agent[] }) => setAgents(d.agents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Agent[]>();
    for (const a of agents) {
      const dept = a.department || "general";
      const list = map.get(dept) ?? [];
      list.push(a);
      map.set(dept, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [agents]);

  const handleAgentClick = useCallback((id: string) => {
    setSelectedId(id);
    window.dispatchEvent(
      new CustomEvent("studio:open-agent", { detail: { id } })
    );
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, agent: Agent) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, agent });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const ctxMenuItems = useMemo((): ContextMenuItem[] => {
    if (!ctxMenu) return [];
    const { agent } = ctxMenu;
    return [
      {
        label: "Run Agent",
        icon: <Play size={12} />,
        onClick: () => {
          window.dispatchEvent(
            new CustomEvent("studio:run-agent", { detail: { id: agent.id, name: agent.name } })
          );
        },
      },
      {
        label: "View Details",
        icon: <Eye size={12} />,
        onClick: () => handleAgentClick(agent.id),
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Copy Name",
        icon: <Copy size={12} />,
        onClick: () => { navigator.clipboard.writeText(agent.name || agent.id).catch(() => {}); },
      },
      {
        label: "Edit",
        icon: <Pencil size={12} />,
        onClick: () => handleAgentClick(agent.id),
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Delete",
        icon: <Trash2 size={12} />,
        danger: true,
        onClick: () => {
          setDialog({
            open: true,
            title: `Delete "${agent.name || agent.id}"?`,
            message: "This will permanently remove the agent file from .claude/agents/.",
            confirmLabel: "Delete",
            danger: true,
            onConfirm: () => {
              fetchApi(`/api/agents/${agent.id}`, { method: "DELETE" })
                .then(() => { refreshAgents(); setDialog(null); })
                .catch(() => setDialog(null));
            },
          });
        },
      },
    ];
  }, [ctxMenu, handleAgentClick, refreshAgents]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          fontSize: 10,
          fontFamily: "var(--font)",
          letterSpacing: "0.06em",
          color: "var(--text-dim)",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        <span>AGENTS</span>
        <span
          style={{
            fontSize: 10,
            color: "var(--text-dimmer)",
            background: "var(--bg-3)",
            borderRadius: 10,
            padding: "1px 6px",
          }}
        >
          {agents.length}
        </span>
      </div>

      {/* Agent list */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {loading ? (
          <div
            style={{
              padding: "12px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {/* List skeleton: dot + label rows mimic agent list */}
            {[65, 50, 70].map((w, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SkeletonAvatar size={7} />
                <Skeleton width={`${w}%`} />
              </div>
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div
            style={{
              padding: "12px 16px",
              fontSize: 11,
              color: "var(--text-dimmer)",
              fontFamily: "var(--font)",
            }}
          >
            No agents found.
            <div style={{ marginTop: 4, fontSize: 10 }}>
              Add .md files to .claude/agents/
            </div>
          </div>
        ) : (
          grouped.map(([dept, deptAgents]) => (
            <DeptSection
              key={dept}
              dept={dept}
              agents={deptAgents}
              selectedId={selectedId}
              onAgentClick={handleAgentClick}
              onContextMenu={handleContextMenu}
            />
          ))
        )}
      </div>

      <ContextMenu
        items={ctxMenuItems}
        position={ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : null}
        onClose={closeCtxMenu}
      />
      {dialog && (
        <ConfirmDialog
          open={dialog.open}
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          danger={dialog.danger}
          onConfirm={() => { dialog.onConfirm(); }}
          onCancel={closeDialog}
        />
      )}
    </div>
  );
}
