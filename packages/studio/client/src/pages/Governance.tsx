import { useState, useEffect, useCallback } from "react";
import { Shield } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Policy {
  id: string;
  name: string;
  description: string;
  scope: string;
  rules: unknown[];
  enabled: number;
  created_at: number;
}

interface AgentAction {
  id: number;
  session_id: string | null;
  agent_id: string | null;
  action_type: string;
  target: string | null;
  outcome: string;
  policy_id: string | null;
  created_at: number;
}

interface Summary {
  total: number;
  blocked: number;
  flagged: number;
  byType: { action_type: string; count: number }[];
  recentBlocked: AgentAction[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    allowed: { bg: "rgba(16,185,129,0.12)", color: "#10b981" },
    blocked: { bg: "rgba(239,68,68,0.12)",  color: "#ef4444" },
    flagged: { bg: "rgba(234,179,8,0.12)",   color: "#eab308" },
  };
  const s = map[outcome] ?? { bg: "rgba(113,113,122,0.15)", color: "#71717a" };
  return (
    <span style={{
      display: "inline-block",
      padding: "1px 7px",
      fontSize: 10,
      fontFamily: "var(--font)",
      fontWeight: 700,
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

function TypeBadge({ type }: { type: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "1px 7px",
      fontSize: 10,
      fontFamily: "var(--font)",
      letterSpacing: "0.04em",
      background: "rgba(113,113,122,0.15)",
      color: "var(--text-dim)",
      borderRadius: 2,
    }}>
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// New policy form
// ---------------------------------------------------------------------------

interface PolicyFormProps {
  onSave: () => void;
  onCancel: () => void;
}

function PolicyForm({ onSave, onCancel }: PolicyFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState("all");
  const [rulesRaw, setRulesRaw] = useState("[]");
  const [rulesErr, setRulesErr] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let rules: unknown[];
    try {
      rules = JSON.parse(rulesRaw);
      if (!Array.isArray(rules)) throw new Error("must be array");
      setRulesErr("");
    } catch {
      setRulesErr("Rules must be a valid JSON array");
      return;
    }
    setSaving(true);
    await fetch("/api/governance/policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, scope, rules }),
    });
    setSaving(false);
    onSave();
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--bg)",
    border: "1px solid var(--border-dim)",
    color: "var(--text)",
    fontFamily: "var(--font)",
    fontSize: 12,
    padding: "6px 8px",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 10,
    letterSpacing: "0.06em",
    color: "var(--text-dimmer)",
    marginBottom: 4,
    textTransform: "uppercase",
  };

  return (
    <form onSubmit={e => void handleSubmit(e)} style={{
      background: "var(--bg-2)",
      border: "1px solid var(--border)",
      padding: 16,
      marginBottom: 12,
    }}>
      <div style={{ fontSize: 11, color: "var(--accent)", marginBottom: 12, letterSpacing: "0.04em" }}>
        NEW POLICY
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Name *</label>
          <input
            style={inputStyle}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. no-shell-exec"
            required
          />
        </div>
        <div>
          <label style={labelStyle}>Scope</label>
          <input
            style={inputStyle}
            value={scope}
            onChange={e => setScope(e.target.value)}
            placeholder="all  or  agent_id"
          />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Description</label>
        <input
          style={inputStyle}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What does this policy enforce?"
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Rules (JSON array)</label>
        <textarea
          style={{ ...inputStyle, height: 80, resize: "vertical" }}
          value={rulesRaw}
          onChange={e => setRulesRaw(e.target.value)}
          spellCheck={false}
        />
        {rulesErr && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>{rulesErr}</div>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          style={{
            background: "var(--accent)", color: "#000",
            border: "none", padding: "5px 14px",
            fontFamily: "var(--font)", fontSize: 11, fontWeight: 700,
            cursor: saving ? "not-allowed" : "pointer",
            letterSpacing: "0.04em",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "SAVING…" : "> SAVE POLICY"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: "none", border: "1px solid var(--border-dim)",
            color: "var(--text-dim)", padding: "5px 14px",
            fontFamily: "var(--font)", fontSize: 11,
            cursor: "pointer", letterSpacing: "0.04em",
          }}
        >
          CANCEL
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Policies tab
// ---------------------------------------------------------------------------

function PoliciesTab() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/governance/policies")
      .then(r => r.json())
      .then((d: { policies: Policy[] }) => setPolicies(d.policies))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleEnabled = async (p: Policy) => {
    await fetch(`/api/governance/policies/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: p.enabled === 0 }),
    });
    load();
  };

  const deletePolicy = async (id: string) => {
    if (!confirm("Delete this policy?")) return;
    await fetch(`/api/governance/policies/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: "var(--text-dimmer)", letterSpacing: "0.04em" }}>
          {policies.length} {policies.length === 1 ? "policy" : "policies"}
        </span>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            background: showForm ? "var(--accent-bg)" : "none",
            border: "1px solid var(--border)",
            color: showForm ? "var(--accent)" : "var(--text-dim)",
            padding: "4px 12px",
            fontFamily: "var(--font)", fontSize: 11,
            cursor: "pointer", letterSpacing: "0.04em",
          }}
        >
          {showForm ? "CANCEL" : "+ NEW POLICY"}
        </button>
      </div>

      {showForm && (
        <PolicyForm
          onSave={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div style={{ color: "var(--text-dimmer)", fontSize: 12, padding: "24px 0" }}>Loading…</div>
      ) : policies.length === 0 ? (
        <div style={{
          padding: "40px 0", textAlign: "center",
          color: "var(--text-dimmer)", fontSize: 12,
          fontFamily: "var(--font)",
        }}>
          No policies yet. Create one to start governing agent actions.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-dim)" }}>
              {["NAME", "SCOPE", "RULES", "ENABLED", "CREATED", ""].map(h => (
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
            {policies.map(p => (
              <tr
                key={p.id}
                style={{ borderBottom: "1px solid var(--border-dim)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-bg)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "8px 10px" }}>
                  <div style={{ color: "var(--text)", fontWeight: 600 }}>{p.name}</div>
                  {p.description && (
                    <div style={{ fontSize: 11, color: "var(--text-dimmer)", marginTop: 2 }}>{p.description}</div>
                  )}
                </td>
                <td style={{ padding: "8px 10px", color: "var(--text-dim)", fontFamily: "var(--font)" }}>
                  {p.scope}
                </td>
                <td style={{ padding: "8px 10px", color: "var(--text-dim)" }}>
                  {p.rules.length}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <button
                    onClick={() => void toggleEnabled(p)}
                    style={{
                      background: "none", border: "none",
                      cursor: "pointer",
                      color: p.enabled ? "#10b981" : "var(--text-dimmer)",
                      fontSize: 11, fontFamily: "var(--font)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {p.enabled ? "ON" : "OFF"}
                  </button>
                </td>
                <td style={{ padding: "8px 10px", color: "var(--text-dimmer)", fontSize: 11, fontFamily: "var(--font)" }}>
                  {fmtTime(p.created_at)}
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>
                  <button
                    onClick={() => void deletePolicy(p.id)}
                    style={{
                      background: "none", border: "none",
                      color: "var(--text-dimmer)", cursor: "pointer",
                      fontSize: 13, lineHeight: 1,
                      transition: "color 0.1s",
                    }}
                    title="Delete policy"
                    onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dimmer)")}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action Log tab
// ---------------------------------------------------------------------------

function ActionLogTab() {
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [outcomeFilter, setOutcomeFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const LIMIT = 100;

  const loadSummary = useCallback(() => {
    fetch("/api/governance/summary")
      .then(r => r.json())
      .then((d: Summary) => setSummary(d))
      .catch(() => {});
  }, []);

  const loadActions = useCallback((off: number, outcome: string | null) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
    if (outcome) params.set("outcome", outcome);
    fetch(`/api/governance/actions?${params}`)
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

  const filterBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? "var(--accent-bg)" : "none",
    border: `1px solid ${active ? "var(--accent)" : "var(--border-dim)"}`,
    color: active ? "var(--accent)" : "var(--text-dim)",
    padding: "3px 10px",
    fontFamily: "var(--font)", fontSize: 10,
    letterSpacing: "0.06em", cursor: "pointer",
  });

  return (
    <div>
      {/* Summary stats */}
      {summary && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          {[
            { label: "TOTAL ACTIONS", value: summary.total, color: "var(--text)" },
            { label: "BLOCKED",       value: summary.blocked, color: "#ef4444" },
            { label: "FLAGGED",       value: summary.flagged, color: "#eab308" },
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
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "var(--font)" }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter row */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "var(--text-dimmer)", letterSpacing: "0.06em", marginRight: 4 }}>FILTER:</span>
        {([null, "blocked", "flagged"] as const).map(f => (
          <button
            key={f ?? "all"}
            onClick={() => applyFilter(f)}
            style={filterBtnStyle(outcomeFilter === f)}
          >
            {f === null ? "ALL" : f.toUpperCase()}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--text-dimmer)" }}>
          {actions.length} / {total}
        </span>
      </div>

      {/* Table */}
      {loading && actions.length === 0 ? (
        <div style={{ color: "var(--text-dimmer)", fontSize: 12, padding: "24px 0" }}>Loading…</div>
      ) : actions.length === 0 ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-dimmer)", fontSize: 12 }}>
          No actions logged yet.
        </div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-dim)" }}>
                {["TIMESTAMP", "AGENT", "TYPE", "TARGET", "OUTCOME"].map(h => (
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
              {actions.map(a => (
                <tr
                  key={a.id}
                  style={{ borderBottom: "1px solid var(--border-dim)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-bg)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "7px 10px", color: "var(--text-dimmer)", fontSize: 11, fontFamily: "var(--font)", whiteSpace: "nowrap" }}>
                    {fmtTime(a.created_at)}
                  </td>
                  <td style={{ padding: "7px 10px", color: "var(--text-dim)", fontFamily: "var(--font)", fontSize: 11 }}>
                    {a.agent_id ?? <span style={{ opacity: 0.4 }}>—</span>}
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
                    {a.target ?? <span style={{ opacity: 0.4 }}>—</span>}
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
                {loading ? "LOADING…" : `LOAD MORE (${total - actions.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action Journal tab (JSONL audit trail from agent runs)
// ---------------------------------------------------------------------------

interface JournalEvent {
  timestamp: number;
  runId: string;
  agentId: string;
  workerId?: number;
  action: string;
  target: string;
  outcome: "success" | "failure" | "skipped";
  detail?: string;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ActionBadge({ action }: { action: string }) {
  const colorMap: Record<string, string> = {
    file_write:      "#10b981",
    file_read:       "#6366f1",
    bash_exec:       "#f59e0b",
    git_commit:      "#3b82f6",
    git_merge:       "#8b5cf6",
    test_run:        "#ec4899",
    worktree_create: "#14b8a6",
    worktree_remove: "#71717a",
  };
  const color = colorMap[action] ?? "#71717a";
  return (
    <span style={{
      display: "inline-block",
      padding: "1px 7px",
      fontSize: 10,
      fontFamily: "var(--font)",
      fontWeight: 700,
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
    success: { bg: "rgba(16,185,129,0.12)", color: "#10b981" },
    failure: { bg: "rgba(239,68,68,0.12)",  color: "#ef4444" },
    skipped: { bg: "rgba(113,113,122,0.15)", color: "#71717a" },
  };
  const s = map[outcome] ?? map.skipped;
  return (
    <span style={{
      display: "inline-block",
      padding: "1px 7px",
      fontSize: 10,
      fontFamily: "var(--font)",
      fontWeight: 700,
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

function ActionJournalTab() {
  const [events, setEvents] = useState<JournalEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 100;

  const load = useCallback((off: number) => {
    setLoading(true);
    fetch(`/api/governance/action-log?limit=${LIMIT}&offset=${off}`)
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
        <div style={{ color: "var(--text-dimmer)", fontSize: 12, padding: "24px 0" }}>Loading…</div>
      ) : events.length === 0 ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-dimmer)", fontSize: 12, fontFamily: "var(--font)" }}>
          No actions logged yet.
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
                  style={{ borderBottom: "1px solid var(--border-dim)" }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = "var(--accent-bg)")}
                  onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}
                  title={e.detail}
                >
                  <td style={{ padding: "7px 10px", color: "var(--text-dimmer)", fontSize: 11, fontFamily: "var(--font)", whiteSpace: "nowrap" }}>
                    {relativeTime(e.timestamp)}
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
                {loading ? "LOADING…" : `LOAD MORE (${total - events.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Governance page
// ---------------------------------------------------------------------------

type Tab = "policies" | "actions" | "journal";

export default function Governance() {
  const [tab, setTab] = useState<Tab>("policies");

  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
    color: active ? "var(--text)" : "var(--text-dimmer)",
    padding: "8px 16px",
    fontFamily: "var(--font)",
    fontSize: 11,
    letterSpacing: "0.06em",
    cursor: "pointer",
    transition: "color 0.1s",
  });

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1100, fontFamily: "var(--font-ui)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Shield size={16} style={{ color: "var(--accent)" }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", letterSpacing: "0.02em" }}>
          GOVERNANCE
        </span>
        <span style={{ fontSize: 11, color: "var(--text-dimmer)", marginLeft: 4 }}>
          Policy engine + action log
        </span>
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid var(--border-dim)",
        marginBottom: 20,
      }}>
        <button style={tabStyle(tab === "policies")} onClick={() => setTab("policies")}>
          POLICIES
        </button>
        <button style={tabStyle(tab === "actions")} onClick={() => setTab("actions")}>
          ACTION LOG
        </button>
        <button style={tabStyle(tab === "journal")} onClick={() => setTab("journal")}>
          ACTION LOG (JSONL)
        </button>
      </div>

      {tab === "policies" ? <PoliciesTab /> : tab === "actions" ? <ActionLogTab /> : <ActionJournalTab />}
    </div>
  );
}
