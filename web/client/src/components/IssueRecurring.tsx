import { useState, useEffect } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";
import type { Issue, IssueStatus } from "./IssueComponents";
import { STATUS_ORDER, STATUS_LABELS, STATUS_COLORS } from "./IssueComponents";
import { recordActivity } from "../lib/issueUtils";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ScheduleExpr = "daily" | "weekly" | "monthly" | `every ${number} days`;

export interface RecurringIssue {
  id: string;
  templateIssue: {
    title: string;
    description: string;
    status: IssueStatus;
    agent_id: string | null;
  };
  cronExpr: ScheduleExpr;
  nextRun: number;
  lastRun: number;
}

const REC_KEY = "hm-recurring-issues";

// ── Storage ────────────────────────────────────────────────────────────────────

export function loadRecurring(): RecurringIssue[] {
  try { return JSON.parse(localStorage.getItem(REC_KEY) ?? "[]") as RecurringIssue[]; }
  catch { return []; }
}

function saveRecurring(recs: RecurringIssue[]) {
  localStorage.setItem(REC_KEY, JSON.stringify(recs));
}

function computeNextRun(expr: ScheduleExpr, from: number = Date.now()): number {
  if (expr === "daily") return from + 86400_000;
  if (expr === "weekly") return from + 7 * 86400_000;
  if (expr === "monthly") return from + 30 * 86400_000;
  const m = expr.match(/^every (\d+) days$/);
  if (m) return from + parseInt(m[1], 10) * 86400_000;
  return from + 86400_000;
}

function scheduleLabel(expr: ScheduleExpr): string {
  if (expr === "daily") return "Daily";
  if (expr === "weekly") return "Weekly";
  if (expr === "monthly") return "Monthly";
  const m = expr.match(/^every (\d+) days$/);
  if (m) return `Every ${m[1]} days`;
  return expr;
}

function formatDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Auto-create hook (call once at page load) ──────────────────────────────────

export async function runRecurringChecks(onCreated?: (issue: Issue) => void) {
  const now = Date.now();
  const recs = loadRecurring();
  let changed = false;

  for (const rec of recs) {
    if (rec.nextRun > now) continue;
    try {
      const issue = await fetchApi<Issue>("/api/issues", {
        method: "POST",
        body: JSON.stringify({
          title: rec.templateIssue.title,
          description: rec.templateIssue.description || null,
          status: rec.templateIssue.status,
          agent_id: rec.templateIssue.agent_id || null,
        }),
      });
      recordActivity({ issueId: issue.id, issueTitle: issue.title, action: "created", detail: `Recurring: ${rec.cronExpr}` });
      rec.lastRun = now;
      rec.nextRun = computeNextRun(rec.cronExpr, now);
      changed = true;
      toast.success(`Auto-created: ${issue.title}`);
      onCreated?.(issue);
    } catch {
      toast.error(`Failed to auto-create: ${rec.templateIssue.title}`);
    }
  }

  if (changed) saveRecurring(recs);
}

// ── Create/Edit Modal ──────────────────────────────────────────────────────────

const SCHEDULES: ScheduleExpr[] = ["daily", "weekly", "monthly", "every 3 days", "every 7 days", "every 14 days"];

interface RecurringForm {
  title: string;
  description: string;
  status: IssueStatus;
  agent_id: string;
  cronExpr: ScheduleExpr;
}

const EMPTY_FORM: RecurringForm = {
  title: "",
  description: "",
  status: "backlog",
  agent_id: "",
  cronExpr: "weekly",
};

function RecurringModal({ initial, agents, onSave, onClose }: {
  initial?: RecurringIssue;
  agents: { id: string; name: string }[];
  onSave: (form: RecurringForm) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<RecurringForm>(initial ? {
    title: initial.templateIssue.title,
    description: initial.templateIssue.description,
    status: initial.templateIssue.status,
    agent_id: initial.templateIssue.agent_id ?? "",
    cronExpr: initial.cronExpr,
  } : { ...EMPTY_FORM });

  const f = <K extends keyof RecurringForm>(k: K, v: RecurringForm[K]) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div style={{
      position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 500,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "var(--bg-panel)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: 20, width: 460, maxWidth: "90vw",
        boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
        display: "flex", flexDirection: "column", gap: 10,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          {initial ? "Edit Recurring Issue" : "Create Recurring Issue"}
        </div>

        <input
          autoFocus
          value={form.title}
          onChange={e => f("title", e.target.value)}
          placeholder="Issue title template"
          className="input input-elevated"
          style={{ fontSize: 12, padding: "7px 10px" }}
        />

        <textarea
          value={form.description}
          onChange={e => f("description", e.target.value)}
          placeholder="Description (optional)"
          rows={3}
          className="input input-elevated input-mono"
          style={{ resize: "vertical", lineHeight: 1.5 }}
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</span>
            <select
              value={form.status}
              onChange={e => f("status", e.target.value as IssueStatus)}
              className="input"
              style={{ fontSize: 11, color: STATUS_COLORS[form.status] }}
            >
              {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Agent</span>
            <select
              value={form.agent_id}
              onChange={e => f("agent_id", e.target.value)}
              className="input"
              style={{ fontSize: 11 }}
            >
              <option value="">Unassigned</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 120 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Schedule</span>
            <select
              value={form.cronExpr}
              onChange={e => f("cronExpr", e.target.value as ScheduleExpr)}
              className="input"
              style={{ fontSize: 11 }}
            >
              {SCHEDULES.map(s => <option key={s} value={s}>{scheduleLabel(s)}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button className="btn btn-secondary btn-md" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary btn-md"
            onClick={() => onSave(form)}
            disabled={!form.title.trim()}
          >
            {initial ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RecurringSection (rendered in IssuesPage) ──────────────────────────────────

export function RecurringSection({ agents, onIssueCreated }: {
  agents: { id: string; name: string }[];
  onIssueCreated?: (issue: Issue) => void;
}) {
  const [recs, setRecs] = useState<RecurringIssue[]>(loadRecurring);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<RecurringIssue | null>(null);
  const [expanded, setExpanded] = useState(false);

  const refresh = () => setRecs(loadRecurring());

  const handleSave = (form: RecurringForm) => {
    const now = Date.now();
    if (editing) {
      const next = recs.map(r => r.id === editing.id ? {
        ...r,
        templateIssue: { title: form.title, description: form.description, status: form.status, agent_id: form.agent_id || null },
        cronExpr: form.cronExpr,
        nextRun: computeNextRun(form.cronExpr, now),
      } : r);
      saveRecurring(next);
    } else {
      const rec: RecurringIssue = {
        id: crypto.randomUUID(),
        templateIssue: { title: form.title, description: form.description, status: form.status, agent_id: form.agent_id || null },
        cronExpr: form.cronExpr,
        nextRun: computeNextRun(form.cronExpr, now),
        lastRun: 0,
      };
      saveRecurring([...recs, rec]);
    }
    refresh();
    setShowModal(false);
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this recurring issue?")) return;
    saveRecurring(recs.filter(r => r.id !== id));
    refresh();
  };

  const handleEdit = (rec: RecurringIssue) => {
    setEditing(rec);
    setShowModal(true);
  };

  // Check and fire any overdue recurring issues on mount
  useEffect(() => {
    void runRecurringChecks(onIssueCreated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div style={{ borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 8,
            padding: "8px 14px", background: "none", border: "none", cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
            {expanded ? "▾" : "▸"}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Recurring</span>
          {recs.length > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 600, color: "var(--accent)",
              background: "color-mix(in srgb, var(--accent) 15%, transparent)",
              borderRadius: 8, padding: "0 5px", lineHeight: "16px",
            }}>
              {recs.length}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={e => { e.stopPropagation(); setEditing(null); setShowModal(true); }}
            style={{
              fontSize: 10, background: "none", border: "1px solid var(--border)",
              color: "var(--text-muted)", borderRadius: 3, padding: "1px 7px",
              cursor: "pointer",
            }}
          >
            + New
          </button>
        </button>

        {expanded && (
          <div style={{ padding: "0 14px 10px" }}>
            {recs.length === 0 && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "6px 0" }}>
                No recurring issues.{" "}
                <button
                  onClick={() => { setEditing(null); setShowModal(true); }}
                  style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontSize: 11 }}
                >
                  Create one
                </button>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recs.map(rec => {
                const agent = agents.find(a => a.id === rec.templateIssue.agent_id);
                const isOverdue = rec.nextRun < Date.now();
                return (
                  <div key={rec.id} style={{
                    padding: "8px 10px", background: "var(--bg-elevated)",
                    border: `1px solid ${isOverdue ? "var(--yellow, #e3c16f)" : "var(--border)"}`,
                    borderRadius: "var(--radius-sm)", display: "flex", alignItems: "flex-start", gap: 10,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {rec.templateIssue.title}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{
                          fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3,
                          background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                          color: "var(--accent)",
                          border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
                          textTransform: "uppercase",
                        }}>
                          {scheduleLabel(rec.cronExpr)}
                        </span>
                        <span style={{ fontSize: 10, color: STATUS_COLORS[rec.templateIssue.status] }}>
                          {STATUS_LABELS[rec.templateIssue.status]}
                        </span>
                        {agent && (
                          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>@{agent.name}</span>
                        )}
                        <span style={{ fontSize: 10, color: isOverdue ? "var(--yellow, #e3c16f)" : "var(--text-muted)" }}>
                          Next: {formatDate(rec.nextRun)}
                        </span>
                        {rec.lastRun > 0 && (
                          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                            Last: {formatDate(rec.lastRun)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => handleEdit(rec)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "var(--text-muted)", padding: "2px 5px" }}
                      >Edit</button>
                      <button
                        onClick={() => handleDelete(rec.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--text-muted)", lineHeight: 1, padding: "0 2px" }}
                        title="Delete"
                      >×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <RecurringModal
          initial={editing ?? undefined}
          agents={agents}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
    </>
  );
}
