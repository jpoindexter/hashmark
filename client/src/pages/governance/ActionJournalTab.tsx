import { useState, useEffect, useCallback } from "react";
import { FileText } from "lucide-react";
import { Skeleton, SkeletonCard } from "../../components/shared/Skeleton";
import { fetchApi } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import type { JournalEvent } from "./types";

function ActionBadge({ action }: { action: string }) {
  const colorMap: Record<string, string> = {
    file_write:      "var(--accent)",
    file_read:       "#6366f1",
    bash_exec:       "var(--yellow)",
    git_commit:      "var(--blue)",
    git_merge:       "#8b5cf6",
    test_run:        "#ec4899",
    worktree_create: "#14b8a6",
    worktree_remove: "var(--text-dim)",
  };
  const color = colorMap[action] ?? "var(--text-dim)";
  return (
    <span style={{
      display: "inline-block",
      padding: "1px 7px",
      fontSize: 10,
      fontFamily: "var(--font)",
      fontWeight: 600,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      background: `${color}1a`,
      color,
      borderRadius: 2,
    }}>
      {action.replace(/_/g, " ")}
    </span>
  );
}

function JournalOutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    success: { bg: "var(--accent-bg)", color: "var(--accent)" },
    failure: { bg: "var(--red-bg)",  color: "var(--red)" },
    skipped: { bg: "rgba(113,113,122,0.15)", color: "var(--text-dim)" },
  };
  const s = map[outcome] ?? map.skipped;
  return (
    <span style={{
      display: "inline-block",
      padding: "1px 7px",
      fontSize: 10,
      fontFamily: "var(--font)",
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      background: s.bg,
      color: s.color,
      borderRadius: 2,
    }}>
      {outcome}
    </span>
  );
}

export function ActionJournalTab() {
  const [events, setEvents] = useState<JournalEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 100;

  const load = useCallback((off: number) => {
    setLoading(true);
    fetchApi(`/api/governance/action-log?limit=${LIMIT}&offset=${off}`)
      .then(r => r.json())
      .then((d: { events: JournalEvent[]; total: number }) => {
        if (off === 0) setEvents(d.events);
        else setEvents(prev => [...prev, ...d.events]);
        setTotal(d.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(0); }, [load]);

  const loadMore = () => {
    const next = offset + LIMIT;
    setOffset(next);
    load(next);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: "var(--text-dimmer)", letterSpacing: "0.04em" }}>
          Append-only JSONL audit trail from agent runs
        </span>
        <span style={{ fontSize: 11, color: "var(--text-dimmer)" }}>
          {events.length} / {total}
        </span>
      </div>

      {loading && events.length === 0 ? (
        <div style={{ border: "1px solid var(--border-dim)", overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "80px 100px 100px 100px 1fr 80px",
            padding: "6px 10px", background: "var(--bg-3)",
            borderBottom: "1px solid var(--border-dim)",
          }}>
            <Skeleton width={30} height={8} />
          </div>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "80px 100px 100px 100px 1fr 80px",
              alignItems: "center", padding: "9px 10px", gap: 8,
              borderBottom: i < 4 ? "1px solid var(--border-dim)" : "none",
            }}>
              <Skeleton height={10} width={50} />
              <Skeleton height={10} width={70} />
              <Skeleton height={10} width={60} />
              <SkeletonCard width={72} height={18} />
              <Skeleton height={10} width={`${35 + (i % 4) * 15}%`} />
              <SkeletonCard width={52} height={18} />
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "48px 20px", gap: 12,
        }}>
          <FileText size={32} style={{ color: "var(--text-dimmer)", opacity: 0.5 }} />
          <div style={{
            fontSize: 13, fontWeight: 600, color: "var(--text-dim)",
            fontFamily: "var(--font-ui)", letterSpacing: "0.02em",
          }}>
            No journal entries yet
          </div>
          <div style={{
            fontSize: 11, color: "var(--text-dimmer)", textAlign: "center",
            fontFamily: "var(--font-ui)", maxWidth: 340, lineHeight: 1.5,
          }}>
            The append-only JSONL audit trail records every action taken during agent runs -- file writes, shell commands, git operations, and their outcomes.
          </div>
        </div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-dim)" }}>
                {["WHEN", "RUN", "AGENT", "ACTION", "TARGET", "OUTCOME"].map(h => (
                  <th key={h} style={{
                    padding: "6px 10px", textAlign: "left",
                    fontSize: 10, letterSpacing: "0.06em",
                    color: "var(--text-dimmer)", fontWeight: 600,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr
                  key={i}
                  className="hoverable"
                  style={{ borderBottom: "1px solid var(--border-dim)" }}
                  title={e.detail}
                >
                  <td style={{ padding: "7px 10px", color: "var(--text-dimmer)", fontSize: 11, fontFamily: "var(--font)", whiteSpace: "nowrap" }}>
                    {timeAgo(e.timestamp)}
                  </td>
                  <td style={{ padding: "7px 10px", color: "var(--text-dim)", fontFamily: "var(--font)", fontSize: 11 }}>
                    {e.runId}
                    {e.workerId !== undefined && (
                      <span style={{ opacity: 0.5, marginLeft: 4 }}>#{e.workerId}</span>
                    )}
                  </td>
                  <td style={{ padding: "7px 10px", color: "var(--text-dim)", fontFamily: "var(--font)", fontSize: 11 }}>
                    {e.agentId}
                  </td>
                  <td style={{ padding: "7px 10px" }}>
                    <ActionBadge action={e.action} />
                  </td>
                  <td style={{
                    padding: "7px 10px", color: "var(--text-dim)",
                    fontFamily: "var(--font)", fontSize: 11,
                    maxWidth: 260, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                    title={e.target}
                  >
                    {e.target}
                  </td>
                  <td style={{ padding: "7px 10px" }}>
                    <JournalOutcomeBadge outcome={e.outcome} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {events.length < total && (
            <div style={{ padding: "12px 0", textAlign: "center" }}>
              <button
                onClick={loadMore}
                disabled={loading}
                style={{
                  background: "none", border: "1px solid var(--border-dim)",
                  color: "var(--text-dim)", padding: "5px 16px",
                  fontFamily: "var(--font)", fontSize: 11,
                  cursor: loading ? "not-allowed" : "pointer",
                  letterSpacing: "0.04em",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "LOADING\u2026" : `LOAD MORE (${total - events.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
