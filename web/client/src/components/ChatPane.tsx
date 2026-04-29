import React, { useState, useEffect, useRef, useCallback } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";
import { ToolOutput } from "./ToolOutput";
import { TimelineGroup } from "./TimelineGroup";
import { Markdown } from "./Markdown";
import { ModelPicker } from "./ModelPicker";
import type { ProvidersStore } from "./ModelPicker";
import { MessageBubble, MsgCtxItem } from "./MessageBubble";
import { ChatDialogs } from "./ChatDialogs";
import type { ViewMode } from "./MessageBubble";
import type { Session, Message } from "../types";
import { DiffPane } from "./DiffPane";
import { useChatStream } from "../hooks/useChatStream";
import { getContextLimit, getSessionCost } from "../lib/modelConfig";
import { ChatCompose } from "./ChatCompose";
import { ChatEmptyState } from "./ChatEmptyState";



interface SkillChip { id: string; name: string; content: string; }

export function ChatPane({
  session,
  onSessionUpdate,
  pendingText,
  onPendingTextConsumed,
  pendingSkill,
  onPendingSkillConsumed,
  onDispatch,
  viewMode = "verbose",
  sidebarCollapsed,
  onToggleSidebar,
  filesOpen,
  onToggleFiles,
}: {
  session: Session;
  onSessionUpdate: (updates: Partial<Session>) => void;
  pendingText?: string | null;
  onPendingTextConsumed?: () => void;
  pendingSkill?: SkillChip | null;
  onPendingSkillConsumed?: () => void;
  onDispatch?: (sessions: Session[]) => void;
  viewMode?: ViewMode;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  filesOpen?: boolean;
  onToggleFiles?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [systemPromptDraft, setSystemPromptDraft] = useState(session.system_prompt ?? "");
  const [providers, setProviders] = useState<ProvidersStore | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [msgCtxMenu, setMsgCtxMenu] = useState<{ x: number; y: number; message: Message } | null>(null);
  const [showCompactConfirm, setShowCompactConfirm] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [skillChips, setSkillChips] = useState<SkillChip[]>([]);
  const [budgetEditing, setBudgetEditing] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [broadcastConfirm, setBroadcastConfirm] = useState<{ message: string; targets: Session[] } | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(session.notes ?? "");
  const notesDraftRef = useRef(notesDraft);
  notesDraftRef.current = notesDraft;
  const [showDiffPane, setShowDiffPane] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const skillChipsRef = useRef(skillChips);
  skillChipsRef.current = skillChips;

  // Flush notes on tab/window close so onBlur-only save doesn't lose data
  useEffect(() => {
    const flush = () => {
      const notes = notesDraftRef.current;
      if (notes !== (session.notes ?? "")) {
        void fetchApi(`/api/sessions/${session.id}`, { method: "PATCH", body: JSON.stringify({ notes: notes || null }) });
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [session.id, session.notes]);

  const stream = useChatStream({
    session, onSessionUpdate,
    patchSession: async (updates) => {
      await fetchApi(`/api/sessions/${session.id}`, { method: "PATCH", body: JSON.stringify(updates) });
      onSessionUpdate(updates);
    },
    getSkillChips: () => skillChipsRef.current,
    clearSkillChips: () => setSkillChips([]),
    setMessages,
    onDispatch,
  });

  const { streaming, streamingRef, liveText, liveTools, toolsElapsed, textActive, reconnecting, lastTurnTokens,
    plan, askUserQuestion, exitPlanRequest, denyFeedback, turnFiles, fileEdits,
    setFileEdits, setDenyFeedback, setTurnFiles,
    send, stopStream, handleApproval, handleAskUserAnswer, handleExitPlanApprove, handleExitPlanDeny,
    resetOnSessionChange } = stream;
  const searchRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const msgCtxRef = useRef<HTMLDivElement>(null);

  // Load messages on session change
  useEffect(() => {
    setMessages([]);
    resetOnSessionChange();
    setLoading(true);
    setSystemPromptDraft(session.system_prompt ?? "");
    fetchApi<{ session: Session; messages: Message[] }>(`/api/sessions/${session.id}`)
      .then(({ messages: msgs }) => setMessages(msgs))
      .catch(() => toast.error("Failed to load messages"))
      .finally(() => setLoading(false));
  }, [session.id]);

  // Fetch git branch once on mount
  useEffect(() => {
    fetchApi<{ branch: string }>("/api/git-info")
      .then(d => setGitBranch(d.branch))
      .catch(() => {});
  }, []);

  // Load providers whenever model picker opens (picks up settings changes)
  useEffect(() => {
    if (showModelPicker) {
      fetchApi<ProvidersStore>("/api/providers").then(setProviders).catch(() => {});
    }
  }, [showModelPicker]);

  // Consume pending text from file explorer (set as input, focus)
  useEffect(() => {
    if (pendingText) {
      setInput(pendingText);
      onPendingTextConsumed?.();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [pendingText, onPendingTextConsumed]);

  // Consume pending skill -- add as chip (not textarea dump)
  useEffect(() => {
    if (pendingSkill) {
      setSkillChips(prev => prev.find(c => c.id === pendingSkill.id) ? prev : [...prev, pendingSkill]);
      onPendingSkillConsumed?.();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [pendingSkill, onPendingSkillConsumed]);

  // Auto-scroll: only scroll to bottom if user hasn't scrolled up
  const scrollToBottom = useCallback(() => {
    if (!userScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, liveText, liveTools, scrollToBottom]);

  // Reset scroll suppression on session change
  useEffect(() => { userScrolledUpRef.current = false; }, [session.id]);

  // ⌘F to open/close chat search; ⌘. to toggle system prompt editor
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(v => {
          if (!v) setTimeout(() => searchRef.current?.focus(), 50);
          else setSearchQuery("");
          return !v;
        });
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        if (streamingRef.current) { stopStream(); } else { setShowSystemPrompt(v => !v); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stopStream]);

  // Close model picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
      if (msgCtxRef.current && !msgCtxRef.current.contains(e.target as Node)) {
        setMsgCtxMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const patchSession = useCallback(async (updates: Partial<Session>) => {
    try {
      await fetchApi(`/api/sessions/${session.id}`, { method: "PATCH", body: JSON.stringify(updates) });
      onSessionUpdate(updates);
    } catch {
      toast.error("Failed to save");
    }
  }, [session.id, onSessionUpdate]);

  const saveSystemPrompt = async () => {
    await patchSession({ system_prompt: systemPromptDraft });
    setShowSystemPrompt(false);
    toast.success("System prompt saved");
  };

  const handleFork = useCallback(async (messageId: string) => {
    try {
      const newSession = await fetchApi<Session>(`/api/sessions/${session.id}/fork`, {
        method: "POST",
        body: JSON.stringify({ upToMessageId: messageId }),
      });
      toast.success(`Forked: ${newSession.title}`);
      onDispatch?.([newSession]);
    } catch {
      toast.error("Fork failed");
    }
  }, [session.id, onDispatch]);

  const handleRewind = useCallback(async (messageId: string) => {
    if (!confirm("Rewind to this turn? This will git reset --hard to the checkpoint before this response, and delete all messages after it.")) return;
    try {
      await fetchApi(`/api/sessions/${session.id}/rewind`, {
        method: "POST",
        body: JSON.stringify({ messageId }),
      });
      toast.success("Rewound to checkpoint");
      // Reload messages
      const updated = await fetchApi<Message[]>(`/api/sessions/${session.id}/messages`);
      setMessages(updated);
    } catch (e) {
      toast.error(`Rewind failed: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }, [session.id]);


  const deleteMessage = async (msgId: string) => {
    setMsgCtxMenu(null);
    try {
      await fetchApi(`/api/sessions/${session.id}/messages/${msgId}`, { method: "DELETE" });
      setMessages(prev => prev.filter(m => m.id !== msgId));
    } catch { toast.error("Failed to delete"); }
  };

  const contextLimit = getContextLimit(session.model);
  const totalTokens = (session.input_tokens ?? 0) + (session.output_tokens ?? 0);
  const contextPct = Math.min(100, (totalTokens / contextLimit) * 100);
  const contextBarColor = contextPct > 80 ? "var(--red)" : contextPct > 50 ? "var(--orange)" : "var(--accent)";

  return (
    <div ref={paneRef} style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", position: "relative" }}>
      {/* Session title header */}
      <div style={{
        display: "flex", alignItems: "center", padding: "0 10px 0 14px", height: 38,
        borderBottom: "1px solid var(--border)", flexShrink: 0, gap: 8,
        background: "var(--bg)",
      }}>
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? "Show sidebar (⌘B)" : "Hide sidebar (⌘B)"}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "3px 4px", color: "var(--text-muted)", borderRadius: 4, display: "flex", alignItems: "center", flexShrink: 0, opacity: 0.6 }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "0.6"; e.currentTarget.style.background = "none"; }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M5 1.5v11" stroke="currentColor" strokeWidth="1.1"/>
              {sidebarCollapsed && <path d="M7.5 5.5L10 7l-2.5 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>}
            </svg>
          </button>
        )}
        <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {session.title}
        </span>
        {contextPct > 0 && (
          <span style={{ fontSize: 10, color: contextPct > 80 ? "var(--red)" : contextPct > 50 ? "var(--orange)" : "var(--text-muted)", flexShrink: 0 }}>
            {Math.round(contextPct)}% ctx
          </span>
        )}
        <button
          onClick={() => setShowSearch(v => !v)}
          title="Search messages"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "3px 5px", color: "var(--text-muted)", borderRadius: 4, display: "flex", alignItems: "center" }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
            <circle cx="5" cy="5" r="3.2" /><path d="M7.5 7.5L10.5 10.5" strokeLinecap="round"/>
          </svg>
        </button>
        {onToggleFiles && (
          <button
            onClick={onToggleFiles}
            title="Toggle files tray (⌘E)"
            style={{ background: filesOpen ? "var(--bg-hover)" : "none", border: "none", cursor: "pointer", padding: "3px 5px", color: filesOpen ? "var(--accent)" : "var(--text-muted)", borderRadius: 4, display: "flex", alignItems: "center", flexShrink: 0 }}
            onMouseEnter={e => { if (!filesOpen) e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={e => { if (!filesOpen) e.currentTarget.style.background = "none"; }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M9 1.5v11" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M3 5h3.5M3 7.5h3.5M3 10h2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity=".6"/>
            </svg>
          </button>
        )}
      </div>

      {/* Context usage strip -- 2px bar */}
      {contextPct > 0 && (
        <div style={{ height: 2, background: "var(--bg-active)", flexShrink: 0 }}>
          <div style={{ height: "100%", width: `${contextPct}%`, background: contextBarColor, transition: "width 0.4s ease" }} />
        </div>
      )}

      {/* System prompt editor (slides down when open) */}
      {showSystemPrompt && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
            {([
              { label: "Coding", text: "You are an expert software engineer. Write clean, minimal, production-grade code. No unnecessary abstractions, no placeholder logic. Prefer editing existing files over creating new ones." },
              { label: "Reviewer", text: "You are a senior code reviewer. Focus on bugs, security issues, and logic errors. Only flag high-confidence issues. Be terse and direct." },
              { label: "Planner", text: "You are a technical planner. Break tasks into concrete, ordered steps. Identify risks and dependencies. Ask clarifying questions before starting work." },
              { label: "Writer", text: "You are a technical writer. Write clear, concise documentation and explanations. Use plain language. Structure content with headers and examples." },
            ] as const).map(t => (
              <button
                key={t.label}
                className="btn btn-xs"
                onClick={() => setSystemPromptDraft(t.text)}
              >{t.label}</button>
            ))}
          </div>
          <textarea
            className="input input-mono"
            value={systemPromptDraft}
            onChange={e => setSystemPromptDraft(e.target.value)}
            placeholder="System prompt for this session..."
            rows={3}
            style={{ width: "100%", resize: "vertical", lineHeight: 1.5, boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button className="btn btn-primary btn-sm" onClick={saveSystemPrompt}>Save</button>
            <button className="btn btn-sm" onClick={() => { setSystemPromptDraft(session.system_prompt ?? ""); setShowSystemPrompt(false); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Session notes (persistent scratchpad) */}
      {showNotes && (
        <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Session Notes</div>
          <textarea
            className="input"
            value={notesDraft}
            onChange={e => setNotesDraft(e.target.value)}
            placeholder="Notes, context, or goals for this session..."
            rows={4}
            style={{ width: "100%", resize: "vertical", lineHeight: 1.5, boxSizing: "border-box" }}
            onBlur={async () => { await patchSession({ notes: notesDraft || null }); }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button className="btn btn-sm" onClick={() => setShowNotes(false)}>Done</button>
          </div>
        </div>
      )}

      {/* Model picker dropdown (anchored to top) */}
      {showModelPicker && providers && (
        <div style={{ position: "relative" }} ref={modelPickerRef}>
          <ModelPicker
            currentModel={session.model}
            currentProvider={session.provider}
            providers={providers}
            onSelect={(model, provider) => { void patchSession({ model, provider }); setShowModelPicker(false); }}
          />
        </div>
      )}

      {/* Search bar */}
      {showSearch && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
          background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)",
          position: "sticky", top: 0, zIndex: 10,
        }}>
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="var(--text-muted)" strokeWidth="1.2">
            <circle cx="5" cy="5" r="3" /><path d="M7.5 7.5L10 10" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") { setShowSearch(false); setSearchQuery(""); } }}
            placeholder="Search messages…"
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              fontSize: 12, color: "var(--text)", fontFamily: "var(--font-sans)",
            }}
          />
          {searchQuery && (
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase())).length} results
            </span>
          )}
          <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text-muted)", padding: "0 2px" }}>✕</button>
        </div>
      )}

      {/* Live plan checklist */}
      {plan.length > 0 && (
        <div style={{
          padding: "8px 16px", borderBottom: "1px solid var(--border)",
          background: "var(--bg-elevated)", flexShrink: 0,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
            Plan
          </div>
          {plan.map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 12 }}>
              <span style={{ color: t.done ? "var(--green)" : "var(--border)", fontSize: 14 }}>
                {t.done ? "✓" : "○"}
              </span>
              <span style={{ color: t.done ? "var(--text-muted)" : "var(--text-dim)", textDecoration: t.done ? "line-through" : "none" }}>
                {t.title}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Main content row: messages+input (left) + diff pane (right) */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={e => {
          const el = e.currentTarget;
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          userScrolledUpRef.current = !nearBottom;
          setShowScrollBtn(!nearBottom);
        }}
        style={{ flex: 1, overflow: "auto" }}
      >
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 20px 8px", boxSizing: "border-box" }}>
        {loading && <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Loading...</div>}
        {!loading && messages.length === 0 && !streaming && (
          <ChatEmptyState session={session} onSelectPrompt={p => { setInput(p); setTimeout(() => inputRef.current?.focus(), 50); }} />
        )}
        {(searchQuery ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase())) : messages).map((msg, i, arr) => {
          const prev = arr[i - 1];
          const msgDate = new Date(msg.created_at);
          const prevDate = prev ? new Date(prev.created_at) : null;
          const showSep = !prevDate || msgDate.toDateString() !== prevDate.toDateString();
          const today = new Date();
          const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
          const sepLabel = msgDate.toDateString() === today.toDateString() ? "Today"
            : msgDate.toDateString() === yesterday.toDateString() ? "Yesterday"
            : msgDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: msgDate.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
          return (
            <div key={msg.id}>
              {showSep && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0 8px", userSelect: "none" }}>
                  <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  <span style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{sepLabel}</span>
                  <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>
              )}
              <MessageBubble
                message={msg}
                viewMode={viewMode}
                onContextMenu={(e) => { e.preventDefault(); setMsgCtxMenu({ x: e.clientX, y: e.clientY, message: msg }); }}
                onFork={msg.role === "assistant" ? handleFork : undefined}
                onRewind={msg.role === "assistant" && msg.git_checkpoint ? handleRewind : undefined}
              />
            </div>
          );
        })}

        {/* Reconnecting indicator */}
        {reconnecting && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", marginBottom: 8, background: "color-mix(in srgb, var(--orange) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--orange) 30%, transparent)", borderRadius: "var(--radius-md)", fontSize: 12 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--orange)", animation: "dot-pulse 1.4s ease-in-out infinite", flexShrink: 0 }} />
            <span style={{ color: "var(--orange)" }}>Connection lost — waiting for server...</span>
          </div>
        )}

        {/* Live streaming */}
        {(liveText || liveTools.length > 0) && (
          <div style={{ marginBottom: 16, animation: "gc-fade-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
            {/* Tool timeline - collapse when text starts flowing */}
            {liveTools.length > 0 && viewMode !== "summary" && (
              liveText && toolsElapsed != null ? (
                // Tools done: show collapsed worked separator
                <TimelineGroup
                  tools={liveTools}
                  elapsed={toolsElapsed}
                />
              ) : (
                // Tools in progress: show live list
                <div style={{ padding: "4px 0 8px", borderLeft: "2px solid var(--border)", paddingLeft: 10, marginBottom: 4 }}>
                  {liveTools.map((tool, index) => (
                    <ToolOutput
                      key={tool.toolUseId}
                      name={tool.name}
                      input={tool.input}
                      result={tool.result}
                      isError={tool.isError}
                      pending={tool.pending}
                      onApprove={tool.pending ? () => handleApproval(tool.toolUseId, true) : undefined}
                      onDeny={tool.pending ? () => handleApproval(tool.toolUseId, false) : undefined}
                      idx={index}
                    />
                  ))}
                </div>
              )
            )}
            {liveText && (
              <div style={{ lineHeight: 1.65 }}>
                <Markdown text={liveText.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").replace(/<thinking>[\s\S]*/g, "")} />
                <span style={{
                  display: "inline-block", width: 7, height: 13,
                  backgroundImage: "linear-gradient(to right, var(--shimmer-gold), var(--accent) 40%, var(--shimmer-gold))",
                  backgroundSize: "200% auto",
                  marginLeft: 2, verticalAlign: "text-bottom",
                  animation: textActive
                    ? "shimmer-sweep 1.2s linear infinite"
                    : "cursor-blink 1s step-end infinite",
                  opacity: textActive ? 1 : 0.5,
                  transition: "opacity 0.3s",
                }} />
              </div>
            )}
          </div>
        )}

        <ChatDialogs
          showCompactConfirm={showCompactConfirm}
          setShowCompactConfirm={setShowCompactConfirm}
          onCompact={() => void send("/compact")}
          broadcastConfirm={broadcastConfirm}
          setBroadcastConfirm={setBroadcastConfirm}
          exitPlanRequest={exitPlanRequest}
          denyFeedback={denyFeedback}
          setDenyFeedback={setDenyFeedback}
          handleExitPlanApprove={handleExitPlanApprove}
          handleExitPlanDeny={handleExitPlanDeny}
          askUserQuestion={askUserQuestion}
          handleAskUserAnswer={handleAskUserAnswer}
        />

        {turnFiles.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "6px 0 2px" }}>
            {turnFiles.map((f, i) => {
              const name = f.path.split("/").pop() ?? f.path;
              return (
                <span key={i} style={{
                  fontSize: 10, padding: "2px 7px", borderRadius: 3,
                  background: "color-mix(in srgb, var(--green) 10%, transparent)",
                  color: "var(--green)", border: "1px solid color-mix(in srgb, var(--green) 25%, transparent)",
                  fontFamily: "var(--font-mono)", cursor: "default",
                }} title={f.path}>
                  {name}
                </span>
              );
            })}
          </div>
        )}

        <div ref={messagesEndRef} />
        </div>{/* end centered content */}
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={() => {
            userScrolledUpRef.current = false;
            setShowScrollBtn(false);
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          }}
          style={{
            position: "absolute", bottom: 100, right: 32, zIndex: 20,
            width: 32, height: 32, borderRadius: "50%",
            background: "var(--bg-panel)", border: "1px solid var(--border)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-muted)", fontSize: 14, transition: "all 100ms",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-focus)"; e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
          title="Scroll to bottom"
        >↓</button>
      )}

      {/* Message context menu */}
      {msgCtxMenu && (
        <div
          ref={msgCtxRef}
          style={{
            position: "fixed", left: msgCtxMenu.x, top: msgCtxMenu.y, zIndex: 200,
            background: "var(--bg-panel)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)", padding: "4px 0", minWidth: 150,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          <MsgCtxItem label="Copy text" onClick={() => {
            const text = msgCtxMenu.message.blocks?.filter(b => b.type === "text").map(b => b.text).join("\n") || msgCtxMenu.message.content;
            void navigator.clipboard.writeText(text);
            setMsgCtxMenu(null);
          }} />
          <MsgCtxItem
            label={msgCtxMenu.message.bookmarked ? "Remove bookmark" : "Bookmark"}
            onClick={async () => {
              const msg = msgCtxMenu.message;
              const next = msg.bookmarked ? 0 : 1;
              await fetchApi(`/api/sessions/${session.id}/messages/${msg.id}`, { method: "PATCH", body: JSON.stringify({ bookmarked: next }) });
              setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, bookmarked: next } : m));
              setMsgCtxMenu(null);
            }}
          />
          {msgCtxMenu.message.role === "user" && (
            <MsgCtxItem label="Retry" onClick={() => {
              const text = msgCtxMenu.message.content;
              setMsgCtxMenu(null);
              void send(text);
            }} />
          )}
          {msgCtxMenu.message.role === "user" && (
            <MsgCtxItem label="Edit & retry" onClick={() => {
              setInput(msgCtxMenu.message.content);
              setMsgCtxMenu(null);
              setTimeout(() => inputRef.current?.focus(), 50);
            }} />
          )}
          <MsgCtxItem label="Delete message" danger onClick={() => void deleteMessage(msgCtxMenu.message.id)} />
        </div>
      )}

      <ChatCompose
        session={session}
        patchSession={patchSession}
        onSessionUpdate={onSessionUpdate}
        input={input}
        onInputChange={setInput}
        streaming={streaming}
        send={send}
        stopStream={stopStream}
        gitBranch={gitBranch}
        fileEdits={fileEdits}
        showDiffPane={showDiffPane}
        onToggleDiffPane={() => setShowDiffPane(v => !v)}
        onToggleModelPicker={() => setShowModelPicker(v => !v)}
        onToggleSystemPrompt={() => setShowSystemPrompt(v => !v)}
        onToggleNotes={() => setShowNotes(v => !v)}
        skillChips={skillChips}
        onRemoveSkillChip={id => setSkillChips(prev => prev.filter(c => c.id !== id))}
        inputRef={inputRef}
        paneRef={paneRef}
        onCompactRequest={() => setShowCompactConfirm(true)}
        onBroadcastRequest={msg => {
          void fetchApi<Session[]>("/api/sessions").then(sessions => {
            const targets = sessions.filter(s => s.id !== session.id && s.status === "idle");
            if (!targets.length) { toast("No other idle sessions to broadcast to"); return; }
            setBroadcastConfirm({ message: msg, targets });
          });
        }}
        onClearMessages={() => setMessages([])}
        lastTurnTokens={lastTurnTokens}
        budgetEditing={budgetEditing}
        budgetDraft={budgetDraft}
        onBudgetEditStart={() => { setBudgetEditing(true); setBudgetDraft(session.token_budget ? String(Math.round(session.token_budget / 1000)) : ""); }}
        onBudgetDraftChange={setBudgetDraft}
        onBudgetSave={async (v) => {
          setBudgetEditing(false);
          const k = parseInt(v, 10);
          const val = isNaN(k) || k === 0 ? null : k * 1000;
          await patchSession({ token_budget: val });
        }}
        onBudgetCancel={() => { setBudgetEditing(false); setBudgetDraft(""); }}
      />

        </div>{/* end left column */}
        {showDiffPane && (
          <div style={{ width: 320, flexShrink: 0, borderLeft: "1px solid var(--border)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <DiffPane edits={fileEdits} onClose={() => setShowDiffPane(false)} />
          </div>
        )}
      </div>{/* end content row */}

    </div>
  );
}

