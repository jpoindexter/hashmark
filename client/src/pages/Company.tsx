import { useState, useRef, useEffect, useCallback } from "react";
import DependencyGraph from "../components/DependencyGraph.tsx";
import { PageShell } from "../components/shared/PageShell.tsx";
import { fetchApi } from "../lib/api";
import type { AgentDef, Subtask, Phase, WorkerStatus, WorkerState, MergeResult, RunRecord } from "./company/types";
import { parseWorkerOutput, AgentBadge, WorkerCard } from "./company/WorkerCard";

export default function Company() {
  const [task, setTask] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [plan, setPlan] = useState<Subtask[]>([]);
  const [workers, setWorkers] = useState<Map<number, WorkerState>>(new Map());
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableAgents, setAvailableAgents] = useState<AgentDef[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [clearCountdown, setClearCountdown] = useState<number | null>(null);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [conflictData, setConflictData] = useState<{
    hasConflicts: boolean;
    conflicts: Array<{ file: string; agents: string[]; severity: "high" | "medium" | "low" }>;
    summary: string;
  } | null>(null);
  const [conflictLoading, setConflictLoading] = useState(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchApi("/api/company/agents")
      .then(r => r.json())
      .then((d: { agents: AgentDef[] }) => setAvailableAgents(d.agents ?? []))
      .catch(() => {});
  }, []);

  const loadRuns = useCallback(() => {
    fetchApi('/api/company/runs')
      .then(r => r.json())
      .then((d: { runs: RunRecord[] }) => setRuns(d.runs ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!historyOpen) return;
    loadRuns();
    const interval = setInterval(loadRuns, 3000);
    return () => clearInterval(interval);
  }, [historyOpen, loadRuns]);

  useEffect(() => {
    if (phase !== 'done') return;
    loadRuns();
    setHistoryOpen(true);

    let secs = 8;
    setClearCountdown(secs);
    countdownRef.current = setInterval(() => {
      secs--;
      if (secs <= 0) {
        setClearCountdown(null);
        if (countdownRef.current) clearInterval(countdownRef.current);
        handleClear();
      } else {
        setClearCountdown(secs);
      }
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function cancelAutoClear() {
    if (clearTimerRef.current) { clearTimeout(clearTimerRef.current); clearTimerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setClearCountdown(null);
  }

  const agentName = useCallback((agentId: string): string => {
    const a = availableAgents.find(x => x.id === agentId);
    return a?.name ?? agentId.split("-").pop() ?? agentId;
  }, [availableAgents]);

  async function checkConflicts() {
    const workerArr = [...workers.values()];
    const agentsWithFiles = workerArr
      .filter(w => w.output)
      .map(w => {
        const parsed = parseWorkerOutput(w.output);
        return { id: String(w.id), name: w.agentName, files: parsed.files };
      })
      .filter(a => a.files.length > 0);

    if (agentsWithFiles.length < 2) {
      setConflictData({
        hasConflicts: false,
        conflicts: [],
        summary: "Need at least 2 agents with detected files to check conflicts",
      });
      setConflictsOpen(true);
      return;
    }

    setConflictLoading(true);
    try {
      const res = await fetchApi("/api/company/conflicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents: agentsWithFiles }),
      });
      const data = await res.json() as {
        hasConflicts: boolean;
        conflicts: Array<{ file: string; agents: string[]; severity: "high" | "medium" | "low" }>;
        summary: string;
      };
      setConflictData(data);
    } catch {
      setConflictData({
        hasConflicts: false,
        conflicts: [],
        summary: "Failed to check conflicts",
      });
    }
    setConflictLoading(false);
    setConflictsOpen(true);
  }

  async function handlePlan() {
    if (!task.trim()) return;
    setPhase("planning");
    setError(null);
    setPlan([]);
    setWorkers(new Map());
    setExpandedIds(new Set());
    setMergeResult(null);

    try {
      const res = await fetchApi("/api/company/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      const data = await res.json() as { plan?: Subtask[]; error?: string };
      if (data.error) { setError(data.error); setPhase("idle"); return; }
      if (data.plan) { setPlan(data.plan); setPhase("planned"); }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("idle");
    }
  }

  async function handleRun() {
    if (plan.length === 0) return;
    setPhase("running");
    setError(null);
    setMergeResult(null);

    const initial = new Map<number, WorkerState>();
    for (const s of plan) {
      initial.set(s.id, {
        id: s.id,
        title: s.title,
        agentId: s.agentId,
        agentName: agentName(s.agentId),
        status: "pending",
        output: "",
      });
    }
    setWorkers(initial);
    setExpandedIds(new Set(plan.map(s => s.id)));

    try {
      const res = await fetchApi("/api/company/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, plan }),
      });
      if (!res.body) { setError("No stream"); setPhase("planned"); return; }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
            handleEvent(event);
          } catch {}
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleEvent(event: Record<string, unknown>) {
    switch (event.type) {
      case "worker_start":
        setWorkers(prev => {
          const next = new Map(prev);
          const w = next.get(event.id as number);
          if (w) next.set(w.id, { ...w, status: "running" });
          return next;
        });
        break;

      case "worker_chunk":
        setWorkers(prev => {
          const next = new Map(prev);
          const w = next.get(event.id as number);
          if (w) next.set(w.id, { ...w, output: w.output + (event.text as string) });
          return next;
        });
        break;

      case "worker_verifying":
        setWorkers(prev => {
          const next = new Map(prev);
          const w = next.get(event.id as number);
          if (w) next.set(w.id, { ...w, verifying: true });
          return next;
        });
        break;

      case "worker_verify_result":
        setWorkers(prev => {
          const next = new Map(prev);
          const w = next.get(event.id as number);
          if (w) next.set(w.id, {
            ...w,
            verifying: false,
            testPassed: event.passed as boolean,
            testOutput: event.output as string,
            testSkipped: (event.skipped as boolean) ?? false,
          });
          return next;
        });
        break;

      case "worker_done":
        setWorkers(prev => {
          const next = new Map(prev);
          const w = next.get(event.id as number);
          if (w) next.set(w.id, { ...w, status: "done", output: event.output as string });
          return next;
        });
        break;

      case "worker_error":
        setWorkers(prev => {
          const next = new Map(prev);
          const w = next.get(event.id as number);
          if (w) next.set(w.id, { ...w, status: "error", error: event.error as string });
          return next;
        });
        break;

      case "phase":
        if (event.phase === "merging") setPhase("merging");
        break;

      case "merge_result":
        setMergeResult(event as unknown as MergeResult);
        setWorkers(prev => {
          const next = new Map(prev);
          for (const id of (event.conflicts as number[]) ?? []) {
            const w = next.get(id);
            if (w && w.status !== "error") next.set(id, { ...w, status: "conflict" });
          }
          return next;
        });
        break;

      case "complete":
        setPhase("done");
        break;

      case "error":
        setError(event.error as string);
        setPhase("done");
        break;
    }
  }

  function handleClear() {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    if (clearTimerRef.current) { clearTimeout(clearTimerRef.current); clearTimerRef.current = null; }
    setClearCountdown(null);
    setTask("");
    setPhase("idle");
    setPlan([]);
    setWorkers(new Map());
    setExpandedIds(new Set());
    setMergeResult(null);
    setError(null);
  }

  function toggleExpanded(id: number) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const workerList = [...workers.values()];
  const runningCount = workerList.filter(w => w.status === "running").length;
  const doneCount = workerList.filter(w => w.status === "done").length;
  const busy = phase === "planning" || phase === "running" || phase === "merging";

  const cols = workerList.length <= 2 ? workerList.length : workerList.length <= 4 ? 2 : Math.min(3, workerList.length);

  return (
    <PageShell maxWidth={1100}>
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text)", marginBottom: 4 }}>
            SWARM
          </h1>
          <div style={{ fontSize: 11, color: "var(--text-dimmer)" }}>
            Decompose tasks, run agents in parallel git worktrees, merge results
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {availableAgents.length > 0 && phase === "idle" && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 400, justifyContent: "flex-end" }}>
              {availableAgents.slice(0, 6).map(a => (
                <AgentBadge key={a.id} name={a.name} />
              ))}
              {availableAgents.length > 6 && (
                <span style={{ fontSize: 9, color: "var(--text-dimmer)" }}>+{availableAgents.length - 6} more</span>
              )}
            </div>
          )}
          {phase !== "idle" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {clearCountdown !== null && (
                <span style={{ fontSize: 10, color: "var(--text-dimmer)" }}>
                  clearing in {clearCountdown}s
                  <button
                    onClick={cancelAutoClear}
                    style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 10, marginLeft: 4, padding: 0 }}
                  >
                    cancel
                  </button>
                </span>
              )}
              <button className="btn btn-sm" onClick={() => { cancelAutoClear(); handleClear(); }}>clear</button>
            </div>
          )}
        </div>
      </div>

      <div>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) void handlePlan(); }}
          placeholder="Describe what to build — e.g. Add OAuth2 login with GitHub provider, protect API routes, and add a user profile page..."
          disabled={busy}
          rows={3}
          style={{
            width: "100%",
            padding: "12px 14px",
            background: "var(--bg-2)",
            border: "1px solid var(--border-dim)",
            borderRadius: "var(--radius)",
            color: "var(--text)",
            fontFamily: "var(--font)",
            fontSize: 12,
            lineHeight: 1.6,
            resize: "vertical",
            outline: "none",
            display: "block",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "var(--border-dim)"; }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
          <button
            className="btn btn-primary"
            onClick={handlePlan}
            disabled={!task.trim() || busy}
          >
            {phase === "planning" ? "Planning..." : "Plan"}
          </button>
          {plan.length > 0 && !busy && (
            <button className="btn btn-primary" onClick={handleRun}>
              {`Run ${plan.length} agents`}
            </button>
          )}
          {(phase === "running" || phase === "merging") && (
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
              {phase === "merging" ? "Merging..." : `${runningCount} running · ${doneCount}/${workerList.length} done`}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: "var(--text-dimmer)" }}>⌘↵ to plan</span>
        </div>
      </div>

      {error && (
        <div style={{
          padding: "10px 14px",
          background: "rgba(239,68,68,0.08)",
          border: "1px solid var(--red)",
          borderRadius: "var(--radius)",
          color: "var(--red)",
          fontSize: 11,
          fontFamily: "var(--font)",
          whiteSpace: "pre-wrap",
        }}>
          {error}
        </div>
      )}

      {plan.length > 0 && phase === "planned" && (
        <div>
          <div className="label" style={{ marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--border-dim)" }}>
            PLAN -- {plan.length} parallel subtasks
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {plan.map(s => (
              <div key={s.id} style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 12px",
                background: "var(--bg-2)",
                border: "1px solid var(--border-dim)",
                borderRadius: "var(--radius)",
              }}>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  background: "var(--accent-bg)",
                  color: "var(--accent)",
                  border: "1px solid var(--accent)",
                  padding: "1px 6px",
                  borderRadius: "var(--radius)",
                  flexShrink: 0,
                  lineHeight: "1.6",
                }}>
                  {s.id}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{s.title}</span>
                    <AgentBadge name={agentName(s.agentId)} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>{s.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {workerList.length > 0 && (phase === "running" || phase === "merging" || phase === "done") && (
        <div onClick={cancelAutoClear}>
          <div style={{
            fontSize: 10,
            color: "var(--text-dimmer)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 10,
            paddingBottom: 6,
            borderBottom: "1px solid var(--border-dim)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span>AGENTS</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setExpandedIds(new Set(workerList.map(w => w.id)))}
                style={{ background: "none", border: "none", color: "var(--text-dimmer)", cursor: "pointer", fontSize: 9 }}
              >
                EXPAND ALL
              </button>
              <button
                onClick={() => setExpandedIds(new Set())}
                style={{ background: "none", border: "none", color: "var(--text-dimmer)", cursor: "pointer", fontSize: 9 }}
              >
                COLLAPSE ALL
              </button>
            </div>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 10,
          }}>
            {workerList.map(worker => (
              <WorkerCard
                key={worker.id}
                worker={worker}
                isExpanded={expandedIds.has(worker.id)}
                onToggle={() => toggleExpanded(worker.id)}
              />
            ))}
          </div>
        </div>
      )}

      {mergeResult && phase === "done" && (
        <div style={{
          padding: "14px 16px",
          background: "var(--bg-2)",
          border: "1px solid var(--border-dim)",
          borderRadius: "var(--radius)",
        }}>
          <div className="label mb-2">
            MERGE RESULTS
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, flexWrap: "wrap" }}>
            {mergeResult.merged.length > 0 && (
              <span style={{ color: "var(--accent)" }}>
                Merged: {mergeResult.merged.join(", ")}
              </span>
            )}
            {mergeResult.conflicts.length > 0 && (
              <span style={{ color: "var(--yellow)" }}>
                Conflicts: {mergeResult.conflicts.join(", ")} — manual merge required
              </span>
            )}
            {mergeResult.skipped.length > 0 && (
              <span style={{ color: "var(--text-dimmer)" }}>
                No changes: {mergeResult.skipped.join(", ")}
              </span>
            )}
          </div>
        </div>
      )}

      {workerList.length > 1 && (phase === "running" || phase === "done") && (
        <div>
          <div
            onClick={() => {
              if (!conflictsOpen && !conflictData) {
                void checkConflicts();
              } else {
                setConflictsOpen(v => !v);
              }
            }}
            style={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 10,
              color: "var(--text-dimmer)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              padding: "8px 0",
              borderTop: "1px solid var(--border-dim)",
              userSelect: "none",
            }}
          >
            <span>{conflictsOpen ? "▾" : "▸"}</span>
            <span>FILE CONFLICTS</span>
            {conflictData && conflictData.hasConflicts && (
              <span style={{
                fontSize: 9,
                color: "var(--red)",
                border: "1px solid var(--red)",
                padding: "0px 5px",
                lineHeight: "14px",
              }}>
                {conflictData.conflicts.length}
              </span>
            )}
            {conflictData && !conflictData.hasConflicts && (
              <span style={{ fontSize: 9, color: "var(--accent)" }}>clear</span>
            )}
            <span style={{ flex: 1 }} />
            {(phase === "running" || phase === "done") && (
              <button
                onClick={(e) => { e.stopPropagation(); void checkConflicts(); }}
                style={{
                  background: "none",
                  border: "none",
                  color: conflictLoading ? "var(--text-dimmer)" : "var(--accent)",
                  cursor: conflictLoading ? "default" : "pointer",
                  fontSize: 9,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
                disabled={conflictLoading}
              >
                {conflictLoading ? "CHECKING..." : "REFRESH"}
              </button>
            )}
          </div>

          {conflictsOpen && conflictData && (
            <div style={{ paddingBottom: 8 }}>
              <DependencyGraph
                agents={[...workers.values()]
                  .filter(w => w.output)
                  .map(w => ({
                    id: String(w.id),
                    name: w.agentName,
                    files: parseWorkerOutput(w.output).files,
                  }))
                  .filter(a => a.files.length > 0)}
                conflicts={conflictData.conflicts}
              />
            </div>
          )}
        </div>
      )}

      <div>
        <div
          onClick={() => { setHistoryOpen(v => !v); if (!historyOpen) loadRuns(); }}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 10, color: 'var(--text-dimmer)', textTransform: 'uppercase',
            letterSpacing: '0.1em', padding: '8px 0', borderTop: '1px solid var(--border-dim)',
            userSelect: 'none' }}
        >
          <span>{historyOpen ? '▾' : '▸'}</span>
          <span>PAST RUNS</span>
          {runs.length > 0 && <span>({runs.length})</span>}
        </div>

        {historyOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {runs.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', padding: '12px 0' }}>No past runs</div>
            )}
            {runs.map(run => {
              const isExpanded = expandedRunId === run.id;
              const runCols = run.workers.length <= 2 ? run.workers.length : run.workers.length <= 4 ? 2 : 3;
              return (
                <div key={run.id} style={{ border: '1px solid var(--border-dim)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  <div
                    onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      cursor: 'pointer', background: 'var(--bg-2)', userSelect: 'none' }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: run.status === 'done' ? 'var(--accent)' : run.status === 'error' ? 'var(--red)' : 'var(--yellow)',
                      ...(run.status === 'running' ? { animation: 'swarm-pulse 1s ease-in-out infinite' } : {})
                    }} />
                    <span style={{ flex: 1, fontSize: 11, color: 'var(--text)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {run.task.slice(0, 80)}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-dimmer)', flexShrink: 0 }}>
                      {run.worker_count} agents
                      {run.merged_count > 0 && <span style={{ color: 'var(--accent)' }}> · {run.merged_count} merged</span>}
                      {run.conflict_count > 0 && <span style={{ color: 'var(--yellow)' }}> · {run.conflict_count} conflicts</span>}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--text-dimmer)', flexShrink: 0 }}>
                      {new Date(run.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        fetchApi(`/api/company/runs/${run.id}`, { method: 'DELETE' })
                          .then(() => loadRuns())
                          .catch(() => {});
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-dimmer)',
                        cursor: 'pointer', fontSize: 12, padding: '0 2px', flexShrink: 0 }}
                      title="Delete run"
                    >
                      ×
                    </button>
                    <span style={{ fontSize: 10, color: 'var(--text-dimmer)', flexShrink: 0 }}>
                      {isExpanded ? '▴' : '▾'}
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '10px 12px', background: 'var(--bg)',
                      display: 'grid', gridTemplateColumns: `repeat(${runCols}, 1fr)`, gap: 8 }}>
                      {run.workers.map(w => (
                        <WorkerCard
                          key={w.worker_id}
                          worker={{
                            id: w.worker_id,
                            title: w.title,
                            agentId: w.agent_id,
                            agentName: w.agent_name,
                            status: w.status as WorkerStatus,
                            output: w.output,
                            error: w.error ?? undefined,
                          }}
                          isExpanded={true}
                          onToggle={() => {}}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
    </PageShell>
  );
}
