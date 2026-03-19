import { useState, useEffect, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ThinkingBlock from "./chat/ThinkingBlock";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
}

// Mixed content blocks for in-progress streaming messages
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

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div style={{
      position: "relative",
      background: "var(--bg-3)",
      border: "1px solid var(--border-dim)",
      margin: "8px 0",
      overflow: "hidden",
    }}>
      {lang && (
        <div style={{
          position: "absolute",
          top: 6,
          right: 8,
          fontSize: "9px",
          fontFamily: "var(--font)",
          color: "var(--accent)",
          background: "var(--bg-4)",
          border: "1px solid var(--border-dim)",
          padding: "1px 6px",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          userSelect: "none",
        }}>
          {lang}
        </div>
      )}
      <pre style={{
        padding: lang ? "28px 12px 10px" : "10px 12px",
        overflow: "auto",
        fontSize: "11px",
        lineHeight: "1.5",
        margin: 0,
      }}>
        <code style={{ color: "var(--text)", fontFamily: "var(--font)" }}>{code}</code>
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

// Returns the border-left color and label color for a given tool name
function toolAccentColor(tool: string): string {
  const name = tool.toLowerCase();
  if (["write", "edit", "create", "multiedit"].includes(name)) return "var(--accent)";
  if (["bash", "shell"].includes(name)) return "var(--yellow)";
  if (["read", "glob", "grep"].includes(name)) return "var(--blue)";
  return "var(--text-dimmer)";
}

// Extract the primary argument string from a tool input
function primaryArg(tool: string, input: Record<string, unknown>): string {
  const name = tool.toLowerCase();
  if (name === "bash" || name === "shell") {
    const cmd = input.command ?? input.cmd ?? "";
    return String(cmd);
  }
  if (name === "read") return String(input.file_path ?? input.path ?? "");
  if (name === "glob") return String(input.pattern ?? "");
  if (name === "grep") return String(input.pattern ?? "");
  // Write / Edit / Create / MultiEdit
  const path = input.file_path ?? input.path ?? input.new_file_path ?? "";
  if (path) return String(path);
  // Fallback: first string value
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

function CostLine({ cost, usage }: { cost?: number; usage?: { input_tokens: number; output_tokens: number } }) {
  if (!cost && !usage) return null;
  const parts: string[] = [];
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

function UserBubble({ msg }: { msg: Message }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, maxWidth: "80%" }}>
        <div style={{ flex: 1 }}>
          <div style={{
            background: "var(--bg-4)",
            border: "1px solid var(--border)",
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
        {/* Avatar */}
        <div style={{
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
        }}>
          U
        </div>
      </div>
      <div style={{
        fontSize: 10,
        color: "var(--text-dimmer)",
        marginTop: 3,
        marginRight: 30,
        opacity: hovered ? 1 : 0,
        transition: "opacity 0.15s",
        userSelect: "none",
      }}>
        {fmtTime(msg.created_at)}
      </div>
    </div>
  );
}

function AssistantBubble({ msg }: { msg: Message }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        borderLeft: "2px solid var(--accent)",
        paddingLeft: 12,
        fontSize: 13,
        color: "var(--text)",
        lineHeight: 1.6,
        fontFamily: "var(--font-ui)",
        animation: "fadeIn 0.2s ease forwards",
      }}>
        <AssistantContent text={msg.content} />
      </div>
      <div style={{
        display: "flex",
        gap: 8,
        fontSize: 10,
        color: "var(--text-dimmer)",
        marginTop: 3,
        paddingLeft: 14,
        opacity: hovered ? 1 : 0,
        transition: "opacity 0.15s",
        userSelect: "none",
      }}>
        <span>{fmtTime(msg.created_at)}</span>
        {msg.output_tokens != null && msg.output_tokens > 0 && (
          <span>{fmtTokens(msg.output_tokens)} tok</span>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === "user") return <UserBubble msg={msg} />;
  return <AssistantBubble msg={msg} />;
}

function StreamingBubble({ state, legacyText }: { state?: StreamingState; legacyText: string }) {
  // If we have rich streaming state, render mixed blocks
  const hasBlocks = state && state.blocks.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <div style={{
        borderLeft: "2px solid var(--accent)",
        paddingLeft: 12,
        fontSize: 13,
        color: "var(--text)",
        lineHeight: 1.6,
        fontFamily: "var(--font-ui)",
        width: "100%",
      }}>
        {hasBlocks ? (
          <>
            {state.blocks.map((block, i) => {
              if (block.type === "text") {
                return block.text ? (
                  <AssistantContent key={i} text={block.text} />
                ) : null;
              }
              if (block.type === "tool_use") {
                return <ToolUseBlock key={i} block={block} />;
              }
              if (block.type === "progress") {
                return (
                  <div key={i} style={{
                    fontSize: 11,
                    color: "var(--text-dimmer)",
                    fontFamily: "var(--font)",
                    margin: "2px 0",
                    fontStyle: "italic",
                  }}>
                    {block.text}
                  </div>
                );
              }
              if (block.type === "thinking") {
                return <ThinkingBlock key={i} content={block.content} id={block.id ?? String(i)} />;
              }
              return null;
            })}
            {/* Blinking cursor after last block */}
            <span style={{
              display: "inline-block",
              width: 7,
              height: 13,
              background: "var(--accent)",
              verticalAlign: "text-bottom",
              marginLeft: 2,
              animation: "cursor-blink 1s step-end infinite",
            }} />
          </>
        ) : legacyText ? (
          <>
            <AssistantContent text={legacyText} />
            <span style={{
              display: "inline-block",
              width: 7,
              height: 13,
              background: "var(--accent)",
              verticalAlign: "text-bottom",
              marginLeft: 2,
              animation: "cursor-blink 1s step-end infinite",
            }} />
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

      {/* Cost/usage from done event */}
      {state && (state.cost != null || state.usage != null) ? (
        <CostLine cost={state.cost} usage={state.usage} />
      ) : (
        <div style={{ fontSize: 10, color: "var(--text-dimmer)", marginTop: 3, paddingLeft: 14, userSelect: "none" }}>
          typing...
        </div>
      )}
    </div>
  );
}

const SUGGESTIONS = [
  "Explain the architecture of this project",
  "Review recent changes for issues",
  "Write tests for the main module",
  "Commit staged changes with a message",
];

function SuggestionItem({ text }: { text: string }) {
  const [hovered, setHovered] = useState(false);

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent("studio:suggest", { detail: { text } }));
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: "var(--radius)",
        background: hovered ? "var(--bg-2)" : "transparent",
        cursor: "pointer",
        transition: "background 0.1s",
        fontSize: 12,
        fontFamily: "var(--font)",
        userSelect: "none",
      }}
    >
      <span style={{ color: "var(--accent)", flexShrink: 0 }}>&gt;</span>
      <span style={{ color: "var(--text-dim)" }}>{text}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
    }}>
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0,
      }}>
        <div style={{
          fontSize: 11,
          color: "var(--text-dimmer)",
          fontFamily: "var(--font)",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}>
          <span>✦</span>
          <span>Sonnet 4.6</span>
        </div>

        <div style={{
          fontSize: 13,
          color: "var(--text-dim)",
          fontFamily: "var(--font-ui)",
          textAlign: "center",
          lineHeight: 1.6,
          marginBottom: 16,
        }}>
          Ask me to build, fix, or explain anything.
          <br />
          I can read and edit files, run commands,
          <br />
          and work through complex tasks.
        </div>

        <div style={{
          width: 240,
          height: 1,
          background: "var(--border-dim)",
          margin: "16px auto",
        }} />

        <div style={{ width: 240 }}>
          <div style={{
            fontSize: 10,
            color: "var(--text-dimmer)",
            fontFamily: "var(--font)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 8,
            paddingLeft: 10,
          }}>
            Suggested
          </div>
          {SUGGESTIONS.map((text) => (
            <SuggestionItem key={text} text={text} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Sentinel ID for the streaming row
const STREAMING_ID = "__streaming__";

type VirtualItem = Message | { id: typeof STREAMING_ID; role: "assistant" };

export default function ChatMessages({ sessionId, streamText, streaming, streamingState }: ChatMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const prevScrollTop = useRef(0);

  const loadMessages = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${id}`);
      const data = await res.json() as { messages: Message[] };
      setMessages(data.messages ?? []);
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

  const items: VirtualItem[] = streaming
    ? [...messages, { id: STREAMING_ID, role: "assistant" as const }]
    : messages;

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 90,
    overscan: 5,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  // Smooth scroll to bottom on new messages / stream updates
  useEffect(() => {
    if (items.length === 0) return;
    if (!userScrolledUp.current) {
      virtualizer.scrollToIndex(items.length - 1, { behavior: "smooth" });
    }
  }, [items.length, streamText, streamingState]);

  // Detect manual scroll-up to suppress auto-scroll
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const handleScroll = () => {
      const scrollingUp = el.scrollTop < prevScrollTop.current;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (scrollingUp) userScrolledUp.current = true;
      if (nearBottom) userScrolledUp.current = false;
      prevScrollTop.current = el.scrollTop;
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

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
    return <EmptyState />;
  }

  return (
    <div
      ref={parentRef}
      style={{ flex: 1, overflow: "auto", fontFamily: "var(--font)" }}
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
                maxWidth: 760,
                margin: "0 auto",
                padding: vrow.index === 0 ? "20px 24px 14px" : "0 24px 20px",
              }}>
                {item.id === STREAMING_ID ? (
                  <StreamingBubble state={streamingState} legacyText={streamText} />
                ) : (
                  <MessageBubble msg={item as Message} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
        @keyframes cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
