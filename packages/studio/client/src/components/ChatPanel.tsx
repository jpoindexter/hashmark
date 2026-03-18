import { useState, useEffect, useRef, useCallback } from "react";

interface Session {
  id: string;
  title: string;
  status: "idle" | "streaming";
  message_count: number;
  updated_at: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: number;
}

function inlineNodes(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
      return <code key={i} style={{ background: "var(--bg-3)", padding: "1px 4px", fontSize: "10px", color: "var(--accent)", fontFamily: "var(--font)" }}>{p.slice(1, -1)}</code>;
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4)
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    return p;
  });
}

function AssistantText({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { code.push(lines[i]); i++; }
      nodes.push(
        <pre key={key++} style={{ background: "var(--bg-3)", border: "1px solid var(--border-dim)", padding: "8px 10px", margin: "6px 0", overflow: "auto", fontSize: "10px", lineHeight: 1.5 }}>
          {lang && <div style={{ color: "var(--accent)", fontSize: "9px", marginBottom: "4px", textTransform: "uppercase" }}>{lang}</div>}
          <code style={{ color: "var(--text)", fontFamily: "var(--font)" }}>{code.join("\n")}</code>
        </pre>
      );
      i++; continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(<div key={key++} style={{ fontWeight: 700, color: "var(--text)", fontSize: "11px", margin: "8px 0 3px" }}>{line.slice(3)}</div>);
      i++; continue;
    }
    if (line.match(/^[-*] /)) {
      nodes.push(<div key={key++} style={{ display: "flex", gap: "6px", margin: "1px 0" }}><span style={{ color: "var(--accent)", flexShrink: 0, fontSize: "10px" }}>›</span><span style={{ fontSize: "11px" }}>{inlineNodes(line.slice(2))}</span></div>);
      i++; continue;
    }
    if (!line.trim()) { nodes.push(<div key={key++} style={{ height: "4px" }} />); i++; continue; }
    nodes.push(<div key={key++} style={{ lineHeight: 1.6, fontSize: "11px" }}>{inlineNodes(line)}</div>);
    i++;
  }
  return <>{nodes}</>;
}

export default function ChatPanel() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [showSessions, setShowSessions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/sessions");
    const data = await res.json() as { sessions: Session[] };
    setSessions(data.sessions ?? []);
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamText]);

  const loadSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/sessions/${id}`);
    const data = await res.json() as { session: Session; messages: Message[] };
    setMessages(data.messages ?? []);
    setActiveId(id);
    setStreamText("");
    setShowSessions(false);
  }, []);

  const newSession = async () => {
    const res = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const data = await res.json() as { session: Session };
    setSessions((p) => [data.session, ...p]);
    setActiveId(data.session.id);
    setMessages([]);
    setStreamText("");
    setShowSessions(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    let sid = activeId;
    if (!sid) {
      const res = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json() as { session: Session };
      sid = data.session.id;
      setSessions((p) => [data.session, ...p]);
      setActiveId(sid);
    }
    const text = input.trim();
    setInput("");
    setStreaming(true);
    setStreamText("");
    setMessages((p) => [...p, { id: `tmp-${Date.now()}`, role: "user", content: text, created_at: Date.now() }]);

    const res = await fetch(`/api/sessions/${sid}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }) });
    if (!res.ok || !res.body) { setStreaming(false); return; }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let assembled = "";
    abortRef.current = () => { reader.cancel().catch(() => {}); fetch(`/api/sessions/${sid}/interrupt`, { method: "POST" }).catch(() => {}); };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as { type: string; text?: string };
            if (evt.type === "text" && evt.text) { assembled += evt.text; setStreamText(assembled); }
          } catch {}
        }
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      setStreamText("");
      if (sid) { await loadSession(sid); await loadSessions(); }
    }
  };

  const activeSession = sessions.find((s) => s.id === activeId);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ height: "38px", minHeight: "38px", borderBottom: "1px solid var(--border-dim)", display: "flex", alignItems: "center", padding: "0 10px", gap: "6px", background: "var(--bg-2)", flexShrink: 0 }}>
        <span style={{ fontSize: "10px", color: "var(--accent)", fontWeight: 700, letterSpacing: "0.05em" }}>◈ CLAUDE</span>
        <div style={{ flex: 1, overflow: "hidden" }}>
          {activeSession && <span style={{ fontSize: "10px", color: "var(--text-dimmer)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{activeSession.title}</span>}
        </div>
        <button onClick={() => setShowSessions((v) => !v)} style={{ background: "none", border: "none", color: showSessions ? "var(--accent)" : "var(--text-dimmer)", cursor: "pointer", fontSize: "14px", padding: "2px 4px" }}>≡</button>
        <button onClick={() => void newSession()} style={{ background: "none", border: "none", color: "var(--text-dimmer)", cursor: "pointer", fontSize: "16px", padding: "2px 4px", lineHeight: 1 }}>+</button>
      </div>

      {showSessions && (
        <div style={{ borderBottom: "1px solid var(--border-dim)", maxHeight: "200px", overflow: "auto", flexShrink: 0, background: "var(--bg-3)" }}>
          {sessions.length === 0 && <div style={{ padding: "12px", fontSize: "10px", color: "var(--text-dimmer)", textAlign: "center" }}>No sessions</div>}
          {sessions.map((s) => (
            <div key={s.id} onClick={() => void loadSession(s.id)} style={{ padding: "6px 10px", cursor: "pointer", background: s.id === activeId ? "var(--accent-bg)" : "transparent", borderLeft: s.id === activeId ? "2px solid var(--accent)" : "2px solid transparent", borderBottom: "1px solid var(--border-dim)" }}>
              <div style={{ fontSize: "10px", color: s.id === activeId ? "var(--text)" : "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
              <div style={{ fontSize: "9px", color: "var(--text-dimmer)", marginTop: "2px" }}>{s.message_count ?? 0} msgs</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto", padding: "12px 10px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {messages.length === 0 && !streaming && (
          <div style={{ textAlign: "center", color: "var(--text-dimmer)", fontSize: "11px", marginTop: "40px", lineHeight: 1.8 }}>
            <div style={{ fontSize: "20px", color: "var(--accent-dim)", marginBottom: "8px" }}>◌</div>
            Ask Claude anything about<br />your codebase or project.
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} style={{ display: "flex", gap: "8px", flexDirection: msg.role === "user" ? "row-reverse" : "row", alignItems: "flex-start" }}>
            <div style={{ width: "20px", height: "20px", flexShrink: 0, background: msg.role === "user" ? "var(--bg-3)" : "var(--accent-bg)", border: `1px solid ${msg.role === "user" ? "var(--border)" : "var(--accent)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", color: msg.role === "user" ? "var(--text-dim)" : "var(--accent)", fontFamily: "var(--font)", fontWeight: 700 }}>
              {msg.role === "user" ? "U" : "AI"}
            </div>
            <div style={{ flex: 1, maxWidth: "90%", fontSize: "11px", color: "var(--text)", lineHeight: 1.6 }}>
              {msg.role === "user"
                ? <div style={{ background: "var(--bg-3)", border: "1px solid var(--border)", padding: "6px 8px", whiteSpace: "pre-wrap", fontFamily: "var(--font)" }}>{msg.content}</div>
                : <AssistantText text={msg.content} />
              }
            </div>
          </div>
        ))}
        {streaming && (
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <div style={{ width: "20px", height: "20px", flexShrink: 0, background: "var(--accent-bg)", border: "1px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", color: "var(--accent)", fontFamily: "var(--font)", fontWeight: 700 }}>AI</div>
            <div style={{ flex: 1, fontSize: "11px", color: "var(--text)", lineHeight: 1.6 }}>
              {streamText ? <AssistantText text={streamText} /> : <span style={{ color: "var(--text-dimmer)" }}>thinking...</span>}
              <span style={{ display: "inline-block", width: "6px", height: "12px", background: "var(--accent)", verticalAlign: "text-bottom", marginLeft: "2px", animation: "cursor-blink 1s step-end infinite" }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: "8px", borderTop: "1px solid var(--border-dim)", flexShrink: 0 }}>
        {streaming && (
          <button onClick={() => abortRef.current?.()} style={{ width: "100%", marginBottom: "6px", background: "none", border: "1px solid #ef4444", color: "#ef4444", padding: "4px", fontSize: "10px", cursor: "pointer", fontFamily: "var(--font)" }}>
            ■ STOP
          </button>
        )}
        <div style={{ display: "flex", gap: "6px", alignItems: "flex-end", background: "var(--bg-3)", border: "1px solid var(--border)", padding: "6px 8px" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
            placeholder={streaming ? "..." : "Ask Claude (↵ send)"}
            disabled={streaming}
            rows={1}
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text)", fontSize: "11px", fontFamily: "var(--font)", resize: "none", maxHeight: "100px", overflowY: "auto", lineHeight: 1.5 }}
            onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 100)}px`; }}
          />
          <button className="btn" onClick={() => void sendMessage()} disabled={streaming || !input.trim()} style={{ padding: "3px 10px", fontSize: "10px", flexShrink: 0 }}>↵</button>
        </div>
      </div>
      <style>{`@keyframes cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
    </div>
  );
}
