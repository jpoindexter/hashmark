import { useState, useEffect, useRef } from "react";

interface Session {
  id: string;
  title: string;
  status: "idle" | "streaming";
}

interface ChatInputBarProps {
  sessionId: string | null;
  onNewSession: () => void;
  onSessionCreated?: (sessionId: string) => void;
  onStreamText: (text: string) => void;
  onStreamingChange: (streaming: boolean) => void;
  streaming: boolean;
}

export default function ChatInputBar({
  sessionId,
  onNewSession,
  onSessionCreated,
  onStreamText,
  onStreamingChange,
  streaming,
}: ChatInputBarProps) {
  const [input, setInput] = useState("");
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!sessionId) { setSessionTitle(null); return; }
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => r.json())
      .then((d: { session: Session }) => setSessionTitle(d.session?.title ?? null))
      .catch(() => setSessionTitle(null));
  }, [sessionId]);

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    const text = input.trim();
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    let sid = sessionId;
    if (!sid) {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json() as { session: Session };
      sid = data.session.id;
      setSessionTitle(data.session.title);
      onSessionCreated?.(sid);
    }

    onStreamingChange(true);
    onStreamText("");

    const res = await fetch(`/api/sessions/${sid}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });

    if (!res.ok || !res.body) {
      onStreamingChange(false);
      return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let assembled = "";

    abortRef.current = () => {
      reader.cancel().catch(() => {});
      fetch(`/api/sessions/${sid}/interrupt`, { method: "POST" }).catch(() => {});
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const evt = JSON.parse(raw) as { type: string; text?: string };
            if (evt.type === "text" && evt.text) {
              assembled += evt.text;
              onStreamText(assembled);
            }
          } catch {}
        }
      }
    } finally {
      abortRef.current = null;
      onStreamingChange(false);
      onStreamText("");
      if (sid) {
        fetch(`/api/sessions/${sid}`)
          .then((r) => r.json())
          .then((d: { session: Session }) => setSessionTitle(d.session?.title ?? null))
          .catch(() => {});
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <div style={{
      borderTop: "1px solid var(--border-dim)",
      background: "var(--bg-2)",
      flexShrink: 0,
    }}>
      {/* Session meta row */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 12px 0",
        gap: "8px",
      }}>
        <div style={{
          fontSize: "10px", color: "var(--text-dimmer)", fontFamily: "var(--font)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          flex: 1,
        }}>
          {sessionTitle
            ? <span>◈ {sessionTitle}</span>
            : <span>no active session</span>
          }
          {streaming && (
            <span style={{ color: "var(--accent)", marginLeft: "8px" }}>● responding</span>
          )}
        </div>
        <button
          onClick={onNewSession}
          style={{
            background: "none",
            border: "1px solid var(--border-dim)",
            color: "var(--text-dimmer)",
            fontFamily: "var(--font)",
            fontSize: "9px",
            padding: "2px 7px",
            cursor: "pointer",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            flexShrink: 0,
            transition: "border-color 0.1s, color 0.1s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.style.color = "var(--accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-dim)";
            e.currentTarget.style.color = "var(--text-dimmer)";
          }}
        >
          + NEW
        </button>
      </div>

      {/* Input row */}
      <div style={{ padding: "6px 12px 10px" }}>
        {streaming && (
          <button
            onClick={() => abortRef.current?.()}
            style={{
              width: "100%",
              marginBottom: "6px",
              background: "none",
              border: "1px solid var(--red)",
              color: "var(--red)",
              padding: "4px",
              fontSize: "10px",
              cursor: "pointer",
              fontFamily: "var(--font)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            ■ STOP
          </button>
        )}
        <div style={{
          display: "flex", gap: "8px", alignItems: "flex-end",
          background: "var(--bg-3)",
          border: "1px solid var(--border)",
          padding: "7px 10px",
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={streaming ? "Waiting for response..." : "Ask Claude  (↵ send · ⇧↵ newline)"}
            disabled={streaming}
            rows={1}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              color: "var(--text)",
              fontSize: "12px",
              fontFamily: "var(--font)",
              resize: "none",
              maxHeight: "120px",
              overflowY: "auto",
              lineHeight: "1.5",
            }}
          />
          <button
            className="btn btn-primary"
            onClick={() => void sendMessage()}
            disabled={streaming || !input.trim()}
            style={{ padding: "5px 14px", fontSize: "11px", flexShrink: 0 }}
          >
            &gt; SEND
          </button>
        </div>
      </div>
    </div>
  );
}
