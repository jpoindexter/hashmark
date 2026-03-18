import { useState, useEffect, useRef, useCallback } from "react";

interface Session {
  id: string;
  title: string;
  agent_name: string | null;
  model: string;
  status: "idle" | "streaming";
  total_input_tokens: number;
  total_output_tokens: number;
  message_count: number;
  created_at: number;
  updated_at: number;
}

interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
}

const MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtTokens(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(inputTok: number, outputTok: number, model: string) {
  const rates: Record<string, [number, number]> = {
    "claude-opus-4-6": [15, 75],
    "claude-sonnet-4-6": [3, 15],
    "claude-haiku-4-5-20251001": [0.8, 4],
  };
  const [i, o] = rates[model] ?? [3, 15];
  const cost = (inputTok * i + outputTok * o) / 1_000_000;
  if (cost < 0.01) return `<$0.01`;
  return `$${cost.toFixed(3)}`;
}

// Renderer that returns React nodes from assistant markdown text
function AssistantContent({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block start
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

    // Heading
    if (line.startsWith("### ")) {
      nodes.push(<h4 key={key++} style={{ color: "var(--text)", fontSize: "12px", fontWeight: 700, margin: "12px 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{line.slice(4)}</h4>);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(<h3 key={key++} style={{ color: "var(--text)", fontSize: "13px", fontWeight: 700, margin: "12px 0 4px" }}>{line.slice(3)}</h3>);
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      nodes.push(<h2 key={key++} style={{ color: "var(--accent)", fontSize: "14px", fontWeight: 700, margin: "12px 0 6px" }}>{line.slice(2)}</h2>);
      i++;
      continue;
    }

    // List item
    if (line.match(/^[-*] /)) {
      nodes.push(
        <div key={key++} style={{ display: "flex", gap: "8px", margin: "2px 0" }}>
          <span style={{ color: "var(--accent)", flexShrink: 0 }}>›</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
      i++;
      continue;
    }

    // Empty line
    if (!line.trim()) {
      nodes.push(<div key={key++} style={{ height: "6px" }} />);
      i++;
      continue;
    }

    // Normal paragraph line
    nodes.push(
      <div key={key++} style={{ lineHeight: "1.6" }}>
        {renderInline(line)}
      </div>
    );
    i++;
  }

  return <>{nodes}</>;
}

function renderInline(text: string): React.ReactNode {
  // Split on inline code and bold patterns
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

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [newModel, setNewModel] = useState("claude-sonnet-4-6");
  const [claudeAvailable, setClaudeAvailable] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/sessions");
    const data = await res.json() as { sessions: Session[] };
    setSessions(data.sessions ?? []);
  }, []);

  useEffect(() => {
    fetch("/api/sessions/config")
      .then((r) => r.json())
      .then((d: { claudeAvailable: boolean }) => setClaudeAvailable(d.claudeAvailable))
      .catch(() => setClaudeAvailable(false));
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);

  const loadSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/sessions/${id}`);
    const data = await res.json() as { session: Session; messages: Message[] };
    setActiveSession(data.session);
    setMessages(data.messages ?? []);
    setActiveId(id);
    setStreamText("");
  }, []);

  const createSession = async () => {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: newModel }),
    });
    const data = await res.json() as { session: Session };
    setSessions((prev) => [data.session, ...prev]);
    await loadSession(data.session.id);
  };

  const deleteSession = async (id: string) => {
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setActiveSession(null);
      setMessages([]);
    }
  };

  const sendMessage = async () => {
    if (!activeId || !input.trim() || streaming) return;
    const text = input.trim();
    setInput("");
    setStreaming(true);
    setStreamText("");

    // Optimistic user message display
    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      session_id: activeId,
      role: "user",
      content: text,
      input_tokens: null,
      output_tokens: null,
      created_at: Date.now(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    let res: Response;
    try {
      res = await fetch(`/api/sessions/${activeId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
    } catch (e) {
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`, session_id: activeId, role: "assistant",
        content: `Network error: ${e instanceof Error ? e.message : String(e)}`,
        input_tokens: null, output_tokens: null, created_at: Date.now(),
      }]);
      setStreaming(false);
      return;
    }

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ error: "Request failed" })) as { error?: string };
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`, session_id: activeId, role: "assistant",
        content: `Error: ${err.error ?? "failed"}`,
        input_tokens: null, output_tokens: null, created_at: Date.now(),
      }]);
      setStreaming(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assembled = "";

    abortRef.current = () => {
      reader.cancel().catch(() => {});
      fetch(`/api/sessions/${activeId}/interrupt`, { method: "POST" }).catch(() => {});
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const evt = JSON.parse(raw) as {
              type: string; text?: string; message?: string;
            };
            if (evt.type === "text" && evt.text) {
              assembled += evt.text;
              setStreamText(assembled);
            } else if (evt.type === "error") {
              assembled = `Error: ${evt.message ?? "unknown"}`;
              setStreamText(assembled);
            }
          } catch {}
        }
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      setStreamText("");
      await loadSession(activeId);
      await loadSessions();
    }
  };

  const interrupt = () => abortRef.current?.();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const totalCost = activeSession
    ? fmtCost(activeSession.total_input_tokens, activeSession.total_output_tokens, activeSession.model)
    : null;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", flexDirection: "column" }}>

      {/* Claude CLI warning banner */}
      {claudeAvailable === false && (
        <div style={{
          background: "var(--red-bg)",
          borderBottom: "1px solid rgba(248,81,73,0.25)",
          padding: "8px 16px",
          fontSize: "11px",
          color: "var(--text-dim)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexShrink: 0,
        }}>
          <span style={{ color: "var(--red)", fontWeight: 700 }}>✗ claude CLI not found.</span>
          Install Claude Code: <code style={{ background: "var(--bg-3)", padding: "1px 5px", borderRadius: "var(--radius-sm)" }}>npm install -g @anthropic-ai/claude-code</code>
        </div>
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

      {/* Session list */}
      <div style={{
        width: "240px",
        minWidth: "240px",
        background: "var(--bg-2)",
        borderRight: "1px solid var(--border-dim)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "12px",
          borderBottom: "1px solid var(--border-dim)",
          display: "flex",
          gap: "8px",
          alignItems: "center",
        }}>
          <select
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            style={{
              flex: 1,
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              color: "var(--text-dim)",
              padding: "4px 6px",
              fontSize: "10px",
              fontFamily: "var(--font)",
            }}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <button className="btn" onClick={() => void createSession()} style={{ padding: "4px 10px", fontSize: "10px", whiteSpace: "nowrap" }}>
            + NEW
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>
          {sessions.length === 0 && (
            <div style={{ padding: "20px 12px", color: "var(--text-dimmer)", fontSize: "11px", textAlign: "center" }}>
              No sessions yet
            </div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => void loadSession(s.id)}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                background: s.id === activeId ? "var(--accent-bg)" : "transparent",
                borderLeft: s.id === activeId ? "2px solid var(--accent)" : "2px solid transparent",
                borderBottom: "1px solid var(--border-dim)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "4px" }}>
                <div style={{
                  fontSize: "11px",
                  color: s.id === activeId ? "var(--text)" : "var(--text-dim)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}>
                  {s.title}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); void deleteSession(s.id); }}
                  style={{
                    background: "none", border: "none", color: "var(--text-dimmer)",
                    cursor: "pointer", fontSize: "14px", lineHeight: 1,
                    padding: "0 2px", flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
              <div style={{ marginTop: "4px", fontSize: "10px", color: "var(--text-dimmer)", display: "flex", gap: "8px" }}>
                <span>{s.message_count ?? 0} msgs</span>
                {s.status === "streaming" && <span style={{ color: "var(--accent)" }}>● live</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      {!activeId ? (
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-dimmer)", fontSize: "13px", flexDirection: "column", gap: "12px",
        }}>
          <div style={{ fontSize: "28px", color: "var(--accent-dim)" }}>◌</div>
          <div>Select a session or create a new one</div>
          <button className="btn" onClick={() => void createSession()} style={{ marginTop: "4px" }}>
            + NEW SESSION
          </button>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Session header */}
          <div style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--border-dim)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexShrink: 0,
            background: "var(--bg-2)",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", color: "var(--text)", fontWeight: 600 }}>
                {activeSession?.title}
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-dimmer)", marginTop: "2px", fontFamily: "var(--font)" }}>
                {activeSession?.model} · {fmtTokens(activeSession?.total_input_tokens ?? 0)} in · {fmtTokens(activeSession?.total_output_tokens ?? 0)} out · {totalCost}
              </div>
            </div>
            {streaming && (
              <button
                className="btn"
                onClick={interrupt}
                style={{
                  borderColor: "var(--red)",
                  color: "var(--red)",
                  fontSize: "10px",
                  padding: "4px 10px",
                }}
              >
                ■ STOP
              </button>
            )}
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflow: "auto", padding: "20px 16px",
            display: "flex", flexDirection: "column", gap: "20px",
          }}>
            {messages.length === 0 && !streaming && (
              <div style={{ textAlign: "center", color: "var(--text-dimmer)", fontSize: "12px", marginTop: "60px" }}>
                Start a conversation with {activeSession?.model}
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}

            {/* Streaming assistant response */}
            {streaming && (
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <AvatarBadge role="assistant" />
                <div style={{ flex: 1, paddingTop: "2px" }}>
                  {streamText ? (
                    <div style={{
                      fontSize: "12px",
                      color: "var(--text)",
                      lineHeight: "1.6",
                      fontFamily: "var(--font)",
                    }}>
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
          </div>

          {/* Input area */}
          <div style={{
            padding: "12px 16px", borderTop: "1px solid var(--border-dim)", flexShrink: 0,
          }}>
            <div style={{
              display: "flex", gap: "8px", alignItems: "flex-end",
              background: "var(--bg-2)", border: "1px solid var(--border)", padding: "8px 10px",
            }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={streaming ? "Waiting for response..." : "Message Claude  (↵ send · ⇧↵ newline)"}
                disabled={streaming}
                rows={1}
                style={{
                  flex: 1, background: "none", border: "none", outline: "none",
                  color: "var(--text)", fontSize: "12px", fontFamily: "var(--font)",
                  resize: "none", maxHeight: "140px", overflowY: "auto", lineHeight: "1.5",
                }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
                }}
              />
              <button
                className="btn"
                onClick={() => void sendMessage()}
                disabled={streaming || !input.trim()}
                style={{ padding: "5px 14px", fontSize: "11px", flexShrink: 0 }}
              >
                SEND
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
      </div>
    </div>
  );
}

function AvatarBadge({ role }: { role: "user" | "assistant" }) {
  const isUser = role === "user";
  return (
    <div style={{
      width: "28px", height: "28px",
      background: isUser ? "var(--bg-3)" : "var(--accent-bg)",
      border: `1px solid ${isUser ? "var(--border)" : "var(--accent)"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "9px", color: isUser ? "var(--text-dim)" : "var(--accent)",
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
      display: "flex", gap: "12px", alignItems: "flex-start",
      flexDirection: isUser ? "row-reverse" : "row",
    }}>
      <AvatarBadge role={msg.role} />
      <div style={{ flex: 1, maxWidth: "85%" }}>
        {isUser ? (
          <div style={{
            background: "var(--bg-3)", border: "1px solid var(--border)",
            padding: "8px 12px", fontSize: "12px", color: "var(--text)",
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
          marginTop: "4px", fontSize: "10px", color: "var(--text-dimmer)",
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
