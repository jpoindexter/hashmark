import { useState, useRef, useEffect, useCallback } from "react";

interface AgentDef {
  id: string;
  name: string;
  description: string;
}

interface Subtask {
  id: number;
  title: string;
  description: string;
  agentId: string;
}

type Phase = "idle" | "planning" | "planned" | "running" | "merging" | "done";
type WorkerStatus = "pending" | "running" | "done" | "error" | "conflict";

interface WorkerState {
  id: number;
  title: string;
  agentId: string;
  agentName: string;
  status: WorkerStatus;
  output: string;
  error?: string;
}

interface MergeResult {
  merged: number[];
  conflicts: number[];
  skipped: number[];
}

interface RunRecord {
  id: string;
  task: string;
  status: 'running' | 'done' | 'error';
  worker_count: number;
  merged_count: number;
  conflict_count: number;
  skipped_count: number;
  created_at: number;
  completed_at: number | null;
  workers: {
    worker_id: number;
    title: string;
    agent_id: string;
    agent_name: string;
    status: string;
    output: string;
    error: string | null;
  }[];
}

const STATUS_COLORS: Record<WorkerStatus, string> = {
  pending:  "var(--text-dimmer)",
  running:  "var(--accent)",
  done:     "var(--accent)",
  error:    "var(--red)",
  conflict: "var(--yellow)",
};

const STATUS_LABELS: Record<WorkerStatus, string> = {
  pending:  "WAITING",
  running:  "RUNNING",
  done:     "DONE",
  error:    "FAILED",
  conflict: "CONFLICT",
};

function AgentBadge({ name }: { name: string }) {
  return (
    <span style={{
      fontSize: 9,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      color: "var(--accent)",
      border: "1px solid var(--accent)",
      padding: "1px 5px",
      borderRadius: "var(--radius)",
      opacity: 0.8,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      maxWidth: 120,
    }}>
      {name}
    </span>
  );
}

function WorkerCard({ worker, isExpanded, onToggle }: {
  worker: WorkerState;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const outputRef = useRef<HTMLDivElement>(null);
  const wasRunning = useRef(false);

  // Auto-scroll to bottom while running
  useEffect(() => {
    if (worker.status === "running") {
      wasRunning.current = true;
      if (outputRef.current) {
        outputRef.current.scrollTop = outputRef.current.scrollHeight;
      }
    }
  }, [worker.output, worker.status]);

  const color = STATUS_COLORS[worker.status];

  return (
    <div style={{
      background: "var(--bg-2)",
      border: `1px solid ${isExpanded ? "var(--accent)" : worker.status === "running" ? "var(--accent)" : "var(--border-dim)"}`,
      borderRadius: "var(--radius)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      transition: "border-color 0.15s",
    }}>
      {/* Card header */}
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          cursor: "pointer",
          borderBottom: isExpanded ? "1px solid var(--border-dim)" : "none",
          background: isExpanded ? "var(--bg-3)" : "transparent",
          userSelect: "none",
        }}
      >
        {/* Status dot */}
        <span style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          ...(worker.status === "running" ? { animation: "swarm-pulse 1s ease-in-out infinite" } : {}),
        }} />

        {/* Agent badge */}
        <AgentBadge name={worker.agentName} />

        {/* Title */}
        <span style={{
          flex: 1,
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {worker.title}
        </span>

        {/* Status label */}
        <span style={{ fontSize: 9, color, letterSpacing: "0.05em", flexShrink: 0 }}>
          {STATUS_LABELS[worker.status]}
        </span>

        {/* Toggle icon */}
        <span style={{ fontSize: 10, color: "var(--text-dimmer)", flexShrink: 0 }}>
          {isExpanded ? "▴" : "▾"}
        </span>
      </div>

      {/* Output */}
      {isExpanded && (
        <div
          ref={outputRef}
          style={{
            padding: "10px 12px",
            fontFamily: "var(--font)",
            fontSize: 10,
            lineHeight: 1.6,
            color: "var(--text-dim)",
            maxHeight: 220,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            flex: 1,
          }}
        >
          {worker.error ? (
            <span style={{ color: "var(--red)" }}>{worker.error}</span>
          ) : worker.output ? (
            <>
              {worker.output}
              {worker.status === "running" && (
                <span style={{
                  display: "inline-block",
                  width: 5,
                  height: 11,
                  background: "var(--accent)",
                  verticalAlign: "text-bottom",
                  marginLeft: 2,
                  animation: "cursor-blink 1s step-end infinite",
                }} />
              )}
            </>
          ) : (
            <span style={{ color: "var(--text-dimmer)" }}>Waiting for output...</span>
          )}
        </div>
      )}
    </div>
  );
}

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
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load available agents for preview
  useEffect(() => {
    fetch("/api/company/agents")
      .then(r => r.json())
      .then((d: { agents: AgentDef[] }) => setAvailableAgents(d.agents ?? []))
      .catch(() => {});
  }, []);

  const loadRuns = useCallback(() => {
    fetch('/api/company/runs')
      .then(r => r.json())
      .then((d: { runs: RunRecord[] }) => setRuns(d.runs ?? []))
      .catch(() => {});
  }, []);

  // Poll for in-progress runs while history panel is open
  useEffect(() => {
    if (!historyOpen) return;
    loadRuns();
    const interval = setInterval(loadRuns, 3000);
    return () => clearInterval(interval);
  }, [historyOpen, loadRuns]);

  // On completion: reload runs, open history, start auto-clear countdown
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

  // Cancel auto-clear if user interacts with the result
  function cancelAutoClear() {
    if (clearTimerRef.current) { clearTimeout(clearTimerRef.current); clearTimerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setClearCountdown(null);
  }

  const agentName = useCallback((agentId: string): string => {
    const a = availableAgents.find(x => x.id === agentId);
    return a?.name ?? agentId.split("-").pop() ?? agentId;
  }, [availableAgents]);

  async function handlePlan() {
    if (!task.trim()) return;
    setPhase("planning");
    setError(null);
    setPlan([]);
    setWorkers(new Map());
    setExpandedIds(new Set());
    setMergeResult(null);

    try {
      const res = await fetch("/api/company/plan", {
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
    // Auto-expand all workers when run starts
    setWorkers(initial);
    setExpandedIds(new Set(plan.map(s => s.id)));

    try {
      const res = await fetch("/api/company/run", {
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

  // Determine grid columns based on worker count
  const cols = workerList.length <= 2 ? workerList.length : workerList.length <= 4 ? 2 : Math.min(3, workerList.length);

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text)", marginBottom: 4 }}>
            SWARM
          </h1>
          <div style={{ fontSize: 11, color: "var(--text-dimmer)" }}>
            Decompose tasks, run agents in parallel git worktrees, merge results
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Available agents preview */}
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
              <button className="btn" onClick={() => { cancelAutoClear(); handleClear(); }} style={{ fontSize: 11 }}>CLEAR</button>
            </div>
          )}
        </div>
      </div>

      {/* Task input */}
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
            {phase === "planning" ? "PLANNING..." : "> PLAN"}
          </button>
          {plan.length > 0 && !busy && (
            <button className="btn btn-primary" onClick={handleRun}>
              {`> RUN ${plan.length} AGENTS`}
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

      {/* Error */}
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

      {/* Plan preview (before running) */}
      {plan.length > 0 && phase === "planned" && (
        <div>
          <div style={{ fontSize: 10, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--border-dim)" }}>
            PLAN — {plan.length} parallel subtasks
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
                  fontWeight: 700,
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

      {/* Swarm grid — always-visible output during/after run */}
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

      {/* Merge results */}
      {mergeResult && phase === "done" && (
        <div style={{
          padding: "14px 16px",
          background: "var(--bg-2)",
          border: "1px solid var(--border-dim)",
          borderRadius: "var(--radius)",
        }}>
          <div style={{ fontSize: 10, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
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

      {/* History */}
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
                  {/* Run header */}
                  <div
                    onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      cursor: 'pointer', background: 'var(--bg-2)', userSelect: 'none' }}
                  >
                    {/* Status dot */}
                    <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: run.status === 'done' ? 'var(--accent)' : run.status === 'error' ? 'var(--red)' : 'var(--yellow)',
                      ...(run.status === 'running' ? { animation: 'swarm-pulse 1s ease-in-out infinite' } : {})
                    }} />
                    {/* Task text */}
                    <span style={{ flex: 1, fontSize: 11, color: 'var(--text)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {run.task.slice(0, 80)}
                    </span>
                    {/* Stats */}
                    <span style={{ fontSize: 10, color: 'var(--text-dimmer)', flexShrink: 0 }}>
                      {run.worker_count} agents
                      {run.merged_count > 0 && <span style={{ color: 'var(--accent)' }}> · {run.merged_count} merged</span>}
                      {run.conflict_count > 0 && <span style={{ color: 'var(--yellow)' }}> · {run.conflict_count} conflicts</span>}
                    </span>
                    {/* Date */}
                    <span style={{ fontSize: 9, color: 'var(--text-dimmer)', flexShrink: 0 }}>
                      {new Date(run.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {/* Delete */}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        fetch(`/api/company/runs/${run.id}`, { method: 'DELETE' })
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

                  {/* Expanded worker grid */}
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

      <style>{`
        @keyframes swarm-pulse { 0%,100%{opacity:.5;transform:scale(.8)} 50%{opacity:1;transform:scale(1.3)} }
        @keyframes cursor-blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}
