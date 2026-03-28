import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "../hooks/useToast.ts";
import { PageShell } from "../components/shared/PageShell.tsx";
import { fetchApi, apiUrl } from "../lib/api";

interface AgentDef {
  id: string;
  name: string;
  description: string;
}

type AgentStatus = "pending" | "running" | "done" | "failed" | "cancelled";
type SwarmMode = "plan" | "build";
type SwarmPhase = "idle" | "launching" | "running" | "done";

interface TaskInput {
  task: string;
  agentId: string;
}

interface AgentCard {
  id: string;
  task: string;
  agentId?: string;
  status: AgentStatus;
  output: string;
}

const STATUS_COLOR: Record<AgentStatus, string> = {
  pending: "var(--text-dimmer)",
  running: "var(--accent)",
  done: "var(--accent)",
  failed: "var(--red)",
  cancelled: "var(--text-dimmer)",
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  pending: "PENDING",
  running: "RUNNING",
  done: "DONE",
  failed: "FAILED",
  cancelled: "CANCELLED",
};

function emptyTask(): TaskInput {
  return { task: "", agentId: "" };
}

export default function Swarm() {
  const [tasks, setTasks] = useState<TaskInput[]>([emptyTask(), emptyTask()]);
  const [mode, setMode] = useState<SwarmMode>("build");
  const [phase, setPhase] = useState<SwarmPhase>("idle");
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [availableAgents, setAvailableAgents] = useState<AgentDef[]>([]);
  const [swarmId, setSwarmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const outputRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    fetchApi("/api/company/agents")
      .then((r) => r.json())
      .then((d: { agents: AgentDef[] }) => setAvailableAgents(d.agents ?? []))
      .catch(() => {});
  }, []);

  // Auto-scroll each output card while running
  useEffect(() => {
    if (phase !== "running") return;
    for (const [, el] of outputRefs.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [agents, phase]);

  const connectStream = useCallback((id: string) => {
    const es = new EventSource(apiUrl(`/api/swarm/${id}/stream`));
    esRef.current = es;

    es.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data as string) as {
          type: string;
          agentIndex?: number;
          data?: string;
          swarmId?: string;
        };

        if (event.type === "swarm_complete") {
          setPhase("done");
          es.close();
          setAgents((prev) => {
            const doneCount = prev.filter((a) => a.status === "done").length;
            const failedCount = prev.filter((a) => a.status === "failed").length;
            if (failedCount === 0) {
              toast("Swarm complete", { variant: "success", title: `${doneCount}/${prev.length} tasks succeeded` });
            }
            return prev;
          });
          return;
        }

        const idx = event.agentIndex;
        if (idx === undefined) return;

        setAgents((prev) => {
          const next = [...prev];
          const card = next[idx];
          if (!card) return prev;

          if (event.type === "status") {
            const newStatus = event.data as AgentStatus;
            next[idx] = { ...card, status: newStatus };
            if (newStatus === "failed") {
              toast("Agent failed", { variant: "warning", title: card.task.slice(0, 60) });
            }
          } else if (event.type === "chunk") {
            next[idx] = { ...card, output: card.output + (event.data ?? "") };
          } else if (event.type === "complete") {
            next[idx] = { ...card, status: "done" };
          }
          return next;
        });
      } catch {}
    };

    es.onerror = () => {
      setPhase("done");
      es.close();
    };
  }, []);

  async function handleLaunch() {
    const validTasks = tasks.filter((t) => t.task.trim());
    if (validTasks.length === 0 || phase !== "idle") return;

    setPhase("launching");
    setError(null);
    setAgents([]);

    try {
      const res = await fetchApi("/api/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: validTasks.map((t) => ({
            task: t.task.trim(),
            agentId: t.agentId || undefined,
          })),
          mode,
        }),
      });

      const data = await res.json() as {
        error?: string;
        swarmId?: string;
        agents?: Array<{ id: string; task: string; status: AgentStatus }>;
      };

      if (!res.ok || !data.swarmId) {
        setError(data.error ?? `Server error ${res.status}`);
        setPhase("idle");
        return;
      }

      setSwarmId(data.swarmId);
      setAgents(
        (data.agents ?? []).map((a) => ({
          id: a.id,
          task: a.task,
          agentId: validTasks.find((t) => t.task.trim() === a.task)?.agentId || undefined,
          status: "pending",
          output: "",
        }))
      );
      setPhase("running");
      connectStream(data.swarmId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("idle");
    }
  }

  async function handleCancel() {
    if (!swarmId) return;
    try {
      await fetchApi(`/api/swarm/${swarmId}`, { method: "DELETE" });
    } catch {}
    esRef.current?.close();
    setPhase("done");
    setAgents((prev) =>
      prev.map((a) =>
        a.status === "pending" || a.status === "running"
          ? { ...a, status: "cancelled" }
          : a
      )
    );
    toast("Swarm cancelled", { variant: "info" });
  }

  function handleReset() {
    esRef.current?.close();
    setTasks([emptyTask(), emptyTask()]);
    setMode("build");
    setPhase("idle");
    setAgents([]);
    setSwarmId(null);
    setError(null);
    outputRefs.current.clear();
  }

  function addTask() {
    if (tasks.length >= 8) return;
    setTasks((prev) => [...prev, emptyTask()]);
  }

  function removeTask(i: number) {
    setTasks((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateTask(i: number, field: keyof TaskInput, value: string) {
    setTasks((prev) => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t));
  }

  const validCount = tasks.filter((t) => t.task.trim()).length;
  const busy = phase === "launching" || phase === "running";

  // Grid columns based on agent count
  const cols = agents.length <= 1 ? 1 : agents.length <= 2 ? 2 : agents.length <= 4 ? 2 : Math.min(agents.length, 4);

  return (
    <PageShell>
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text)", marginBottom: 4 }}>
            SWARM
          </h1>
          <div style={{ fontSize: 11, color: "var(--text-dimmer)" }}>
            Run multiple agents in parallel — each task gets its own worktree
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {phase !== "idle" && (
            <span style={{
              fontSize: 10,
              color: "var(--text-dimmer)",
              background: "var(--bg-2)",
              border: "1px solid var(--border-dim)",
              borderRadius: "var(--radius)",
              padding: "3px 8px",
              letterSpacing: "0.05em",
            }}>
              {agents.length} AGENT{agents.length !== 1 ? "S" : ""}
            </span>
          )}
          {phase === "running" && (
            <button className="btn btn-sm" onClick={handleCancel} style={{ color: "var(--red)", borderColor: "var(--red)" }}>
              Cancel
            </button>
          )}
          {(phase === "done" || phase === "idle") && agents.length > 0 && (
            <button className="btn btn-sm" onClick={handleReset}>
              New swarm
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
          fontSize: 11,
          fontFamily: "var(--font)",
        }}>
          {error}
        </div>
      )}

      {/* Task editor (idle) */}
      {phase === "idle" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {tasks.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{
                minWidth: 20,
                paddingTop: 10,
                fontSize: 10,
                color: "var(--text-dimmer)",
                fontFamily: "var(--font)",
                letterSpacing: "0.05em",
                textAlign: "right",
              }}>
                {i + 1}
              </div>
              <textarea
                value={t.task}
                onChange={(e) => updateTask(i, "task", e.target.value)}
                placeholder={`Task ${i + 1} — e.g. Add dark mode toggle...`}
                rows={2}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  background: "var(--bg-2)",
                  border: "1px solid var(--border-dim)",
                  borderRadius: "var(--radius)",
                  color: "var(--text)",
                  fontFamily: "var(--font)",
                  fontSize: 12,
                  lineHeight: 1.5,
                  resize: "vertical",
                  outline: "none",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-dim)"; }}
              />
              <select
                value={t.agentId}
                onChange={(e) => updateTask(i, "agentId", e.target.value)}
                style={{
                  padding: "6px 8px",
                  background: "var(--bg-2)",
                  border: "1px solid var(--border-dim)",
                  borderRadius: "var(--radius)",
                  color: t.agentId ? "var(--text)" : "var(--text-dimmer)",
                  fontFamily: "var(--font)",
                  fontSize: 10,
                  outline: "none",
                  cursor: "pointer",
                  minWidth: 130,
                  alignSelf: "center",
                }}
              >
                <option value="">No agent</option>
                {availableAgents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {tasks.length > 1 && (
                <button
                  onClick={() => removeTask(i)}
                  style={{
                    alignSelf: "center",
                    padding: "4px 8px",
                    background: "none",
                    border: "1px solid var(--border-dim)",
                    borderRadius: "var(--radius)",
                    color: "var(--text-dimmer)",
                    fontFamily: "var(--font)",
                    fontSize: 12,
                    cursor: "pointer",
                    lineHeight: 1,
                  }}
                  title="Remove task"
                >
                  ×
                </button>
              )}
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {tasks.length < 8 && (
              <button
                className="btn btn-sm"
                onClick={addTask}
              >
                + Add task
              </button>
            )}

            {/* Mode toggle */}
            <div style={{ display: "flex", border: "1px solid var(--border-dim)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              {(["plan", "build"] as SwarmMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    padding: "5px 10px",
                    fontSize: 10,
                    fontFamily: "var(--font)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    border: "none",
                    borderRight: m === "plan" ? "1px solid var(--border-dim)" : "none",
                    background: mode === m
                      ? m === "plan" ? "var(--cyan-bg)" : "var(--accent-bg)"
                      : "var(--bg-2)",
                    color: mode === m
                      ? m === "plan" ? "var(--cyan)" : "var(--accent)"
                      : "var(--text-dimmer)",
                    fontWeight: mode === m ? 700 : 400,
                  }}
                >
                  {m}
                </button>
              ))}
            </div>

            <span style={{ flex: 1 }} />

            <button
              className="btn btn-primary"
              onClick={handleLaunch}
              disabled={validCount === 0}
            >
              {`Launch Swarm (${validCount})`}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {phase === "idle" && tasks.every((t) => !t.task.trim()) && (
        <div style={{
          padding: "40px 20px",
          textAlign: "center",
          color: "var(--text-dimmer)",
          fontSize: 12,
          border: "1px dashed var(--border-dim)",
          borderRadius: "var(--radius)",
        }}>
          No tasks yet — add tasks above to run in parallel
        </div>
      )}

      {/* Agent cards grid */}
      {agents.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 12,
        }}>
          {agents.map((agent, i) => {
            const running = agent.status === "running";
            const failed = agent.status === "failed";
            const colour = STATUS_COLOR[agent.status];

            return (
              <div
                key={agent.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  background: "var(--bg-2)",
                  border: "1px solid var(--border-dim)",
                  borderLeft: `3px solid ${colour}`,
                  borderRadius: "var(--radius)",
                  overflow: "hidden",
                  animation: running ? "swarm-border-pulse 2s ease-in-out infinite" : undefined,
                }}
              >
                {/* Card header */}
                <div style={{
                  padding: "8px 12px",
                  borderBottom: "1px solid var(--border-dim)",
                  background: "var(--bg-3)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: colour,
                    flexShrink: 0,
                    animation: running ? "run-pulse 1s ease-in-out infinite" : undefined,
                  }} />
                  <span style={{
                    fontSize: 10,
                    color: colour,
                    letterSpacing: "0.06em",
                    fontFamily: "var(--font)",
                    flexShrink: 0,
                  }}>
                    {STATUS_LABEL[agent.status]}
                  </span>
                  <span style={{
                    flex: 1,
                    fontSize: 11,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {agent.task}
                  </span>
                  {agent.agentId && (
                    <span style={{
                      fontSize: 9,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--accent)",
                      border: "1px solid var(--accent)",
                      padding: "1px 5px",
                      borderRadius: "var(--radius)",
                      flexShrink: 0,
                      opacity: 0.75,
                    }}>
                      {availableAgents.find((a) => a.id === agent.agentId)?.name ?? agent.agentId}
                    </span>
                  )}
                </div>

                {/* Output */}
                <div
                  ref={(el) => {
                    if (el) outputRefs.current.set(i, el);
                    else outputRefs.current.delete(i);
                  }}
                  style={{
                    padding: "8px 12px",
                    fontFamily: "var(--font)",
                    fontSize: 10,
                    lineHeight: 1.6,
                    color: failed ? "var(--red)" : "var(--text-dim)",
                    minHeight: 120,
                    maxHeight: 300,
                    overflowY: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {agent.output || (
                    <span style={{ color: "var(--text-dimmer)" }}>
                      {agent.status === "pending" ? "Waiting to start..." : "Running..."}
                    </span>
                  )}
                  {running && (
                    <span style={{
                      display: "inline-block",
                      width: 4, height: 10,
                      background: "var(--accent)",
                      verticalAlign: "text-bottom",
                      marginLeft: 2,
                      animation: "cursor-blink 1s step-end infinite",
                    }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Done banner */}
      {phase === "done" && agents.length > 0 && (
        <div style={{
          padding: "12px 16px",
          background: "var(--bg-2)",
          border: "1px solid var(--border-dim)",
          borderRadius: "var(--radius)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <span style={{
            fontSize: 11,
            color: "var(--text-dimmer)",
          }}>
            {agents.filter((a) => a.status === "done").length}/{agents.length} agents completed
            {agents.some((a) => a.status === "failed") && ` — ${agents.filter((a) => a.status === "failed").length} failed`}
            {agents.some((a) => a.status === "cancelled") && ` — ${agents.filter((a) => a.status === "cancelled").length} cancelled`}
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={handleReset}>
            {"New swarm"}
          </button>
        </div>
      )}

      {/* Launching indicator */}
      {phase === "launching" && (
        <div style={{
          padding: "12px 16px",
          background: "var(--bg-2)",
          border: "1px solid var(--border-dim)",
          borderRadius: "var(--radius)",
          fontSize: 11,
          color: "var(--accent)",
        }}>
          Launching {validCount} agent{validCount !== 1 ? "s" : ""}...
        </div>
      )}

    </div>
    </PageShell>
  );
}
