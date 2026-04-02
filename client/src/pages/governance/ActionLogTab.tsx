import { useState, useEffect, useCallback } from "react";
import { Activity } from "lucide-react";
import { Skeleton, SkeletonCard } from "../../components/shared/Skeleton";
import { fetchApi } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import type { AgentAction, Summary } from "./types";
import { OutcomeBadge, TypeBadge } from "./PoliciesTab";

type SortKey = "created_at" | "agent_id" | "action_type" | "target";
type SortDir = "asc" | "desc";

export function ActionLogTab() {
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [outcomeFilter, setOutcomeFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [loading, setLoading] = useState(true);

  const LIMIT = 100;

  const loadSummary = useCallback(() => {
    fetchApi("/api/governance/summary")
      .then(r => r.json())
      .then((d: Summary) => setSummary(d))
      .catch(() => {});
  }, []);

  const loadActions = useCallback((off: number, outcome: string | null) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
    if (outcome) params.set("outcome", outcome);
    fetchApi(`/api/governance/actions?${params}`)
      .then(r => r.json())
      .then((d: { actions: AgentAction[]; total: number }) => {
        if (off === 0) setActions(d.actions);
        else setActions(prev => [...prev, ...d.actions]);
        setTotal(d.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSummary();
    loadActions(0, null);
  }, [loadSummary, loadActions]);

  const applyFilter = (outcome: string | null) => {
    setOutcomeFilter(outcome);
    setOffset(0);
    loadActions(0, outcome);
  };

  const loadMore = () => {
    const next = offset + LIMIT;
    setOffset(next);
    loadActions(next, outcomeFilter);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const actionTypes = Array.from(new Set(actions.map(a => a.action_type))).sort();

  const displayed = [...actions]
    .filter(a => typeFilter === null || a.action_type === typeFilter)
    .sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });

  const exportCSV = () => {
    const rows = [
      ["timestamp", "agent", "action_type", "target", "outcome", "session_id", "policy_id"],
      ...displayed.map(a => [
        fmtDateTime(a.created_at),
        a.agent_id ?? "",
        a.action_type,
        a.target ?? "",
        a.outcome,
        a.session_id ?? "",
        a.policy_id ?? "",
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `action-log-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filterBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? "var(--accent-bg)" : "none",
    border: `1px solid ${active ? "var(--accent)" : "var(--border-dim)"}`,
    color: active ? "var(--accent)" : "var(--text-dim)",
    padding: "3px 10px",
    fontFamily: "var(--font)", fontSize: 10,
    letterSpacing: "0.06em", cursor: "pointer",
    borderRadius: 0,
  });

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return <span style={{ opacity: 0.25, marginLeft: 3 }}>&#8597;</span>;
    return <span style={{ marginLeft: 3, color: "var(--accent)" }}>{sortDir === "asc" ? "\u2191" : "\u2193"}</span>;
  };

  const thStyle = (_key: SortKey): React.CSSProperties => ({
    padding: "6px 10px", textAlign: "left",
    fontSize: 10, letterSpacing: "0.06em",
    color: "var(--text-dimmer)", fontWeight: 600,
    cursor: "pointer", userSelect: "none",
    whiteSpace: "nowrap",
  });

  return (
    <div>
      {summary && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          {[
            { label: "TOTAL ACTIONS", value: summary.total, color: "var(--text)" },
            { label: "BLOCKED",       value: summary.blocked, color: "var(--red)" },
            { label: "FLAGGED",       value: summary.flagged, color: "var(--yellow)" },
          ].map(s => (
            <div key={s.label} style={{
              background: "var(--bg-2)",
              border: "1px solid var(--border-dim)",
              padding: "10px 16px",
              minWidth: 100,
            }}>
              <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-dimmer)", marginBottom: 4 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, color: s.color, fontFamily: "var(--font)" }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "var(--text-dimmer)", letterSpacing: "0.06em", marginRight: 4 }}>OUTCOME:</span>
        {([null, "blocked", "flagged"] as const).map(f => (
          <button
            key={f ?? "all"}
            onClick={() => applyFilter(f)}
            style={filterBtnStyle(outcomeFilter === f)}
          >
            {f === null ? "ALL" : f.toUpperCase()}
          </button>
        ))}
      </div>

      {actionTypes.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "var(--text-dimmer)", letterSpacing: "0.06em", marginRight: 4 }}>TYPE:</span>
          <button
            onClick={() => setTypeFilter(null)}
            style={filterBtnStyle(typeFilter === null)}
          >
            ALL
          </button>
          {actionTypes.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t === typeFilter ? null : t)}
              style={filterBtnStyle(typeFilter === t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--text-dimmer)", flex: 1 }}>
          {displayed.length} / {total} actions
        </span>
        <button
          onClick={exportCSV}
          disabled={displayed.length === 0}
          style={{
            background: "none", border: "1px solid var(--border-dim)",
            color: "var(--text-dim)", padding: "3px 10px",
            fontFamily: "var(--font)", fontSize: 10,
            cursor: displayed.length === 0 ? "not-allowed" : "pointer",
            letterSpacing: "0.04em",
            opacity: displayed.length === 0 ? 0.4 : 1,
          }}
        >
          &#8595; EXPORT CSV
        </button>
      </div>

      {loading && actions.length === 0 ? (
        <div style={{ border: "1px solid var(--border-dim)", overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "160px 120px 100px 1fr 80px",
            padding: "6px 10px", background: "var(--bg-3)",
            borderBottom: "1px solid var(--border-dim)",
          }}>
            <Skeleton width={60} height={8} />
          </div>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "160px 120px 100px 1fr 80px",
              alignItems: "center", padding: "9px 10px", gap: 8,
              borderBottom: i < 4 ? "1px solid var(--border-dim)" : "none",
            }}>
              <Skeleton height={10} width={100} />
              <Skeleton height={10} width={70} />
              <SkeletonCard width={60} height={18} />
              <Skeleton height={10} width={`${40 + (i % 3) * 20}%`} />
              <SkeletonCard width={52} height={18} />
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "48px 20px", gap: 12,
        }}>
          <Activity size={32} style={{ color: "var(--text-dimmer)", opacity: 0.5 }} />
          <div style={{
            fontSize: 13, fontWeight: 600, color: "var(--text-dim)",
            fontFamily: "var(--font-ui)", letterSpacing: "0.02em",
          }}>
            No actions logged yet
          </div>
          <div style={{
            fontSize: 11, color: "var(--text-dimmer)", textAlign: "center",
            fontFamily: "var(--font-ui)", maxWidth: 340, lineHeight: 1.5,
          }}>
            Agent actions (file writes, shell commands, git operations) will be logged here as they are evaluated against your policies.
          </div>
        </div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-dim)", background: "var(--bg-3)" }}>
                <th style={thStyle("created_at")} onClick={() => handleSort("created_at")}>
                  TIMESTAMP {sortIndicator("created_at")}
                </th>
                <th style={thStyle("agent_id")} onClick={() => handleSort("agent_id")}>
                  AGENT {sortIndicator("agent_id")}
                </th>
                <th style={thStyle("action_type")} onClick={() => handleSort("action_type")}>
                  TYPE {sortIndicator("action_type")}
                </th>
                <th style={thStyle("target")} onClick={() => handleSort("target")}>
                  TARGET {sortIndicator("target")}
                </th>
                <th style={{
                  padding: "6px 10px", textAlign: "left",
                  fontSize: 10, letterSpacing: "0.06em",
                  color: "var(--text-dimmer)", fontWeight: 600,
                }}>
                  OUTCOME
                </th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(a => (
                <tr
                  key={a.id}
                  className="hoverable"
                  style={{ borderBottom: "1px solid var(--border-dim)" }}
                >
                  <td style={{ padding: "7px 10px", color: "var(--text-dimmer)", fontSize: 11, fontFamily: "var(--font)", whiteSpace: "nowrap" }}>
                    {fmtDateTime(a.created_at)}
                  </td>
                  <td style={{ padding: "7px 10px", color: "var(--text-dim)", fontFamily: "var(--font)", fontSize: 11 }}>
                    {a.agent_id ?? <span style={{ opacity: 0.4 }}>&mdash;</span>}
                  </td>
                  <td style={{ padding: "7px 10px" }}>
                    <TypeBadge type={a.action_type} />
                  </td>
                  <td style={{
                    padding: "7px 10px", color: "var(--text-dim)",
                    fontFamily: "var(--font)", fontSize: 11,
                    maxWidth: 280, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {a.target ?? <span style={{ opacity: 0.4 }}>&mdash;</span>}
                  </td>
                  <td style={{ padding: "7px 10px" }}>
                    <OutcomeBadge outcome={a.outcome} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {actions.length < total && (
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
                {loading ? "LOADING\u2026" : `LOAD MORE (${total - actions.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
