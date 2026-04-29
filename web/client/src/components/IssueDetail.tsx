import { useState, useEffect } from "react";
import { fetchApi, getToken } from "../lib/api";
import { toast } from "./Toasts";
import type { Agent } from "../types";
import type { Issue, IssueStatus, IssueTask, Satisfaction, Run } from "./IssueComponents";
import { STATUS_COLORS, STATUS_LABELS, STATUS_ORDER } from "./IssueComponents";

export function IssueDetail({ issue, agents, onClose, onUpdate, onDelete }: {
  issue: Issue;
  agents: Agent[];
  onClose: () => void;
  onUpdate: (issue: Issue) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(issue.title);
  const [desc, setDesc] = useState(issue.description ?? "");
  const [status, setStatus] = useState<IssueStatus>(issue.status);
  const [agentId, setAgentId] = useState(issue.agent_id ?? "");
  const [tasks, setTasks] = useState<IssueTask[]>(() => {
    try { return JSON.parse(issue.tasks ?? "[]") as IssueTask[]; } catch { return []; }
  });
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState(false);
  const [runOutput, setRunOutput] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTitle(issue.title);
    setDesc(issue.description ?? "");
    setStatus(issue.status);
    setAgentId(issue.agent_id ?? "");
    try { setTasks(JSON.parse(issue.tasks ?? "[]") as IssueTask[]); } catch { setTasks([]); }
    setNewTaskTitle("");
    setDirty(false);
    setRunOutput("");
    fetchApi<{ issue: Issue; runs: Run[] }>(`/api/issues/${issue.id}`)
      .then(({ runs: r }) => setRuns(r))
      .catch(() => {});
  }, [issue.id]);

  const save = async () => {
    try {
      const updated = await fetchApi<Issue>(`/api/issues/${issue.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title, description: desc || null, status, agent_id: agentId || null, tasks }),
      });
      onUpdate(updated);
      setDirty(false);
      toast.success("Saved");
    } catch { toast.error("Failed to save"); }
  };

  const del = async () => {
    if (!confirm(`Delete ${issue.identifier}?`)) return;
    try {
      await fetchApi(`/api/issues/${issue.id}`, { method: "DELETE" });
      onDelete(issue.id);
    } catch { toast.error("Failed to delete"); }
  };

  const runIssue = async () => {
    if (running) return;
    setRunning(true);
    setRunOutput("");
    const token = await getToken();
    try {
      const res = await fetch(`/api/issues/${issue.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({}),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as { type: string; text?: string; error?: string };
            if (evt.type === "text" && evt.text) setRunOutput(p => p + evt.text);
            if (evt.type === "done") {
              const updated = await fetchApi<Issue>(`/api/issues/${issue.id}`).then(r => (r as { issue: Issue }).issue);
              onUpdate(updated);
              setRuns(p => [{ id: Date.now().toString(), issue_id: issue.id, agent_id: agentId || null, status: "done", output: runOutput, error: null, created_at: Date.now() }, ...p]);
            }
          } catch {}
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  };

  const change = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{issue.identifier}</span>
        <div style={{ flex: 1 }} />
        {dirty && (
          <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
        )}
        <button className={`btn btn-sm ${running ? "btn-secondary" : "btn-success"}`} onClick={runIssue} disabled={running}>
          {running ? "Running..." : "Run"}
        </button>
        <button className="btn btn-danger btn-sm" onClick={del}>Delete</button>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
        <input
          value={title}
          onChange={e => change<string>(setTitle)(e.target.value)}
          style={{
            background: "none", border: "none", borderBottom: "1px solid var(--border)",
            color: "var(--text)", fontSize: 15, fontWeight: 600, width: "100%", outline: "none",
            paddingBottom: 6, fontFamily: "var(--font-mono)",
          }}
          placeholder="Issue title"
        />

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</span>
            <select
              value={status}
              onChange={e => change<IssueStatus>(setStatus)(e.target.value as IssueStatus)}
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: STATUS_COLORS[status], borderRadius: 3, padding: "3px 6px", fontSize: 12, cursor: "pointer" }}
            >
              {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Agent</span>
            <select
              value={agentId}
              onChange={e => change<string>(setAgentId)(e.target.value)}
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-dim)", borderRadius: 3, padding: "3px 6px", fontSize: 12, cursor: "pointer" }}
            >
              <option value="">Unassigned</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>

        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Description</div>
          <textarea
            value={desc}
            onChange={e => change<string>(setDesc)(e.target.value)}
            placeholder="Add a description..."
            rows={5}
            style={{
              width: "100%", background: "var(--bg-elevated)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", color: "var(--text)", fontSize: 12,
              lineHeight: 1.6, padding: "8px 10px", resize: "vertical", outline: "none",
              fontFamily: "var(--font-mono)", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Task checklist (prd.json pattern) */}
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Tasks
            <span style={{ marginLeft: 8, color: "var(--text-dim)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
              {tasks.filter(t => t.passes).length}/{tasks.length} passing
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {tasks.map(task => (
              <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => { const next = tasks.map(t => t.id === task.id ? { ...t, passes: !t.passes } : t); setTasks(next); setDirty(true); }}
                  style={{
                    width: 14, height: 14, flexShrink: 0, borderRadius: 3, cursor: "pointer",
                    background: task.passes ? "var(--green)" : "none",
                    border: `1.5px solid ${task.passes ? "var(--green)" : "var(--border)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                  title={task.passes ? "Mark incomplete" : "Mark passing"}
                >
                  {task.passes && <span style={{ color: "var(--text-on-accent)", fontSize: 9, lineHeight: 1 }}>✓</span>}
                </button>
                <span style={{ flex: 1, fontSize: 12, color: task.passes ? "var(--text-muted)" : "var(--text)", textDecoration: task.passes ? "line-through" : "none" }}>
                  {task.title}
                </span>
                <button
                  onClick={() => { setTasks(tasks.filter(t => t.id !== task.id)); setDirty(true); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
                >×</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
              <input
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && newTaskTitle.trim()) {
                    setTasks([...tasks, { id: crypto.randomUUID(), title: newTaskTitle.trim(), passes: false }]);
                    setNewTaskTitle("");
                    setDirty(true);
                  }
                }}
                placeholder="Add task… (Enter to save)"
                className="input"
                style={{ flex: 1, fontSize: 11, padding: "3px 8px" }}
              />
            </div>
          </div>
        </div>

        {(running || runOutput) && (
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              {running ? "Running..." : "Last output"}
            </div>
            <pre style={{
              background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
              padding: "8px 10px", fontSize: 11, color: "var(--text-dim)", whiteSpace: "pre-wrap",
              wordBreak: "break-word", maxHeight: 200, overflow: "auto", margin: 0,
            }}>
              {runOutput || "..."}
            </pre>
          </div>
        )}

        {runs.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Run history</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {runs.slice(0, 5).map(run => (
                <div key={run.id} style={{
                  padding: "6px 10px", background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)", fontSize: 11,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: run.status === "done" ? "var(--green)" : run.status === "failed" ? "var(--red)" : "var(--yellow)", fontSize: 9 }}>●</span>
                    <span style={{ color: "var(--text-dim)" }}>{run.status}</span>
                    {run.satisfaction && (() => {
                      const s = JSON.parse(run.satisfaction) as { satisfied: boolean; score: number; notes: string };
                      return (
                        <span
                          title={`Score: ${Math.round(s.score * 100)}% — ${s.notes}`}
                          style={{
                            fontSize: 9, padding: "1px 5px", borderRadius: 3,
                            background: s.satisfied ? "color-mix(in srgb, var(--green) 15%, transparent)" : "color-mix(in srgb, var(--red) 15%, transparent)",
                            color: s.satisfied ? "var(--green)" : "var(--red)",
                            border: `1px solid color-mix(in srgb, ${s.satisfied ? "var(--green)" : "var(--red)"} 30%, transparent)`,
                          }}
                        >
                          {s.satisfied ? `✓ ${Math.round(s.score * 100)}%` : `✗ ${Math.round(s.score * 100)}%`}
                        </span>
                      );
                    })()}
                    <span style={{ color: "var(--text-muted)", marginLeft: "auto" }}>{new Date(run.created_at).toLocaleTimeString()}</span>
                  </div>
                  {run.error && <div style={{ marginTop: 4, color: "var(--red)", fontFamily: "var(--font-mono)" }}>{run.error.slice(0, 200)}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create modal ───────────────────────────────────────────────────────────────

