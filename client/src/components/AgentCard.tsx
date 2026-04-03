import { useState } from "react";
import { Play, Edit2, Copy, Trash2 } from "lucide-react";
import ContextMenu from "./shared/ContextMenu.tsx";
import type { ContextMenuItem } from "./shared/ContextMenu.tsx";
import { DEPT_COLORS } from "../lib/constants";
import { timeAgo } from "../lib/format";

interface Agent {
  id: string;
  name: string;
  description: string;
  department: string;
  path: string;
  content?: string;
}

interface AgentStats {
  totalRuns: number;
  successRate: number;
  lastRun: number | null;
}

interface AgentCardProps {
  agent: Agent;
  stats?: AgentStats;
  onClick?: () => void;
  onRun?: (e: React.MouseEvent) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  streaming?: boolean;
}

function StatusDot({ stats }: { stats?: AgentStats }) {
  if (!stats || stats.totalRuns === 0) {
    return (
      <span title="Never run" style={{
        display: "inline-block",
        width: 6, height: 6,
        borderRadius: "50%",
        background: "var(--text-dimmer)",
        flexShrink: 0,
      }} />
    );
  }
  const recentSuccess = stats.successRate >= 0.8;
  const color = recentSuccess ? "var(--accent)" : "var(--red)";
  const label = recentSuccess ? "Recently succeeded" : "Recent failures";
  return (
    <span title={label} style={{
      display: "inline-block",
      width: 6, height: 6,
      borderRadius: "50%",
      background: color,
      flexShrink: 0,
      boxShadow: `0 0 4px ${color}`,
    }} />
  );
}

export default function AgentCard({ agent, stats, onClick, onRun, onDelete, onDuplicate, streaming }: AgentCardProps) {
  const color = DEPT_COLORS[agent.department] ?? DEPT_COLORS.general;
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);

  const ctxItems: ContextMenuItem[] = [
    ...(onClick ? [{ label: "Edit Agent", icon: <Edit2 size={12} />, onClick }] : []),
    ...(onRun ? [{ label: "Run Agent", icon: <Play size={12} />, onClick: (e: React.MouseEvent) => onRun(e) }] : []),
    ...(onClick || onRun ? [{ label: "", separator: true, onClick: () => {} }] : []),
    ...(onDuplicate ? [{ label: "Duplicate", icon: <Copy size={12} />, onClick: onDuplicate }] : []),
    ...(onDelete ? [{ label: "Delete", icon: <Trash2 size={12} />, danger: true, onClick: onDelete }] : []),
  ];

  return (
    <>
    <div
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); setCtxPos({ x: e.clientX, y: e.clientY }); }}
      className={streaming ? "fade-in" : ""}
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border-dim)",
        borderRadius: "var(--radius)",
        padding: "12px 14px",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.12s, background 0.12s, box-shadow 0.12s",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        if (!onClick) return;
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = "var(--accent)";
        el.style.background = "var(--accent-bg)";
        el.style.boxShadow = "var(--shadow-md)";
        el.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        if (!onClick) return;
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = "var(--border-dim)";
        el.style.background = "var(--bg-2)";
        el.style.boxShadow = "none";
        el.style.transform = "none";
      }}
    >
      {/* Left accent bar */}
      <div style={{
        position: "absolute",
        left: 0, top: 0, bottom: 0,
        width: "2px",
        background: color,
      }} />

      <div style={{ paddingLeft: "6px" }}>
        {/* Top row: dept badge + status dot */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "6px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="text-micro" style={{ color }}>
              {agent.department}
            </span>
            {streaming && (
              <span className="text-micro" style={{ color: "var(--accent)" }}>
                generating<span className="cursor" style={{ height: "9px", width: "5px" }} />
              </span>
            )}
          </div>
          <StatusDot stats={stats} />
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
          marginBottom: "10px",
        }}>
          {agent.description || "No description"}
        </div>

        {/* Footer: stats + run button */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "10px", color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
            {stats && stats.totalRuns > 0 ? (
              <>
                <span title="Total runs">{stats.totalRuns} run{stats.totalRuns !== 1 ? "s" : ""}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span title="Success rate">{Math.round(stats.successRate * 100)}%</span>
                {stats.lastRun && (
                  <>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span title={new Date(stats.lastRun).toLocaleString()}>{timeAgo(stats.lastRun)}</span>
                  </>
                )}
              </>
            ) : (
              <span style={{ fontStyle: "italic", opacity: 0.5 }}>never run</span>
            )}
          </div>

          {onRun && (
            <button
              onClick={(e) => { e.stopPropagation(); onRun(e); }}
              className="text-micro"
              style={{
                padding: "2px 8px",
                fontFamily: "var(--font)",
                background: "var(--accent-bg)",
                border: "1px solid var(--accent-border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--accent)",
                cursor: "pointer",
                flexShrink: 0,
                transition: "background 0.1s, border-color 0.1s",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.background = "rgba(63,185,80,0.18)";
                el.style.borderColor = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.background = "var(--accent-bg)";
                el.style.borderColor = "var(--accent-border)";
              }}
            >
              Run
            </button>
          )}
        </div>
      </div>
    </div>

    <ContextMenu
      items={ctxItems}
      position={ctxPos}
      onClose={() => setCtxPos(null)}
    />
  </>
  );
}
