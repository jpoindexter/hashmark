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

const MODELS = [
  { id: "claude-opus-4-6", label: "Opus 4.6", note: "1M ctx" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", note: "default" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", note: "fast" },
];

function persist(key: string, val: unknown) {
  try { localStorage.setItem(`studio_${key}`, JSON.stringify(val)); } catch {}
}
function restore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`studio_${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function ToggleButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "rgba(16,185,129,0.12)" : "none",
        border: `1px solid ${active ? "var(--accent)" : "var(--border-dim)"}`,
        color: active ? "var(--accent)" : "var(--text-dimmer)",
        fontFamily: "var(--font)",
        fontSize: "10px",
        padding: "2px 8px",
        cursor: "pointer",
        letterSpacing: "0.04em",
        flexShrink: 0,
        transition: "all 0.1s",
      }}
    >
      {children}
    </button>
  );
}

function ModelSelector({
  selected, onChange,
}: { selected: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODELS.find((m) => m.id === selected) ?? MODELS[1];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "none",
          border: "1px solid var(--border-dim)",
          color: "var(--text-dimmer)",
          fontFamily: "var(--font)",
          fontSize: "10px",
          padding: "2px 8px",
          cursor: "pointer",
          letterSpacing: "0.04em",
          transition: "all 0.1s",
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
        ▾ {current.label}
      </button>
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          zIndex: 200,
          background: "var(--bg-3)",
          border: "1px solid var(--border)",
          minWidth: "160px",
        }}>
          {MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => { onChange(m.id); setOpen(false); }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "6px 10px",
                background: "none",
                border: "none",
                borderLeft: m.id === selected ? "2px solid var(--accent)" : "2px solid transparent",
                color: m.id === selected ? "var(--accent)" : "var(--text-dim)",
                fontFamily: "var(--font)",
                fontSize: "11px",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
              }}
            >
              <span>{m.label}</span>
              <span style={{ color: "var(--text-dimmer)", fontSize: "10px" }}>{m.note}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  const [selectedModel, setSelectedModel] = useState(() => restore("model", "claude-sonnet-4-6"));
  const [thinking, setThinking] = useState(() => restore("thinking", false));
  const [planMode, setPlanMode] = useState(() => restore("plan_mode", false));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => persist("model", selectedModel), [selectedModel]);
  useEffect(() => persist("thinking", thinking), [thinking]);
  useEffect(() => persist("plan_mode", planMode), [planMode]);

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

    let systemPrompt = "";
    if (thinking) systemPrompt += "\n\nUse extended thinking before responding.";
    if (planMode) systemPrompt += "\n\nEnter plan mode: respond with a structured plan only, do not write code.";

    const res = await fetch(`/api/sessions/${sid}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        model: selectedModel,
        ...(systemPrompt.trim() && { systemPrompt: systemPrompt.trim() }),
      }),
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
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      setPlanMode((v) => !v);
      return;
    }
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
        display: "flex", alignItems: "center",
        padding: "6px 12px 0",
        gap: "6px",
      }}>
        <ModelSelector selected={selectedModel} onChange={setSelectedModel} />
        <ToggleButton active={thinking} onClick={() => setThinking((v) => !v)}>
          🧠 Thinking{thinking ? " ●" : ""}
        </ToggleButton>
        <ToggleButton active={planMode} onClick={() => setPlanMode((v) => !v)}>
          📋 Plan
        </ToggleButton>
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
            placeholder={streaming ? "Waiting for response..." : "Ask Claude  (↵ send · ⇧↵ newline · ⇧⇥ plan)"}
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
