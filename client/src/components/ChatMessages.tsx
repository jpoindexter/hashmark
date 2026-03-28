import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ThinkingBlock from "./chat/ThinkingBlock";
import ToolCallSummary, { FileBadge, getReadFilePath, categorize } from "./chat/ToolSummary";
import ContextMenu, { type ContextMenuItem } from "./shared/ContextMenu";
import ScrollToBottom from "./shared/ScrollToBottom";
import { fetchApi } from "../lib/api";

const CURSOR_STYLE: React.CSSProperties = {
  display: "inline-block",
  width: 7,
  height: 13,
  background: "var(--accent)",
  verticalAlign: "text-bottom",
  marginLeft: 2,
  animation: "cursor-blink 1s step-end infinite",
};

const CODE_CONTAINER_STYLE: React.CSSProperties = {
  position: "relative",
  background: "var(--bg-3)",
  border: "1px solid var(--border-dim)",
  margin: "8px 0",
  overflow: "hidden",
};

const CODE_ACTIONS_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 6,
  right: 8,
  display: "flex",
  gap: 6,
  alignItems: "center",
  zIndex: 1,
};

const LANG_BADGE_STYLE: React.CSSProperties = {
  fontSize: "9px",
  fontFamily: "var(--font)",
  color: "var(--accent)",
  background: "var(--bg-4)",
  border: "1px solid var(--border-dim)",
  padding: "1px 6px",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  userSelect: "none",
};

const SECTION_HEADING_STYLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text)",
  fontFamily: "var(--font-ui)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

interface ContextMenuState {
  items: ContextMenuItem[];
  position: { x: number; y: number };
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
}

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlockData {
  type: "tool_use";
  tool: string;
  input: Record<string, unknown>;
}

export interface ProgressBlock {
  type: "progress";
  text: string;
}

export interface ThinkingBlockData {
  type: "thinking";
  content: string;
  id?: string;
}

export type ContentBlock = TextBlock | ToolUseBlockData | ProgressBlock | ThinkingBlockData;

export interface StreamingState {
  blocks: ContentBlock[];
  cost?: number;
  usage?: { input_tokens: number; output_tokens: number };
}

interface ChatMessagesProps {
  sessionId: string | null;
  streamText: string;
  streaming: boolean;
  streamingState?: StreamingState;
  modelLabel?: string;
  planMode?: boolean;
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtTokens(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} style={{
          background: "var(--bg-3)",
          border: "1px solid var(--border-dim)",
          padding: "1px 5px",
          fontSize: "11px",
          color: "var(--accent)",
          fontFamily: "var(--font)",
        }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i} style={{ color: "var(--text)", fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function DiffLine({ line }: { line: string }) {
  if (line.startsWith("---") || line.startsWith("+++"))
    return <div style={{ color: "var(--text-dimmer)", fontStyle: "italic" }}>{line}</div>;
  if (line.startsWith("@@"))
    return <div style={{ color: "var(--blue, #388bfd)" }}>{line}</div>;
  if (line.startsWith("+"))
    return <div style={{ background: "var(--accent-bg, rgba(63,185,80,0.1))", color: "var(--accent)" }}>{line}</div>;
  if (line.startsWith("-"))
    return <div style={{ background: "var(--red-bg, rgba(248,81,73,0.1))", color: "var(--red, #f85149)" }}>{line}</div>;
  return <div style={{ color: "var(--text-dim)" }}>{line}</div>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      style={{
        fontSize: "10px",
        fontFamily: "var(--font-ui)",
        color: copied ? "var(--accent)" : "var(--text-dim)",
        background: "var(--bg-3)",
        border: "1px solid var(--border-dim)",
        padding: "1px 6px",
        cursor: "pointer",
        userSelect: "none",
        lineHeight: 1.4,
        transition: "background 0.1s, color 0.1s",
      }}
      onMouseEnter={e => { if (!copied) e.currentTarget.style.background = "var(--bg-4)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-3)"; }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const isDiff = lang === "diff";
  return (
    <div style={CODE_CONTAINER_STYLE}>
      <div style={CODE_ACTIONS_STYLE}>
        {(lang || isDiff) && <span style={LANG_BADGE_STYLE}>{isDiff ? "DIFF" : lang}</span>}
        <CopyButton text={code} />
      </div>
      <pre style={{
        padding: "28px 12px 10px",
        overflow: "auto",
        fontSize: "11px",
        lineHeight: "1.5",
        margin: 0,
        fontFamily: isDiff ? "var(--font)" : undefined,
      }}>
        {isDiff ? (
          code.split("\n").map((line, i) => <DiffLine key={i} line={line} />)
        ) : (
          <code style={{ color: "var(--text)", fontFamily: "var(--font)" }}>{code}</code>
        )}
      </pre>
    </div>
  );
}

export function AssistantContent({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(<CodeBlock key={key++} lang={lang} code={codeLines.join("\n")} />);
      i++;
      continue;
    }

    if (line.startsWith("### ")) {
      nodes.push(<h4 key={key++} style={{ color: "var(--text)", fontSize: "12px", fontWeight: 700, margin: "12px 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{line.slice(4)}</h4>);
      i++; continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(<h3 key={key++} style={{ color: "var(--text)", fontSize: "13px", fontWeight: 700, margin: "12px 0 4px" }}>{line.slice(3)}</h3>);
      i++; continue;
    }
    if (line.startsWith("# ")) {
      nodes.push(<h2 key={key++} style={{ color: "var(--accent)", fontSize: "14px", fontWeight: 700, margin: "12px 0 6px" }}>{line.slice(2)}</h2>);
      i++; continue;
    }

    if (line.match(/^[-*] /)) {
      nodes.push(
        <div key={key++} style={{ display: "flex", gap: "8px", margin: "2px 0" }}>
          <span style={{ color: "var(--accent)", flexShrink: 0 }}>›</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
      i++; continue;
    }

    if (!line.trim()) {
      nodes.push(<div key={key++} style={{ height: "6px" }} />);
      i++; continue;
    }

    nodes.push(
      <div key={key++} style={{ lineHeight: "1.6" }}>
        {renderInline(line)}
      </div>
    );
    i++;
  }

  return <>{nodes}</>;
}

function toolAccentColor(tool: string): string {
  const name = tool.toLowerCase();
  if (["write", "edit", "create", "multiedit"].includes(name)) return "var(--accent)";
  if (["bash", "shell"].includes(name)) return "var(--yellow)";
  if (["read", "glob", "grep"].includes(name)) return "var(--blue)";
  return "var(--text-dimmer)";
}

function primaryArg(tool: string, input: Record<string, unknown>): string {
  const name = tool.toLowerCase();
  if (name === "bash" || name === "shell") return String(input.command ?? input.cmd ?? "");
  if (name === "read") return String(input.file_path ?? input.path ?? "");
  if (name === "glob" || name === "grep") return String(input.pattern ?? "");
  const path = input.file_path ?? input.path ?? input.new_file_path ?? "";
  if (path) return String(path);
  for (const v of Object.values(input)) {
    if (typeof v === "string") return v;
  }
  return "";
}

export function ToolUseBlock({ block }: { block: ToolUseBlockData }) {
  const accent = toolAccentColor(block.tool);
  const arg = primaryArg(block.tool, block.input);
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      background: "var(--bg-3)",
      border: "1px solid var(--border-dim)",
      borderLeft: `2px solid ${accent}`,
      borderRadius: "var(--radius-sm, 4px)",
      padding: "4px 8px",
      fontSize: 11,
      fontFamily: "var(--font)",
      margin: "4px 0",
      lineHeight: 1.4,
    }}>
      <span style={{ color: accent, fontWeight: 700, flexShrink: 0 }}>[{block.tool}]</span>
      {arg && (
        <span style={{
          color: "var(--text-dim)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {arg}
        </span>
      )}
    </div>
  );
}

function fmtDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

function CostLine({ cost, usage, responseTime }: { cost?: number; usage?: { input_tokens: number; output_tokens: number }; responseTime?: number }) {
  if (!cost && !usage && !responseTime) return null;
  const parts: string[] = [];
  if (responseTime != null) parts.push(fmtDuration(responseTime));
  if (cost != null) parts.push(`$${cost.toFixed(4)}`);
  if (usage) parts.push(`${fmtTokens(usage.input_tokens)}in / ${fmtTokens(usage.output_tokens)}out`);
  return (
    <div style={{
      fontSize: 10,
      color: "var(--text-dimmer)",
      fontFamily: "var(--font)",
      marginTop: 6,
      paddingLeft: 14,
      userSelect: "none",
    }}>
      {parts.join(" · ")}
    </div>
  );
}

const USER_AVATAR_STYLE: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: "50%",
  background: "var(--bg-4)",
  border: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 9,
  color: "var(--text-dim)",
  flexShrink: 0,
  fontFamily: "var(--font)",
  fontWeight: 700,
  letterSpacing: "0.05em",
  marginTop: 2,
};

const ASSISTANT_CONTENT_STYLE: React.CSSProperties = {
  paddingLeft: 12,
  fontSize: 13,
  color: "var(--text)",
  lineHeight: 1.6,
  fontFamily: "var(--font-ui)",
};

const TIMESTAMP_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-dimmer)",
  transition: "opacity 0.15s",
  userSelect: "none",
};

function UserBubble({ msg, onContextMenu, showRetry, onRetry }: {
  msg: Message;
  onContextMenu: (e: React.MouseEvent) => void;
  showRetry?: boolean;
  onRetry?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={onContextMenu}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, maxWidth: "80%" }}>
        <div style={{ flex: 1 }}>
          <div style={{
            background: "var(--bg-4)",
            border: `1px solid ${showRetry ? "var(--red, #f85149)" : "var(--border)"}`,
            padding: "8px 12px 8px 14px",
            fontSize: 13,
            color: "var(--text)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            fontFamily: "var(--font-ui)",
          }}>
            {msg.content}
          </div>
        </div>
        <div style={USER_AVATAR_STYLE}>U</div>
      </div>
      {showRetry && onRetry && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginRight: 30, marginTop: 4 }}>
          <RetryButton onClick={onRetry} />
        </div>
      )}
      <div style={{ ...TIMESTAMP_STYLE, marginTop: 3, marginRight: 30, opacity: hovered ? 1 : 0 }}>
        {fmtTime(msg.created_at)}
      </div>
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginTop: 8,
      paddingLeft: 14,
    }}>
      <div style={{
        fontSize: 11,
        color: "var(--red, #f85149)",
        fontFamily: "var(--font-ui)",
      }}>
        Stream failed
      </div>
      <button
        onClick={onClick}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 10px",
          fontSize: 11,
          fontFamily: "var(--font-ui)",
          fontWeight: 600,
          color: "var(--accent)",
          background: "var(--accent-bg, rgba(63,185,80,0.1))",
          border: "1px solid var(--accent)",
          borderRadius: 4,
          cursor: "pointer",
          transition: "background 0.1s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(63,185,80,0.2)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "var(--accent-bg, rgba(63,185,80,0.1))"; }}
      >
        Retry
      </button>
    </div>
  );
}

function AssistantBubble({ msg, onContextMenu, showRetry, onRetry, responseTime }: {
  msg: Message;
  onContextMenu: (e: React.MouseEvent) => void;
  showRetry?: boolean;
  onRetry?: () => void;
  responseTime?: number;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={onContextMenu}
    >
      <div style={{
        ...ASSISTANT_CONTENT_STYLE,
        borderLeft: `2px solid ${showRetry ? "var(--red, #f85149)" : "var(--accent)"}`,
        animation: "fadeIn 0.2s ease forwards",
      }}>
        <AssistantContent text={msg.content} />
      </div>
      {showRetry && onRetry && <RetryButton onClick={onRetry} />}
      <div style={{ ...TIMESTAMP_STYLE, display: "flex", gap: 8, marginTop: 3, paddingLeft: 14, opacity: hovered || responseTime != null ? 1 : 0 }}>
        <span>{fmtTime(msg.created_at)}</span>
        {responseTime != null && (
          <span>{fmtDuration(responseTime)}</span>
        )}
        {msg.output_tokens != null && msg.output_tokens > 0 && (
          <span>{fmtTokens(msg.output_tokens)} tok</span>
        )}
      </div>
    </div>
  );
}

const GATE_BTN_STYLE: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: 12,
  borderRadius: "var(--radius)",
  cursor: "pointer",
  fontFamily: "var(--font-ui)",
};

function PlanReviewGate({ planText }: { planText: string }) {
  const [mode, setMode] = useState<"idle" | "feedback" | "deny">("idle");
  const [feedbackText, setFeedbackText] = useState("");
  const feedbackRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (mode === "feedback" || mode === "deny") {
      requestAnimationFrame(() => feedbackRef.current?.focus());
    }
  }, [mode]);

  const sendMessage = (text: string) => {
    window.dispatchEvent(new CustomEvent("studio:suggest", { detail: { text } }));
    setTimeout(() => {
      const ta = document.querySelector("textarea") as HTMLTextAreaElement | null;
      if (ta) {
        const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
        ta.dispatchEvent(enterEvent);
      }
    }, 50);
  };

  const handleApprove = () => {
    window.dispatchEvent(new CustomEvent("studio:plan-approve"));
    sendMessage(`[APPROVED] Execute the plan above.`);
  };

  const handleDeny = () => {
    if (mode !== "deny") {
      setMode("deny");
      return;
    }
    const reason = feedbackText.trim();
    window.dispatchEvent(new CustomEvent("studio:plan-deny"));
    sendMessage(`[DENIED] ${reason || "Plan rejected. Please propose a different approach."}`);
    setMode("idle");
    setFeedbackText("");
  };

  const handleFeedback = () => {
    if (mode !== "feedback") {
      setMode("feedback");
      return;
    }
    const fb = feedbackText.trim();
    if (!fb) return;
    window.dispatchEvent(new CustomEvent("studio:plan-feedback"));
    sendMessage(`[FEEDBACK] ${fb}`);
    setMode("idle");
    setFeedbackText("");
  };

  const handleFeedbackKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (mode === "feedback") handleFeedback();
      if (mode === "deny") handleDeny();
    }
    if (e.key === "Escape") {
      setMode("idle");
      setFeedbackText("");
    }
  };

  return (
    <div style={{
      padding: "8px 0",
      marginTop: 8,
      borderTop: "1px solid var(--border-dim)",
    }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleApprove}
          style={{ ...GATE_BTN_STYLE, fontWeight: 600, background: "var(--accent)", color: "var(--bg)", border: "none" }}
        >
          Approve & Execute
        </button>
        <button
          onClick={handleFeedback}
          style={{
            ...GATE_BTN_STYLE,
            background: mode === "feedback" ? "var(--accent-bg)" : "var(--bg-3)",
            color: mode === "feedback" ? "var(--accent)" : "var(--text-dim)",
            border: mode === "feedback" ? "1px solid var(--accent)" : "1px solid var(--border)",
          }}
        >
          Give Feedback
        </button>
        <button
          onClick={handleDeny}
          style={{
            ...GATE_BTN_STYLE,
            background: mode === "deny" ? "var(--red-bg)" : "none",
            color: "var(--red)",
            border: mode === "deny" ? "1px solid var(--red)" : "1px solid var(--red-bg)",
          }}
        >
          Deny
        </button>
      </div>

      {(mode === "feedback" || mode === "deny") && (
        <div style={{ marginTop: 8 }}>
          <textarea
            ref={feedbackRef}
            value={feedbackText}
            onChange={e => setFeedbackText(e.target.value)}
            onKeyDown={handleFeedbackKeyDown}
            placeholder={mode === "feedback" ? "What should change in this plan?" : "Reason for rejection (optional)..."}
            rows={2}
            style={{
              width: "100%",
              background: "var(--bg-3)",
              border: `1px solid ${mode === "deny" ? "var(--red-bg)" : "var(--border)"}`,
              borderRadius: "var(--radius)",
              color: "var(--text)",
              fontSize: 12,
              fontFamily: "var(--font-ui)",
              padding: "6px 10px",
              resize: "none",
              outline: "none",
            }}
          />
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 4,
          }}>
            <span style={{ fontSize: 10, color: "var(--text-dimmer)", fontFamily: "var(--font-ui)" }}>
              Enter to send, Esc to cancel
            </span>
            <button
              onClick={() => { setMode("idle"); setFeedbackText(""); }}
              style={{
                padding: "2px 8px",
                fontSize: 11,
                background: "none",
                border: "none",
                color: "var(--text-dimmer)",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg, showPlanGate, onContextMenu, showRetry, onRetry, showUserRetry, responseTime }: {
  msg: Message;
  showPlanGate: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  showRetry?: boolean;
  onRetry?: () => void;
  showUserRetry?: boolean;
  responseTime?: number;
}) {
  if (msg.role === "user") return <UserBubble msg={msg} onContextMenu={onContextMenu} showRetry={showUserRetry} onRetry={onRetry} />;
  return (
    <div>
      <AssistantBubble msg={msg} onContextMenu={onContextMenu} showRetry={showRetry} onRetry={onRetry} responseTime={responseTime} />
      {showPlanGate && <PlanReviewGate planText={msg.content} />}
    </div>
  );
}

type StreamSegment =
  | { kind: "node"; key: number; node: React.ReactNode }
  | { kind: "tool_group"; key: number; blocks: ToolUseBlockData[]; startIdx: number };

function segmentBlocks(blocks: ContentBlock[]): StreamSegment[] {
  const segments: StreamSegment[] = [];
  let segKey = 0;
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    if (block.type === "tool_use") {
      const startIdx = i;
      const toolBlocks: ToolUseBlockData[] = [];
      while (i < blocks.length && blocks[i].type === "tool_use") {
        toolBlocks.push(blocks[i] as ToolUseBlockData);
        i++;
      }
      segments.push({ kind: "tool_group", key: segKey++, blocks: toolBlocks, startIdx });
      continue;
    }

    if (block.type === "text") {
      if (block.text) {
        segments.push({ kind: "node", key: segKey++, node: <AssistantContent text={block.text} /> });
      }
      i++;
      continue;
    }

    if (block.type === "progress") {
      segments.push({
        kind: "node",
        key: segKey++,
        node: (
          <div style={{
            fontSize: 11,
            color: "var(--text-dimmer)",
            fontFamily: "var(--font)",
            margin: "2px 0",
            fontStyle: "italic",
          }}>
            {block.text}
          </div>
        ),
      });
      i++;
      continue;
    }

    if (block.type === "thinking") {
      segments.push({
        kind: "node",
        key: segKey++,
        node: <ThinkingBlock content={block.content} id={block.id ?? String(i)} />,
      });
      i++;
      continue;
    }

    i++;
  }

  return segments;
}

function StreamingBubble({ state, legacyText, streamStartTime }: { state?: StreamingState; legacyText: string; streamStartTime?: number }) {
  const hasBlocks = state && state.blocks.length > 0;

  const segments = useMemo(
    () => (hasBlocks ? segmentBlocks(state.blocks) : []),
    [hasBlocks, state?.blocks]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <div style={{
        ...ASSISTANT_CONTENT_STYLE,
        borderLeft: "2px solid var(--accent)",
        width: "100%",
      }}>
        {hasBlocks ? (
          <>
            {segments.map((seg) => {
              if (seg.kind === "node") {
                return <div key={seg.key}>{seg.node}</div>;
              }
              if (seg.blocks.length === 1) {
                const b = seg.blocks[0];
                const isRead = categorize(b.tool) === "Read";
                const fp = isRead ? getReadFilePath(b.input) : null;
                return (
                  <div key={seg.key}>
                    <ToolUseBlock block={b} />
                    {fp && (
                      <div style={{ paddingLeft: 2, marginTop: 2, marginBottom: 4 }}>
                        <FileBadge filePath={fp} />
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <ToolCallSummary
                  key={seg.key}
                  groups={seg.blocks.map((b) => ({
                    block: b,
                    node: <ToolUseBlock block={b} />,
                  }))}
                />
              );
            })}
            <span style={CURSOR_STYLE} />
          </>
        ) : legacyText ? (
          <>
            <AssistantContent text={legacyText} />
            <span style={CURSOR_STYLE} />
          </>
        ) : (
          <div style={{ display: "flex", gap: 4, alignItems: "center", paddingTop: 4 }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                width: 5,
                height: 5,
                background: "var(--accent)",
                borderRadius: "50%",
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        )}
      </div>

      {state && (state.cost != null || state.usage != null) ? (
        <CostLine cost={state.cost} usage={state.usage} />
      ) : (
        <div style={{ display: "flex", gap: 8, fontSize: 10, color: "var(--text-dimmer)", marginTop: 3, paddingLeft: 14, userSelect: "none" }}>
          <span>typing...</span>
          {streamStartTime != null && <StreamingTimer startTime={streamStartTime} />}
        </div>
      )}
    </div>
  );
}

function StreamingTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - startTime);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startTime), 100);
    return () => clearInterval(id);
  }, [startTime]);
  return <span>{fmtDuration(elapsed)}</span>;
}

const START_LINKS = [
  { label: "New Chat", icon: "\u2b22", action: "new-chat" },
  { label: "Scan Codebase", icon: "\u21bb", action: "navigate", route: "/generate" },
  { label: "View Agents", icon: "\u25c6", action: "navigate", route: "/agents" },
  { label: "Open Settings", icon: "\u2699", action: "navigate", route: "/settings" },
] as const;

const SUGGESTIONS = [
  "Explain the architecture of this project",
  "Review recent changes for issues",
  "Write tests for the main module",
  "Commit staged changes with a message",
];

const LINK_BTN_STYLE: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "var(--font-ui)",
  color: "var(--blue, #388bfd)",
};

function underlineHover(e: React.MouseEvent) { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }
function underlineUnhover(e: React.MouseEvent) { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }

interface Workspace {
  id: string;
  name: string;
  path: string;
  last_opened: number;
}

function WelcomeLink({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="welcome-link"
      style={{ ...LINK_BTN_STYLE, display: "flex", alignItems: "center", gap: 8, padding: "4px 0", lineHeight: 1.6 }}
      onMouseEnter={underlineHover}
      onMouseLeave={underlineUnhover}
    >
      <span style={{ fontSize: 14, opacity: 0.7, width: 20, textAlign: "center", flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  );
}

const DISPATCH_SUGGESTIONS = [
  "scan this project for design violations",
  "review recent changes and summarize what changed",
  "run a full audit — violations, hierarchy, contrast",
  "fix all spacing token mismatches",
];

function EmptyState({ modelLabel: _modelLabel }: { modelLabel: string }) {
  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 28,
      padding: "0 40px",
      overflow: "auto",
    }}>
      <div style={{
        fontFamily: "var(--font)",
        fontSize: 14,
        color: "var(--text-dimmer)",
        letterSpacing: "0.02em",
      }}>
        what do you want to build?
      </div>
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        width: "100%",
        maxWidth: 440,
      }}>
        {DISPATCH_SUGGESTIONS.map(text => (
          <button
            key={text}
            onClick={() => window.dispatchEvent(new CustomEvent("studio:suggest", { detail: { text } }))}
            style={{
              fontSize: 12.5,
              color: "var(--text-dimmer)",
              padding: "9px 14px",
              border: "0.5px solid var(--border-dim)",
              borderRadius: 7,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              transition: "all 0.12s",
              background: "transparent",
              fontFamily: "var(--font-ui)",
              textAlign: "left",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget;
              el.style.borderColor = "var(--border)";
              el.style.color = "var(--text-dim)";
              el.style.background = "var(--bg-2)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget;
              el.style.borderColor = "var(--border-dim)";
              el.style.color = "var(--text-dimmer)";
              el.style.background = "transparent";
            }}
          >
            <span style={{ color: "var(--text-dimmer)", fontFamily: "var(--font)", fontSize: 11, flexShrink: 0 }}>→</span>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResumedDivider({ timestamp }: { timestamp: number }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "8px 0",
      userSelect: "none",
    }}>
      <div style={{ flex: 1, height: 1, background: "var(--border-dim)" }} />
      <span style={{
        fontSize: 10,
        color: "var(--text-dimmer)",
        fontFamily: "var(--font)",
        letterSpacing: "0.05em",
        whiteSpace: "nowrap",
      }}>
        Resumed session {"\u00b7"} {new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--border-dim)" }} />
    </div>
  );
}

const STREAMING_ID = "__streaming__";
const RESUME_DIVIDER_ID = "__resume_divider__";

type VirtualItem =
  | Message
  | { id: typeof STREAMING_ID; role: "assistant" }
  | { id: typeof RESUME_DIVIDER_ID; role: "divider"; timestamp: number };

function isLastWithRole(msgs: Message[], role: Message["role"], id: string): boolean {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === role) return msgs[i].id === id;
  }
  return false;
}

export default function ChatMessages({ sessionId, streamText, streaming, streamingState, modelLabel = "Sonnet 4.6", planMode = false }: ChatMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [failedMsgId, setFailedMsgId] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const prevScrollTop = useRef(0);

  const streamStartTime = useRef<number | null>(null);
  const [lastResponseTime, setLastResponseTime] = useState<number | null>(null);
  const lastResponseMsgId = useRef<string | null>(null);

  const resumedAtCount = useRef<number>(0);
  const resumeTimestamp = useRef<number>(0);

  const loadMessages = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetchApi(`/api/sessions/${id}`);
      const data = await res.json() as { messages: Message[] };
      const msgs = data.messages ?? [];
      if (msgs.length > 0) {
        resumedAtCount.current = msgs.length;
        resumeTimestamp.current = Date.now();
      } else {
        resumedAtCount.current = 0;
        resumeTimestamp.current = 0;
      }
      setMessages(msgs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionId) {
      void loadMessages(sessionId);
    } else {
      setMessages([]);
    }
  }, [sessionId, loadMessages]);

  useEffect(() => {
    if (!streaming) {
      if (sessionId) void loadMessages(sessionId);
    }
  }, [streaming, sessionId, loadMessages]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ lastUserMessage?: string }>).detail;
      if (messages.length > 0) {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === "assistant") {
            setFailedMsgId(messages[i].id);
            break;
          }
        }
      }
      if (detail?.lastUserMessage && messages.every(m => m.role === "user")) {
        setFailedMsgId("__last_user__");
      }
    };
    window.addEventListener("studio:stream-failed", handler);
    return () => window.removeEventListener("studio:stream-failed", handler);
  }, [messages]);

  useEffect(() => {
    if (streaming) setFailedMsgId(null);
  }, [streaming]);

  useEffect(() => {
    if (streaming) {
      streamStartTime.current = Date.now();
      setLastResponseTime(null);
      lastResponseMsgId.current = null;
    } else if (streamStartTime.current != null) {
      const elapsed = Date.now() - streamStartTime.current;
      setLastResponseTime(elapsed);
      streamStartTime.current = null;
    }
  }, [streaming]);

  useEffect(() => {
    if (lastResponseTime != null && lastResponseMsgId.current == null && messages.length > 0) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant") {
          lastResponseMsgId.current = messages[i].id;
          break;
        }
      }
    }
  }, [messages, lastResponseTime]);

  const findLastUserMessage = useCallback((): string | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].content;
    }
    return null;
  }, [messages]);

  const handleRetry = useCallback(() => {
    const text = findLastUserMessage();
    if (!text) return;
    setFailedMsgId(null);
    window.dispatchEvent(new CustomEvent("studio:retry-message", { detail: { text } }));
  }, [findLastUserMessage]);

  const showResumeDivider = resumedAtCount.current > 0 && messages.length > resumedAtCount.current;
  const items: VirtualItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    items.push(messages[i]);
    if (showResumeDivider && i === resumedAtCount.current - 1) {
      items.push({ id: RESUME_DIVIDER_ID, role: "divider", timestamp: resumeTimestamp.current });
    }
  }
  if (streaming) {
    if (resumedAtCount.current > 0 && messages.length === resumedAtCount.current) {
      items.push({ id: RESUME_DIVIDER_ID, role: "divider", timestamp: resumeTimestamp.current });
    }
    items.push({ id: STREAMING_ID, role: "assistant" as const });
  }

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 5,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  useEffect(() => {
    if (items.length === 0) return;
    if (userScrolledUp.current) return;
    const el = parentRef.current;
    if (!el) return;
    if (streaming) {
      el.scrollTop = el.scrollHeight;
    } else {
      virtualizer.scrollToIndex(items.length - 1, { align: "end" });
    }
  }, [items.length, streamText, streamingState]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const handleScroll = () => {
      const scrollingUp = el.scrollTop < prevScrollTop.current;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (scrollingUp) userScrolledUp.current = true;
      if (nearBottom) userScrolledUp.current = false;
      setShowScrollBtn(userScrolledUp.current);
      prevScrollTop.current = el.scrollTop;
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToEnd = useCallback(() => {
    userScrolledUp.current = false;
    setShowScrollBtn(false);
    virtualizer.scrollToIndex(items.length - 1, { behavior: "smooth" });
  }, [virtualizer, items.length]);

  const handleMessageContextMenu = useCallback((e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      position: { x: e.clientX, y: e.clientY },
      items: msg.role === "user" ? buildUserMenuItems(msg) : buildAssistantMenuItems(msg, messages),
    });
  }, [messages]);

  if (loading && messages.length === 0) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--text-dimmer)", fontSize: "11px", fontFamily: "var(--font)",
      }}>
        loading...
      </div>
    );
  }

  if (!sessionId || (messages.length === 0 && !streaming)) {
    return <EmptyState modelLabel={modelLabel} />;
  }

  return (
    <div
      ref={parentRef}
      style={{ flex: 1, overflow: "auto", fontFamily: "var(--font)", position: "relative" }}
    >
      <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
        {virtualizer.getVirtualItems().map((vrow) => {
          const item = items[vrow.index];
          return (
            <div
              key={vrow.key}
              data-index={vrow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vrow.start}px)`,
              }}
            >
              <div style={{
                maxWidth: 900,
                margin: "0 auto",
                padding: vrow.index === 0 ? "20px 24px 14px" : "0 24px 20px",
              }}>
                {item.id === RESUME_DIVIDER_ID ? (
                  <ResumedDivider timestamp={(item as { timestamp: number }).timestamp} />
                ) : item.id === STREAMING_ID ? (
                  <StreamingBubble state={streamingState} legacyText={streamText} streamStartTime={streamStartTime.current ?? undefined} />
                ) : (() => {
                  const msg = item as Message;
                  return (
                    <MessageBubble
                      msg={msg}
                      showPlanGate={planMode && !streaming && msg.role === "assistant" && isLastWithRole(messages, "assistant", msg.id)}
                      onContextMenu={(e) => handleMessageContextMenu(e, msg)}
                      showRetry={!streaming && failedMsgId != null && failedMsgId !== "__last_user__" && msg.role === "assistant" && isLastWithRole(messages, "assistant", msg.id)}
                      showUserRetry={!streaming && failedMsgId === "__last_user__" && msg.role === "user" && isLastWithRole(messages, "user", msg.id)}
                      onRetry={handleRetry}
                      responseTime={lastResponseTime != null && lastResponseMsgId.current === msg.id ? lastResponseTime : undefined}
                    />
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      <ScrollToBottom visible={showScrollBtn} onClick={scrollToEnd} />

      <ContextMenu
        items={ctxMenu?.items ?? []}
        position={ctxMenu?.position ?? null}
        onClose={() => setCtxMenu(null)}
      />

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
        @keyframes cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, "").replace(/```/g, ""))
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "- ");
}

function buildUserMenuItems(msg: Message): ContextMenuItem[] {
  return [
    {
      label: "Copy Text",
      onClick: () => {
        void navigator.clipboard.writeText(msg.content);
      },
    },
  ];
}

function buildAssistantMenuItems(msg: Message, messages: Message[]): ContextMenuItem[] {
  const msgIndex = messages.findIndex((m) => m.id === msg.id);
  let lastUserMsg: Message | undefined;
  for (let i = msgIndex - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserMsg = messages[i];
      break;
    }
  }

  const items: ContextMenuItem[] = [
    {
      label: "Copy Text",
      onClick: () => {
        void navigator.clipboard.writeText(stripMarkdown(msg.content));
      },
    },
    {
      label: "Copy as Markdown",
      onClick: () => {
        void navigator.clipboard.writeText(msg.content);
      },
    },
  ];

  if (lastUserMsg) {
    items.push({ label: "", onClick: () => {}, separator: true });
    items.push({
      label: "Retry",
      onClick: () => {
        window.dispatchEvent(
          new CustomEvent("studio:suggest", { detail: { text: lastUserMsg.content } })
        );
      },
    });
  }

  return items;
}
