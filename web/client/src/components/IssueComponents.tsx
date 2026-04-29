import { useState, useEffect } from "react";
import { fetchApi, getToken } from "../lib/api";
import { toast } from "./Toasts";
import type { Agent } from "../types";

export interface IssueTask {
  id: string;
  title: string;
  passes: boolean;
}

export interface Satisfaction {
  satisfied: boolean;
  score: number;
  notes: string;
}

export interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  agent_id: string | null;
  project_dir: string;
  tasks: string | null;  // JSON: IssueTask[]
  created_at: number;
  updated_at: number;
}

export interface Run {
  id: string;
  issue_id: string;
  agent_id: string | null;
  status: string;
  output: string | null;
  error: string | null;
  satisfaction: string | null;  // JSON: Satisfaction
  created_at: number;
}

export type IssueStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done";

export const STATUS_ORDER: IssueStatus[] = ["backlog", "todo", "in_progress", "in_review", "done"];
export const STATUS_LABELS: Record<IssueStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};
export const STATUS_COLORS: Record<IssueStatus, string> = {
  backlog:     "var(--text-muted)",
  todo:        "var(--blue)",
  in_progress: "var(--accent)",
  in_review:   "var(--yellow)",
  done:        "var(--green)",
};

// ── Issue row ──────────────────────────────────────────────────────────────────

export function IssueRow({ issue, agents, active, onClick, onUpdate }: {
  issue: Issue;
  agents: Agent[];
  active: boolean;
  onClick: () => void;
  onUpdate: (issue: Issue) => void;
}) {
  const agent = agents.find(a => a.id === issue.agent_id);

  const cycleStatus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = STATUS_ORDER.indexOf(issue.status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    try {
      const updated = await fetchApi<Issue>(`/api/issues/${issue.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      onUpdate(updated);
    } catch { toast.error("Failed to update status"); }
  };

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 14px", cursor: "pointer",
        background: active ? "var(--bg-active)" : "none",
        borderBottom: "1px solid var(--border)",
        transition: "background var(--transition)",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "none"; }}
    >
      <button
        onClick={cycleStatus}
        title={`Status: ${STATUS_LABELS[issue.status]} (click to advance)`}
        style={{
          width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
          background: STATUS_COLORS[issue.status],
          border: "none", cursor: "pointer", padding: 0,
        }}
      />
      <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0, fontFamily: "var(--font-mono)", minWidth: 52 }}>
        {issue.identifier}
      </span>
      <span style={{ flex: 1, fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {issue.title}
      </span>
      {agent && (
        <span style={{
          fontSize: 10, color: "var(--text-dim)", background: "var(--bg-elevated)",
          border: "1px solid var(--border)", borderRadius: 3, padding: "1px 5px",
          flexShrink: 0, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {agent.name}
        </span>
      )}
    </div>
  );
}

// ── Issue detail panel ─────────────────────────────────────────────────────────

export function CreateIssueModal({ onClose, onCreate }: { onClose: () => void; onCreate: (issue: Issue) => void }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState<IssueStatus>("backlog");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const issue = await fetchApi<Issue>("/api/issues", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), description: desc || null, status }),
      });
      onCreate(issue);
    } catch { toast.error("Failed to create issue"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 500,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "var(--bg-panel)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: 20, width: 480, maxWidth: "90vw",
        boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 14 }}>New Issue</div>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") void submit(); if (e.key === "Escape") onClose(); }}
          placeholder="Issue title"
          className="input input-elevated"
          style={{ fontSize: 13, padding: "8px 10px", marginBottom: 10 }}
        />
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Description (optional)"
          rows={3}
          className="input input-elevated input-mono"
          style={{ resize: "vertical", marginBottom: 10, lineHeight: 1.5 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as IssueStatus)}
            className="input"
            style={{ width: "auto", color: STATUS_COLORS[status], cursor: "pointer" }}
          >
            {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary btn-md" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-md" onClick={submit} disabled={!title.trim() || saving}>
            {saving ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
