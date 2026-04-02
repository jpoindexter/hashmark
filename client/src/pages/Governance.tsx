import { useState, useEffect, useCallback, useRef } from "react";
import { Shield, Activity, FileText } from "lucide-react";
import { PageShell } from "../components/shared/PageShell.tsx";
import { Skeleton, SkeletonCard } from "../components/shared/Skeleton";
import Toggle from "../components/shared/Toggle";
import { fetchApi } from "../lib/api";
import { fmtDateTime, timeAgo } from "../lib/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PolicyRule {
  type: "block" | "warn" | "require";
  pattern: string;
  message: string;
}

interface Policy {
  id: string;
  name: string;
  description: string;
  scope: string;
  rules: PolicyRule[];
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

function OutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    allowed: { bg: "var(--accent-bg)", color: "var(--accent)" },
    blocked: { bg: "var(--red-bg)",  color: "var(--red)" },
    flagged: { bg: "var(--yellow-bg)",   color: "var(--yellow)" },
  };
  const s = map[outcome] ?? { bg: "rgba(113,113,122,0.15)", color: "var(--text-dim)" };
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
// Delete confirm tooltip
// ---------------------------------------------------------------------------

function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Delete policy"
        style={{
          background: "none", border: "none",
          color: open ? "var(--red)" : "var(--text-dimmer)",
          cursor: "pointer", fontSize: 15, lineHeight: 1,
          transition: "color 0.1s", padding: "0 2px",
        }}
        className={open ? "" : "hoverable"}
      >
        ×
      </button>
      {open && (
        <div style={{
          position: "absolute",
          right: 0,
          top: "calc(100% + 4px)",
          background: "var(--bg-3)",
          border: "1px solid var(--border)",
          borderTop: "2px solid var(--red)",
          padding: "10px 12px",
          whiteSpace: "nowrap",
          zIndex: 100,
          minWidth: 160,
        }}>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8 }}>Delete this policy?</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => { setOpen(false); onConfirm(); }}
              style={{
                background: "var(--red)", border: "none", color: "var(--text)",
                padding: "3px 10px", fontFamily: "var(--font)", fontSize: 10,
                fontWeight: 700, cursor: "pointer", letterSpacing: "0.04em",
              }}
            >
              DELETE
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "1px solid var(--border-dim)",
                color: "var(--text-dim)", padding: "3px 10px",
                fontFamily: "var(--font)", fontSize: 10, cursor: "pointer",
              }}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rule templates
// ---------------------------------------------------------------------------

const RULE_TEMPLATES: { label: string; rule: PolicyRule }[] = [
  {
    label: "No secrets in commits",
    rule: { type: "block", pattern: "(?i)(password|secret|api[_-]?key|token)\\s*=\\s*['\"][^'\"]+['\"]", message: "Potential secret detected in commit" },
  },
  {
    label: "No force push",
    rule: { type: "warn", pattern: "git push --force|git push -f", message: "Force push requires review" },
  },
  {
    label: "Require tests",
    rule: { type: "require", pattern: "\\.(test|spec)\\.(ts|tsx|js|jsx)$", message: "Tests required before merge" },
  },
  {
    label: "No prod deploys on Friday",
    rule: { type: "block", pattern: "deploy.*prod|prod.*deploy", message: "Production deploys blocked on Fridays" },
  },
];

// ---------------------------------------------------------------------------
// Policy drawer (create / edit)
// ---------------------------------------------------------------------------

interface PolicyDrawerProps {
  policy: Policy | null; // null = create mode
  onSave: () => void;
  onClose: () => void;
}

function PolicyDrawer({ policy, onSave, onClose }: PolicyDrawerProps) {
  const [name, setName] = useState(policy?.name ?? "");
  const [description, setDescription] = useState(policy?.description ?? "");
  const [scope, setScope] = useState<"session" | "project" | "global">(
    (policy?.scope as "session" | "project" | "global") ?? "project"
  );
  const [rulesRaw, setRulesRaw] = useState(
    policy ? JSON.stringify(policy.rules, null, 2) : "[]"
  );
  const [rulesErr, setRulesErr] = useState("");
  const [enabled, setEnabled] = useState(policy ? Boolean(policy.enabled) : true);
  const [saving, setSaving] = useState(false);

  const isEdit = policy !== null;

  const validateRules = (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("must be array");
      setRulesErr("");
      return parsed as PolicyRule[];
    } catch {
      setRulesErr("Rules must be a valid JSON array");
      return null;
    }
  };

  const addTemplate = (rule: PolicyRule) => {
    try {
      const current = JSON.parse(rulesRaw);
      const next = Array.isArray(current) ? [...current, rule] : [rule];
      setRulesRaw(JSON.stringify(next, null, 2));
      setRulesErr("");
    } catch {
      setRulesRaw(JSON.stringify([rule], null, 2));
      setRulesErr("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rules = validateRules(rulesRaw);
    if (!rules) return;
    setSaving(true);
    if (isEdit) {
      await fetchApi(`/api/governance/policies/${policy.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, scope, rules, enabled }),
      });
    } else {
      await fetchApi("/api/governance/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, scope, rules, enabled }),
      });
    }
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
    borderRadius: 0,
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
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.4)",
          zIndex: 200,
        }}
      />
      {/* Drawer */}
      <div style={{
        position: "fixed",
        top: 0, right: 0, bottom: 0,
        width: 480,
        background: "var(--bg-2)",
        borderLeft: "1px solid var(--border)",
        zIndex: 201,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Drawer header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-dim)",
          background: "var(--bg-3)",
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.06em" }}>
            {isEdit ? "EDIT POLICY" : "NEW POLICY"}
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-dimmer)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <form
          onSubmit={e => void handleSubmit(e)}
          style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}
        >
          {/* Name + Scope */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
              <select
                style={{ ...inputStyle, appearance: "none" }}
                value={scope}
                onChange={e => setScope(e.target.value as "session" | "project" | "global")}
              >
                <option value="session">session</option>
                <option value="project">project</option>
                <option value="global">global</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description <span style={{ opacity: 0.5, textTransform: "none", fontSize: 9 }}>(optional)</span></label>
            <input
              style={inputStyle}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this policy enforce?"
            />
          </div>

          {/* Rule templates */}
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-dimmer)", marginBottom: 6, textTransform: "uppercase" }}>
              Quick-add templates
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {RULE_TEMPLATES.map(t => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => addTemplate(t.rule)}
                  style={{
                    background: "var(--bg-3)",
                    border: "1px solid var(--border-dim)",
                    color: "var(--text-dim)",
                    padding: "3px 9px",
                    fontFamily: "var(--font)",
                    fontSize: 10,
                    cursor: "pointer",
                    letterSpacing: "0.03em",
                    borderRadius: 0,
                    transition: "border-color 0.1s, color 0.1s",
                  }}
                  className="hoverable"
                >
                  + {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rules JSON editor */}
          <div>
            <label style={labelStyle}>Rules (JSON array)</label>
            <textarea
              style={{
                ...inputStyle,
                height: 180,
                resize: "vertical",
                borderColor: rulesErr ? "var(--red)" : "var(--border-dim)",
              }}
              value={rulesRaw}
              onChange={e => setRulesRaw(e.target.value)}
              onBlur={() => validateRules(rulesRaw)}
              spellCheck={false}
            />
            {rulesErr
              ? <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>{rulesErr}</div>
              : <div style={{ fontSize: 10, color: "var(--text-dimmer)", marginTop: 4 }}>
                  Each rule: <code style={{ color: "var(--text-dim)" }}>{"{ type, pattern, message }"}</code> — type: block | warn | require
                </div>
            }
          </div>

          {/* Enabled toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Toggle checked={enabled} onChange={setEnabled} />
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
              {enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        </form>

        {/* Sticky footer */}
        <div style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border-dim)",
          background: "var(--bg-3)",
          display: "flex",
          gap: 8,
        }}>
          <button
            className="btn btn-primary"
            onClick={e => void handleSubmit(e as unknown as React.FormEvent)}
            disabled={saving || !name.trim()}
            style={{ fontSize: 11 }}
          >
            {saving ? "Saving..." : isEdit ? "Update policy" : "Save policy"}
          </button>
          <button
            className="btn"
            type="button"
            onClick={onClose}
            style={{ fontSize: 11 }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Policies tab
// ---------------------------------------------------------------------------

function PoliciesTab() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerPolicy, setDrawerPolicy] = useState<Policy | null | "new">(undefined as unknown as Policy | null | "new");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchApi("/api/governance/policies")
      .then(r => r.json())
      .then((d: { policies: Policy[] }) => setPolicies(d.policies))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setDrawerPolicy(null);
    setDrawerOpen(true);
  };

  const openEdit = (p: Policy) => {
    setDrawerPolicy(p);
    setDrawerOpen(true);
  };

  const closeDrawer = () => setDrawerOpen(false);

  const toggleEnabled = async (p: Policy) => {
    setTogglingId(p.id);
    await fetchApi(`/api/governance/policies/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: p.enabled === 0 }),
    });
    setTogglingId(null);
    load();
  };

  const deletePolicy = async (id: string) => {
    await fetchApi(`/api/governance/policies/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: "var(--text-dimmer)", letterSpacing: "0.04em" }}>
          {policies.length} {policies.length === 1 ? "policy" : "policies"}
        </span>
        <button
          onClick={openCreate}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            color: "var(--text-dim)",
            padding: "4px 12px",
            fontFamily: "var(--font)", fontSize: 11,
            cursor: "pointer", letterSpacing: "0.04em",
          }}
        >
          + NEW POLICY
        </button>
      </div>

      {loading ? (
        <div style={{ border: "1px solid var(--border-dim)", overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 90px 70px 48px 60px 80px 48px",
            padding: "6px 10px", background: "var(--bg-3)",
            borderBottom: "1px solid var(--border-dim)",
          }}>
            <Skeleton width={30} height={8} />
          </div>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1fr 90px 70px 48px 60px 80px 48px",
              alignItems: "center", padding: "10px 10px", gap: 8,
              borderBottom: i < 2 ? "1px solid var(--border-dim)" : "none",
            }}>
              <div>
                <Skeleton height={11} width={`${50 + i * 20}%`} style={{ marginBottom: 5 }} />
                <Skeleton height={9} width="70%" />
              </div>
              <Skeleton height={10} width={55} />
              <Skeleton height={10} width={20} />
              <SkeletonCard width={32} height={18} />
              <SkeletonCard width={40} height={22} />
              <SkeletonCard width={60} height={22} />
              <Skeleton height={10} width={14} />
            </div>
          ))}
        </div>
      ) : policies.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "48px 20px", gap: 12,
        }}>
          <Shield size={32} style={{ color: "var(--text-dimmer)", opacity: 0.5 }} />
          <div style={{
            fontSize: 13, fontWeight: 600, color: "var(--text-dim)",
            fontFamily: "var(--font-ui)", letterSpacing: "0.02em",
          }}>
            No policies yet
          </div>
          <div style={{
            fontSize: 11, color: "var(--text-dimmer)", textAlign: "center",
            fontFamily: "var(--font-ui)", maxWidth: 340, lineHeight: 1.5,
          }}>
            Policies define rules that govern agent behavior -- block dangerous actions, require tests before merge, or flag risky patterns for review.
          </div>
          <button
            onClick={openCreate}
            style={{
              marginTop: 4,
              padding: "6px 16px",
              background: "none",
              border: "1px solid var(--border)",
              color: "var(--text-dim)",
              fontFamily: "var(--font)",
              fontSize: 11,
              cursor: "pointer",
              letterSpacing: "0.04em",
              transition: "border-color 0.1s, color 0.1s",
            }}
            className="hoverable"
          >
            + NEW POLICY
          </button>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-dim)" }}>
              {["NAME", "SCOPE", "RULES", "ENABLED", "", "", ""].map((h, i) => (
                <th key={i} style={{
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
                className="hoverable"
                style={{ borderBottom: "1px solid var(--border-dim)" }}
              >
                <td style={{ padding: "8px 10px" }}>
                  <div style={{ color: "var(--text)", fontWeight: 600 }}>{p.name}</div>
                  {p.description && (
                    <div style={{ fontSize: 11, color: "var(--text-dimmer)", marginTop: 2 }}>{p.description}</div>
                  )}
                </td>
                <td style={{ padding: "8px 10px", color: "var(--text-dim)", fontFamily: "var(--font)", fontSize: 11 }}>
                  {p.scope}
                </td>
                <td style={{ padding: "8px 10px", color: "var(--text-dim)" }}>
                  {p.rules.length}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <Toggle
                    checked={Boolean(p.enabled)}
                    onChange={() => void toggleEnabled(p)}
                    disabled={togglingId === p.id}
                  />
                </td>
                <td style={{ padding: "8px 6px" }}>
                  <button
                    onClick={() => openEdit(p)}
                    style={{
                      background: "none", border: "1px solid var(--border-dim)",
                      color: "var(--text-dim)", padding: "3px 8px",
                      fontFamily: "var(--font)", fontSize: 10,
                      cursor: "pointer", letterSpacing: "0.04em",
                      whiteSpace: "nowrap",
                    }}
                    className="hoverable"
                  >
                    EDIT
                  </button>
                </td>
                <td style={{ padding: "8px 6px" }}>
                  <DeleteButton onConfirm={() => void deletePolicy(p.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {drawerOpen && (
        <PolicyDrawer
          policy={drawerPolicy as Policy | null}
          onSave={() => { closeDrawer(); load(); }}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action Log tab — sortable + type filter chips + CSV export
// ---------------------------------------------------------------------------

type SortKey = "created_at" | "agent_id" | "action_type" | "target";
type SortDir = "asc" | "desc";

function ActionLogTab() {
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

  // Derive unique action types from loaded actions
  const actionTypes = Array.from(new Set(actions.map(a => a.action_type))).sort();

  // Apply client-side type filter and sort
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
    if (sortKey !== key) return <span style={{ opacity: 0.25, marginLeft: 3 }}>↕</span>;
    return <span style={{ marginLeft: 3, color: "var(--accent)" }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
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
      {/* Summary stats */}
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
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "var(--font)" }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Outcome filter row */}
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

      {/* Action type filter chips */}
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

      {/* Count + export row */}
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
          ↓ EXPORT CSV
        </button>
      </div>

      {/* Table */}
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
    <PageShell maxWidth={1100}>
    <div style={{ fontFamily: "var(--font-ui)" }}>
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
    </PageShell>
  );
}
