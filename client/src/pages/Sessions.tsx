import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { Search, X, Trash2, Plus, Download, Archive, Check, Edit2 } from "lucide-react";
import XTerminal from "../components/XTerminal";
import { ContextHeatmap } from "../components/ContextHeatmap.tsx";
import { fetchApi } from "../lib/api";

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
  archived: number;
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

// Context window limits per model (tokens)
const CTX_WINDOW: Record<string, number> = {
  "claude-opus-4-6": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-haiku-4-5-20251001": 200_000,
};

// Provider dot color per model family
function providerColor(model: string): string {
  if (model.includes("opus")) return "var(--yellow)";   // yellow — premium
  if (model.includes("sonnet")) return "var(--blue)";  // blue — standard
  if (model.includes("haiku")) return "var(--accent)";   // green — fast
  return "var(--text-dimmer)";
}

function modelShortLabel(model: string): string {
  const found = MODELS.find(m => m.id === model);
  return found?.label ?? model;
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtTokens(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtRelative(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
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

// Token usage bar color based on % used
function tokenBarColor(pct: number): string {
  if (pct < 50) return "var(--accent)";
  if (pct < 80) return "var(--yellow)";
  return "var(--red)";
}

// Renderer that returns React nodes from assistant markdown text
const AssistantContent = memo(function AssistantContent({ text }: { text: string }) {
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

    if (!line.trim()) {
      nodes.push(<div key={key++} style={{ height: "6px" }} />);
      i++;
      continue;
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

interface SearchResult {
  id: string;
  title: string;
  model: string;
  updatedAt: number;
  snippet: string | null;
  snippetRole: string | null;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (q.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetchApi(`/api/sessions/search?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json() as { results: SearchResult[] };
        setSearchResults(data.results ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults(null);
    setSearchLoading(false);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  };

  const highlight = (text: string, q: string) => {
    if (!q || q.length < 2) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: "var(--accent-bg)", color: "var(--accent)", padding: 0 }}>
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  const loadSessions = useCallback(async () => {
    const url = showArchived ? "/api/sessions?archived=true" : "/api/sessions";
    const res = await fetch(url);
    const data = await res.json() as { sessions: Session[] };
    setSessions(data.sessions ?? []);
  }, [showArchived]);

  useEffect(() => {
    fetchApi("/api/sessions/config")
      .then((r) => r.json())
      .then((d: { claudeAvailable: boolean }) => setClaudeAvailable(d.claudeAvailable))
      .catch(() => setClaudeAvailable(false));
    loadSessions();
  }, [loadSessions]);

  // Cmd+N shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        void createSession();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newModel]);

  // Dismiss delete confirm on outside click
  useEffect(() => {
    if (!deleteConfirm) return;
    const handler = () => setDeleteConfirm(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [deleteConfirm]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);

  // Focus title input when editing starts
  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  const loadSession = useCallback(async (id: string) => {
    const res = await fetchApi(`/api/sessions/${id}`);
    const data = await res.json() as { session: Session; messages: Message[] };
    setActiveSession(data.session);
    setMessages(data.messages ?? []);
    setActiveId(id);
    setStreamText("");
    setEditingTitle(false);
  }, []);

  const createSession = async () => {
    const res = await fetchApi("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: newModel }),
    });
    const data = await res.json() as { session: Session };
    setSessions((prev) => [data.session, ...prev]);
    await loadSession(data.session.id);
  };

  const deleteSession = async (id: string) => {
    await fetchApi(`/api/sessions/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setActiveSession(null);
      setMessages([]);
    }
    setDeleteConfirm(null);
  };

  const archiveSession = async (id: string) => {
    await fetchApi(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setActiveSession(null);
      setMessages([]);
    }
  };

  const saveTitle = async () => {
    if (!activeId || !titleDraft.trim()) {
      setEditingTitle(false);
      return;
    }
    const newTitle = titleDraft.trim();
    await fetchApi(`/api/sessions/${activeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
    setActiveSession((prev) => prev ? { ...prev, title: newTitle } : prev);
    setSessions((prev) => prev.map((s) => s.id === activeId ? { ...s, title: newTitle } : s));
    setEditingTitle(false);
  };

  const startEditTitle = () => {
    if (!activeSession) return;
    setTitleDraft(activeSession.title);
    setEditingTitle(true);
  };

  const exportSession = () => {
    if (!activeSession) return;
    const payload = {
      session: {
        id: activeSession.id,
        title: activeSession.title,
        model: activeSession.model,
        created_at: activeSession.created_at,
        updated_at: activeSession.updated_at,
        total_input_tokens: activeSession.total_input_tokens,
        total_output_tokens: activeSession.total_output_tokens,
      },
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        created_at: m.created_at,
        ...(m.input_tokens != null ? { input_tokens: m.input_tokens } : {}),
        ...(m.output_tokens != null ? { output_tokens: m.output_tokens } : {}),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-${activeSession.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sendMessage = async () => {
    if (!activeId || !input.trim() || streaming) return;
    const text = input.trim();
    setInput("");
    setStreaming(true);
    setStreamText("");

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
      res = await fetchApi(`/api/sessions/${activeId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          systemPrompt: (localStorage.getItem("studio:system_prompt") ?? "").trim() || undefined,
        }),
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
      fetchApi(`/api/sessions/${activeId}/interrupt`, { method: "POST" }).catch(() => {});
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

  // Token stats for active session
  const totalTokens = activeSession
    ? activeSession.total_input_tokens + activeSession.total_output_tokens
    : 0;
  const ctxWindow = activeSession ? (CTX_WINDOW[activeSession.model] ?? 200_000) : 200_000;
  const tokenPct = Math.min(100, Math.round((totalTokens / ctxWindow) * 100));
  const totalCost = activeSession
    ? fmtCost(activeSession.total_input_tokens, activeSession.total_output_tokens, activeSession.model)
    : null;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", flexDirection: "column" }}>

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
          {/* Top controls */}
          <div style={{
            padding: "8px",
            borderBottom: "1px solid var(--border-dim)",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}>
            {/* New session row */}
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
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
              <button
                className="btn"
                onClick={() => void createSession()}
                title="New mission (Cmd+N)"
                style={{ padding: "4px 8px", fontSize: "10px", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "4px" }}
              >
                <Plus size={11} />
                NEW
              </button>
            </div>

            {/* Search bar */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              padding: "4px 8px",
            }}>
              <Search size={11} style={{ color: "var(--text-dimmer)", flexShrink: 0 }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Filter sessions…"
                style={{
                  flex: 1, background: "none", border: "none", outline: "none",
                  color: "var(--text)", fontSize: "11px", fontFamily: "var(--font)",
                }}
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--text-dimmer)", display: "flex", alignItems: "center", padding: 0,
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Archive toggle */}
            <button
              onClick={() => { setShowArchived(v => !v); setActiveId(null); setActiveSession(null); setMessages([]); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: showArchived ? "var(--accent)" : "var(--text-dimmer)",
                fontSize: "10px", textAlign: "left", padding: "0 2px",
                display: "flex", alignItems: "center", gap: "4px",
              }}
            >
              <Archive size={10} />
              {showArchived ? "Showing archived" : "Show archived"}
            </button>
          </div>

          <div style={{ flex: 1, overflow: "auto" }}>
            {searchQuery.trim().length >= 2 ? (
              searchLoading ? (
                <div style={{ padding: "16px 12px", color: "var(--text-dimmer)", fontSize: "11px", textAlign: "center" }}>
                  Searching…
                </div>
              ) : searchResults !== null && searchResults.length === 0 ? (
                <div style={{ padding: "16px 12px", color: "var(--text-dimmer)", fontSize: "11px", textAlign: "center" }}>
                  No results for "{searchQuery}"
                </div>
              ) : (searchResults ?? filteredSessions.map((s) => ({
                  id: s.id, title: s.title, model: s.model,
                  updatedAt: s.updated_at, snippet: null, snippetRole: null,
                }))).map((r) => (
                <div
                  key={r.id}
                  onClick={() => { void loadSession(r.id); clearSearch(); }}
                  style={{
                    padding: "8px 12px",
                    cursor: "pointer",
                    background: r.id === activeId ? "var(--accent-bg)" : "transparent",
                    borderLeft: r.id === activeId ? "2px solid var(--accent)" : "2px solid transparent",
                    borderBottom: "1px solid var(--border-dim)",
                  }}
                >
                  <div style={{
                    fontSize: "11px",
                    color: r.id === activeId ? "var(--text)" : "var(--text-dim)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {highlight(r.title, searchQuery)}
                  </div>
                  {r.snippet && (
                    <div style={{
                      marginTop: "3px", fontSize: "10px", color: "var(--text-dimmer)",
                      overflow: "hidden", display: "-webkit-box",
                      WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      lineHeight: "1.4",
                    }}>
                      {r.snippetRole === "user" ? "You: " : "AI: "}
                      {highlight(r.snippet, searchQuery)}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <>
                {sessions.length === 0 && (
                  <div style={{
                    padding: "32px 16px",
                    color: "var(--text-dimmer)",
                    fontSize: "11px",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "8px",
                  }}>
                    <span style={{
                      display: "inline-block",
                      width: "8px",
                      height: "14px",
                      background: "var(--accent)",
                      animation: "cursor-blink 1s step-end infinite",
                    }} />
                    {showArchived ? "No archived sessions" : "No sessions yet — start a conversation"}
                  </div>
                )}
                {filteredSessions.map((s) => {
                  const sTotalTok = s.total_input_tokens + s.total_output_tokens;
                  const sCtxWin = CTX_WINDOW[s.model] ?? 200_000;
                  const sPct = Math.min(100, Math.round((sTotalTok / sCtxWin) * 100));
                  const isDelConfirm = deleteConfirm === s.id;

                  return (
                    <SessionListItem
                      key={s.id}
                      s={s}
                      isActive={s.id === activeId}
                      sPct={sPct}
                      isDelConfirm={isDelConfirm}
                      onSelect={() => void loadSession(s.id)}
                      onDeleteRequest={(e) => { e.stopPropagation(); setDeleteConfirm(s.id); }}
                      onDeleteConfirm={(e) => { e.stopPropagation(); void deleteSession(s.id); }}
                      onDeleteCancel={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                    />
                  );
                })}
              </>
            )}
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
            <button className="btn" onClick={() => void createSession()} style={{ marginTop: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
              <Plus size={13} />
              NEW SESSION
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
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Title row */}
                {editingTitle ? (
                  <input
                    ref={titleInputRef}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveTitle();
                      if (e.key === "Escape") setEditingTitle(false);
                    }}
                    onBlur={() => void saveTitle()}
                    style={{
                      fontSize: "13px", fontWeight: 600,
                      background: "var(--bg-3)", border: "1px solid var(--border)",
                      color: "var(--text)", padding: "2px 6px", width: "100%",
                      fontFamily: "var(--font-ui)",
                    }}
                  />
                ) : (
                  <div
                    onClick={startEditTitle}
                    title="Click to edit title"
                    style={{
                      fontSize: "13px", color: "var(--text)", fontWeight: 600,
                      cursor: "text", display: "flex", alignItems: "center", gap: "6px",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {activeSession?.title}
                    </span>
                    <Edit2 size={11} style={{ color: "var(--text-dimmer)", flexShrink: 0 }} />
                  </div>
                )}

                {/* Token row */}
                <div style={{ marginTop: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
                  {/* Token usage bar */}
                  <div style={{
                    width: "60px", height: "3px",
                    background: "var(--bg-4)",
                    borderRadius: "2px",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}>
                    <div style={{
                      width: `${tokenPct}%`,
                      height: "100%",
                      background: tokenBarColor(tokenPct),
                      borderRadius: "2px",
                      transition: "width 0.3s",
                    }} />
                  </div>
                  <span style={{
                    fontSize: "10px",
                    color: tokenBarColor(tokenPct),
                    fontFamily: "var(--font)",
                  }}>
                    {fmtTokens(totalTokens)} / {fmtTokens(ctxWindow)} ({tokenPct}%)
                  </span>
                  <span style={{ fontSize: "10px", color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
                    · {totalCost}
                  </span>
                </div>
              </div>

              {/* Model badge */}
              {activeSession && (
                <div style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  background: "var(--bg-3)", border: "1px solid var(--border)",
                  padding: "3px 8px", borderRadius: "var(--radius-sm)", flexShrink: 0,
                }}>
                  <div style={{
                    width: "6px", height: "6px", borderRadius: "50%",
                    background: providerColor(activeSession.model),
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "var(--font)", whiteSpace: "nowrap" }}>
                    {modelShortLabel(activeSession.model)}
                  </span>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                <button
                  className="btn"
                  onClick={exportSession}
                  title="Export as JSON"
                  style={{ padding: "4px 7px", fontSize: "10px", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <Download size={11} />
                </button>
                <button
                  className="btn"
                  onClick={() => activeId && void archiveSession(activeId)}
                  title="Archive session"
                  style={{ padding: "4px 7px", fontSize: "10px", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <Archive size={11} />
                </button>
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

              {streaming && (
                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <AvatarBadge role="assistant" />
                  <div style={{ flex: 1, paddingTop: "2px" }}>
                    {streamText ? (
                      <div style={{ height: "320px", minHeight: "120px" }}>
                        <XTerminal output={streamText} />
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

            <ContextHeatmap sessionId={activeId} streaming={streaming} />
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

interface SessionListItemProps {
  s: Session;
  isActive: boolean;
  sPct: number;
  isDelConfirm: boolean;
  onSelect: () => void;
  onDeleteRequest: (e: React.MouseEvent) => void;
  onDeleteConfirm: (e: React.MouseEvent) => void;
  onDeleteCancel: (e: React.MouseEvent) => void;
}

function SessionListItem({
  s, isActive, sPct, isDelConfirm,
  onSelect, onDeleteRequest, onDeleteConfirm, onDeleteCancel,
}: SessionListItemProps) {
  const [hovered, setHovered] = useState(false);
  const barColor = tokenBarColor(sPct);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={isActive ? "true" : undefined}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "9px 10px 9px 12px",
        cursor: "pointer",
        background: isActive ? "var(--accent-bg)" : hovered ? "var(--bg-3)" : "transparent",
        borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
        borderBottom: "1px solid var(--border-dim)",
        transition: "background 0.1s",
        position: "relative",
      }}
    >
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0 }}>
        {/* Provider dot */}
        <div style={{
          width: "6px", height: "6px", borderRadius: "50%",
          background: providerColor(s.model),
          flexShrink: 0,
        }} />
        <div style={{
          fontSize: "11px",
          color: isActive ? "var(--text)" : "var(--text-dim)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}>
          {s.title}
        </div>

        {/* Trash / confirm buttons */}
        {isDelConfirm ? (
          <div style={{ display: "flex", gap: "3px", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onDeleteConfirm}
              title="Confirm delete"
              style={{
                background: "rgba(248,81,73,0.15)", border: "1px solid var(--red)",
                color: "var(--red)", cursor: "pointer", borderRadius: "var(--radius-sm)",
                padding: "2px 5px", fontSize: "10px", display: "flex", alignItems: "center",
              }}
            >
              <Check size={10} />
            </button>
            <button
              onClick={onDeleteCancel}
              style={{
                background: "none", border: "1px solid var(--border)",
                color: "var(--text-dimmer)", cursor: "pointer", borderRadius: "var(--radius-sm)",
                padding: "2px 5px", fontSize: "10px", display: "flex", alignItems: "center",
              }}
            >
              <X size={10} />
            </button>
          </div>
        ) : (hovered || isActive) ? (
          <button
            onClick={onDeleteRequest}
            title="Delete mission"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-dimmer)", display: "flex", alignItems: "center",
              padding: "1px", flexShrink: 0, borderRadius: "var(--radius-sm)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dimmer)"; }}
          >
            <Trash2 size={11} />
          </button>
        ) : null}
      </div>

      {/* Meta row */}
      <div style={{ marginTop: "5px", display: "flex", alignItems: "center", gap: "6px" }}>
        {/* Token bar */}
        <div style={{
          flex: 1, height: "2px",
          background: "var(--bg-4)",
          borderRadius: "1px",
          overflow: "hidden",
        }}>
          <div style={{
            width: `${sPct}%`,
            height: "100%",
            background: barColor,
            borderRadius: "1px",
          }} />
        </div>
        <span style={{ fontSize: "10px", color: "var(--text-dimmer)", whiteSpace: "nowrap" }}>
          {s.message_count ?? 0} msgs
        </span>
        <span style={{ fontSize: "10px", color: "var(--text-dimmer)", whiteSpace: "nowrap" }}>
          {fmtRelative(s.updated_at)}
        </span>
        {s.status === "streaming" && (
          <span style={{ color: "var(--accent)", fontSize: "10px" }}>● live</span>
        )}
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
