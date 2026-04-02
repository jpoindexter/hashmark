import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Zap } from "lucide-react";
import { DiffPanel } from "../components/DiffPanel.tsx";
import PlanPhaseBar, { extractPlanSummary, detectPlanPhaseTransition } from "../components/PlanPhaseBar.tsx";
import { toast } from "../hooks/useToast.ts";
import ActivityFeed from "../components/ActivityFeed.tsx";
import { PageShell } from "../components/shared/PageShell.tsx";
import { fetchApi } from "../lib/api";
import type { AgentDef, RunPhase, RunMode, RunResult } from "./run/types";
import { deptColor, loadRecent, saveRecent, useElapsed, formatElapsed } from "./run/types";
import RunInputForm from "./run/RunInputForm";
import RunDoneBanner from "./run/RunDoneBanner";

const MAX_DISPLAY_LINES = 500;

export default function Run() {
  const [searchParams] = useSearchParams();
  const [task, setTask]         = useState(searchParams.get("task") ?? "");
  const [agentId, setAgentId]   = useState<string>(searchParams.get("agent") ?? "");
  const [agents, setAgents]     = useState<AgentDef[]>([]);
  const [phase, setPhase]       = useState<RunPhase>("idle");
  const [mode, setMode]         = useState<RunMode>("build");
  const [planPhase, setPlanPhase] = useState<1 | 2 | 3>(1);
  const [status, setStatus]     = useState("");
  const [displayOutput, setDisplayOutput] = useState("");
  const [totalLines, setTotalLines]      = useState(0);
  const [result, setResult]     = useState<RunResult | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [toolEvents, setToolEvents] = useState<import("../components/ToolEvent").ToolEventData[]>([]);
  const [diff, setDiff]         = useState<string>("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [copied, setCopied]     = useState(false);
  const [merging, setMerging]   = useState(false);

  const outputRef     = useRef<HTMLDivElement>(null);
  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const resultRef     = useRef<RunResult | null>(null);
  const fullOutputRef = useRef("");
  const outputDirty   = useRef(false);
  const rafId         = useRef<number>(0);

  const flushOutput = useCallback(() => {
    const full = fullOutputRef.current;
    const lines = full.split("\n");
    setTotalLines(lines.length);
    if (lines.length > MAX_DISPLAY_LINES) {
      setDisplayOutput(lines.slice(-MAX_DISPLAY_LINES).join("\n"));
    } else {
      setDisplayOutput(full);
    }
    outputDirty.current = false;
  }, []);

  const appendOutput = useCallback((text: string) => {
    fullOutputRef.current += text;
    if (!outputDirty.current) {
      outputDirty.current = true;
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(flushOutput);
    }
  }, [flushOutput]);

  const clearOutput = useCallback(() => {
    fullOutputRef.current = "";
    outputDirty.current = false;
    cancelAnimationFrame(rafId.current);
    setDisplayOutput("");
    setTotalLines(0);
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  const elapsed = useElapsed(phase === "running");

  useEffect(() => { resultRef.current = result; }, [result]);

  useEffect(() => {
    fetchApi("/api/company/agents")
      .then((r) => r.json())
      .then((d: { agents: AgentDef[] }) => setAgents(d.agents ?? []))
      .catch(() => {
        toast.error("Failed to load agents");
      });
  }, []);

  useEffect(() => {
    if (phase === "running" && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [displayOutput, phase]);

  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  async function handleRun() {
    if (!task.trim() || phase === "running") return;
    saveRecent(task.trim());
    setPhase("running");
    setStatus("Running...");
    clearOutput();
    setResult(null);
    resultRef.current = null;
    setError(null);
    setShowDiff(false);
    setDiff("");
    setPlanPhase(1);

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    try {
      const res = await fetchApi("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, agentId: agentId || undefined, mode }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? `Server error ${res.status}`);
        setPhase("idle");
        return;
      }

      if (!res.body) {
        setError("No stream returned");
        setPhase("idle");
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

      if (buffer.trim().startsWith("data: ")) {
        try {
          const event = JSON.parse(buffer.trim().slice(6)) as Record<string, unknown>;
          handleEvent(event);
        } catch {}
      }

      if (!resultRef.current && !error) {
        setPhase("lost");
        setStatus("Connection lost");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (resultRef.current) {
        setError(msg);
        setPhase("done");
      } else {
        setError(msg);
        setPhase("lost");
        setStatus("Connection lost");
      }
    }
  }

  function handleRetry() {
    if (!task.trim()) return;
    setPhase("idle");
    setStatus("");
    setError(null);
    setResult(null);
    resultRef.current = null;
    setTimeout(() => void handleRun(), 0);
  }

  const handleEvent = useCallback((event: Record<string, unknown>) => {
    switch (event.type) {
      case "start":
        setStatus("Running...");
        break;
      case "chunk":
        appendOutput(event.text as string);
        if (mode === "plan") {
          const next = detectPlanPhaseTransition(fullOutputRef.current, planPhase);
          if (next !== planPhase) setPlanPhase(next);
        }
        break;
      case "tool_use": {
        const tool = event.tool as string;
        const input = event.input as Record<string, unknown> | undefined;
        const target = input?.command
          ? `$ ${(input.command as string).slice(0, 120)}`
          : input?.file_path
            ? String(input.file_path)
            : input?.pattern
              ? String(input.pattern)
              : input?.description
                ? String(input.description).slice(0, 80)
                : "";
        appendOutput(`\n[${tool}] ${target.split("/").pop() || target.slice(0, 60)}\n`);
        setStatus(`${tool}...`);
        setToolEvents(prev => [...prev, {
          id: (event.toolUseId as string) || `te-${Date.now()}`,
          tool, target, status: "running", startedAt: Date.now(), elapsed: 0,
        }]);
        break;
      }
      case "tool_result": {
        const resultId = event.toolUseId as string;
        if (resultId) {
          setToolEvents(prev => prev.map(te =>
            te.id === resultId ? { ...te, status: "complete" as const, output: typeof event.content === "string" ? (event.content as string).slice(0, 2000) : undefined } : te
          ));
        }
        break;
      }
      case "tool_progress": {
        const tp = event.tool as string;
        const el = event.elapsed as number;
        setStatus(`${tp}... ${Math.round(el)}s`);
        setToolEvents(prev => prev.map(te =>
          te.status === "running" && te.tool === tp ? { ...te, elapsed: el } : te
        ));
        break;
      }
      case "thinking":
        setStatus("Thinking...");
        break;
      case "cost": {
        const usd = (event.totalUsd as number).toFixed(4);
        appendOutput(`\n--- Cost: $${usd} ---\n`);
        break;
      }
      case "task_started":
        appendOutput(`\n[Subagent] ${event.description as string}\n`);
        setStatus("Subagent started");
        break;
      case "task_progress":
        setStatus(`Subagent: ${(event.message as string).slice(0, 60)}`);
        break;
      case "progress":
        setStatus(event.message as string);
        break;
      case "committed":
        setStatus("Committed");
        break;
      case "ready_to_merge":
        setStatus("Ready to merge");
        setResult((prev) => ({
          ...(prev ?? { hasChanges: true }),
          readyToMerge: { branch: event.branch as string, filesChanged: event.filesChanged as number },
        }));
        break;
      case "merge_conflict":
        setStatus("Merge conflict");
        setResult((prev) => ({ ...prev, hasChanges: true, conflictBranch: event.branch as string }));
        break;
      case "complete": {
        const r: RunResult = {
          hasChanges: event.hasChanges as boolean,
          mode: event.mode as RunMode | undefined,
          runId: event.runId as string | undefined,
          worktreeBranch: event.branch as string | undefined,
          ...(resultRef.current ?? {}),
        };
        setResult(r);
        setPhase("done");
        if (mode === "plan") {
          setPlanPhase(3);
          setStatus("Plan ready");
        } else {
          setStatus(r.hasChanges ? "Ready to merge" : "Done");
        }
        if (r.mode === "plan" || !r.hasChanges) {
          toast("Run complete", { variant: "success", title: "No changes made" });
        }
        break;
      }
      case "error": {
        const errMsg = event.error as string;
        setError(errMsg);
        setPhase("done");
        toast("Run failed", { variant: "error", title: errMsg });
        break;
      }
      case "notify": {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(event.title as string, { body: event.body as string });
        } else if ("Notification" in window && Notification.permission !== "denied") {
          Notification.requestPermission().then((perm) => {
            if (perm === "granted") {
              new Notification(event.title as string, { body: event.body as string });
            }
          });
        }
        break;
      }
    }
  }, [appendOutput, mode, planPhase]);

  async function handleMerge() {
    const rid = result?.runId;
    if (!rid || merging) return;
    setMerging(true);
    try {
      const res = await fetchApi(`/api/run/runs/${rid}/merge`, { method: "POST" });
      if (res.ok) {
        setResult((prev) => prev ? { ...prev, merged: true, readyToMerge: undefined } : prev);
        setStatus("Merged");
        toast("Merged to main", { variant: "success", title: result?.readyToMerge?.branch ?? "" });
      } else {
        const data = await res.json() as { error?: string };
        toast("Merge failed", { variant: "error", title: data.error ?? "Conflict — resolve manually" });
      }
    } catch {
      toast("Merge failed", { variant: "error" });
    } finally {
      setMerging(false);
    }
  }

  async function handleViewDiff() {
    const rid = result?.runId;
    if (!rid) return;
    setDiffLoading(true);
    setShowDiff(true);
    try {
      const res = await fetchApi(`/api/run/runs/${rid}/diff`);
      const data = await res.json() as { diff: string };
      setDiff(data.diff ?? "");
    } catch {
      setDiff("");
    } finally {
      setDiffLoading(false);
    }
  }

  async function handleCancel() {
    try {
      await fetchApi("/api/run", { method: "DELETE" });
    } catch {}
    setPhase("done");
    setStatus("Cancelled");
  }

  function handleReset() {
    setTask("");
    setAgentId("");
    setPhase("idle");
    setStatus("");
    clearOutput();
    setResult(null);
    resultRef.current = null;
    setError(null);
    setShowDiff(false);
    setDiff("");
    setPlanPhase(1);
    setToolEvents([]);
  }

  function handleExecutePlan() {
    const summary = extractPlanSummary(fullOutputRef.current);
    const prefix = "Execute this plan:\n\n";
    setTask(prefix + summary);
    setMode("build");
    setPhase("idle");
    setStatus("");
    setResult(null);
    resultRef.current = null;
    setError(null);
    setShowDiff(false);
    setDiff("");
    setPlanPhase(1);
    setTimeout(resizeTextarea, 0);
  }

  function handleRunAgain() {
    const currentTask = task;
    handleReset();
    setTimeout(() => {
      setTask(currentTask);
      setTimeout(resizeTextarea, 0);
    }, 0);
  }

  function handleCopyOutput() {
    navigator.clipboard.writeText(fullOutputRef.current).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast("Output copied to clipboard", { variant: "info" });
    }).catch(() => {});
  }

  function handleShare() {
    navigator.clipboard.writeText(task).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast("Task copied to clipboard", { variant: "info" });
    }).catch(() => {});
  }

  const selectedAgent = agents.find((a) => a.id === agentId);
  const busy = phase === "running";
  const isCapped = totalLines > MAX_DISPLAY_LINES;

  return (
    <PageShell maxWidth={showDiff ? "full" : 900}>
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text)", marginBottom: 4 }}>
            RUN
          </h1>
          <div style={{ fontSize: 11, color: "var(--text-dimmer)" }}>
            Run one agent on one task in a git worktree, auto-merge on completion
          </div>
        </div>
        {phase !== "idle" && (
          <button className="btn btn-sm" onClick={handleReset}>
            {phase === "done" ? "run another" : "clear"}
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>

          {phase === "idle" && (
            <RunInputForm
              task={task}
              setTask={setTask}
              agentId={agentId}
              setAgentId={setAgentId}
              agents={agents}
              mode={mode}
              setMode={setMode}
              onRun={() => void handleRun()}
            />
          )}

          {/* Run header (during/after run) */}
          {phase !== "idle" && (
            <div style={{
              padding: "12px 14px",
              background: "var(--bg-2)",
              border: "1px solid var(--border-dim)",
              borderRadius: "var(--radius)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {busy && (
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: "var(--accent)",
                    flexShrink: 0,
                    animation: "run-pulse 1s ease-in-out infinite",
                  }} />
                )}
                {!busy && phase === "done" && !error && (
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: result?.conflictBranch ? "var(--yellow)" : "var(--accent)",
                    flexShrink: 0,
                  }} />
                )}
                {error && (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--red)", flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 12, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {task}
                </span>
                {selectedAgent && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: deptColor(agentId),
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: 9,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--accent)",
                      border: "1px solid var(--accent)",
                      padding: "1px 5px",
                      borderRadius: "var(--radius)",
                      opacity: 0.8,
                    }}>
                      {selectedAgent.name}
                    </span>
                  </span>
                )}
                <span style={{
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: mode === "plan" ? "var(--cyan)" : "var(--accent)",
                  border: `1px solid ${mode === "plan" ? "var(--cyan)" : "var(--accent)"}`,
                  padding: "1px 5px",
                  borderRadius: "var(--radius)",
                  flexShrink: 0,
                }}>
                  {mode}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: busy ? "var(--accent)" : "var(--text-dimmer)", letterSpacing: "0.05em", flex: 1 }}>
                  {status}
                </span>
                {busy && (
                  <>
                    <span style={{ fontSize: 10, color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
                      {formatElapsed(elapsed)}
                    </span>
                    <button
                      className="btn btn-sm"
                      onClick={handleCancel}
                      style={{ color: "var(--red)", borderColor: "var(--red)" }}
                    >
                      cancel
                    </button>
                  </>
                )}
                {result?.worktreeBranch && (
                  <span style={{ fontSize: 9, color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
                    {result.worktreeBranch}
                  </span>
                )}
              </div>
            </div>
          )}

          {mode === "plan" && phase !== "idle" && (
            <PlanPhaseBar
              phase={planPhase}
              running={phase === "running"}
              onExecute={planPhase === 3 && phase === "done" ? handleExecutePlan : undefined}
            />
          )}

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

          {/* Activity feed + Output split */}
          {(phase === "running" || (phase === "done" && displayOutput)) && (
            <div style={{ display: "flex", gap: 12 }}>

            {toolEvents.length > 0 && (
              <div style={{ flex: "0 0 40%", minWidth: 0 }}>
                <ActivityFeed
                  events={toolEvents}
                  totalElapsed={elapsed}
                  maxHeight={420}
                />
              </div>
            )}

            <div style={{
              flex: 1, minWidth: 0,
              background: "var(--bg-2)",
              border: "1px solid var(--border-dim)",
              borderRadius: "var(--radius)",
              overflow: "hidden",
            }}>
              <div style={{
                padding: "6px 12px",
                borderBottom: "1px solid var(--border-dim)",
                background: "var(--bg-3)",
                fontSize: 9,
                color: "var(--text-dimmer)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <span>OUTPUT</span>
                {displayOutput && (
                  <button
                    onClick={handleCopyOutput}
                    style={{
                      background: "none",
                      border: "none",
                      color: copied ? "var(--accent)" : "var(--text-dimmer)",
                      fontSize: 9,
                      fontFamily: "var(--font)",
                      cursor: "pointer",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      padding: "0 2px",
                    }}
                  >
                    {copied ? "COPIED" : "COPY"}
                  </button>
                )}
              </div>
              <div
                ref={outputRef}
                style={{
                  padding: "10px 12px",
                  fontFamily: "var(--font)",
                  fontSize: 11,
                  lineHeight: 1.6,
                  color: "var(--text-dim)",
                  maxHeight: 420,
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {isCapped && (
                  <div style={{
                    fontSize: 10,
                    color: "var(--text-dimmer)",
                    borderBottom: "1px solid var(--border-dim)",
                    paddingBottom: 6,
                    marginBottom: 6,
                  }}>
                    Showing last {MAX_DISPLAY_LINES} lines ({totalLines} total)
                  </div>
                )}
                {displayOutput || <span style={{ color: "var(--text-dimmer)" }}>Waiting for output...</span>}
                {phase === "running" && (
                  <span style={{
                    display: "inline-block",
                    width: 5, height: 11,
                    background: "var(--accent)",
                    verticalAlign: "text-bottom",
                    marginLeft: 2,
                    animation: "cursor-blink 1s step-end infinite",
                  }} />
                )}
              </div>
            </div>
            </div>
          )}

          {phase === "done" && result && (
            <RunDoneBanner
              result={result}
              error={error}
              copied={copied}
              merging={merging}
              diffLoading={diffLoading}
              onExecutePlan={handleExecutePlan}
              onMerge={() => void handleMerge()}
              onViewDiff={() => void handleViewDiff()}
              onRunAgain={handleRunAgain}
              onShare={handleShare}
              onReset={handleReset}
            />
          )}
        </div>

        {showDiff && (
          <div style={{
            width: "clamp(320px, 40vw, 680px)",
            flexShrink: 0,
            height: "auto",
            minHeight: 300,
            border: "1px solid var(--border-dim)",
            borderRadius: "var(--radius)",
            overflow: "hidden",
          }}>
            <DiffPanel
              diff={diff}
              filename={result?.worktreeBranch ?? "diff"}
              onClose={() => setShowDiff(false)}
              fullWidth
            />
          </div>
        )}
      </div>

    </div>
    </PageShell>
  );
}
