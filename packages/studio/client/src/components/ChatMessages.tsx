import { useState, useEffect, useRef, useCallback } from "react";

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
      width: "24px", height: "24px",
      background: isUser ? "var(--bg-3)" : "var(--accent-bg)",
      border: `1px solid ${isUser ? "var(--border)" : "var(--accent)"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "8px", color: isUser ? "var(--text-dim)" : "var(--accent)",
      flexShrink: 0, fontFamily: "var(--font)", letterSpacing: "0.05em",
      fontWeight: 700,
    }}>
      {isUser ? "YOU" : "AI"}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex", gap: "10px", alignItems: "flex-start",
      flexDirection: isUser ? "row-reverse" : "row",
    }}>
      <AvatarBadge role={msg.role} />
      <div style={{ flex: 1, maxWidth: "85%" }}>
        {isUser ? (
          <div style={{
            background: "var(--bg-3)", border: "1px solid var(--border)",
            padding: "7px 10px", fontSize: "12px", color: "var(--text)",
            lineHeight: "1.6", whiteSpace: "pre-wrap", fontFamily: "var(--font)",
          }}>
            {msg.content}
          </div>
        ) : (
          <div style={{ fontSize: "12px", color: "var(--text)", lineHeight: "1.6", fontFamily: "var(--font)" }}>
            <AssistantContent text={msg.content} />
          </div>
        )}
        <div style={{
          marginTop: "3px", fontSize: "10px", color: "var(--text-dimmer)",
          display: "flex", gap: "8px", justifyContent: isUser ? "flex-end" : "flex-start",
        }}>
          <span>{fmtTime(msg.created_at)}</span>
          {msg.output_tokens != null && msg.output_tokens > 0 && (
            <span>{fmtTokens(msg.output_tokens)} tok</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatMessages({ sessionId, streamText, streaming }: ChatMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);

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
        justifyContent: "center", color: "var(--text-dimmer)", fontSize: "12px",
        gap: "10px",
      }}>
        <div style={{ fontSize: "22px", color: "var(--accent-dim)" }}>◌</div>
        <div>Ask Claude anything about your codebase.</div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1, overflow: "auto", padding: "16px 20px",
      display: "flex", flexDirection: "column", gap: "16px",
      fontFamily: "var(--font)",
    }}>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} msg={msg} />
      ))}

      {streaming && (
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <AvatarBadge role="assistant" />
          <div style={{ flex: 1, paddingTop: "2px" }}>
            {streamText ? (
              <div style={{ fontSize: "12px", color: "var(--text)", lineHeight: "1.6", fontFamily: "var(--font)" }}>
                <AssistantContent text={streamText} />
              </div>
            ) : (
              <div style={{ display: "flex", gap: "4px", alignItems: "center", paddingTop: "6px" }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{
                    width: "5px", height: "5px",
                    background: "var(--accent)",
                    borderRadius: "50%",
                    animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            )}
            {streamText && (
              <span style={{
                display: "inline-block", width: "7px", height: "13px",
                background: "var(--accent)", verticalAlign: "text-bottom",
                marginLeft: "2px", animation: "cursor-blink 1s step-end infinite",
              }} />
            )}
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
        @keyframes cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
