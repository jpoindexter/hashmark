import { useState, useRef, useEffect } from "react";
import type { WorkerStatus, WorkerState, ParsedOutput, FailureClassification } from "./types";

export function parseWorkerOutput(output: string): ParsedOutput {
  const lines = output.split("\n");
  const files = new Set<string>();
  const commands = new Set<string>();
  let keySummary = "";

  const filePattern = /\b(?:Edit|Write|Create|Read|Update)\b.*?([\w./\-]+\.(?:ts|tsx|js|jsx|py|json|md|css|sh|go|rs|yaml|yml|toml))/i;
  const bashPattern = /^(?:Bash|Running|Executing|\$)\s+(.+)/i;
  const cmdPattern = /(?:npm|git|npx|pnpm|yarn|python|node)\s+\S+/;
  const boilerplate = /^(Reading|Thinking|Analyzing|Looking|Checking|Processing|Loading|Fetching)/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const fileMatch = trimmed.match(filePattern);
    if (fileMatch) files.add(fileMatch[1]);

    const bashMatch = trimmed.match(bashPattern);
    if (bashMatch) {
      commands.add(bashMatch[1].trim().slice(0, 60));
    } else {
      const cmdMatch = trimmed.match(cmdPattern);
      if (cmdMatch) commands.add(cmdMatch[0].trim().slice(0, 60));
    }

    if (!keySummary && trimmed.length > 10 && !boilerplate.test(trimmed)) {
      keySummary = trimmed.slice(0, 80);
    }
  }

  return {
    files: [...files],
    commands: [...commands],
    lineCount: lines.filter(l => l.trim()).length,
    keySummary,
  };
}

export function classifyFailure(error?: string, output?: string): FailureClassification {
  const text = `${error ?? ""} ${output ?? ""}`.toLowerCase();

  if (/type error|syntax error|\btsc\b|cannot find module|ts\(\d+\)/.test(text))
    return { type: "COMPILE_ERROR", color: "var(--red)" };
  if (/test failed|vitest|jest|\bassertion\b|expect\(/.test(text))
    return { type: "TEST_FAIL", color: "var(--red)" };
  if (/\bconflict\b/.test(text))
    return { type: "MERGE_CONFLICT", color: "var(--yellow)" };
  if (/exit code|killed|timeout|timed out/.test(text))
    return { type: "TIMEOUT", color: "var(--orange, #f97316)" };
  if (/eacces|permission denied/.test(text))
    return { type: "PERMISSION", color: "var(--red)" };
  if (/worktree|\bgit\b|\bbranch\b/.test(text))
    return { type: "GIT_ERROR", color: "var(--yellow)" };

  return { type: "UNKNOWN", color: "var(--red)" };
}

export const STATUS_COLORS: Record<WorkerStatus, string> = {
  pending:  "var(--text-dimmer)",
  running:  "var(--accent)",
  done:     "var(--accent)",
  error:    "var(--red)",
  conflict: "var(--yellow)",
};

export const STATUS_LABELS: Record<WorkerStatus, string> = {
  pending:  "WAITING",
  running:  "RUNNING",
  done:     "DONE",
  error:    "FAILED",
  conflict: "CONFLICT",
};

export function AgentBadge({ name }: { name: string }) {
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

export function WorkerCard({ worker, isExpanded, onToggle }: {
  worker: WorkerState;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const outputRef = useRef<HTMLDivElement>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showFiles, setShowFiles] = useState(true);
  const [showCommands, setShowCommands] = useState(true);
  const [showTestOutput, setShowTestOutput] = useState(false);

  useEffect(() => {
    if (worker.status === "running" && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [worker.output, worker.status]);

  const color = STATUS_COLORS[worker.status];
  const isRunning = worker.status === "running";
  const isFailed = worker.status === "error" || worker.status === "conflict";

  const parsed = !isRunning && worker.output ? parseWorkerOutput(worker.output) : null;
  const failure = isFailed ? classifyFailure(worker.error, worker.output) : null;

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
        <span style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          ...(isRunning ? { animation: "swarm-pulse 1s ease-in-out infinite" } : {}),
        }} />

        <AgentBadge name={worker.agentName} />

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

        <span style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <span style={{ fontSize: 9, color, letterSpacing: "0.05em" }}>
            {STATUS_LABELS[worker.status]}
          </span>
          {failure && (
            <span style={{
              fontSize: 8,
              letterSpacing: "0.06em",
              color: failure.color,
              border: `1px solid ${failure.color}`,
              padding: "0px 4px",
              opacity: 0.9,
              lineHeight: "14px",
            }}>
              {failure.type}
            </span>
          )}
          {worker.verifying && (
            <span style={{ fontSize: 8, color: "var(--text-dimmer)", display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, border: "1px solid var(--text-dimmer)", borderTopColor: "transparent", borderRadius: "50%", animation: "verify-spin 0.7s linear infinite" }} />
              verifying tests...
            </span>
          )}
          {!worker.verifying && worker.testPassed === true && !worker.testSkipped && (
            <span style={{
              fontSize: 8,
              letterSpacing: "0.06em",
              color: "var(--accent)",
              border: "1px solid var(--accent)",
              padding: "0px 4px",
              lineHeight: "14px",
            }}>
              TESTS PASS
            </span>
          )}
          {!worker.verifying && worker.testSkipped && (
            <span style={{ fontSize: 8, color: "var(--text-dimmer)" }}>· no tests</span>
          )}
          {!worker.verifying && worker.testPassed === false && (
            <span style={{
              fontSize: 8,
              letterSpacing: "0.06em",
              color: "var(--red)",
              border: "1px solid var(--red)",
              padding: "0px 4px",
              lineHeight: "14px",
            }}>
              TESTS FAILED
            </span>
          )}
        </span>

        <span style={{ fontSize: 10, color: "var(--text-dimmer)", flexShrink: 0 }}>
          {isExpanded ? "▴" : "▾"}
        </span>
      </div>

      {isExpanded && (
        <div style={{ fontFamily: "var(--font)", fontSize: 10 }}>
          {worker.error && (
            <div style={{
              padding: "8px 12px",
              color: "var(--red)",
              borderBottom: "1px solid var(--border-dim)",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>
              {worker.error}
            </div>
          )}

          {isRunning && (
            <div
              ref={outputRef}
              style={{
                padding: "10px 12px",
                lineHeight: 1.6,
                color: "var(--text-dim)",
                maxHeight: 220,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {worker.output || <span style={{ color: "var(--text-dimmer)" }}>Waiting for output...</span>}
              <span style={{
                display: "inline-block",
                width: 5,
                height: 11,
                background: "var(--accent)",
                verticalAlign: "text-bottom",
                marginLeft: 2,
                animation: "cursor-blink 1s step-end infinite",
              }} />
            </div>
          )}

          {!isRunning && parsed && (
            <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{
                fontSize: 9,
                color: "var(--text-dimmer)",
                letterSpacing: "0.05em",
                borderBottom: "1px solid var(--border-dim)",
                paddingBottom: 6,
              }}>
                {[
                  parsed.files.length > 0 && `${parsed.files.length} file${parsed.files.length !== 1 ? "s" : ""} changed`,
                  parsed.commands.length > 0 && `${parsed.commands.length} command${parsed.commands.length !== 1 ? "s" : ""}`,
                  `${parsed.lineCount} lines output`,
                ].filter(Boolean).join(" · ")}
              </div>

              {parsed.keySummary && (
                <div style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.5 }}>
                  {parsed.keySummary}
                </div>
              )}

              {parsed.files.length > 0 && (
                <div>
                  <button
                    onClick={e => { e.stopPropagation(); setShowFiles(v => !v); }}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 9, color: "var(--text-dimmer)", letterSpacing: "0.06em",
                      padding: 0, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    <span>{showFiles ? "▾" : "▸"}</span> FILES ({parsed.files.length})
                  </button>
                  {showFiles && (
                    <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                      {parsed.files.map((f, i) => (
                        <span key={i} style={{ fontSize: 9, color: "var(--accent)", paddingLeft: 10 }}>
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {parsed.commands.length > 0 && (
                <div>
                  <button
                    onClick={e => { e.stopPropagation(); setShowCommands(v => !v); }}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 9, color: "var(--text-dimmer)", letterSpacing: "0.06em",
                      padding: 0, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    <span>{showCommands ? "▾" : "▸"}</span> COMMANDS ({parsed.commands.length})
                  </button>
                  {showCommands && (
                    <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                      {parsed.commands.map((c, i) => (
                        <span key={i} style={{ fontSize: 9, color: "var(--text-dim)", paddingLeft: 10 }}>
                          $ {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <button
                  onClick={e => { e.stopPropagation(); setShowRaw(v => !v); }}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 9, color: "var(--text-dimmer)", letterSpacing: "0.06em",
                    padding: 0, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  <span>{showRaw ? "▾" : "▸"}</span> RAW OUTPUT
                </button>
                {showRaw && (
                  <div
                    ref={outputRef}
                    style={{
                      marginTop: 6,
                      padding: "8px 10px",
                      background: "var(--bg-3)",
                      border: "1px solid var(--border-dim)",
                      maxHeight: 180,
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      lineHeight: 1.6,
                      color: "var(--text-dimmer)",
                    }}
                  >
                    {worker.output}
                  </div>
                )}
              </div>
            </div>
          )}

          {!isRunning && worker.testPassed === false && worker.testOutput && (
            <div style={{ padding: "0 12px 8px" }}>
              <button
                onClick={e => { e.stopPropagation(); setShowTestOutput(v => !v); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 9, color: "var(--red)", letterSpacing: "0.06em",
                  padding: 0, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 4,
                }}
              >
                <span>{showTestOutput ? "▾" : "▸"}</span> TEST OUTPUT
              </button>
              {showTestOutput && (
                <div style={{
                  marginTop: 4,
                  padding: "8px 10px",
                  background: "var(--bg-3)",
                  border: "1px solid var(--red)",
                  maxHeight: 160,
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  lineHeight: 1.6,
                  color: "var(--red)",
                  fontSize: 9,
                }}>
                  {worker.testOutput}
                </div>
              )}
            </div>
          )}

          {!isRunning && !parsed && !worker.error && (
            <div style={{ padding: "10px 12px", color: "var(--text-dimmer)" }}>
              No output
            </div>
          )}
        </div>
      )}
    </div>
  );
}
