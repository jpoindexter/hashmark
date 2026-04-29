import React, { useState, useEffect, useCallback, useRef } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";
import { GitHubConfigPanel } from "./GitHubConfigPanel";

interface WorkflowStep {
  id: string;
  name?: string;
  prompt: string;
  model?: string;
  depends_on?: string[];
  human_gate?: boolean;
}

interface WorkflowDef {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  created_at: number;
}

interface WorkflowRun {
  id: string;
  workflowId: string;
  status: "running" | "waiting" | "done" | "error" | "cancelled";
  stepResults: Record<string, { sessionId: string; status: string }>;
  error?: string;
  created_at: number;
  updated_at: number;
}

const STATUS_COLOR: Record<string, string> = {
  done: "var(--green)",
  running: "var(--accent)",
  waiting: "var(--orange)",
  error: "var(--red)",
  cancelled: "var(--text-muted)",
  pending: "var(--border)",
};

interface BuiltinMeta { index: number; name: string; description?: string; }

export function WorkflowsPanel() {
  const [tab, setTab] = useState<"workflows" | "github">("workflows");
  const [workflows, setWorkflows] = useState<WorkflowDef[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [builtins, setBuiltins] = useState<BuiltinMeta[]>([]);
  const [selected, setSelected] = useState<WorkflowDef | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "", stepsJson: JSON.stringify([{ id: "step1", name: "Step 1", prompt: "..." }], null, 2) });

  const load = useCallback(async () => {
    const [w, r, b] = await Promise.all([
      fetchApi<WorkflowDef[]>("/api/workflows").catch(() => []),
      fetchApi<WorkflowRun[]>("/api/workflows/runs").catch(() => []),
      fetchApi<BuiltinMeta[]>("/api/workflows/builtins").catch(() => []),
    ]);
    setWorkflows(w);
    setRuns(r);
    setBuiltins(b);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Poll while any run is active -- stable interval, not recreated on every runs change
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const hasActive = runs.some(r => r.status === "running" || r.status === "waiting");
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(() => void load(), 3000);
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [runs, load]);

  const runWorkflow = async (workflowId: string) => {
    try {
      const run = await fetchApi<WorkflowRun>(`/api/workflows/${workflowId}/run`, { method: "POST" });
      setRuns(prev => [run, ...prev]);
      toast.success("Workflow started");
    } catch (e) { toast.error(String(e)); }
  };

  const cancelRun = async (runId: string) => {
    await fetchApi(`/api/workflows/runs/${runId}/cancel`, { method: "POST" }).catch(() => {});
    void load();
  };

  const deleteWorkflow = async (id: string) => {
    await fetchApi(`/api/workflows/${id}`, { method: "DELETE" }).catch(() => {});
    setWorkflows(prev => prev.filter(w => w.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const saveNew = async () => {
    try {
      const steps = JSON.parse(draft.stepsJson) as WorkflowStep[];
      const wf = await fetchApi<WorkflowDef>("/api/workflows", {
        method: "POST",
        body: JSON.stringify({ name: draft.name, description: draft.description, steps }),
      });
      setWorkflows(prev => [wf, ...prev]);
      setCreating(false);
      setDraft({ name: "", description: "", stepsJson: JSON.stringify([{ id: "step1", name: "Step 1", prompt: "..." }], null, 2) });
      toast.success("Workflow saved");
    } catch (e) { toast.error(`Invalid steps JSON: ${String(e)}`); }
  };

  const installBuiltin = async (index: number) => {
    try {
      const wf = await fetchApi<WorkflowDef>(`/api/workflows/builtins/${index}/install`, { method: "POST" });
      setWorkflows(prev => [wf, ...prev]);
      setSelected(wf);
      toast.success(`Installed: ${wf.name}`);
    } catch (e) { toast.error(String(e)); }
  };

  const workflowRuns = (wfId: string) => runs.filter(r => r.workflowId === wfId);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {(["workflows", "github"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 14px", fontSize: 11, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "var(--text)" : "var(--text-muted)",
              background: "none", border: "none", borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
              cursor: "pointer", textTransform: "capitalize", letterSpacing: "0.04em",
            }}
          >
            {t === "github" ? "GitHub" : "Workflows"}
          </button>
        ))}
      </div>

      {tab === "github" && <GitHubConfigPanel workflows={workflows} />}
      {tab === "workflows" && <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Workflow list */}
      <div style={{ width: 220, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "10px 10px 6px", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", flex: 1, textTransform: "uppercase", letterSpacing: "0.06em" }}>Workflows</span>
          <button className="btn btn-primary btn-xs" onClick={() => setCreating(true)}>+ New</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {workflows.length === 0 && !creating && (
            <div style={{ padding: "16px 10px", fontSize: 11, color: "var(--text-muted)" }}>No workflows yet. Create one to define multi-step agent pipelines.</div>
          )}
          {workflows.map(wf => {
            const active = workflowRuns(wf.id).filter(r => r.status === "running" || r.status === "waiting");
            return (
              <div
                key={wf.id}
                onClick={() => setSelected(wf)}
                style={{
                  padding: "8px 10px", cursor: "pointer", borderBottom: "1px solid var(--glass-border)",
                  background: selected?.id === wf.id ? "var(--bg-active)" : "none",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wf.name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{wf.steps.length} step{wf.steps.length !== 1 ? "s" : ""}</div>
                </div>
                {active.length > 0 && (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animation: "dot-pulse 1.4s ease-in-out infinite", flexShrink: 0 }} />
                )}
              </div>
            );
          })}
          {builtins.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 4 }}>
              <div style={{ padding: "6px 10px 2px", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Templates</div>
              {builtins.map(b => (
                <div key={b.index} style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--glass-border)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
                  </div>
                  <button className="btn btn-secondary btn-xs" onClick={() => void installBuiltin(b.index)}>Install</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail / create pane */}
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {creating && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 600 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>New Workflow</div>
            <input
              className="input"
              placeholder="Name"
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            />
            <input
              className="input"
              placeholder="Description (optional)"
              value={draft.description}
              onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            />
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Steps (JSON array)</div>
            <textarea
              className="input input-mono"
              rows={12}
              value={draft.stepsJson}
              onChange={e => setDraft(d => ({ ...d, stepsJson: e.target.value }))}
              style={{ resize: "vertical" }}
            />
            <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.6 }}>
              Each step: {"{"} id, name?, prompt, model?, depends_on?: [stepId], human_gate?: true {"}"}
              <br />Use {"{{stepId.session_id}}"} in prompts to reference prior step outputs.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => void saveNew()}>Save</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </div>
        )}

        {!creating && selected && (() => {
          // Most recent active/done run for live step status overlay
          const liveRun = workflowRuns(selected.id).find(r => r.status === "running" || r.status === "waiting" || r.status === "done");
          return (
          <div style={{ maxWidth: 600 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{selected.name}</span>
              {selected.description && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{selected.description}</span>}
              <div style={{ flex: 1 }} />
              <button className="btn btn-primary btn-sm" onClick={() => void runWorkflow(selected.id)}>Run</button>
              <button className="btn btn-secondary btn-sm" onClick={() => void deleteWorkflow(selected.id)}>Delete</button>
            </div>

            {/* Step graph (linear list with connectors) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 20 }}>
              {selected.steps.map((step, i) => {
                const stepStatus = liveRun?.stepResults[step.id]?.status;
                const stepColor = stepStatus ? STATUS_COLOR[stepStatus] : undefined;
                return (
                <div key={step.id}>
                  <div style={{
                    padding: "10px 12px", borderRadius: "var(--radius-sm)",
                    background: stepStatus === "running" ? "color-mix(in srgb, var(--accent) 8%, var(--bg-panel))" : "var(--bg-panel)",
                    border: stepColor ? `1px solid color-mix(in srgb, ${stepColor} 40%, transparent)` : "1px solid var(--border)",
                    transition: "border-color 0.3s, background 0.3s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      {stepStatus && <span style={{ width: 6, height: 6, borderRadius: "50%", background: stepColor, flexShrink: 0, animation: stepStatus === "running" ? "dot-pulse 1.4s ease-in-out infinite" : "none" }} />}
                      <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{step.id}</span>
                      {step.name && <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{step.name}</span>}
                      {step.human_gate && <span style={{ fontSize: 9, padding: "1px 5px", background: "color-mix(in srgb, var(--orange) 15%, transparent)", color: "var(--orange)", borderRadius: 3 }}>human gate</span>}
                      {step.model && <span style={{ fontSize: 9, padding: "1px 5px", background: "var(--bg-active)", color: "var(--text-muted)", borderRadius: 3 }}>{step.model}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>{step.prompt.slice(0, 120)}{step.prompt.length > 120 ? "..." : ""}</div>
                  </div>
                  {i < selected.steps.length - 1 && (
                    <div style={{ width: 1, height: 12, background: "var(--border)", margin: "0 20px" }} />
                  )}
                </div>
                );
              })}
            </div>

            {/* Runs */}
            {workflowRuns(selected.id).length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Runs</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {workflowRuns(selected.id).map(run => (
                    <div key={run.id} style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-panel)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[run.status] ?? "var(--border)", flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text)" }}>{run.status}</span>
                        <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>{new Date(run.created_at).toLocaleTimeString()}</span>
                        {(run.status === "running" || run.status === "waiting") && (
                          <button className="btn btn-secondary btn-xs" onClick={() => void cancelRun(run.id)}>Cancel</button>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {Object.entries(run.stepResults).map(([stepId, result]) => (
                          <span
                            key={stepId}
                            title={result.sessionId ? `Session: ${result.sessionId}` : undefined}
                            style={{
                              fontSize: 9, padding: "2px 6px", borderRadius: 3,
                              background: `color-mix(in srgb, ${STATUS_COLOR[result.status] ?? "var(--border)"} 15%, transparent)`,
                              color: STATUS_COLOR[result.status] ?? "var(--text-muted)",
                            }}
                          >
                            {stepId}: {result.status}
                          </span>
                        ))}
                      </div>
                      {/* Human gate approval for waiting steps */}
                      {run.status === "waiting" && Object.entries(run.stepResults)
                        .filter(([, r]) => r.status === "waiting")
                        .map(([stepId]) => (
                          <div key={stepId} style={{ marginTop: 8, padding: "8px 10px", background: "color-mix(in srgb, var(--orange) 10%, transparent)", borderRadius: "var(--radius-sm)", border: "1px solid color-mix(in srgb, var(--orange) 30%, transparent)" }}>
                            <div style={{ fontSize: 11, color: "var(--orange)", marginBottom: 6, fontWeight: 500 }}>Human gate: approve step "{stepId}" to continue</div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="btn btn-primary btn-xs" onClick={async () => {
                                await fetchApi(`/api/workflows/runs/${run.id}/gate`, { method: "POST", body: JSON.stringify({ stepId, approved: true }) }).catch(() => {});
                                void load();
                              }}>Approve</button>
                              <button className="btn btn-secondary btn-xs" onClick={async () => {
                                await fetchApi(`/api/workflows/runs/${run.id}/gate`, { method: "POST", body: JSON.stringify({ stepId, approved: false }) }).catch(() => {});
                                void load();
                              }}>Deny</button>
                            </div>
                          </div>
                        ))
                      }
                      {run.error && <div style={{ fontSize: 10, color: "var(--red)", marginTop: 4 }}>{run.error}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {!creating && !selected && (
          <div style={{ padding: 24, fontSize: 12, color: "var(--text-muted)" }}>
            Select a workflow or create a new one. Workflows chain multiple agent sessions with artifact passing between steps.
          </div>
        )}
      </div>
      </div>}
    </div>
  );
}
