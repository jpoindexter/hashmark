import React, { useState, useEffect, useCallback } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";
import type { Agent } from "../types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkflowTrigger =
  | { type: "manual" }
  | { type: "session_start"; agentId?: string }
  | { type: "schedule"; cronExpression: string; description: string }
  | { type: "keyword"; keywords: string[]; matchAll: boolean }
  | { type: "idle"; afterMinutes: number };

export interface WorkflowDefWithTrigger {
  id: string;
  name: string;
  description?: string;
  steps: unknown[];
  trigger?: WorkflowTrigger;
  last_triggered?: number;
  created_at: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TRIGGER_COLORS: Record<string, string> = {
  manual: "var(--text-muted)",
  session_start: "var(--blue)",
  schedule: "var(--green)",
  keyword: "var(--orange)",
  idle: "var(--yellow)",
};

const TRIGGER_ICONS: Record<string, string> = {
  manual: "▶",
  session_start: "🚀",
  schedule: "🕐",
  keyword: "💬",
  idle: "⏸",
};

export function triggerLabel(trigger: WorkflowTrigger | undefined): string {
  if (!trigger || trigger.type === "manual") return "Manual";
  switch (trigger.type) {
    case "session_start": return "On session start";
    case "schedule": return `Scheduled: ${trigger.description}`;
    case "keyword": return `Keyword: ${trigger.keywords.slice(0, 2).join(", ")}${trigger.keywords.length > 2 ? "…" : ""}`;
    case "idle": return `After idle ${trigger.afterMinutes} min`;
  }
}

// ── TriggerBadge ──────────────────────────────────────────────────────────────

export function TriggerBadge({ trigger, small }: { trigger?: WorkflowTrigger; small?: boolean }) {
  const t = trigger ?? { type: "manual" as const };
  const color = TRIGGER_COLORS[t.type];
  const icon = TRIGGER_ICONS[t.type];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: small ? 9 : 10, padding: small ? "1px 5px" : "2px 7px",
      borderRadius: 10,
      background: `color-mix(in srgb, ${color} 14%, transparent)`,
      color,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      whiteSpace: "nowrap",
      flexShrink: 0,
    }}>
      {icon} {triggerLabel(trigger)}
    </span>
  );
}

// ── TriggerEditor ─────────────────────────────────────────────────────────────

export function TriggerEditor({
  trigger,
  agents,
  onSave,
  onCancel,
}: {
  trigger?: WorkflowTrigger;
  agents: Agent[];
  onSave: (t: WorkflowTrigger) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<WorkflowTrigger["type"]>(trigger?.type ?? "manual");
  const [agentId, setAgentId] = useState<string>(
    trigger?.type === "session_start" ? (trigger.agentId ?? "") : ""
  );
  const [scheduleDesc, setScheduleDesc] = useState<string>(
    trigger?.type === "schedule" ? trigger.description : ""
  );
  const [scheduleCron, setScheduleCron] = useState<string>(
    trigger?.type === "schedule" ? trigger.cronExpression : ""
  );
  const [keywords, setKeywords] = useState<string>(
    trigger?.type === "keyword" ? trigger.keywords.join(", ") : ""
  );
  const [matchAll, setMatchAll] = useState<boolean>(
    trigger?.type === "keyword" ? trigger.matchAll : false
  );
  const [idleMinutes, setIdleMinutes] = useState<number>(
    trigger?.type === "idle" ? trigger.afterMinutes : 15
  );

  const handleSave = () => {
    let t: WorkflowTrigger;
    switch (type) {
      case "manual": t = { type: "manual" }; break;
      case "session_start": t = { type: "session_start", ...(agentId ? { agentId } : {}) }; break;
      case "schedule": {
        if (!scheduleDesc.trim()) { toast.error("Schedule description required"); return; }
        t = { type: "schedule", cronExpression: scheduleCron, description: scheduleDesc.trim() };
        break;
      }
      case "keyword": {
        const kws = keywords.split(",").map(s => s.trim()).filter(Boolean);
        if (!kws.length) { toast.error("At least one keyword required"); return; }
        t = { type: "keyword", keywords: kws, matchAll };
        break;
      }
      case "idle": {
        const mins = Math.max(1, Math.min(1440, idleMinutes));
        t = { type: "idle", afterMinutes: mins };
        break;
      }
    }
    onSave(t);
  };

  const rowStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
  const labelStyle: React.CSSProperties = { fontSize: 10, color: "var(--text-muted)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 0" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(["manual", "session_start", "schedule", "keyword", "idle"] as const).map(t => (
          <label key={t} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11, color: type === t ? "var(--text)" : "var(--text-muted)" }}>
            <input
              type="radio"
              name="trigger-type"
              value={t}
              checked={type === t}
              onChange={() => setType(t)}
              style={{ accentColor: "var(--accent)" }}
            />
            {TRIGGER_ICONS[t]} {t.replace("_", " ")}
          </label>
        ))}
      </div>

      {type === "session_start" && (
        <div style={rowStyle}>
          <span style={labelStyle}>Agent (optional — blank = any session start)</span>
          <select
            className="input"
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
            style={{ fontSize: 11 }}
          >
            <option value="">Any agent</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      )}

      {type === "schedule" && (
        <>
          <div style={rowStyle}>
            <span style={labelStyle}>Description (e.g. "every day at 9am")</span>
            <input
              className="input"
              value={scheduleDesc}
              onChange={e => setScheduleDesc(e.target.value)}
              placeholder="every day at 9am"
              style={{ fontSize: 11 }}
            />
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Cron expression (optional, for reference)</span>
            <input
              className="input input-mono"
              value={scheduleCron}
              onChange={e => setScheduleCron(e.target.value)}
              placeholder="0 9 * * *"
              style={{ fontSize: 11 }}
            />
          </div>
        </>
      )}

      {type === "keyword" && (
        <>
          <div style={rowStyle}>
            <span style={labelStyle}>Keywords (comma-separated)</span>
            <input
              className="input"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="deploy, ship, release"
              style={{ fontSize: 11 }}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer", color: "var(--text-muted)" }}>
            <input
              type="checkbox"
              checked={matchAll}
              onChange={e => setMatchAll(e.target.checked)}
              style={{ accentColor: "var(--accent)" }}
            />
            Match all keywords (AND logic)
          </label>
        </>
      )}

      {type === "idle" && (
        <div style={rowStyle}>
          <span style={labelStyle}>Idle threshold (minutes, 1–1440)</span>
          <input
            className="input"
            type="number"
            min={1}
            max={1440}
            value={idleMinutes}
            onChange={e => setIdleMinutes(Number(e.target.value))}
            style={{ fontSize: 11, width: 80 }}
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn btn-primary btn-xs" onClick={handleSave}>Save trigger</button>
        <button className="btn btn-secondary btn-xs" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── WebhookSection ────────────────────────────────────────────────────────────

interface WebhookRow {
  id: string;
  workflow_id: string;
  created_at: number;
  last_triggered_at: number | null;
  trigger_count: number;
}

interface NewWebhook {
  id: string;
  url: string;
  secret: string;
}

export function WebhookSection({ workflow }: { workflow: WorkflowDefWithTrigger }) {
  const [open, setOpen] = useState(false);
  const [hooks, setHooks] = useState<WebhookRow[]>([]);
  const [newHook, setNewHook] = useState<NewWebhook | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await fetchApi<WebhookRow[]>(`/api/workflows/${workflow.id}/webhooks`);
      setHooks(rows);
    } catch {}
  }, [workflow.id]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const create = async () => {
    setCreating(true);
    try {
      const result = await fetchApi<{ webhook: NewWebhook }>(`/api/workflows/${workflow.id}/webhooks`, { method: "POST" });
      setNewHook(result.webhook);
      void load();
    } catch (e) { toast.error(String(e)); }
    setCreating(false);
  };

  const remove = async (hookId: string) => {
    try {
      await fetchApi(`/api/workflows/${workflow.id}/webhooks/${hookId}`, { method: "DELETE" });
      setHooks(prev => prev.filter(h => h.id !== hookId));
      toast.success("Webhook deleted");
    } catch (e) { toast.error(String(e)); }
  };

  const copy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
  };

  const dimStyle: React.CSSProperties = { fontSize: 10, color: "var(--text-muted)" };
  const monoStyle: React.CSSProperties = { fontFamily: "monospace", fontSize: 11, background: "var(--bg-2)", padding: "3px 7px", borderRadius: 4, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

  return (
    <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 11, color: "var(--text-muted)", width: "100%" }}
      >
        <span style={{ fontSize: 9, transition: "transform 0.15s", transform: open ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>▶</span>
        <span style={{ fontWeight: 500 }}>Webhooks</span>
        {hooks.length > 0 && !open && (
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{hooks.length}</span>
        )}
      </button>

      {open && (
        <div style={{ marginTop: 8, paddingLeft: 2, display: "flex", flexDirection: "column", gap: 8 }}>
          {newHook && (
            <div style={{ background: "color-mix(in srgb, var(--yellow) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--yellow) 30%, transparent)", borderRadius: 6, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ ...dimStyle, color: "var(--yellow)", fontWeight: 600 }}>Store the secret securely — it won't be shown again</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={dimStyle}>URL</span>
                <span style={monoStyle}>{window.location.origin}{newHook.url}</span>
                <button className="btn btn-secondary btn-xs" onClick={() => copy(`${window.location.origin}${newHook.url}`, "URL")}>Copy</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={dimStyle}>Secret</span>
                <span style={monoStyle}>{newHook.secret}</span>
                <button className="btn btn-secondary btn-xs" onClick={() => copy(newHook.secret, "Secret")}>Copy</button>
              </div>
              <button className="btn btn-secondary btn-xs" style={{ alignSelf: "flex-start" }} onClick={() => setNewHook(null)}>Dismiss</button>
            </div>
          )}

          {hooks.map(hook => (
            <div key={hook.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <span style={monoStyle}>{hook.id.slice(0, 8)}…</span>
              <span style={dimStyle}>
                {hook.last_triggered_at
                  ? `last: ${new Date(hook.last_triggered_at).toLocaleString()}`
                  : "never triggered"}
                {hook.trigger_count > 0 && ` · ${hook.trigger_count}x`}
              </span>
              <button className="btn btn-secondary btn-xs" style={{ marginLeft: "auto", flexShrink: 0 }} onClick={() => void remove(hook.id)}>Delete</button>
            </div>
          ))}

          <button className="btn btn-secondary btn-xs" style={{ alignSelf: "flex-start" }} onClick={() => void create()} disabled={creating}>
            {creating ? "Creating…" : "Add webhook"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── TriggerSection ────────────────────────────────────────────────────────────

export function TriggerSection({
  workflow,
  agents,
  onUpdate,
}: {
  workflow: WorkflowDefWithTrigger;
  agents: Agent[];
  onUpdate: (trigger: WorkflowTrigger) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const handleSave = async (trigger: WorkflowTrigger) => {
    try {
      const updated = await fetchApi<WorkflowDefWithTrigger>(`/api/workflows/${workflow.id}`, {
        method: "PATCH",
        body: JSON.stringify({ trigger }),
      });
      onUpdate(updated.trigger ?? trigger);
      setEditing(false);
      toast.success("Trigger saved");
    } catch (e) { toast.error(String(e)); }
  };

  return (
    <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 8 }}>
      <button
        onClick={() => { setOpen(o => !o); if (editing) setEditing(false); }}
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
          cursor: "pointer", padding: 0, fontSize: 11, color: "var(--text-muted)", width: "100%",
        }}
      >
        <span style={{ fontSize: 9, transition: "transform 0.15s", transform: open ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>▶</span>
        <span style={{ fontWeight: 500 }}>Trigger</span>
        {!open && <TriggerBadge trigger={workflow.trigger} small />}
      </button>

      {open && (
        <div style={{ marginTop: 8, paddingLeft: 2 }}>
          {!editing ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <TriggerBadge trigger={workflow.trigger} />
              <button
                className="btn btn-secondary btn-xs"
                onClick={() => setEditing(true)}
              >
                Edit trigger
              </button>
            </div>
          ) : (
            <TriggerEditor
              trigger={workflow.trigger}
              agents={agents}
              onSave={handleSave}
              onCancel={() => setEditing(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
