import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Zap } from "lucide-react";
import { DiffPanel } from "../components/DiffPanel.tsx";
import AgentPicker from "../components/AgentPicker.tsx";
import { toast } from "../hooks/useToast.ts";
import { PageShell } from "../components/shared/PageShell.tsx";
import { fetchApi } from "../lib/api";

interface AgentDef {
  id: string;
  name: string;
  description: string;
}

type RunPhase = "idle" | "running" | "done";

type RunMode = "plan" | "build";

interface RunResult {
  hasChanges: boolean;
  conflictBranch?: string;
  mode?: RunMode;
  runId?: string;
  worktreeBranch?: string;
}

// Department-specific colors (no Grove token equivalent)
const DEPT_COLORS: Record<string, string> = {
  engineering: "var(--blue)",
  product:     "#8b5cf6",
  design:      "#ec4899",
  marketing:   "var(--yellow)",
  sales:       "var(--accent)",
  operations:  "#6366f1",
  pr:          "var(--cyan)",
  general:     "var(--text-dim)",
};

function deptFromId(id: string): string {
  // id format: "department-agentname" or "agentname"
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
  // rough: ~4 chars per token
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

export default function Run() {
  const [task, setTask]         = useState("");
  const [agentId, setAgentId]   = useState<string>("");
  const [agents, setAgents]     = useState<AgentDef[]>([]);
  const [phase, setPhase]       = useState<RunPhase>("idle");
  const [mode, setMode]         = useState<RunMode>("build");
  const [status, setStatus]     = useState("");
  const [output, setOutput]     = useState("");
  const [result, setResult]     = useState<RunResult | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [diff, setDiff]         = useState<string>("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [showRecent, setShowRecent]   = useState(false);
  const [recentTasks, setRecentTasks] = useState<string[]>([]);
  const [copied, setCopied]     = useState(false);

  const outputRef     = useRef<HTMLDivElement>(null);
  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const recentRef     = useRef<HTMLDivElement>(null);
  const resultRef     = useRef<RunResult | null>(null);

  const elapsed = useElapsed(phase === "running");

  // Keep resultRef in sync (avoids stale closure in handleEvent)
  useEffect(() => { resultRef.current = result; }, [result]);

  useEffect(() => {
    fetchApi("/api/company/agents")
      .then((r) => r.json())
      .then((d: { agents: AgentDef[] }) => setAgents(d.agents ?? []))
      .catch(() => {
        window.dispatchEvent(new CustomEvent("studio:toast", { detail: { message: "Failed to load agents", type: "error" } }));
      });
    setRecentTasks(loadRecent());
  }, []);

  // Auto-scroll output while running
  useEffect(() => {
    if (phase === "running" && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, phase]);

  // Auto-resize textarea
  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  // Close recent dropdown on outside click
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
    setOutput("");
    setResult(null);
    resultRef.current = null;
    setError(null);
    setShowDiff(false);
    setDiff("");

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

      // Process any remaining data left in the buffer
      if (buffer.trim().startsWith("data: ")) {
        try {
          const event = JSON.parse(buffer.trim().slice(6)) as Record<string, unknown>;
          handleEvent(event);
        } catch {}
      }

      // If stream ended without a complete/error event, transition out of running
      if (!resultRef.current) {
        setPhase("done");
        setStatus("Stream ended");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("idle");
    }
  }

  const handleEvent = useCallback((event: Record<string, unknown>) => {
    switch (event.type) {
      case "start":
        setStatus("Running...");
        break;
      case "chunk":
        setOutput((prev) => prev + (event.text as string));
        break;
      case "committed":
        setStatus("Committing...");
        break;
      case "merged":
        setStatus("Merging...");
        break;
      case "merge_conflict":
        setStatus("Merge conflict");
        setResult((prev) => ({ ...prev, hasChanges: true, conflictBranch: event.branch as string }));
        break;
      case "complete": {
        setStatus("Done");
        const r: RunResult = {
          hasChanges: event.hasChanges as boolean,
          mode: event.mode as RunMode | undefined,
          runId: event.runId as string | undefined,
          worktreeBranch: event.branch as string | undefined,
        };
        if (!resultRef.current) setResult(r);
        setPhase("done");
        toast("Run complete", {
          variant: "success",
          title: r.worktreeBranch ? `Changes committed to ${r.worktreeBranch}` : "No changes made",
        });
        break;
      }
      case "error": {
        const errMsg = event.error as string;
        setError(errMsg);
        setPhase("done");
        toast("Run failed", { variant: "error", title: errMsg });
        break;
      }
    }
  }, []);

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
    setOutput("");
    setResult(null);
    resultRef.current = null;
    setError(null);
    setShowDiff(false);
    setDiff("");
  }

  function handleRunAgain() {
    const currentTask = task;
    handleReset();
    // Restore task so user can re-run immediately
    setTimeout(() => {
      setTask(currentTask);
      setTimeout(resizeTextarea, 0);
    }, 0);
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

  return (
    <PageShell maxWidth={showDiff ? "full" : 900}>
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text)", marginBottom: 4 }}>
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
                    // delay so click on dropdown registers
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

          {/* Live output terminal */}
          {(phase === "running" || (phase === "done" && output)) && (
            <div style={{
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
              }}>
                OUTPUT
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
                {output || <span style={{ color: "var(--text-dimmer)" }}>Waiting for output...</span>}
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
                    : result.hasChanges
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
                      : result.hasChanges
                        ? "Changes merged to main"
                        : "No changes made"}
                </span>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {result.hasChanges && result.mode !== "plan" && (
                  <button
                    className="btn btn-primary btn-sm"
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
