import { useState, useRef } from "react";
import {
  renderDiff, ToolIcon, FilePill, DiffStats, FileList,
  GrepResult, TodoList, parseTodosFromResult, formatLabelNode, computeDiffStats,
  type TodoItem,
} from "./ToolRenderers";

interface ToolOutputProps {
  name: string;
  input?: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  pending?: boolean;
  onApprove?: (() => void) | undefined;
  onDeny?: (() => void) | undefined;
  idx?: number;
}

export function ToolOutput({ name, input, result, isError, pending, onApprove, onDeny, idx }: ToolOutputProps) {
  const [open, setOpen] = useState(isError || (!!onApprove && !!pending));
  const [expanded, setExpanded] = useState(false);
  const [resultCopied, setResultCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const isDone = !pending && result !== undefined;

  const iconColor = pending
    ? "var(--yellow)"
    : isError
    ? "var(--red)"
    : isDone
    ? "var(--green)"
    : "var(--text-muted)";

  return (
    <div
      style={{
        marginBottom: 2,
        animation: "gc-tool-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) both",
        animationDelay: `${(idx ?? 0) * 40}ms`,
      }}
    >
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "3px 0", cursor: "pointer",
          userSelect: "none",
        }}
      >
        {pending && !onApprove ? (
          <span style={{
            display: "inline-block", width: 11, height: 11, flexShrink: 0,
            border: "1.5px solid var(--yellow)", borderTopColor: "transparent",
            borderRadius: "50%", animation: "spin 0.7s linear infinite",
          }} />
        ) : (
          <span style={{ display: "inline-flex", flexShrink: 0, alignItems: "center" }}>
            <ToolIcon name={name} color={iconColor} />
          </span>
        )}

        <span style={{
          fontSize: 11, flex: 1, overflow: "hidden",
          fontFamily: "var(--font-mono)", display: "inline-flex", alignItems: "center", gap: 4,
          ...(pending && !onApprove ? {
            backgroundImage: "linear-gradient(to right, var(--shimmer-gold), var(--text-dim) 50%, var(--shimmer-gold))",
            backgroundSize: "200% auto",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animation: "shimmer-sweep 1.6s linear infinite",
          } : {}),
        }}>
          {formatLabelNode(name, input, result)}
        </span>

        {pending && onApprove && (
          <div style={{ display: "flex", gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button className="btn btn-success btn-xs" onClick={onApprove}>Allow</button>
            <button className="btn btn-secondary btn-xs" onClick={onDeny}>Deny</button>
          </div>
        )}
      </div>

      <div
        ref={contentRef}
        style={{
          overflow: "hidden",
          maxHeight: open ? (contentRef.current?.scrollHeight ?? 2000) : 0,
          transition: "max-height 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div style={{ marginLeft: 14, marginTop: 4, marginBottom: 6, background: isError ? "var(--bg-error)" : undefined, borderRadius: isError ? 4 : undefined, padding: isError ? "4px 6px" : undefined }}>
          {(() => {
            const n = name.toLowerCase();
            const skipInput = ["read", "write", "edit", "multi_edit", "glob", "grep", "web_search", "web_fetch", "todowrite", "todoread", "agent"].includes(n);

            if (n === "multi_edit") {
              const edits = Array.isArray(input?.edits) ? input.edits as Array<{ old_string?: string; new_string?: string }> : [];
              if (!edits.length) return null;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {edits.map((e, i) => {
                    const removed = (e.old_string ?? "").split("\n").map(l => `- ${l}`).join("\n");
                    const added = (e.new_string ?? "").split("\n").map(l => `+ ${l}`).join("\n");
                    const diff = [removed, added].filter(Boolean).join("\n");
                    const stats = computeDiffStats(diff);
                    return (
                      <div key={i} style={{ borderLeft: "2px solid var(--border)", paddingLeft: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>edit {i + 1}</span>
                          <DiffStats added={stats.added} removed={stats.removed} />
                        </div>
                        <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", lineHeight: 1.5, maxHeight: 160, overflow: "auto" }}>
                          {renderDiff(diff)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            if (n === "agent") {
              const prompt = String(input?.prompt ?? input?.description ?? "");
              return (
                <div style={{
                  borderLeft: "2px solid var(--accent)", paddingLeft: 10,
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  {prompt && (
                    <div>
                      <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Task</div>
                      <pre style={{ fontSize: 10, color: "var(--text-dim)", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, fontFamily: "var(--font-mono)", lineHeight: 1.5, maxHeight: 200, overflow: "auto" }}>
                        {prompt}
                      </pre>
                    </div>
                  )}
                  {result && (
                    <div>
                      <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Result</div>
                      <pre style={{ fontSize: 10, color: "var(--text-dim)", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, fontFamily: "var(--font-mono)", lineHeight: 1.5, maxHeight: 240, overflow: "auto" }}>
                        {result.length > 2000 ? result.slice(0, 2000) + "\n…" : result}
                      </pre>
                    </div>
                  )}
                </div>
              );
            }

            if ((n === "write" || n === "edit") && !result && input) {
              const content = String(input.content ?? input.new_string ?? "");
              if (content) {
                const preview = content.length > 2000 ? content.slice(0, 2000) + "\n…" : content;
                return (
                  <pre style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, fontFamily: "var(--font-mono)", lineHeight: 1.5, maxHeight: 200, overflow: "auto" }}>
                    {preview}
                  </pre>
                );
              }
            }

            if (n === "todowrite" || n === "todoread") {
              const todos = result ? (parseTodosFromResult(result) ?? (Array.isArray(input?.todos) ? input.todos as TodoItem[] : [])) : (Array.isArray(input?.todos) ? input.todos as TodoItem[] : []);
              if (todos.length > 0) return <TodoList todos={todos} />;
              return null;
            }

            return (
              <>
                {!skipInput && input && Object.keys(input).length > 0 && (
                  <pre style={{
                    fontSize: 10, color: "var(--text-muted)", whiteSpace: "pre-wrap",
                    wordBreak: "break-all", margin: 0, marginBottom: result ? 6 : 0,
                    fontFamily: "var(--font-mono)", lineHeight: 1.5,
                    maxHeight: 200, overflow: "auto",
                  }}>
                    {formatInput(name, input)}
                  </pre>
                )}
                {result && (() => {
                  const isDiff = (n === "write" || n === "edit") && /^[+-]/m.test(result) && result.includes("\n");
                  const isGlob = n === "glob";
                  const isGrep = n === "grep";
                  const lineCount = result.split("\n").length;
                  const needsTrunc = result.length > 2000 && !expanded;
                  const displayContent = needsTrunc ? result.slice(0, 2000) : result;
                  const isBash = n === "bash";
                  return (
                    <>
                      <div style={{ position: "relative" }}>
                        {isGlob ? (
                          <FileList content={result} />
                        ) : isGrep ? (
                          <GrepResult content={result} />
                        ) : isDiff ? (
                          <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", lineHeight: 1.5, maxHeight: expanded ? "none" : 240, overflow: "auto" }}>
                            {renderDiff(displayContent)}
                          </div>
                        ) : (
                          <pre style={{
                            fontSize: 10, color: isError ? "var(--red)" : "var(--text-dim)",
                            whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0,
                            fontFamily: "var(--font-mono)", lineHeight: 1.5,
                            maxHeight: expanded ? "none" : 240, overflow: "auto",
                          }}>
                            {displayContent}
                          </pre>
                        )}
                        {isBash && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              void navigator.clipboard.writeText(result);
                              setResultCopied(true);
                              setTimeout(() => setResultCopied(false), 1500);
                            }}
                            style={{
                              position: "absolute", top: 4, right: 4,
                              fontSize: 9, color: "var(--text-muted)",
                              background: "var(--bg-panel)", border: "1px solid var(--border)",
                              borderRadius: 3, padding: "1px 6px", cursor: "pointer",
                            }}
                          >
                            {resultCopied ? "✓" : "Copy"}
                          </button>
                        )}
                      </div>
                      {!isGlob && !isGrep && result.length > 2000 && !expanded && (
                        <button className="btn btn-ghost-accent btn-sm" onClick={e => { e.stopPropagation(); setExpanded(true); }} style={{ marginTop: 4, display: "block" }}>
                          Show all ({lineCount} lines)
                        </button>
                      )}
                      {!isGlob && !isGrep && expanded && (
                        <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setExpanded(false); }} style={{ marginTop: 4, display: "block" }}>
                          Collapse
                        </button>
                      )}
                    </>
                  );
                })()}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatInput(name: string, input: Record<string, unknown>): string {
  if (name === "bash" && input.command) return String(input.command);
  if ((name === "write" || name === "edit") && input.content) {
    const s = String(input.content);
    return s.length > 1000 ? s.slice(0, 1000) + "\n… (truncated)" : s;
  }
  return JSON.stringify(input, null, 2);
}
