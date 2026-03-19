import { useState, useEffect, useMemo, useCallback } from "react";

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
  data: "#06b6d4",
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
  onClick,
}: {
  agent: Agent;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
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
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "var(--bg-3)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
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
  onAgentClick,
}: {
  dept: string;
  agents: Agent[];
  onAgentClick: (id: string) => void;
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
            "rgba(255,255,255,0.03)";
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
            onClick={() => onAgentClick(agent.id)}
          />
        ))}
    </div>
  );
}

export default function AgentsSidebar() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
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
    // Sort departments alphabetically
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [agents]);

  const handleAgentClick = useCallback((id: string) => {
    window.dispatchEvent(
      new CustomEvent("studio:open-agent", { detail: { id } })
    );
  }, []);

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
              gap: 6,
            }}
          >
            {[65, 50, 70].map((w, i) => (
              <div
                key={i}
                style={{
                  height: 12,
                  width: `${w}%`,
                  background: "var(--bg-4)",
                  borderRadius: "var(--radius-sm)",
                }}
              />
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
              onAgentClick={handleAgentClick}
            />
          ))
        )}
      </div>
    </div>
  );
}
