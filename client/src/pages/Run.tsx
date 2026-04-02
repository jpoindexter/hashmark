import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Zap } from "lucide-react";
import { DiffPanel } from "../components/DiffPanel.tsx";
import AgentPicker from "../components/AgentPicker.tsx";
import PermissionSelector from "../components/PermissionSelector.tsx";
import PlanPhaseBar, { extractPlanSummary, detectPlanPhaseTransition } from "../components/PlanPhaseBar.tsx";
import { toast } from "../hooks/useToast.ts";
import ActivityFeed from "../components/ActivityFeed.tsx";
import { PageShell } from "../components/shared/PageShell.tsx";
import { fetchApi } from "../lib/api";
import { DEPT_COLORS } from "../lib/constants";

interface AgentDef {
  id: string;
  name: string;
  description: string;
}

type RunPhase = "idle" | "running" | "done" | "lost";

type RunMode = "plan" | "build";

interface RunResult {
  hasChanges: boolean;
  conflictBranch?: string;
  mode?: RunMode;
  runId?: string;
  worktreeBranch?: string;
  readyToMerge?: { branch: string; filesChanged: number };
  merged?: boolean;
}

function deptFromId(id: string): string {
  const seg = id.split("-")[0].toLowerCase();
  return DEPT_COLORS[seg] ? seg : "general";
}

function deptColor(id: string): string {
  return DEPT_COLORS[deptFromId(id)] ?? DEPT_COLORS.general;
}

// ─── Recent tasks (localStorage) ─────────────────────────────────────────────

const RECENT_KEY = "studio:run:recent-tasks";
const MAX_RECENT = 10;

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch { return []; }
}

function saveRecent(task: string) {
  const prev = loadRecent().filter((t) => t !== task);
  const next = [task, ...prev].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

// ─── Token estimate ───────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.max(0, Math.round(text.length / 4));
}

// ─── Elapsed timer ────────────────────────────────────────────────────────────

function useElapsed(active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      startRef.current = Date.now();
      setElapsed(0);
      const id = setInterval(() => {
        setElapsed(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000));
      }, 1000);
      return () => clearInterval(id);
    } else {
      startRef.current = null;
    }
  }, [active]);

  return elapsed;
}

function formatElapsed(s: number): string {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ─── Agent grouping ───────────────────────────────────────────────────────────

function groupAgents(agents: AgentDef[]): Map<string, AgentDef[]> {
  const map = new Map<string, AgentDef[]>();
  for (const a of agents) {
    const dept = deptFromId(a.id);
    const label = dept.charAt(0).toUpperCase() + dept.slice(1);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(a);
  }
  return map;
}

// ─── Component ────────────────────────────────────────────────────────────────

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
  const [showRecent, setShowRecent]   = useState(false);
  const [recentTasks, setRecentTasks] = useState<string[]>([]);
  const [copied, setCopied]     = useState(false);
  const [merging, setMerging]   = useState(false);

  const outputRef     = useRef<HTMLDivElement>(null);
  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const recentRef     = useRef<HTMLDivElement>(null);
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
    setRecentTasks(loadRecent());
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

  useEffect(() => {
    if (!showRecent) return;
    function onDown(e: MouseEvent) {
      if (recentRef.current && !recentRef.current.contains(e.target as Node)) {
        setShowRecent(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showRecent]);

  async function handleRun() {
    if (!task.trim() || phase === "running") return;
    saveRecent(task.trim());
    setRecentTasks(loadRecent());
    setPhase("running");
    setStatus("Running...");
    clearOutput();
    setResult(null);
    resultRef.current = null;
    setError(null);
    setShowDiff(false);
    setDiff("");
    setPlanPhase(1);

    // Request notification permission on first run start (not on page load)
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
        const elapsed = event.elapsed as number;
        setStatus(`${tp}... ${Math.round(elapsed)}s`);
        setToolEvents(prev => prev.map(te =>
          te.status === "running" && te.tool === tp ? { ...te, elapsed } : te
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
  const tokenEst = estimateTokens(task);
  const grouped = groupAgents(agents);
  const isCapped = totalLines > MAX_DISPLAY_LINES;

  return (
    <PageShell maxWidth={showDiff ? "full" : 900}>
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
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

      {/* Main layout: form + diff side by side when diff is open */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Input form — shown when idle */}
          {phase === "idle" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

              {/* Textarea with recent dropdown */}
              <div style={{ position: "relative" }} ref={recentRef}>
                <textarea
                  ref={textareaRef}
                  value={task}
                  onChange={(e) => { setTask(e.target.value); resizeTextarea(); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) void handleRun(); }}
                  onFocus={() => {
                    if (recentTasks.length > 0) setShowRecent(true);
                    if (textareaRef.current) textareaRef.current.style.borderColor = "var(--accent)";
                  }}
                  onBlur={(e) => {
                    if (textareaRef.current) textareaRef.current.style.borderColor = "var(--border-dim)";
                    setTimeout(() => {
                      if (!recentRef.current?.contains(document.activeElement)) setShowRecent(false);
                    }, 150);
                    void e;
                  }}
                  placeholder="Describe the task — e.g. Add input validation to the signup form..."
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
                    resize: "none",
                    outline: "none",
                    display: "block",
                    boxSizing: "border-box",
                    overflow: "hidden",
                  }}
                />

                {/* Recent tasks dropdown */}
                {showRecent && recentTasks.length > 0 && (
                  <div style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    right: 0,
                    background: "var(--bg-3)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    zIndex: 50,
                    overflow: "hidden",
                    boxShadow: "var(--shadow-md)",
                  }}>
                    <div style={{
                      padding: "4px 10px",
                      fontSize: 9,
                      color: "var(--text-dimmer)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      borderBottom: "1px solid var(--border-dim)",
                    }}>
                      Recent tasks
                    </div>
                    {recentTasks.map((t, i) => (
                      <button
                        key={i}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setTask(t);
                          setShowRecent(false);
                          setTimeout(resizeTextarea, 0);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "7px 10px",
                          background: "none",
                          border: "none",
                          borderBottom: i < recentTasks.length - 1 ? "1px solid var(--border-dim)" : "none",
                          color: "var(--text-dim)",
                          fontFamily: "var(--font)",
                          fontSize: 11,
                          cursor: "pointer",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-4)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Token estimate + shortcut hint */}
              <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 2 }}>
                <span style={{ fontSize: 10, color: "var(--text-dimmer)" }}>
                  {task.length > 0 ? `~${tokenEst} tokens` : ""}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-dimmer)" }}>Cmd+Enter to run</span>
              </div>

              {/* Controls row */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {/* Agent selector */}
                <AgentPicker
                  agents={agents}
                  selectedId={agentId}
                  onSelect={setAgentId}
                  grouped={grouped}
                  deptColor={deptColor}
                />

                <button
                  className="btn btn-primary"
                  onClick={handleRun}
                  disabled={!task.trim()}
                >
                  {"run agent"}
                </button>
              </div>

              {/* Agent description */}
              {selectedAgent?.description && (
                <div style={{ fontSize: 11, color: "var(--text-dimmer)", paddingLeft: 2 }}>
                  {selectedAgent.description}
                </div>
              )}

              {/* Mode cards */}
              <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
                {([
                  { value: "plan" as RunMode, icon: <Search size={14} />, label: "Explore", sub: "Read-only analysis, no file changes" },
                  { value: "build" as RunMode, icon: <Zap size={14} />, label: "Execute", sub: "Write files, commit changes" },
                ] as const).map(({ value, icon, label, sub }) => (
                  <button
                    key={value}
                    onClick={() => setMode(value)}
                    style={{
                      flex: 1,
                      padding: "12px 14px",
                      background: mode === value ? "rgba(63,185,80,0.07)" : "var(--bg-2)",
                      border: `1.5px solid ${mode === value ? "var(--accent)" : "var(--border-dim)"}`,
                      borderRadius: "var(--radius)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "border-color 0.12s, background 0.12s",
                    }}
                  >
                    <div style={{ fontSize: 13, marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: mode === value ? "var(--accent)" : "var(--text-dimmer)", display: "flex", alignItems: "center" }}>{icon}</span>
                      <span style={{
                        fontFamily: "var(--font-ui)",
                        fontWeight: 600,
                        color: mode === value ? "var(--accent)" : "var(--text)",
                        fontSize: 12,
                        letterSpacing: "0.01em",
                      }}>
                        {label}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 10,
                      color: "var(--text-dimmer)",
                      fontFamily: "var(--font-ui)",
                      lineHeight: 1.4,
                    }}>
                      {sub}
                    </div>
                  </button>
                ))}
              </div>

              <PermissionSelector />
            </div>
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

              {/* Status + elapsed + cancel */}
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

          {/* Plan phase indicator */}
          {mode === "plan" && phase !== "idle" && (
            <PlanPhaseBar
              phase={planPhase}
              running={phase === "running"}
              onExecute={planPhase === 3 && phase === "done" ? handleExecutePlan : undefined}
            />
          )}

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

          {/* Activity feed + Output split */}
          {(phase === "running" || (phase === "done" && displayOutput)) && (
            <div style={{ display: "flex", gap: 12 }}>

            {/* Activity feed (left) */}
            {toolEvents.length > 0 && (
              <div style={{ flex: "0 0 40%", minWidth: 0 }}>
                <ActivityFeed
                  events={toolEvents}
                  totalElapsed={elapsed}
                  maxHeight={420}
                />
              </div>
            )}

            {/* Output (right) */}
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

          {/* Done banner */}
          {phase === "done" && result && !error && (
            <div style={{
              padding: "14px 16px",
              background: "var(--bg-2)",
              border: `1px solid ${
                result.mode === "plan"
                  ? "var(--cyan)"
                  : result.conflictBranch
                    ? "var(--yellow)"
                    : result.readyToMerge && !result.merged
                      ? "var(--yellow)"
                      : result.merged || result.hasChanges
                        ? "var(--accent)"
                        : "var(--border-dim)"
              }`,
              borderRadius: "var(--radius)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: result.mode === "plan"
                    ? "var(--cyan)"
                    : result.conflictBranch
                      ? "var(--yellow)"
                      : result.hasChanges
                        ? "var(--accent)"
                        : "var(--border-dim)",
                }} />
                <span style={{
                  fontSize: 12,
                  color: result.mode === "plan"
                    ? "var(--cyan)"
                    : result.conflictBranch
                      ? "var(--yellow)"
                      : result.hasChanges
                        ? "var(--accent)"
                        : "var(--text-dimmer)",
                  flex: 1,
                }}>
                  {result.mode === "plan"
                    ? "Plan complete — review output above"
                    : result.conflictBranch
                      ? `Merge conflict — branch ${result.conflictBranch} preserved`
                      : result.merged
                        ? "Merged to main"
                        : result.readyToMerge
                          ? `Ready to merge — ${result.readyToMerge.filesChanged} file${result.readyToMerge.filesChanged !== 1 ? "s" : ""} changed`
                          : result.hasChanges
                            ? `Changes on ${result.readyToMerge ? result.readyToMerge.branch : "branch"}`
                            : "No changes made"}
                </span>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {result.mode === "plan" && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleExecutePlan}
                    style={{ display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <Zap size={12} />
                    execute this plan
                  </button>
                )}
                {result.readyToMerge && !result.merged && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleMerge}
                    disabled={merging}
                    style={{ borderColor: "var(--yellow)", color: "var(--yellow)" }}
                  >
                    {merging ? "merging..." : `review & merge (${result.readyToMerge.filesChanged} file${result.readyToMerge.filesChanged !== 1 ? "s" : ""})`}
                  </button>
                )}
                {result.hasChanges && result.mode !== "plan" && (
                  <button
                    className="btn btn-sm"
                    onClick={handleViewDiff}
                    disabled={diffLoading}
                  >
                    {diffLoading ? "loading..." : "view diff"}
                  </button>
                )}
                <button
                  className="btn btn-sm"
                  onClick={handleRunAgain}
                >
                  {"run again"}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={handleShare}
                  style={{ color: copied ? "var(--accent)" : undefined, borderColor: copied ? "var(--accent)" : undefined }}
                >
                  {copied ? "copied!" : "share"}
                </button>
                <span style={{ flex: 1 }} />
                <button
                  className="btn btn-sm"
                  onClick={handleReset}
                >
                  {"new run"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Diff panel */}
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
