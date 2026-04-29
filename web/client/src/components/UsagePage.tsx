import { useState, useEffect } from "react";
import { fetchApi } from "../lib/api";
import { getSessionCost } from "../lib/modelConfig";

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  return getSessionCost(model, inputTokens, outputTokens);
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(usd: number): string {
  if (usd < 0.01) return `<$0.01`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

interface UsageData {
  totalSessions: number;
  totalMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  sessionsLast30Days: number;
  messagesLast7Days: number;
  topSessions?: { id: string; title: string; model: string; input_tokens: number; output_tokens: number }[];
  modelBreakdown?: { model: string; sessions: number; input_tokens: number; output_tokens: number }[];
  timeline?: { date: string; count: number }[];
}

function TimelineChart({ data }: { data: { date: string; count: number }[] }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const W = 640, H = 80, BAR_W = Math.floor((W - data.length) / data.length);
  return (
    <div style={{ maxWidth: W, overflowX: "auto" }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 20}`} style={{ display: "block" }}>
        {data.map((d, i) => {
          const barH = Math.max(2, Math.round((d.count / maxCount) * H));
          const x = i * (BAR_W + 1);
          return (
            <g key={i}>
              <rect
                x={x} y={H - barH} width={BAR_W} height={barH}
                fill={d.count > 0 ? "var(--accent)" : "var(--bg-elevated)"}
                rx={1}
                opacity={d.count > 0 ? 0.8 : 1}
              />
              {(i === 0 || i === Math.floor(data.length / 2) || i === data.length - 1) && (
                <text x={x + BAR_W / 2} y={H + 14} textAnchor="middle" fontSize={8} fill="var(--text-muted)">{d.date}</text>
              )}
              {d.count > 0 && (
                <title>{d.date}: {d.count} message{d.count !== 1 ? "s" : ""}</title>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi<UsageData>("/api/usage")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 24, fontSize: 12, color: "var(--text-muted)" }}>Loading...</div>;
  if (!data) return <div style={{ padding: 24, fontSize: 12, color: "var(--text-muted)" }}>Failed to load usage data.</div>;

  const totalCost = (data.modelBreakdown ?? []).reduce((sum, m) =>
    sum + estimateCost(m.model, m.input_tokens ?? 0, m.output_tokens ?? 0), 0
  );

  const stats = [
    { label: "Total Sessions", value: fmtNum(data.totalSessions), sub: `${fmtNum(data.sessionsLast30Days)} last 30 days` },
    { label: "Total Messages", value: fmtNum(data.totalMessages), sub: `${fmtNum(data.messagesLast7Days)} last 7 days` },
    { label: "Input Tokens", value: fmtNum(data.totalInputTokens), sub: "all time" },
    { label: "Output Tokens", value: fmtNum(data.totalOutputTokens), sub: "all time" },
    { label: "Est. Cost", value: fmtCost(totalCost), sub: "based on public pricing" },
  ];

  return (
    <div style={{ padding: 20, overflow: "auto", height: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, maxWidth: 680 }}>
        {stats.map(s => (
          <div
            key={s.label}
            style={{
              background: "var(--bg-elevated)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)", padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-mono)", lineHeight: 1 }}>
              {s.value}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {s.label}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      {(data.timeline ?? []).some(d => d.count > 0) && (
        <div style={{ maxWidth: 680 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>Messages — Last 30 Days</div>
          <TimelineChart data={data.timeline!} />
        </div>
      )}

      {/* Model breakdown */}
      {(data.modelBreakdown ?? []).length > 0 && (
        <div style={{ maxWidth: 680 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>By Model</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(data.modelBreakdown ?? []).map(m => {
              const cost = estimateCost(m.model, m.input_tokens ?? 0, m.output_tokens ?? 0);
              const total = (m.input_tokens ?? 0) + (m.output_tokens ?? 0);
              return (
                <div key={m.model} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                  background: "var(--bg-elevated)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)", fontSize: 12,
                }}>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent)", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.model}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{m.sessions} sessions</span>
                  <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 10 }}>{fmtNum(total)} tok</span>
                  <span style={{ color: "var(--green)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, minWidth: 50, textAlign: "right" }}>{fmtCost(cost)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top sessions */}
      {(data.topSessions ?? []).length > 0 && (
        <div style={{ maxWidth: 680 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>Top Sessions by Token Usage</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {(data.topSessions ?? []).map((s, i) => {
              const total = (s.input_tokens ?? 0) + (s.output_tokens ?? 0);
              const cost = estimateCost(s.model, s.input_tokens ?? 0, s.output_tokens ?? 0);
              return (
                <div key={s.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "7px 12px",
                  background: "var(--bg-elevated)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)", fontSize: 12,
                }}>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", minWidth: 16, textAlign: "right" }}>{i + 1}</span>
                  <span style={{ color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                  <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>{fmtNum(total)} tok</span>
                  <span style={{ color: "var(--green)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, minWidth: 50, textAlign: "right" }}>{fmtCost(cost)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
