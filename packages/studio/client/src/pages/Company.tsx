import { useState, useRef, useEffect } from "react";

interface Subtask {
  id: number;
  title: string;
  description: string;
  agentType: "frontend" | "backend" | "testing" | "analysis";
}

type Phase = "idle" | "planning" | "planned" | "running" | "merging" | "done";
type WorkerStatus = "pending" | "running" | "done" | "error" | "conflict";

interface WorkerState {
  id: number;
  title: string;
  agentType: string;
  status: WorkerStatus;
  chunks: string[];
  output: string;
  error?: string;
}

interface MergeResult {
  merged: number[];
  conflicts: number[];
  skipped: number[];
}

const AGENT_COLORS: Record<string, string> = {
  frontend: "var(--blue)",
  backend: "var(--accent)",
  testing: "var(--yellow)",
  analysis: "#a855f7",
};

export default function Company() {
  const [task, setTask] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [plan, setPlan] = useState<Subtask[]>([]);
  const [workers, setWorkers] = useState<Map<number, WorkerState>>(new Map());
  const [expandedWorker, setExpandedWorker] = useState<number | null>(null);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [workers, expandedWorker]);

  async function handlePlan() {
    if (!task.trim()) return;
    setPhase("planning");
    setError(null);
    setPlan([]);
    setWorkers(new Map());
    setMergeResult(null);

    try {
      const res = await fetch("/api/company/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      const data = await res.json() as { plan?: Subtask[]; error?: string };
      if (data.error) {
        setError(data.error);
        setPhase("idle");
        return;
      }
      if (data.plan) {
        setPlan(data.plan);
        setPhase("planned");
      }
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

    // Initialize worker states
    const initial = new Map<number, WorkerState>();
    for (const s of plan) {
      initial.set(s.id, {
        id: s.id,
        title: s.title,
        agentType: s.agentType,
        status: "pending",
        chunks: [],
        output: "",
      });
    }
    setWorkers(initial);

    try {
      const res = await fetch("/api/company/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, plan }),
      });

      if (!res.body) {
        setError("No response stream");
        setPhase("planned");
        return;
      }

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
        setWorkers((prev) => {
          const next = new Map(prev);
          const w = next.get(event.id as number);
          if (w) next.set(w.id, { ...w, status: "running" });
          return next;
        });
        if (expandedWorker === null) setExpandedWorker(event.id as number);
        break;

      case "worker_chunk":
        setWorkers((prev) => {
          const next = new Map(prev);
          const w = next.get(event.id as number);
          if (w) next.set(w.id, { ...w, chunks: [...w.chunks, event.text as string] });
          return next;
        });
        break;

      case "worker_done":
        setWorkers((prev) => {
          const next = new Map(prev);
          const w = next.get(event.id as number);
          if (w) next.set(w.id, { ...w, status: "done", output: event.output as string });
          return next;
        });
        break;

      case "worker_error":
        setWorkers((prev) => {
          const next = new Map(prev);
          const w = next.get(event.id as number);
          if (w) next.set(w.id, { ...w, status: "error", error: event.error as string });
          return next;
        });
        break;

      case "phase":
        if ((event.phase as string) === "merging") setPhase("merging");
        break;

      case "merge_result":
        setMergeResult(event as unknown as MergeResult);
        // Update worker statuses based on merge
        setWorkers((prev) => {
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
    setTask("");
    setPhase("idle");
    setPlan([]);
    setWorkers(new Map());
    setExpandedWorker(null);
    setMergeResult(null);
    setError(null);
  }

  const statusIcon = (status: WorkerStatus) => {
    switch (status) {
      case "pending": return { text: "PENDING", color: "var(--text-dimmer)" };
      case "running": return { text: "RUNNING", color: "var(--accent)" };
      case "done": return { text: "DONE", color: "var(--accent)" };
      case "error": return { text: "ERROR", color: "var(--red)" };
      case "conflict": return { text: "CONFLICT", color: "var(--yellow)" };
    }
  };

  return (
    <div style={{ padding: "28px", maxWidth: 960 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4, color: "var(--text)" }}>
            COMPANY MODE
          </h1>
          <div style={{ fontSize: 11, color: "var(--text-dimmer)" }}>
            Multi-agent orchestrator -- decompose tasks, run parallel agents in worktrees, merge results
          </div>
        </div>
        {phase !== "idle" && (
          <button className="btn" onClick={handleClear} style={{ fontSize: 11 }}>
            CLEAR
          </button>
        )}
      </div>

      {/* Task input */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Describe what you want to build:
        </div>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="e.g. Add user authentication with JWT, login/register pages, and protected routes..."
          disabled={phase === "planning" || phase === "running" || phase === "merging"}
          style={{
            width: "100%",
            minHeight: 80,
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
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-dim)"; }}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            className="btn btn-primary"
            onClick={handlePlan}
            disabled={!task.trim() || phase === "planning" || phase === "running" || phase === "merging"}
          >
            {phase === "planning" ? "PLANNING..." : "> PLAN"}
          </button>
          {plan.length > 0 && phase !== "running" && phase !== "merging" && (
            <button
              className="btn btn-primary"
              onClick={handleRun}
            >
              {"> RUN"}
            </button>
          )}
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
          fontSize: 12,
          marginBottom: 20,
          fontFamily: "var(--font)",
        }}>
          {error}
        </div>
      )}

      {/* Planning spinner */}
      {phase === "planning" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0", color: "var(--text-dim)", fontSize: 12 }}>
          <span style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--accent)",
            animation: "blink 1s step-end infinite",
          }} />
          Decomposing task...
        </div>
      )}

      {/* Plan cards */}
      {plan.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 10,
            color: "var(--text-dimmer)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: "1px solid var(--border-dim)",
          }}>
            PLAN -- {plan.length} subtasks
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(plan.length, 4)}, 1fr)`,
            gap: 10,
          }}>
            {plan.map((subtask) => {
              const worker = workers.get(subtask.id);
              const status = worker?.status ?? "pending";
              const si = statusIcon(status);
              const isExpanded = expandedWorker === subtask.id;
              const agentColor = AGENT_COLORS[subtask.agentType] ?? "var(--text-dim)";

              return (
                <div
                  key={subtask.id}
                  onClick={() => setExpandedWorker(isExpanded ? null : subtask.id)}
                  style={{
                    padding: "14px",
                    background: isExpanded ? "var(--bg-3)" : "var(--bg-2)",
                    border: "1px solid",
                    borderColor: isExpanded ? "var(--accent)" : status === "running" ? agentColor : "var(--border-dim)",
                    borderRadius: "var(--radius)",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {/* Subtask ID + title */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--bg)",
                      background: agentColor,
                      padding: "1px 5px",
                      borderRadius: "var(--radius)",
                    }}>
                      {subtask.id}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {subtask.title}
                    </span>
                  </div>

                  {/* Agent type badge */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 9,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: agentColor,
                      border: `1px solid ${agentColor}`,
                      padding: "1px 5px",
                      borderRadius: "var(--radius)",
                    }}>
                      {subtask.agentType}
                    </span>
                  </div>

                  {/* Status */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {status === "running" && (
                      <span style={{
                        display: "inline-block",
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--accent)",
                        animation: "blink 1s step-end infinite",
                        flexShrink: 0,
                      }} />
                    )}
                    <span style={{ fontSize: 10, color: si.color, letterSpacing: "0.05em" }}>
                      {si.text}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expanded worker output */}
      {expandedWorker !== null && workers.has(expandedWorker) && (() => {
        const w = workers.get(expandedWorker)!;
        const agentColor = AGENT_COLORS[w.agentType] ?? "var(--text-dim)";
        return (
          <div style={{ marginBottom: 24 }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", textTransform: "uppercase" }}>
                  Agent {w.id}: {w.title}
                </span>
                <span style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  color: agentColor,
                  border: `1px solid ${agentColor}`,
                  padding: "1px 5px",
                  borderRadius: "var(--radius)",
                }}>
                  {w.agentType}
                </span>
              </div>
              <button
                className="btn"
                onClick={(e) => { e.stopPropagation(); setExpandedWorker(null); }}
                style={{ fontSize: 10, padding: "2px 8px" }}
              >
                COLLAPSE
              </button>
            </div>
            <div
              ref={outputRef}
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border-dim)",
                borderRadius: "var(--radius)",
                padding: 14,
                fontFamily: "var(--font)",
                fontSize: 11,
                lineHeight: 1.6,
                color: "var(--text-dim)",
                maxHeight: 300,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {w.chunks.length > 0 ? w.chunks.join("") : w.output || (w.error ? w.error : "Waiting for output...")}
              {w.status === "running" && <span className="cursor" />}
            </div>
          </div>
        );
      })()}

      {/* Merging indicator */}
      {phase === "merging" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", color: "var(--text-dim)", fontSize: 12 }}>
          <span style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--accent)",
            animation: "blink 1s step-end infinite",
          }} />
          Merging results...
        </div>
      )}

      {/* Merge results */}
      {mergeResult && phase === "done" && (
        <div style={{
          padding: "14px",
          background: "var(--bg-2)",
          border: "1px solid var(--border-dim)",
          borderRadius: "var(--radius)",
          marginBottom: 20,
        }}>
          <div style={{
            fontSize: 10,
            color: "var(--text-dimmer)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 10,
          }}>
            MERGE RESULTS
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
            {mergeResult.merged.length > 0 && (
              <span style={{ color: "var(--accent)" }}>
                Merged: {mergeResult.merged.join(", ")}
              </span>
            )}
            {mergeResult.conflicts.length > 0 && (
              <span style={{ color: "var(--yellow)" }}>
                Conflicts: {mergeResult.conflicts.join(", ")} (manual merge required)
              </span>
            )}
            {mergeResult.skipped.length > 0 && (
              <span style={{ color: "var(--text-dimmer)" }}>
                Skipped: {mergeResult.skipped.join(", ")} (no changes)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
