import { useState, useEffect, useRef } from "react";
import { Plus, Send, Square } from "lucide-react";

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
  { id: "claude-opus-4-6",           label: "Opus 4.6",   note: "1M ctx" },
  { id: "claude-sonnet-4-6",         label: "Sonnet 4.6", note: "default" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5",  note: "fast" },
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

function ModelPill({ selected, onChange }: { selected: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODELS.find(m => m.id === selected) ?? MODELS[1];

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "3px 8px", background: "none", border: "none", borderRadius: 4,
          color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-ui)",
          cursor: "pointer", transition: "background 0.1s, color 0.1s", whiteSpace: "nowrap",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)"; }}
      >
        <span style={{ color: "var(--accent)", fontSize: 13 }}>✸</span>
        {current.label}
      </button>

      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 4px)", left: 0, zIndex: 300,
          background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
          minWidth: 180, boxShadow: "0 -4px 16px rgba(0,0,0,0.4)", overflow: "hidden",
        }}>
          {MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => { onChange(m.id); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "7px 12px", background: "none", border: "none",
                borderLeft: m.id === selected ? "2px solid var(--accent)" : "2px solid transparent",
                color: m.id === selected ? "var(--accent)" : "var(--text-dim)",
                fontFamily: "var(--font)", fontSize: 12, cursor: "pointer", textAlign: "left",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "none"}
            >
              <span>{m.label}</span>
              <span style={{ color: "var(--text-dimmer)", fontSize: 10 }}>{m.note}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolbarToggle({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "3px 8px",
        background: active ? "var(--accent-bg)" : "none",
        border: "none", borderRadius: 4,
        color: active ? "var(--accent)" : "var(--text-dimmer)",
        fontSize: 11, fontFamily: "var(--font-ui)",
        cursor: "pointer", transition: "background 0.1s, color 0.1s", whiteSpace: "nowrap",
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = "none";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)";
        }
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export default function ChatInputBar({
  sessionId, onNewSession, onSessionCreated, onStreamText, onStreamingChange, streaming,
}: ChatInputBarProps) {
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(() => restore("model", "claude-sonnet-4-6"));
  const [thinking, setThinking] = useState(() => restore("thinking", false));
  const [planMode, setPlanMode] = useState(() => restore("plan_mode", false));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => persist("model", selectedModel), [selectedModel]);
  useEffect(() => persist("thinking", thinking), [thinking]);
  useEffect(() => persist("plan_mode", planMode), [planMode]);

  // ⌘L focus shortcut
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "l") { e.preventDefault(); textareaRef.current?.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    const text = input.trim();
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    let sid = sessionId;
    if (!sid) {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json() as { session: Session };
      sid = data.session.id;
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

    if (!res.ok || !res.body) { onStreamingChange(false); return; }

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
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); setPlanMode(v => !v); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  return (
    <div style={{ background: "var(--bg)", borderTop: "1px solid var(--border-dim)", flexShrink: 0, padding: "12px 16px 10px" }}>
      <div
        style={{
          background: "var(--bg-2)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", overflow: "hidden", transition: "border-color 0.15s",
        }}
        onFocusCapture={e => (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent-border)"}
        onBlurCapture={e => (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"}
      >
        {/* Textarea */}
        <div style={{ padding: "10px 14px 2px" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={streaming ? "" : "Ask to make changes, @mention files, run /commands"}
            disabled={streaming}
            rows={1}
            style={{
              width: "100%", background: "none", border: "none", outline: "none",
              color: "var(--text)", fontSize: 13, fontFamily: "var(--font)",
              resize: "none", maxHeight: 140, overflowY: "auto", lineHeight: 1.5, display: "block",
            }}
          />
        </div>

        {/* Streaming line */}
        {streaming && (
          <div style={{ padding: "0 14px 6px", fontSize: 11, color: "var(--accent)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animation: "stream-pulse 1s ease-in-out infinite" }} />
            Claude is responding...
          </div>
        )}

        {/* Toolbar */}
        <div style={{
          display: "flex", alignItems: "center", padding: "4px 6px 6px", gap: 0,
          borderTop: "1px solid var(--border-dim)",
        }}>
          <ModelPill selected={selectedModel} onChange={setSelectedModel} />
          <ToolbarToggle active={thinking} onClick={() => setThinking(v => !v)} icon={<span style={{ fontSize: 13, lineHeight: 1 }}>◐</span>} label="Thinking" />
          <ToolbarToggle active={planMode} onClick={() => setPlanMode(v => !v)} icon={<span style={{ fontSize: 11, lineHeight: 1 }}>▦</span>} label="Plan" />

          <div style={{ flex: 1 }} />

          {!streaming && !input && (
            <span style={{ fontSize: 10, color: "var(--text-dimmer)", marginRight: 8, opacity: 0.4 }}>⌘L to focus</span>
          )}

          {/* New */}
          <button
            onClick={onNewSession}
            title="New conversation"
            style={{
              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              background: "none", border: "none", borderRadius: 4,
              color: "var(--text-dimmer)", cursor: "pointer", transition: "background 0.1s, color 0.1s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)"; }}
          >
            <Plus size={14} />
          </button>

          {/* Stop / Send */}
          {streaming ? (
            <button
              onClick={() => abortRef.current?.()}
              title="Stop"
              style={{
                width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                background: "var(--red-bg)", border: "none", borderRadius: 4,
                color: "var(--red)", cursor: "pointer",
              }}
            >
              <Square size={12} />
            </button>
          ) : (
            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim()}
              title="Send (Enter)"
              style={{
                width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                background: input.trim() ? "var(--accent)" : "rgba(255,255,255,0.06)",
                border: "none", borderRadius: 4,
                color: input.trim() ? "#000" : "var(--text-dimmer)",
                cursor: input.trim() ? "pointer" : "default",
                transition: "all 0.15s",
              }}
            >
              <Send size={12} />
            </button>
          )}
        </div>
      </div>

      <style>{`@keyframes stream-pulse { 0%,100%{opacity:.4;transform:scale(.8)} 50%{opacity:1;transform:scale(1.2)} }`}</style>
    </div>
  );
}
