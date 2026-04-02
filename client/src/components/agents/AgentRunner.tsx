import { useState, useEffect, useRef, useMemo, useReducer } from "react";
import { fetchApi } from "../../lib/api";
import { MODELS } from "../../lib/models";
import type { Agent, RunStatus, RunAction } from "./types";
import { runStatusReducer } from "./types";
import { useSegments, RunMetaStrip, StructuredOutput } from "./RunOutput";

interface AgentRunnerProps {
  agent: Agent;
}

export default function AgentRunner({ agent }: AgentRunnerProps) {
  const [runPrompt, setRunPrompt] = useState("");
  const [runModel, setRunModel] = useState("claude-sonnet-4-6");
  const [output, setOutput] = useState("");
  const [runStatus, dispatchRunStatus] = useReducer(runStatusReducer, "idle" as RunStatus);
  const runStatusRef = useRef(runStatus);
  runStatusRef.current = runStatus;
  const running = runStatus === "starting" || runStatus === "running";
  const [runMeta, setRunMeta] = useState<{ startedAt: number; durationMs?: number; wordCount?: number } | null>(null);
  const [loopDetected, setLoopDetected] = useState<{ count: number; pattern: string } | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const loopCountRef = useRef(0);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{ tools: string[] } | null>(null);
  const pendingApprovalResolveRef = useRef<((approved: boolean) => void) | null>(null);

  const govTools = useMemo(() => {
    const content = agent.content;
    if (!content) return [];
    const toolNames = ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebSearch", "WebFetch", "Agent", "MCP"];
    return toolNames.filter((t) => new RegExp(`\\b${t}\\b`).test(content));
  }, [agent.content]);

  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelOpen]);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  const currentModel = MODELS.find((m) => m.id === runModel) ?? MODELS[1];
  const segments = useSegments(output);

  const failureClass = useMemo(() => {
    if (runStatus === "running" || runStatus === "idle") return null;
    if (runStatus === "done") {
      const words = output.trim().split(/\s+/).filter(Boolean).length;
      if (words > 0 && words < 15) return { label: "MINIMAL OUTPUT", color: "var(--yellow)", detail: `Only ${words} words` };
      return null;
    }
    if (!output.trim()) return { label: "NO OUTPUT", color: "var(--red)", detail: "Agent produced nothing" };
    const words = output.trim().split(/\s+/).filter(Boolean).length;
    const hedges = (output.match(/\b(I would|I could|I should|I might|we would|we could)\b/gi) ?? []).length;
    if (hedges > 3 && words > 0 && hedges / words > 0.03) return { label: "PLANNING MODE", color: "var(--yellow)", detail: "Agent planned instead of executing" };
    if (runStatus === "error") {
      if (/\b(cannot|can't|unable to|don't have access|not able to)\b/i.test(output)) return { label: "AGENT BLOCKED", color: "var(--red)", detail: "Capability limitation reported" };
      return { label: "RUN ERROR", color: "var(--red)", detail: "Run ended with error" };
    }
    if (runStatus === "stopped") {
      if (words < 30) return { label: "PREMATURE STOP", color: "var(--yellow)", detail: "Stopped before meaningful output" };
      return { label: "STOPPED", color: "var(--yellow)", detail: `Stopped at ${words} words` };
    }
    if (runStatus === "interrupted") return { label: "LOOP DETECTED", color: "var(--yellow)", detail: loopDetected ? `Pattern repeated ×${loopDetected.count}` : "Auto-stopped on loop" };
    if (runStatus === "starting") return null;
    return null;
  }, [runStatus, output, loopDetected]);

  async function runAgent() {
    if (!runPrompt.trim() || running) return;
    if (approvalRequired && govTools.length > 0) {
      const approved = await new Promise<boolean>((resolve) => {
        pendingApprovalResolveRef.current = resolve;
        setPendingApproval({ tools: govTools });
      });
      setPendingApproval(null);
      pendingApprovalResolveRef.current = null;
      if (!approved) return;
    }
    dispatchRunStatus({ type: "START" });
    setOutput("");
    setLoopDetected(null);
    loopCountRef.current = 0;
    const startedAt = Date.now();
    setRunMeta({ startedAt });
    try {
      const sessRes = await fetchApi("/api/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const sessData = await sessRes.json() as { session: { id: string } };
      const sid = sessData.session.id;
      const chatRes = await fetchApi(`/api/sessions/${sid}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: runPrompt.trim(), model: runModel, systemPrompt: agent.content }),
      });
      if (!chatRes.ok || !chatRes.body) {
        setOutput("Error: failed to start agent run.");
        dispatchRunStatus({ type: "ERROR" });
        setRunMeta(prev => prev ? { ...prev, durationMs: Date.now() - startedAt } : null);
        return;
      }
      const reader = chatRes.body.getReader();
      const dec = new TextDecoder();
      let buf = "", assembled = "", userStopped = false, loopInterrupted = false;
      abortRef.current = () => { userStopped = true; reader.cancel().catch(() => {}); };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const sseLines = buf.split("\n");
          buf = sseLines.pop() ?? "";
          for (const line of sseLines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const evt = JSON.parse(raw) as { type: string; text?: string; success?: boolean };
              if (evt.type === "text" && evt.text) {
                if (runStatusRef.current === "starting") dispatchRunStatus({ type: "FIRST_CHUNK" });
                assembled += evt.text;
                setOutput(assembled);
                if (assembled.length > 600) {
                  const tail = assembled.slice(-250);
                  const earlier = assembled.slice(0, assembled.length - 250);
                  if (earlier.includes(tail)) {
                    loopCountRef.current += 1;
                    if (loopCountRef.current === 1) setLoopDetected({ count: 1, pattern: tail.slice(0, 60).trim() });
                    else if (loopCountRef.current >= 3) {
                      loopInterrupted = true;
                      reader.cancel().catch(() => {});
                      setLoopDetected({ count: loopCountRef.current, pattern: tail.slice(0, 60).trim() });
                    }
                  }
                }
              } else if (evt.type === "done") {
                const action: RunAction = loopInterrupted ? { type: "INTERRUPT" } : userStopped ? { type: "STOP" } : evt.success ? { type: "DONE" } : { type: "ERROR" };
                dispatchRunStatus(action);
                setRunMeta({ startedAt, durationMs: Date.now() - startedAt, wordCount: assembled.trim().split(/\s+/).length });
              }
            } catch {}
          }
        }
      } finally {
        abortRef.current = null;
        if (loopInterrupted) dispatchRunStatus({ type: "INTERRUPT" });
        else if (userStopped) dispatchRunStatus({ type: "STOP" });
        else dispatchRunStatus({ type: "DONE" });
        setRunMeta(prev => prev ? { ...prev, durationMs: Date.now() - startedAt, wordCount: assembled.trim().split(/\s+/).length } : null);
      }
    } catch {
      setOutput("Error: agent run failed.");
      dispatchRunStatus({ type: "ERROR" });
      setRunMeta(prev => prev ? { ...prev, durationMs: Date.now() - startedAt } : null);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <RunControls
        runPrompt={runPrompt} onPromptChange={setRunPrompt} running={running}
        currentModel={currentModel} modelOpen={modelOpen} modelRef={modelRef}
        onToggleModel={() => setModelOpen((v) => !v)} runModel={runModel}
        onSelectModel={(id) => { setRunModel(id); setModelOpen(false); }}
        approvalRequired={approvalRequired} onToggleApproval={() => setApprovalRequired((v) => !v)}
        onRun={() => void runAgent()} onStop={() => abortRef.current?.()}
      />
      <div ref={outputRef} style={{ flex: 1, overflow: "auto", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
        <RunMetaStrip runMeta={runMeta} runStatus={runStatus} currentModel={currentModel} running={running} loopDetected={loopDetected} failureClass={failureClass} />
        {pendingApproval && (
          <ApprovalGate tools={pendingApproval.tools}
            onAllow={() => pendingApprovalResolveRef.current?.(true)}
            onDeny={() => pendingApprovalResolveRef.current?.(false)} />
        )}
        <StructuredOutput segments={segments} running={running} output={output} runStatus={runStatus} />
      </div>
    </div>
  );
}

function RunControls({ runPrompt, onPromptChange, running, currentModel, modelOpen, modelRef, onToggleModel, runModel, onSelectModel, approvalRequired, onToggleApproval, onRun, onStop }: {
  runPrompt: string; onPromptChange: (v: string) => void; running: boolean;
  currentModel: { id: string; label: string; note?: string }; modelOpen: boolean;
  modelRef: React.RefObject<HTMLDivElement | null>; onToggleModel: () => void;
  runModel: string; onSelectModel: (id: string) => void;
  approvalRequired: boolean; onToggleApproval: () => void;
  onRun: () => void; onStop: () => void;
}) {
  return (
    <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-dim)", display: "flex", flexDirection: "column", gap: "10px" }}>
      <textarea value={runPrompt} onChange={(e) => onPromptChange(e.target.value)}
        placeholder="Enter a prompt for this agent..." disabled={running} rows={3}
        style={{ resize: "none", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 10px", fontSize: "12px", lineHeight: "1.5", color: "var(--text)", fontFamily: "var(--font)", outline: "none" }} />
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <div ref={modelRef} style={{ position: "relative" }}>
          <button onClick={onToggleModel} disabled={running} style={{
            background: "none", border: "1px solid var(--border-dim)", color: "var(--text-dimmer)",
            fontFamily: "var(--font)", fontSize: "10px", padding: "4px 10px",
            cursor: running ? "not-allowed" : "pointer", letterSpacing: "0.04em", transition: "all 0.1s", opacity: running ? 0.5 : 1,
          }}>
            ▾ {currentModel.label}
          </button>
          {modelOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200, background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", minWidth: "160px", overflow: "hidden" }}>
              {MODELS.map((m) => (
                <button key={m.id} onClick={() => onSelectModel(m.id)} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "6px 10px", background: "none", border: "none",
                  borderLeft: m.id === runModel ? "2px solid var(--accent)" : "2px solid transparent",
                  color: m.id === runModel ? "var(--accent)" : "var(--text-dim)", fontFamily: "var(--font)", fontSize: "11px", cursor: "pointer", textAlign: "left", transition: "background 0.1s",
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-4)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
                  <span>{m.label}</span>
                  <span style={{ color: "var(--text-dimmer)", fontSize: "10px" }}>{m.note}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={onToggleApproval} disabled={running}
          title={approvalRequired ? "Tool approval required — click to disable" : "Click to require tool approval before run"}
          style={{
            background: approvalRequired ? "rgba(210,153,34,0.12)" : "none",
            border: `1px solid ${approvalRequired ? "rgba(210,153,34,0.4)" : "var(--border-dim)"}`,
            color: approvalRequired ? "var(--yellow)" : "var(--text-dimmer)", fontFamily: "var(--font)", fontSize: "9px", padding: "4px 8px",
            cursor: running ? "not-allowed" : "pointer", letterSpacing: "0.06em", textTransform: "uppercase", transition: "all 0.1s", opacity: running ? 0.5 : 1,
          }}>
          {approvalRequired ? "⚠ GATE ON" : "GATE"}
        </button>
        <div style={{ flex: 1 }} />
        {running ? (
          <button onClick={onStop} style={{
            background: "none", border: "1px solid var(--red)", color: "var(--red)", fontFamily: "var(--font)", fontSize: "10px", padding: "4px 14px",
            cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase", transition: "all 0.1s",
          }}>■ STOP</button>
        ) : (
          <button className="btn btn-primary" onClick={onRun} disabled={!runPrompt.trim()} style={{ fontSize: "10px", padding: "4px 14px" }}>Run</button>
        )}
      </div>
    </div>
  );
}

function ApprovalGate({ tools, onAllow, onDeny }: { tools: string[]; onAllow: () => void; onDeny: () => void }) {
  return (
    <div style={{ padding: "20px", borderBottom: "1px solid var(--border-dim)", background: "rgba(210,153,34,0.05)", flexShrink: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--yellow)", fontFamily: "var(--font)", marginBottom: 8, letterSpacing: "0.06em" }}>
        ⚠ TOOL APPROVAL REQUIRED
      </div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 10 }}>This agent may invoke the following tools:</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
        {tools.map((t) => (
          <span key={t} style={{ padding: "2px 8px", background: "rgba(56,139,253,0.1)", border: "1px solid rgba(56,139,253,0.25)", borderRadius: 2, fontSize: 10, fontFamily: "var(--font)", color: "var(--blue)", letterSpacing: "0.04em" }}>{t}</span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={onAllow}>Allow</button>
        <button className="btn btn-sm" onClick={onDeny} style={{ color: "var(--red)", borderColor: "var(--red)" }}>Deny</button>
      </div>
    </div>
  );
}
