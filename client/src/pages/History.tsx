import { useState, useEffect, useCallback } from "react";
import { Clock } from "lucide-react";
import { DiffPanel } from "../components/DiffPanel.tsx";
import { Skeleton, SkeletonCard } from "../components/shared/Skeleton";

interface AgentRun {
  id: string;
  task: string;
  status: string;
  created_at: number;
  worktree_branch: string | null;
}

interface RunsResponse {
  runs: AgentRun[];
}

interface DiffResponse {
  diff: string;
  branch: string | null;
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "complete" ? "var(--accent)"
    : status === "conflict" ? "var(--yellow)"
    : status === "error" ? "var(--red)"
    : status === "running" ? "var(--cyan)"
    : "var(--text-dimmer)";

  return (
    <span style={{
      display: "inline-block",
      padding: "1px 6px",
      border: `1px solid ${color}`,
      borderRadius: 2,
      fontSize: 9,
      fontFamily: "var(--font, monospace)",
      letterSpacing: "0.07em",
      textTransform: "uppercase",
      color,
      whiteSpace: "nowrap",
    }}>
      {status}
    </span>
  );
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function History() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeDiff, setActiveDiff] = useState<string | null>(null); // run id
  const [diffText, setDiffText] = useState<string>("");
  const [diffFilename, setDiffFilename] = useState<string>("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/run/runs")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<RunsResponse>;
      })
      .then(d => { setRuns(d.runs ?? []); setLoading(false); })
      .catch(e => { setError(e instanceof Error ? e.message : String(e)); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  function openDiff(run: AgentRun) {
    if (activeDiff === run.id) {
      setActiveDiff(null);
      return;
    }
    setActiveDiff(run.id);
    setDiffText("");
    setDiffError(null);
    setDiffLoading(true);
    setDiffFilename(run.worktree_branch ?? run.task.slice(0, 40));

    fetch(`/api/run/runs/${run.id}/diff`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<DiffResponse>;
      })
      .then(d => {
        setDiffText(d.diff ?? "");
        setDiffLoading(false);
      })
      .catch(e => {
        setDiffError(e instanceof Error ? e.message : String(e));
        setDiffLoading(false);
      });
  }

  const monoMuted: React.CSSProperties = {
    padding: 16,
    fontFamily: "var(--font, monospace)",
    fontSize: 12,
    color: "var(--text-dimmer)",
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", position: "relative" }}>

      {/* Main run list */}
      <div style={{
        flex: 1,
        overflow: "auto",
        padding: "24px 28px",
        minWidth: 0,
      }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: "var(--text)",
            marginBottom: 4,
            fontFamily: "var(--font-ui, sans-serif)",
          }}>
            HISTORY
          </h1>
          <div style={{ fontSize: 11, color: "var(--text-dimmer)", fontFamily: "var(--font-ui, sans-serif)" }}>
            Past agent runs — click "View diff" to inspect changes
          </div>
        </div>

        {loading && (
          <div style={{
            border: "1px solid var(--border-dim)",
            borderRadius: "var(--radius, 0)",
            overflow: "hidden",
          }}>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 100px 90px",
              padding: "6px 14px",
              background: "var(--bg-3)",
              borderBottom: "1px solid var(--border-dim)",
            }}>
              <Skeleton width={40} height={8} />
            </div>
            {[0, 1, 2, 3, 4].map(i => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 100px 90px",
                  alignItems: "center",
                  padding: "10px 14px",
                  gap: 8,
                  borderBottom: i < 4 ? "1px solid var(--border-dim)" : "none",
                }}
              >
                <Skeleton height={10} width={`${60 + (i % 3) * 15}%`} />
                <Skeleton height={10} width={80} />
                <SkeletonCard width={56} height={18} />
                <Skeleton height={10} width={60} />
              </div>
            ))}
          </div>
        )}
        {error && (
          <div style={{ ...monoMuted, color: "var(--red)" }}>
            Failed to load runs: {error}
          </div>
        )}

        {!loading && !error && runs.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", padding: "60px 20px", gap: 12,
          }}>
            <Clock size={32} style={{ color: "var(--text-dimmer)", opacity: 0.5 }} />
            <div style={{
              fontSize: 13, fontWeight: 600, color: "var(--text-dim)",
              fontFamily: "var(--font-ui, sans-serif)", letterSpacing: "0.02em",
            }}>
              No runs yet
            </div>
            <div style={{
              fontSize: 11, color: "var(--text-dimmer)", textAlign: "center",
              fontFamily: "var(--font-ui, sans-serif)", maxWidth: 320, lineHeight: 1.5,
            }}>
              Past agent runs will appear here with their status, timestamps, and diffs. Start a run from the Run page.
            </div>
            <a
              href="/run"
              style={{
                marginTop: 4,
                display: "inline-block",
                padding: "6px 16px",
                background: "none",
                border: "1px solid var(--border)",
                color: "var(--text-dim)",
                fontFamily: "var(--font, monospace)",
                fontSize: 11,
                textDecoration: "none",
                letterSpacing: "0.04em",
                cursor: "pointer",
                transition: "border-color 0.1s, color 0.1s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--accent)";
                (e.currentTarget as HTMLAnchorElement).style.color = "var(--accent)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)";
                (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-dim)";
              }}
            >
              Go to Run
            </a>
          </div>
        )}

        {!loading && !error && runs.length > 0 && (
          <div style={{
            border: "1px solid var(--border-dim)",
            borderRadius: "var(--radius, 0)",
            overflow: "hidden",
          }}>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 100px 90px",
              padding: "6px 14px",
              background: "var(--bg-3)",
              borderBottom: "1px solid var(--border-dim)",
              fontSize: 9,
              letterSpacing: "0.08em",
              color: "var(--text-dimmer)",
              textTransform: "uppercase",
              fontFamily: "var(--font-ui, sans-serif)",
            }}>
              <span>Task</span>
              <span>Date</span>
              <span>Status</span>
              <span />
            </div>

            {runs.map((run, idx) => {
              const isActive = activeDiff === run.id;
              return (
                <div
                  key={run.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 120px 100px 90px",
                    alignItems: "center",
                    padding: "10px 14px",
                    borderBottom: idx < runs.length - 1
                      ? "1px solid var(--border-dim)"
                      : "none",
                    background: isActive
                      ? "var(--accent-bg)"
                      : "transparent",
                    transition: "background 0.1s",
                    gap: 8,
                  }}
                >
                  {/* Task */}
                  <div style={{
                    fontFamily: "var(--font, monospace)",
                    fontSize: 12,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                    title={run.task}
                  >
                    {run.task || <span style={{ color: "var(--text-dimmer)" }}>—</span>}
                  </div>

                  {/* Date */}
                  <div style={{
                    fontFamily: "var(--font, monospace)",
                    fontSize: 11,
                    color: "var(--text-dim)",
                    whiteSpace: "nowrap",
                  }}>
                    {formatTs(run.created_at)}
                  </div>

                  {/* Status */}
                  <div>
                    <StatusBadge status={run.status} />
                  </div>

                  {/* Action */}
                  <div>
                    <button
                      onClick={() => openDiff(run)}
                      style={{
                        background: "none",
                        border: "1px solid var(--border-dim)",
                        borderRadius: "var(--radius, 0)",
                        cursor: "pointer",
                        color: isActive ? "var(--accent)" : "var(--text-dim)",
                        fontFamily: "var(--font, monospace)",
                        fontSize: 10,
                        padding: "3px 8px",
                        letterSpacing: "0.04em",
                        transition: "color 0.1s, border-color 0.1s",
                        whiteSpace: "nowrap",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
                      }}
                      onMouseLeave={e => {
                        if (!isActive) {
                          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)";
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-dim)";
                        }
                      }}
                    >
                      {isActive ? "CLOSE" : "VIEW DIFF"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Diff panel — fixed right drawer */}
      {activeDiff && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setActiveDiff(null)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 40,
              background: "rgba(0,0,0,0.35)",
            }}
          />

          {/* Drawer */}
          <div style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
            width: "clamp(320px, 40vw, 680px)",
            display: "flex",
            flexDirection: "column",
            boxShadow: "-4px 0 24px rgba(0,0,0,0.5)",
          }}>
            {diffLoading ? (
              <div style={{
                flex: 1,
                background: "var(--bg)",
                borderLeft: "1px solid var(--border-dim)",
                display: "flex",
                alignItems: "flex-start",
                padding: 20,
                fontFamily: "var(--font, monospace)",
                fontSize: 12,
                color: "var(--text-dimmer)",
              }}>
                {/* Filename header while loading */}
                <div style={{ width: "100%" }}>
                  <div style={{
                    height: 36,
                    display: "flex",
                    alignItems: "center",
                    padding: "0 12px",
                    background: "var(--bg-2)",
                    borderBottom: "1px solid var(--border-dim)",
                    marginBottom: 16,
                    gap: 8,
                  }}>
                    <span style={{ flex: 1, fontFamily: "var(--font, monospace)", fontSize: 11, color: "var(--text-dim)" }}>
                      {diffFilename}
                    </span>
                    <button
                      onClick={() => setActiveDiff(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dimmer)", fontSize: 16, padding: "0 4px", lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </div>
                  Loading diff...
                </div>
              </div>
            ) : diffError ? (
              <div style={{
                flex: 1,
                background: "var(--bg)",
                borderLeft: "1px solid var(--border-dim)",
                padding: 20,
                fontFamily: "var(--font, monospace)",
                fontSize: 12,
                color: "var(--red)",
              }}>
                {diffError}
              </div>
            ) : (
              <DiffPanel
                diff={diffText}
                filename={diffFilename}
                onClose={() => setActiveDiff(null)}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
