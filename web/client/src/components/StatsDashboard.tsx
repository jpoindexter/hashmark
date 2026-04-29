import { useState, useEffect, useRef } from "react";
import { fetchApi } from "../lib/api";

interface DayPoint { date: string; count: number; }

interface StatsResponse {
  totalSessions: number;
  totalMessages: number;
  activeAgents: number;
  toolCalls: number;
  sessionsByDay: DayPoint[];
  messagesByDay: DayPoint[];
  topTools: { name: string; count: number }[];
}

function abbreviateDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function LineChart({ data, color, height = 160 }: { data: DayPoint[]; color: string; height?: number }) {
  if (!data.length) return null;
  const W = 100; // viewBox units
  const H = height / 2; // viewBox height units
  const PAD = { top: 4, bottom: 18, left: 4, right: 4 };
  const maxVal = Math.max(...data.map(d => d.count), 1);
  const toX = (i: number) => PAD.left + (i / Math.max(data.length - 1, 1)) * (W - PAD.left - PAD.right);
  const toY = (v: number) => PAD.top + (1 - v / maxVal) * (H - PAD.top - PAD.bottom);

  const points = data.map((d, i) => `${toX(i)},${toY(d.count)}`).join(" ");
  const areaPoints = [
    `${toX(0)},${H - PAD.bottom}`,
    ...data.map((d, i) => `${toX(i)},${toY(d.count)}`),
    `${toX(data.length - 1)},${H - PAD.bottom}`,
  ].join(" ");

  // Show every ~3rd label to avoid crowding
  const labelEvery = Math.ceil(data.length / 5);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block" }}>
      <defs>
        <linearGradient id={`grad-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={areaPoints}
        fill={`url(#grad-${color.replace(/[^a-z0-9]/gi, "")})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((d, i) => (
        <circle key={i} cx={toX(i)} cy={toY(d.count)} r="1.4" fill={color} />
      ))}
      {data.map((d, i) =>
        i % labelEvery === 0 ? (
          <text
            key={i}
            x={toX(i)} y={H - 2}
            textAnchor="middle"
            fontSize="4"
            fill="var(--text-muted)"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {abbreviateDate(d.date)}
          </text>
        ) : null
      )}
    </svg>
  );
}

function KpiCard({ label, value, trend }: { label: string; value: number; trend: "up" | "down" | "flat" }) {
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "—";
  const arrowColor = trend === "up" ? "var(--green, #4ade80)" : trend === "down" ? "var(--red, #f87171)" : "var(--text-muted)";
  return (
    <div style={{
      flex: 1,
      background: "var(--bg-elevated)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      minWidth: 0,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-mono, monospace)" }}>
          {value.toLocaleString()}
        </span>
        <span style={{ fontSize: 12, color: arrowColor }}>{arrow}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-sans)" }}>{label}</div>
    </div>
  );
}

function trend(data: DayPoint[]): "up" | "down" | "flat" {
  if (data.length < 2) return "flat";
  const half = Math.floor(data.length / 2);
  const first = data.slice(0, half).reduce((s, d) => s + d.count, 0);
  const second = data.slice(half).reduce((s, d) => s + d.count, 0);
  if (second > first) return "up";
  if (second < first) return "down";
  return "flat";
}

export function StatsDashboard() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      const data = await fetchApi<StatsResponse>("/api/stats");
      setStats(data);
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    void load();
    intervalRef.current = setInterval(() => void load(), 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  if (error) return (
    <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13, fontFamily: "var(--font-sans)" }}>
      Failed to load stats.
    </div>
  );

  if (!stats) return (
    <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-sans)" }}>
      Loading...
    </div>
  );

  const maxTool = Math.max(...stats.topTools.map(t => t.count), 1);
  const mostActiveDay = [...stats.sessionsByDay].sort((a, b) => b.count - a.count)[0];

  return (
    <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 20, overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* KPI row */}
      <div style={{ display: "flex", gap: 8 }}>
        <KpiCard label="Sessions" value={stats.totalSessions} trend={trend(stats.sessionsByDay)} />
        <KpiCard label="Messages" value={stats.totalMessages} trend={trend(stats.messagesByDay)} />
        <KpiCard label="Agents" value={stats.activeAgents} trend="flat" />
        <KpiCard label="Tool Calls" value={stats.toolCalls} trend="flat" />
      </div>

      {/* Sessions chart */}
      <div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-sans)", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Sessions — 14 days
        </div>
        <LineChart data={stats.sessionsByDay} color="var(--accent)" height={130} />
      </div>

      {/* Messages chart */}
      <div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-sans)", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Messages — 14 days
        </div>
        <LineChart data={stats.messagesByDay} color="var(--text-muted)" height={130} />
      </div>

      {/* Top tools */}
      {stats.topTools.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-sans)", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Top Tools
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {stats.topTools.slice(0, 5).map(t => (
              <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 72, fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {t.name}
                </div>
                <div style={{ flex: 1, height: 6, background: "var(--bg-elevated)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${(t.count / maxTool) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 3, transition: "width 0.3s" }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)", width: 28, textAlign: "right", flexShrink: 0 }}>
                  {t.count}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick stats strip */}
      {mostActiveDay && (
        <div style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: "10px 12px",
          fontSize: 11,
          color: "var(--text-muted)",
          fontFamily: "var(--font-sans)",
          lineHeight: 1.7,
        }}>
          <div>Most active day: <span style={{ color: "var(--text)" }}>{abbreviateDate(mostActiveDay.date)}</span> ({mostActiveDay.count} sessions)</div>
          <div>Avg sessions/day: <span style={{ color: "var(--text)" }}>{(stats.totalSessions / Math.max(stats.sessionsByDay.length, 1)).toFixed(1)}</span></div>
          <div>Avg messages/session: <span style={{ color: "var(--text)" }}>{stats.totalSessions > 0 ? (stats.totalMessages / stats.totalSessions).toFixed(1) : "—"}</span></div>
        </div>
      )}
    </div>
  );
}
