import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ThinkingBlock from "./chat/ThinkingBlock";
import ToolCallSummary, { FileBadge, getReadFilePath, categorize } from "./chat/ToolSummary";
import { CodeBlock } from "./chat/CodeRendering";
import { EmptyState, ResumedDivider } from "./chat/ChatEmptyState";
import MessageBubble, { ASSISTANT_CONTENT_STYLE, fmtDuration, type Message } from "./chat/MessageBubbles";
import ContextMenu, { type ContextMenuItem } from "./shared/ContextMenu";
import { useTextMeasure } from "../hooks/useTextMeasure";
import ScrollToBottom from "./shared/ScrollToBottom";
import { fetchApi } from "../lib/api";
import { fmtTime, fmtTokens } from "../lib/format";
import { renderInline } from "../lib/markdown";

const CURSOR_STYLE: React.CSSProperties = {
  display: "inline-block",
  width: 7,
  height: 13,
  background: "var(--accent)",
  verticalAlign: "text-bottom",
  marginLeft: 2,
  animation: "cursor-blink 1s step-end infinite",
};

// Code rendering extracted to ./chat/CodeRendering.tsx

interface ContextMenuState {
  items: ContextMenuItem[];
  position: { x: number; y: number };
}

// Message type re-exported from ./chat/MessageBubbles

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

export const AssistantContent = memo(function AssistantContent({ text }: { text: string }) {
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
      nodes.push(<h4 key={key++} style={{ color: "var(--text)", fontSize: "12px", fontWeight: 600, margin: "12px 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{line.slice(4)}</h4>);
      i++; continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(<h3 key={key++} style={{ color: "var(--text)", fontSize: "13px", fontWeight: 600, margin: "12px 0 4px" }}>{line.slice(3)}</h3>);
      i++; continue;
    }
    if (line.startsWith("# ")) {
      nodes.push(<h2 key={key++} style={{ color: "var(--accent)", fontSize: "14px", fontWeight: 600, margin: "12px 0 6px" }}>{line.slice(2)}</h2>);
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
});

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
      <span style={{ color: accent, fontWeight: 600, flexShrink: 0 }}>[{block.tool}]</span>
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

// Empty state & ResumedDivider extracted to ./chat/ChatEmptyState.tsx


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
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
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
      const res = await fetchApi(`/api/sessions/${id}?limit=50`);
      const data = await res.json() as { messages: Message[]; hasMore: boolean };
      const msgs = data.messages ?? [];
      if (msgs.length > 0) {
        resumedAtCount.current = msgs.length;
        resumeTimestamp.current = Date.now();
      } else {
        resumedAtCount.current = 0;
        resumeTimestamp.current = 0;
      }
      setMessages(msgs);
      setHasMore(data.hasMore ?? false);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEarlier = useCallback(async () => {
    if (!sessionId || messages.length === 0 || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const firstId = messages[0].id;
      const res = await fetchApi(`/api/sessions/${sessionId}?before=${firstId}&limit=50`);
      const data = await res.json() as { messages: Message[]; hasMore: boolean };
      const older = data.messages ?? [];
      if (older.length === 0) {
        setHasMore(false);
        return;
      }
      const scrollEl = parentRef.current;
      const prevScrollTop = scrollEl?.scrollTop ?? 0;
      resumedAtCount.current += older.length;
      setMessages(prev => [...older, ...prev]);
      setHasMore(data.hasMore ?? false);
      if (scrollEl) {
        requestAnimationFrame(() => {
          scrollEl.scrollTop = prevScrollTop + older.length * 200;
        });
      }
    } finally {
      setLoadingEarlier(false);
    }
  }, [sessionId, messages, loadingEarlier]);

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

  // Pretext-powered height estimation -- avoids DOM reflow for initial sizing
  const { estimateHeight, updateWidth } = useTextMeasure({
    font: '13px "JetBrains Mono Variable", "JetBrains Mono", monospace',
    lineHeight: 20.8, // 13px * 1.6
    basePadding: 24,   // top + bottom padding on message bubbles
  });

  // Track container width for accurate text measurement
  useEffect(() => { updateWidth(parentRef.current); }, [updateWidth]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = items[index];
      if (!item) return 200;
      if (item.id === STREAMING_ID) return 200; // streaming bubble changes constantly
      if (item.id === RESUME_DIVIDER_ID) return 40;
      const msg = item as Message;
      return estimateHeight(msg.content, msg.role);
    },
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
      {hasMore && (
        <div style={{ padding: "8px 24px", textAlign: "center" }}>
          <button
            onClick={() => void loadEarlier()}
            disabled={loadingEarlier}
            style={{
              fontSize: "11px",
              fontFamily: "var(--font)",
              color: "var(--text-dim)",
              background: "transparent",
              border: "1px solid var(--border-dim)",
              padding: "4px 12px",
              cursor: loadingEarlier ? "default" : "pointer",
              opacity: loadingEarlier ? 0.5 : 1,
            }}
          >
            {loadingEarlier ? "loading..." : "load earlier messages"}
          </button>
        </div>
      )}
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
