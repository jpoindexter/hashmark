import { useState, useEffect, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
}

interface ChatMessagesProps {
  sessionId: string | null;
  streamText: string;
  streaming: boolean;
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

function AssistantContent({ text }: { text: string }) {
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
      nodes.push(
        <pre key={key++} style={{
          background: "var(--bg-3)",
          border: "1px solid var(--border-dim)",
          padding: "10px 12px",
          margin: "8px 0",
          overflow: "auto",
          fontSize: "11px",
          lineHeight: "1.5",
        }}>
          {lang && <div style={{ color: "var(--text-dimmer)", fontSize: "10px", marginBottom: "6px", textTransform: "uppercase" }}>{lang}</div>}
          <code style={{ color: "var(--text)", fontFamily: "var(--font)" }}>{codeLines.join("\n")}</code>
        </pre>
      );
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

function AvatarBadge({ role }: { role: "user" | "assistant" }) {
  const isUser = role === "user";
  return (
    <div style={{
      width: 28, height: 28, borderRadius: "50%",
      background: isUser ? "var(--bg-4)" : "var(--accent-bg)",
      border: `1px solid ${isUser ? "var(--border)" : "var(--accent-border)"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 10, color: isUser ? "var(--text-dim)" : "var(--accent)",
      flexShrink: 0, fontFamily: "var(--font)", letterSpacing: "0.05em",
      fontWeight: 700,
    }}>
      {isUser ? "U" : "✸"}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex", gap: 10, alignItems: "flex-start",
      animation: "fadeIn 0.2s ease forwards",
    }}>
      <AvatarBadge role={msg.role} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4,
        }}>
          <span style={{
            fontSize: 12, fontWeight: 600,
            color: isUser ? "var(--text-dim)" : "var(--accent)",
          }}>
            {isUser ? "You" : "Claude"}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-dimmer)" }}>
            {fmtTime(msg.created_at)}
          </span>
          {msg.output_tokens != null && msg.output_tokens > 0 && (
            <span style={{ fontSize: 10, color: "var(--text-dimmer)" }}>
              {fmtTokens(msg.output_tokens)} tok
            </span>
          )}
        </div>
        {isUser ? (
          <div style={{
            fontSize: 13, color: "var(--text)", lineHeight: 1.6,
            whiteSpace: "pre-wrap", fontFamily: "var(--font-ui)",
          }}>
            {msg.content}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6, fontFamily: "var(--font-ui)" }}>
            <AssistantContent text={msg.content} />
          </div>
        )}
      </div>
    </div>
  );
}

function StreamingBubble({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <AvatarBadge role="assistant" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>Claude</span>
          <span style={{ fontSize: 10, color: "var(--text-dimmer)" }}>typing...</span>
        </div>
        {text ? (
          <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6, fontFamily: "var(--font-ui)" }}>
            <AssistantContent text={text} />
            <span style={{
              display: "inline-block", width: 7, height: 13,
              background: "var(--accent)", verticalAlign: "text-bottom",
              marginLeft: 2, animation: "cursor-blink 1s step-end infinite",
            }} />
          </div>
        ) : (
          <div style={{ display: "flex", gap: 4, alignItems: "center", paddingTop: 4 }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                width: 5, height: 5, background: "var(--accent)", borderRadius: "50%",
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Sentinel ID for the streaming row
const STREAMING_ID = "__streaming__";

type VirtualItem = Message | { id: typeof STREAMING_ID; role: "assistant" };

export default function ChatMessages({ sessionId, streamText, streaming }: ChatMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);
  // Track whether the user has manually scrolled up
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

  // Build the virtual items list: real messages + optional streaming row
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

  // Auto-scroll to bottom on new items/stream updates, unless user scrolled up
  useEffect(() => {
    if (items.length === 0) return;
    if (!userScrolledUp.current) {
      virtualizer.scrollToIndex(items.length - 1, { behavior: "smooth" });
    }
  }, [items.length, streamText]);

  // Detect manual scroll-up
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
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", color: "var(--text-dimmer)",
        gap: 12, padding: 32,
      }}>
        <div style={{ fontSize: 32, color: "var(--accent)", opacity: 0.3, lineHeight: 1 }}>✸</div>
        <div style={{ fontSize: 14, color: "var(--text-dim)", fontWeight: 500 }}>
          How can I help?
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dimmer)", textAlign: "center", maxWidth: 320, lineHeight: 1.6 }}>
          Ask about your codebase, request changes, or run /commands.
        </div>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      style={{ flex: 1, overflow: "auto", fontFamily: "var(--font)" }}
    >
      {/* Outer spacer — virtualizer's total measured height */}
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
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
                padding: vrow.index === 0 ? "20px 24px 10px" : "0 24px 20px",
              }}>
                {item.id === STREAMING_ID ? (
                  <StreamingBubble text={streamText} />
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
