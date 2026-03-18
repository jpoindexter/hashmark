import { useState, useRef, useEffect } from "react";

interface AgentDef {
  id: string;
  name: string;
  description: string;
}

type RunPhase = "idle" | "running" | "done";

interface RunResult {
  hasChanges: boolean;
  conflictBranch?: string;
}

export default function Run() {
  const [task, setTask] = useState("");
  const [agentId, setAgentId] = useState<string>("");
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [status, setStatus] = useState("");
  const [output, setOutput] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/company/agents")
      .then((r) => r.json())
      .then((d: { agents: AgentDef[] }) => setAgents(d.agents ?? []))
      .catch(() => {});
  }, []);

  // Auto-scroll output while running
  useEffect(() => {
    if (phase === "running" && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, phase]);

  async function handleRun() {
    if (!task.trim() || phase === "running") return;
    setPhase("running");
    setStatus("Running...");
    setOutput("");
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, agentId: agentId || undefined }),
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("idle");
    }
  }

  function handleEvent(event: Record<string, unknown>) {
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
        setResult({ hasChanges: true, conflictBranch: event.branch as string });
        break;
      case "complete":
        setStatus("Done");
        if (!result) setResult({ hasChanges: event.hasChanges as boolean });
        setPhase("done");
        break;
      case "error":
        setError(event.error as string);
        setPhase("done");
        break;
    }
  }

  function handleReset() {
    setTask("");
    setAgentId("");
    setPhase("idle");
    setStatus("");
    setOutput("");
    setResult(null);
    setError(null);
  }

  const selectedAgent = agents.find((a) => a.id === agentId);
  const busy = phase === "running";

  return (
    <div style={{ padding: "24px 28px", maxWidth: 900, display: "flex", flexDirection: "column", gap: 20 }}>
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
          <button className="btn" onClick={handleReset} style={{ fontSize: 11 }}>
            {phase === "done" ? "RUN ANOTHER" : "CLEAR"}
          </button>
        )}
      </div>

      {/* Input form — shown when idle or as reference during/after run */}
      {phase === "idle" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) void handleRun(); }}
            placeholder="Describe the task — e.g. Add input validation to the signup form..."
            rows={4}
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
              boxSizing: "border-box",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-dim)"; }}
          />

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Agent selector */}
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              style={{
                padding: "6px 10px",
                background: "var(--bg-2)",
                border: "1px solid var(--border-dim)",
                borderRadius: "var(--radius)",
                color: agentId ? "var(--text)" : "var(--text-dimmer)",
                fontFamily: "var(--font)",
                fontSize: 11,
                outline: "none",
                cursor: "pointer",
                minWidth: 160,
              }}
            >
              <option value="">No specific agent</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>

            <button
              className="btn btn-primary"
              onClick={handleRun}
              disabled={!task.trim()}
            >
              {"> RUN AGENT"}
            </button>

            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: "var(--text-dimmer)" }}>⌘↵ to run</span>
          </div>

          {/* Agent description */}
          {selectedAgent?.description && (
            <div style={{ fontSize: 11, color: "var(--text-dimmer)", paddingLeft: 2 }}>
              {selectedAgent.description}
            </div>
          )}
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
              <span style={{
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--accent)",
                border: "1px solid var(--accent)",
                padding: "1px 5px",
                borderRadius: "var(--radius)",
                opacity: 0.8,
                flexShrink: 0,
              }}>
                {selectedAgent.name}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: busy ? "var(--accent)" : "var(--text-dimmer)", letterSpacing: "0.05em" }}>
            {status}
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
          border: `1px solid ${result.conflictBranch ? "var(--yellow)" : result.hasChanges ? "var(--accent)" : "var(--border-dim)"}`,
          borderRadius: "var(--radius)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: result.conflictBranch ? "var(--yellow)" : result.hasChanges ? "var(--accent)" : "var(--border-dim)",
          }} />
          <span style={{
            fontSize: 12,
            color: result.conflictBranch ? "var(--yellow)" : result.hasChanges ? "var(--accent)" : "var(--text-dimmer)",
          }}>
            {result.conflictBranch
              ? `Merge conflict — branch ${result.conflictBranch} preserved`
              : result.hasChanges
                ? "Changes merged to main"
                : "No changes made"}
          </span>
          <span style={{ flex: 1 }} />
          <button
            className="btn btn-primary"
            onClick={handleReset}
            style={{ fontSize: 11 }}
          >
            {"> RUN ANOTHER"}
          </button>
        </div>
      )}

      <style>{`
        @keyframes run-pulse { 0%,100%{opacity:.5;transform:scale(.8)} 50%{opacity:1;transform:scale(1.3)} }
        @keyframes cursor-blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}
