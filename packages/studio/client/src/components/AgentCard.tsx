interface Agent {
  id: string;
  name: string;
  description: string;
  department: string;
  path: string;
  content?: string;
}

interface AgentCardProps {
  agent: Agent;
  onClick?: () => void;
  streaming?: boolean;
}

const DEPT_COLORS: Record<string, string> = {
  engineering: "#3b82f6",
  product: "#8b5cf6",
  design: "#ec4899",
  marketing: "#f59e0b",
  sales: "#10b981",
  operations: "#6366f1",
  pr: "#06b6d4",
  general: "#71717a",
};

export default function AgentCard({ agent, onClick, streaming }: AgentCardProps) {
  const color = DEPT_COLORS[agent.department] ?? DEPT_COLORS.general;

  return (
    <div
      onClick={onClick}
      className={streaming ? "fade-in" : ""}
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border-dim)",
        borderRadius: "var(--radius)",
        padding: "12px 14px",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.1s, background 0.1s",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent)";
          (e.currentTarget as HTMLDivElement).style.background = "var(--accent-bg)";
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-dim)";
          (e.currentTarget as HTMLDivElement).style.background = "var(--bg-2)";
        }
      }}
    >
      {/* Left accent bar */}
      <div style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: "2px",
        background: color,
      }} />

      <div style={{ paddingLeft: "6px" }}>
        {/* Dept badge */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "6px",
        }}>
          <span style={{
            fontSize: "9px",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: color,
            fontWeight: 600,
          }}>
            {agent.department}
          </span>
          {streaming && (
            <span style={{
              fontSize: "9px",
              color: "var(--accent)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}>
              generating<span className="cursor" style={{ height: "9px", width: "5px" }} />
            </span>
          )}
        </div>

        {/* Name */}
        <div style={{
          fontSize: "12px",
          fontWeight: 600,
          color: "var(--text)",
          marginBottom: "4px",
        }}>
          {agent.name || agent.id}
        </div>

        {/* Description */}
        <div style={{
          fontSize: "11px",
          color: "var(--text-dim)",
          lineHeight: 1.4,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {agent.description || "No description"}
        </div>

        {/* Path */}
        <div style={{
          marginTop: "8px",
          fontSize: "10px",
          color: "var(--text-dimmer)",
          fontFamily: "var(--font)",
        }}>
          .claude/agents/{agent.path}
        </div>
      </div>
    </div>
  );
}
