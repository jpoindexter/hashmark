import { useState, useEffect, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ThinkingBlock from "./chat/ThinkingBlock";
import ContextMenu, { type ContextMenuItem } from "./shared/ContextMenu";
import ScrollToBottom from "./shared/ScrollToBottom";

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

function UserBubble({ msg, onContextMenu }: { msg: Message; onContextMenu: (e: React.MouseEvent) => void }) {
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

function AssistantBubble({ msg, onContextMenu }: { msg: Message; onContextMenu: (e: React.MouseEvent) => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={onContextMenu}
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

function PlanReviewGate() {
  const dispatch = (event: string) => window.dispatchEvent(new CustomEvent(event));

  return (
    <div style={{
      display: "flex",
      gap: 8,
      padding: "8px 0",
      marginTop: 8,
      borderTop: "1px solid var(--border-dim)",
    }}>
      <button
        onClick={() => dispatch("studio:plan-approve")}
        style={{
          padding: "4px 12px",
          fontSize: 12,
          fontWeight: 600,
          background: "var(--accent)",
          color: "var(--bg)",
          border: "none",
          borderRadius: "var(--radius)",
          cursor: "pointer",
          fontFamily: "var(--font-ui)",
        }}
      >
        Approve & Execute
      </button>
      <button
        onClick={() => dispatch("studio:plan-feedback")}
        style={{
          padding: "4px 12px",
          fontSize: 12,
          background: "var(--bg-3)",
          color: "var(--text-dim)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          cursor: "pointer",
          fontFamily: "var(--font-ui)",
        }}
      >
        Give Feedback
      </button>
      <button
        onClick={() => dispatch("studio:plan-deny")}
        style={{
          padding: "4px 12px",
          fontSize: 12,
          background: "none",
          color: "var(--red)",
          border: "1px solid var(--red-bg)",
          borderRadius: "var(--radius)",
          cursor: "pointer",
          fontFamily: "var(--font-ui)",
        }}
      >
        Deny
      </button>
    </div>
  );
}

function MessageBubble({ msg, showPlanGate, onContextMenu }: { msg: Message; showPlanGate: boolean; onContextMenu: (e: React.MouseEvent) => void }) {
  if (msg.role === "user") return <UserBubble msg={msg} onContextMenu={onContextMenu} />;
  return (
    <div>
      <AssistantBubble msg={msg} onContextMenu={onContextMenu} />
      {showPlanGate && <PlanReviewGate />}
    </div>
  );
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

function ActionCard({ icon, label, action }: { icon: string; label: string; action: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={action}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: 16,
        background: hovered ? "var(--bg-3)" : "var(--bg-2)",
        border: `1px solid ${hovered ? "var(--border)" : "var(--border-dim)"}`,
        borderRadius: "var(--radius-lg)",
        cursor: "pointer",
        gap: 8,
        transition: "border-color 0.1s, background 0.1s",
      }}
    >
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontSize: 13, color: "var(--text)", fontFamily: "var(--font-ui)" }}>{label}</span>
    </button>
  );
}

const ACTION_CARDS = [
  { icon: "\u{1F4C2}", label: "Open project", route: "/setup" },
  { icon: "\u26A1", label: "Scan codebase", route: "/generate" },
  { icon: "\u{1F916}", label: "View agents", route: "/agents" },
] as const;

function EmptyState({ modelLabel }: { modelLabel: string }) {
  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 40,
      maxWidth: 600,
      margin: "0 auto",
    }}>
      {/* Logo */}
      <div style={{
        fontSize: 48,
        fontWeight: 900,
        color: "var(--accent)",
        marginBottom: 8,
        fontFamily: "var(--font)",
      }}>
        #
      </div>
      <div style={{
        fontSize: 16,
        fontWeight: 600,
        color: "var(--text)",
        fontFamily: "var(--font-ui)",
        marginBottom: 4,
      }}>
        hashmark studio
      </div>
      <div style={{
        fontSize: 12,
        color: "var(--text-dimmer)",
        fontFamily: "var(--font-ui)",
        marginBottom: 32,
      }}>
        {modelLabel}
      </div>

      {/* Action cards - 3 columns */}
      <div style={{ display: "flex", gap: 12, marginBottom: 32, width: "100%" }}>
        {ACTION_CARDS.map((card) => (
          <ActionCard
            key={card.label}
            icon={card.icon}
            label={card.label}
            action={() => window.dispatchEvent(new CustomEvent("studio:navigate", { detail: card.route }))}
          />
        ))}
      </div>

      {/* Suggestions */}
      <div style={{ width: "100%" }}>
        <div style={{
          fontSize: 10,
          color: "var(--text-dimmer)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 8,
        }}>
          SUGGESTED
        </div>
        {SUGGESTIONS.map((text) => (
          <SuggestionItem key={text} text={text} />
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

// Sentinel IDs for virtual list rows
const STREAMING_ID = "__streaming__";
const RESUME_DIVIDER_ID = "__resume_divider__";

type VirtualItem =
  | Message
  | { id: typeof STREAMING_ID; role: "assistant" }
  | { id: typeof RESUME_DIVIDER_ID; role: "divider"; timestamp: number };

// Check if a message is the last assistant message in the list
function isLastAssistantMessage(msgs: Message[], id: string): boolean {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "assistant") return msgs[i].id === id;
  }
  return false;
}

export default function ChatMessages({ sessionId, streamText, streaming, streamingState, modelLabel = "Sonnet 4.6", planMode = false }: ChatMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const prevScrollTop = useRef(0);

  // Track the count of messages loaded on initial fetch to detect resumed sessions
  const resumedAtCount = useRef<number>(0);
  const resumeTimestamp = useRef<number>(0);

  const loadMessages = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${id}`);
      const data = await res.json() as { messages: Message[] };
      const msgs = data.messages ?? [];
      // If session has existing messages, mark as resumed
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

  // Build virtual list items, injecting a resume divider when a session with
  // prior history receives new messages (streaming or completed new turns).
  const showResumeDivider = resumedAtCount.current > 0 && messages.length > resumedAtCount.current;
  const items: VirtualItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    items.push(messages[i]);
    if (showResumeDivider && i === resumedAtCount.current - 1) {
      items.push({ id: RESUME_DIVIDER_ID, role: "divider", timestamp: resumeTimestamp.current });
    }
  }
  if (streaming) {
    // Show divider before first streaming message if session was resumed and no new
    // persisted messages exist yet
    if (resumedAtCount.current > 0 && messages.length === resumedAtCount.current) {
      items.push({ id: RESUME_DIVIDER_ID, role: "divider", timestamp: resumeTimestamp.current });
    }
    items.push({ id: STREAMING_ID, role: "assistant" as const });
  }

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

  // Detect manual scroll-up to suppress auto-scroll + drive ScrollToBottom visibility
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
                  <StreamingBubble state={streamingState} legacyText={streamText} />
                ) : (
                  <MessageBubble
                    msg={item as Message}
                    showPlanGate={
                      planMode &&
                      !streaming &&
                      (item as Message).role === "assistant" &&
                      isLastAssistantMessage(messages, (item as Message).id)
                    }
                    onContextMenu={(e) => handleMessageContextMenu(e, item as Message)}
                  />
                )}
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

// Strip markdown syntax for plain-text copy
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, "").replace(/```/g, ""))
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "- ");
}

// Context menu item builders for chat messages
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
  // Find the last user message before this assistant message for retry
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
