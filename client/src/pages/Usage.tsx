import { useState, useEffect } from "react";
import { BarChart3, Bot, Cpu, DollarSign, Zap } from "lucide-react";
import { PageShell, PageHeader } from "../components/shared/PageShell";
import { Skeleton } from "../components/shared/Skeleton";
import { fetchApi } from "../lib/api";

interface TopAgent {
  agentId: string;
  runCount: number;
}

interface ModelStats {
  runs: number;
  cost: number;
}

interface UsageData {
  totalRuns: number;
  totalSessions: number;
  totalCostUsd: number;
  runsToday: number;
  runsThisWeek: number;
  avgCostPerRun: number;
  topAgents: TopAgent[];
  modelUsage: Record<string, ModelStats>;
}

function formatUsd(n: number): string {
  return n < 0.01 && n > 0 ? "<$0.01" : `$${n.toFixed(2)}`;
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily: "var(--font)",
          fontSize: 10,
          color: "var(--text-dimmer)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}>
          {label}
        </span>
        <span style={{ color: "var(--text-dimmer)", opacity: 0.5 }}>
          {icon}
        </span>
      </div>
      <div style={{
        fontFamily: "var(--font)",
        fontSize: 22,
        fontWeight: 600,
        color: "var(--accent)",
        letterSpacing: "-0.02em",
      }}>
        {value}
      </div>
    </div>
  );
}

function ModelBar({ model, stats, maxRuns }: { model: string; stats: ModelStats; maxRuns: number }) {
  const pct = maxRuns > 0 ? (stats.runs / maxRuns) * 100 : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: 4,
      }}>
        <span style={{
          fontFamily: "var(--font)",
          fontSize: 11,
          color: "var(--text-dim)",
        }}>
          {model}
        </span>
        <span style={{
          fontFamily: "var(--font)",
          fontSize: 10,
          color: "var(--text-dimmer)",
        }}>
          {stats.runs} runs &middot; {formatUsd(stats.cost)}
        </span>
      </div>
      <div style={{
        height: 6,
        background: "var(--bg-3)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: "var(--accent)",
          borderRadius: "var(--radius)",
          transition: "width 0.3s ease",
          minWidth: pct > 0 ? 4 : 0,
        }} />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}>
            <Skeleton width={80} height={10} />
            <Skeleton width={60} height={22} />
          </div>
        ))}
      </div>
      <Skeleton width={120} height={10} style={{ marginBottom: 16 }} />
      {[0, 1, 2].map(i => (
        <div key={i} style={{ marginBottom: 12 }}>
          <Skeleton width="60%" height={10} style={{ marginBottom: 4 }} />
          <Skeleton width="100%" height={6} />
        </div>
      ))}
    </>
  );
}

export default function Usage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi("/api/settings/usage")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<UsageData>;
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, []);

  const modelEntries = data ? Object.entries(data.modelUsage) : [];
  const maxModelRuns = modelEntries.reduce((mx, [, s]) => Math.max(mx, s.runs), 0);

  return (
    <PageShell>
      <PageHeader title="USAGE" subtitle="Aggregated run and cost statistics" />

      {loading && <LoadingSkeleton />}

      {error && (
        <div style={{
          fontFamily: "var(--font)",
          fontSize: 12,
          color: "var(--red)",
          background: "var(--red-bg)",
          border: "1px solid var(--red)",
          borderRadius: "var(--radius)",
          padding: "10px 14px",
        }}>
          Failed to load usage data: {error}
        </div>
      )}

      {data && (
        <>
          {/* Top stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}>
            <StatCard label="Total Runs" value={String(data.totalRuns)} icon={<Zap size={14} />} />
            <StatCard label="Total Cost" value={formatUsd(data.totalCostUsd)} icon={<DollarSign size={14} />} />
            <StatCard label="Runs Today" value={String(data.runsToday)} icon={<BarChart3 size={14} />} />
            <StatCard label="Avg Cost/Run" value={formatUsd(data.avgCostPerRun)} icon={<Cpu size={14} />} />
          </div>

          {/* Model usage */}
          {modelEntries.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{
                fontFamily: "var(--font)",
                fontSize: 10,
                color: "var(--text-dimmer)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}>
                Model Usage
              </div>
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: 16,
              }}>
                {modelEntries
                  .sort(([, a], [, b]) => b.runs - a.runs)
                  .map(([model, stats]) => (
                    <ModelBar key={model} model={model} stats={stats} maxRuns={maxModelRuns} />
                  ))}
              </div>
            </div>
          )}

          {/* Top agents */}
          {data.topAgents.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{
                fontFamily: "var(--font)",
                fontSize: 10,
                color: "var(--text-dimmer)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}>
                Top Agents
              </div>
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                overflow: "hidden",
              }}>
                {data.topAgents
                  .sort((a, b) => b.runCount - a.runCount)
                  .map((agent, idx) => (
                    <div
                      key={agent.agentId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 16px",
                        borderBottom: idx < data.topAgents.length - 1
                          ? "1px solid var(--border-dim)"
                          : "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Bot size={14} style={{ color: "var(--text-dimmer)" }} />
                        <span style={{
                          fontFamily: "var(--font)",
                          fontSize: 12,
                          color: "var(--text)",
                        }}>
                          {agent.agentId}
                        </span>
                      </div>
                      <span style={{
                        fontFamily: "var(--font)",
                        fontSize: 11,
                        color: "var(--text-dim)",
                      }}>
                        {agent.runCount} runs
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Summary footer */}
          <div style={{
            display: "flex",
            gap: 24,
            fontFamily: "var(--font)",
            fontSize: 10,
            color: "var(--text-dimmer)",
            letterSpacing: "0.04em",
          }}>
            <span>{data.totalSessions} total sessions</span>
            <span>{data.runsThisWeek} runs this week</span>
          </div>
        </>
      )}
    </PageShell>
  );
}
