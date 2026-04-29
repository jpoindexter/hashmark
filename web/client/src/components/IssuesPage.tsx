import { useState, useEffect, useCallback } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";
import type { Agent } from "../types";
import { IssueRow, CreateIssueModal, STATUS_ORDER, STATUS_LABELS, STATUS_COLORS } from "./IssueComponents";
import type { Issue, IssueStatus } from "./IssueComponents";
import { IssueDetail } from "./IssueDetail";

export function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filter, setFilter] = useState<IssueStatus | "all">("all");
  const [selected, setSelected] = useState<Issue | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [issueData, agentData] = await Promise.all([
        fetchApi<Issue[]>("/api/issues"),
        fetchApi<Agent[]>("/api/agents"),
      ]);
      setIssues(issueData);
      setAgents(agentData);
    } catch {
      toast.error("Failed to load issues");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = filter === "all" ? issues : issues.filter(i => i.status === filter);

  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = issues.filter(i => i.status === s).length;
    return acc;
  }, {} as Record<IssueStatus, number>);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Issue list */}
      <div style={{ display: "flex", flexDirection: "column", flex: selected ? "0 0 380px" : 1, borderRight: selected ? "1px solid var(--border)" : "none", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "6px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", flexShrink: 0 }}>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            + New Issue
          </button>
        </div>

        {/* Status tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", flexShrink: 0, overflowX: "auto" }}>
          {(["all", ...STATUS_ORDER] as Array<"all" | IssueStatus>).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                padding: "6px 12px", fontSize: 11, border: "none",
                background: "none", cursor: "pointer", whiteSpace: "nowrap",
                color: filter === s ? "var(--text)" : "var(--text-muted)",
                borderBottom: filter === s ? "2px solid var(--accent)" : "2px solid transparent",
                fontWeight: filter === s ? 600 : 400,
              }}
            >
              {s === "all" ? "All" : STATUS_LABELS[s]}
              {s !== "all" && counts[s] > 0 && (
                <span style={{ marginLeft: 5, color: STATUS_COLORS[s], fontSize: 10 }}>{counts[s]}</span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12 }}>Loading...</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
              No issues yet.{" "}
              <button onClick={() => setCreating(true)} style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>
                Create one
              </button>
            </div>
          )}
          {filtered.map(issue => (
            <IssueRow
              key={issue.id}
              issue={issue}
              agents={agents}
              active={selected?.id === issue.id}
              onClick={() => setSelected(selected?.id === issue.id ? null : issue)}
              onUpdate={(updated) => {
                setIssues(prev => prev.map(i => i.id === updated.id ? updated : i));
                if (selected?.id === updated.id) setSelected(updated);
              }}
            />
          ))}
        </div>
      </div>

      {/* Issue detail */}
      {selected && (
        <IssueDetail
          issue={selected}
          agents={agents}
          onClose={() => setSelected(null)}
          onUpdate={(updated) => {
            setIssues(prev => prev.map(i => i.id === updated.id ? updated : i));
            setSelected(updated);
          }}
          onDelete={(id) => {
            setIssues(prev => prev.filter(i => i.id !== id));
            setSelected(null);
          }}
        />
      )}

      {/* Create modal */}
      {creating && (
        <CreateIssueModal
          onClose={() => setCreating(false)}
          onCreate={(issue) => {
            setIssues(prev => [issue, ...prev]);
            setCreating(false);
            setSelected(issue);
          }}
        />
      )}
    </div>
  );
}

