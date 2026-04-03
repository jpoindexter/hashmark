import { useState, useEffect, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EmptyState, ResumedDivider } from "./chat/ChatEmptyState";
import MessageBubble, { ASSISTANT_CONTENT_STYLE, fmtDuration, type Message } from "./chat/MessageBubbles";
import ContextMenu, { type ContextMenuItem } from "./shared/ContextMenu";
import { useTextMeasure } from "../hooks/useTextMeasure";
import ScrollToBottom from "./shared/ScrollToBottom";
import { fetchApi } from "../lib/api";
import StreamingBubble from "./chat/StreamingBubble";
import { buildUserMenuItems, buildAssistantMenuItems } from "./chat/chatMenuItems";
export { AssistantContent } from "./chat/AssistantContent";

export { ASSISTANT_CONTENT_STYLE, fmtDuration };

interface ContextMenuState {
  items: ContextMenuItem[];
  position: { x: number; y: number };
}

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlockData {
  type: "tool_use";
  tool: string;
  input: Record<string, unknown>;
  toolUseId?: string;
}

export interface ToolResultBlockData {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
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

export type ContentBlock = TextBlock | ToolUseBlockData | ToolResultBlockData | ProgressBlock | ThinkingBlockData;

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
  projectInfo?: { projectName: string; projectDir: string };
  gitStatus?: { branch: string; files: { status: string }[] };
  onNewSession?: () => void;
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

export default function ChatMessages({ sessionId, streamText, streaming, streamingState, modelLabel = "Sonnet 4.6", planMode = false, projectInfo, gitStatus, onNewSession }: ChatMessagesProps) {
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

  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (streaming) {
      wasStreamingRef.current = true;
    } else if (wasStreamingRef.current) {
      wasStreamingRef.current = false;
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
    font: '14px -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
    lineHeight: 22.4, // 14px * 1.6
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
        color: "var(--text-dimmer)", fontSize: "11px",
      }}>
        loading...
      </div>
    );
  }

  if (!sessionId || (messages.length === 0 && !streaming)) {
    return <EmptyState modelLabel={modelLabel} projectInfo={projectInfo} gitStatus={gitStatus} onNewSession={onNewSession} />;
  }

  return (
    <div
      ref={parentRef}
      style={{ flex: 1, overflow: "auto", position: "relative" }}
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
              className="msg-offscreen"
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
                padding: vrow.index === 0 ? "16px 20px 10px" : "0 20px 14px",
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
