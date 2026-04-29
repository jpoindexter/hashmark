import React, { useState, useRef, useCallback, useEffect } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";
import { MentionDropdown } from "./MentionDropdown";
import { getContextLimit } from "../lib/modelConfig";
import { ComposePopover } from "./ComposePopover";
import type { MentionEntry } from "./MentionDropdown";
import type { Session } from "../types";
import type { FileEdit } from "./DiffPane";

interface SkillChip { id: string; name: string; content: string; }

interface ChatComposeProps {
  session: Session;
  patchSession: (updates: Partial<Session>) => Promise<void>;
  onSessionUpdate: (updates: Partial<Session>) => void;
  input: string;
  onInputChange: (val: string) => void;
  streaming: boolean;
  send: (text: string) => void;
  stopStream: () => void;
  gitBranch: string | null;
  fileEdits: FileEdit[];
  showDiffPane: boolean;
  onToggleDiffPane: () => void;
  onToggleModelPicker: () => void;
  onToggleSystemPrompt: () => void;
  onToggleNotes: () => void;
  skillChips: SkillChip[];
  onRemoveSkillChip: (id: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  paneRef: React.RefObject<HTMLDivElement | null>;
  onCompactRequest: () => void;
  onBroadcastRequest: (message: string) => void;
  onClearMessages: () => void;
  lastTurnTokens?: number | null;
  budgetEditing?: boolean;
  budgetDraft?: string;
  onBudgetEditStart?: () => void;
  onBudgetDraftChange?: (v: string) => void;
  onBudgetSave?: (v: string) => void;
  onBudgetCancel?: () => void;
}

export function ChatCompose({
  session, patchSession, onSessionUpdate, input, onInputChange,
  streaming, send, stopStream, fileEdits, showDiffPane,
  onToggleDiffPane, onToggleModelPicker, onToggleSystemPrompt, onToggleNotes,
  lastTurnTokens, budgetEditing, budgetDraft, onBudgetEditStart, onBudgetDraftChange, onBudgetSave, onBudgetCancel,
  skillChips, onRemoveSkillChip, inputRef, paneRef,
  onCompactRequest, onBroadcastRequest, onClearMessages,
}: ChatComposeProps) {
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [atResults, setAtResults] = useState<MentionEntry[]>([]);
  const [atIdx, setAtIdx] = useState(0);
  const [atDropdownPos, setAtDropdownPos] = useState<{ left: number; bottom: number } | null>(null);
  const atDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashIdx, setSlashIdx] = useState(0);
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const contextLimit = getContextLimit(session.model);
  const totalTokens = (session.input_tokens ?? 0) + (session.output_tokens ?? 0);
  const contextPct = Math.min(100, (totalTokens / contextLimit) * 100);

  const hasActiveOption = !!(
    (session.thinking_level && session.thinking_level !== "none") ||
    session.plan_mode || session.fast_mode ||
    session.require_tool_approval !== 0 ||
    fileEdits.length > 0 || showDiffPane ||
    session.system_prompt || session.notes || session.worktree_dir
  );

  useEffect(() => {
    if (!showPopover) return;
    const h = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setShowPopover(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showPopover]);

  const computeAtDropdownPos = (el: HTMLTextAreaElement, cursorPos: number) => {
    if (!paneRef.current) return;
    const cs = window.getComputedStyle(el);
    const mirror = document.createElement("div");
    Object.assign(mirror.style, {
      position: "absolute", top: "-9999px", left: "-9999px",
      width: `${el.offsetWidth}px`, font: cs.font,
      paddingTop: cs.paddingTop, paddingRight: cs.paddingRight,
      paddingBottom: cs.paddingBottom, paddingLeft: cs.paddingLeft,
      border: cs.border, whiteSpace: "pre-wrap", wordBreak: "break-word",
      boxSizing: "border-box", overflow: "hidden",
    });
    mirror.appendChild(document.createTextNode(el.value.slice(0, cursorPos)));
    const marker = document.createElement("span");
    marker.textContent = "\u200b";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const markerLeft = marker.offsetLeft;
    document.body.removeChild(mirror);
    const taRect = el.getBoundingClientRect();
    const paneRect = paneRef.current.getBoundingClientRect();
    const rawLeft = taRect.left - paneRect.left + markerLeft;
    const maxLeft = paneRect.width - 260;
    const bottom = paneRect.bottom - taRect.top + 6;
    setAtDropdownPos({ left: Math.max(24, Math.min(rawLeft, maxLeft)), bottom });
  };

  const insertAtMention = (entry: { path: string; relative: string }) => {
    const el = inputRef.current;
    if (!el) return;
    const pos = el.selectionStart;
    const before = input.slice(0, pos);
    const atMatch = before.match(/@([^\s]*)$/);
    if (!atMatch) return;
    const start = pos - atMatch[0].length;
    const newVal = input.slice(0, start) + `@${entry.relative}` + input.slice(pos) + " ";
    onInputChange(newVal);
    setAtQuery(null); setAtResults([]); setAtDropdownPos(null);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + entry.relative.length + 2, start + entry.relative.length + 2); }, 0);
  };

  const SLASH_COMMANDS: Array<{ name: string; desc: string; action: () => void }> = [
    { name: "/clear", desc: "Clear all messages", action: () => { void fetchApi(`/api/sessions/${session.id}/messages`, { method: "DELETE" }).then(() => onClearMessages()); } },
    { name: "/compact", desc: "Compact context — summarize and continue", action: () => { onCompactRequest(); } },
    { name: "/model", desc: "Open model picker", action: () => { onToggleModelPicker(); } },
    { name: "/plan", desc: "Toggle plan mode on/off", action: () => { void patchSession({ plan_mode: session.plan_mode ? 0 : 1 }); } },
    { name: "/think", desc: "Toggle extended thinking", action: () => { void patchSession({ thinking_level: session.thinking_level && session.thinking_level !== "none" ? "none" : "medium" }); } },
    { name: "/fork", desc: "Fork this session at the last message", action: () => {} },
    { name: "/export", desc: "Export session as JSON", action: () => { window.open(`/api/sessions/${session.id}/export`, "_blank"); } },
    { name: "/broadcast", desc: "Send to all idle sessions", action: () => {
      const msg = input.replace(/^\/broadcast\s*/i, "").trim();
      if (!msg) { toast.error("Type a message after /broadcast"); return; }
      onBroadcastRequest(msg);
    }},
  ];

  const handleAtInput = useCallback((val: string, cursorPos: number) => {
    if (val.startsWith("/") && !val.includes(" ")) {
      setSlashQuery(val.slice(1).toLowerCase()); setSlashIdx(0);
      setAtQuery(null); setAtResults([]);
      return;
    }
    setSlashQuery(null);
    const before = val.slice(0, cursorPos);
    const atMatch = before.match(/@([^\s]*)$/);
    if (atMatch) {
      const q = atMatch[1];
      setAtQuery(q); setAtIdx(0);
      if (inputRef.current) computeAtDropdownPos(inputRef.current, cursorPos);
      if (atDebounceRef.current) clearTimeout(atDebounceRef.current);
      atDebounceRef.current = setTimeout(async () => {
        const filesFetch = fetchApi<{ entries: { name: string; path: string; relative: string }[] }>(`/api/files?flat=true&q=${encodeURIComponent(q)}`).catch(() => ({ entries: [] }));
        const showArtifacts = "artifact".startsWith(q.toLowerCase()) || q.toLowerCase().startsWith("artifact");
        const artifactsFetch = showArtifacts ? fetchApi<{ sessionId: string; title: string }[]>("/api/artifacts").catch(() => []) : Promise.resolve([]);
        const [filesData, artifacts] = await Promise.all([filesFetch, artifactsFetch]);
        const artifactEntries = (artifacts as { sessionId: string; title: string }[]).map(a => ({
          name: `artifact: ${a.title}`, path: `artifact:${a.sessionId}`, relative: `artifact:${a.sessionId}`, isArtifact: true,
        }));
        setAtResults([...artifactEntries, ...filesData.entries]);
      }, 150);
    } else {
      if (atDebounceRef.current) clearTimeout(atDebounceRef.current);
      setAtQuery(null); setAtResults([]); setAtDropdownPos(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashQuery !== null) {
      const cmds = SLASH_COMMANDS.filter(c => c.name.slice(1).startsWith(slashQuery));
      if (cmds.length > 0) {
        if (e.key === "ArrowDown") { e.preventDefault(); setSlashIdx(i => Math.min(i + 1, cmds.length - 1)); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setSlashIdx(i => Math.max(i - 1, 0)); return; }
        if (e.key === "Tab" || e.key === "Enter") {
          e.preventDefault();
          const cmd = cmds[slashIdx];
          if (cmd) { cmd.action(); onInputChange(""); setSlashQuery(null); }
          return;
        }
      }
      if (e.key === "Escape") { setSlashQuery(null); return; }
    }
    if (atQuery !== null && atResults.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setAtIdx(i => Math.min(i + 1, atResults.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setAtIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Tab" || (e.key === "Enter" && atResults.length > 0)) { e.preventDefault(); insertAtMention(atResults[atIdx]); return; }
      if (e.key === "Escape") { setAtQuery(null); setAtResults([]); setAtDropdownPos(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); onInputChange(""); }
  };

  return (
    <div style={{ padding: "12px 20px 16px", flexShrink: 0, position: "relative", maxWidth: 860, width: "100%", marginLeft: "auto", marginRight: "auto", boxSizing: "border-box" }}>
      {/* Slash command popup */}
      {slashQuery !== null && (() => {
        const cmds = SLASH_COMMANDS.filter(c => c.name.slice(1).startsWith(slashQuery));
        if (!cmds.length) return null;
        return (
          <div style={{ position: "absolute", zIndex: 50, left: 16, bottom: "100%", width: 300, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", boxShadow: "0 -4px 24px rgba(0,0,0,0.4)" }}>
            {cmds.map((cmd, i) => (
              <div key={cmd.name} onMouseDown={e => { e.preventDefault(); cmd.action(); onInputChange(""); setSlashQuery(null); }} style={{ padding: "7px 12px", cursor: "pointer", display: "flex", gap: 10, alignItems: "baseline", background: i === slashIdx ? "var(--bg-active)" : "transparent" }} onMouseEnter={() => setSlashIdx(i)}>
                <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>{cmd.name}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cmd.desc}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {atQuery !== null && (
        <MentionDropdown atQuery={atQuery} atResults={atResults} atIdx={atIdx} atDropdownPos={atDropdownPos} onSelect={insertAtMention} onClose={() => { setAtQuery(null); setAtResults([]); setAtDropdownPos(null); }} onHover={setAtIdx} />
      )}

      <div
        style={{
          background: "var(--bg-elevated)",
          border: session.plan_mode ? "1px dashed var(--accent)" : "1px solid color-mix(in srgb, var(--text) 8%, transparent)",
          borderRadius: 12, overflow: "visible", position: "relative",
          transition: "border-color 100ms",
        }}
        onFocusCapture={e => { if (!session.plan_mode) e.currentTarget.style.borderColor = "color-mix(in srgb, var(--text) 16%, transparent)"; }}
        onBlurCapture={e => { if (!session.plan_mode) e.currentTarget.style.borderColor = "color-mix(in srgb, var(--text) 8%, transparent)"; }}
      >
        {skillChips.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "8px 12px 0", borderBottom: "1px solid var(--border)" }}>
            {skillChips.map(chip => (
              <div key={chip.id} style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--accent-dim)", border: "1px solid var(--accent)", borderRadius: 20, padding: "2px 8px 2px 10px", fontSize: 11, color: "var(--accent-text)" }}>
                <span style={{ fontWeight: 600 }}>{chip.name}</span>
                <button onMouseDown={e => { e.preventDefault(); onRemoveSkillChip(chip.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-text)", fontSize: 13, lineHeight: 1, padding: 0, opacity: 0.7 }}>×</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "flex-end", gap: 0 }}>
          {/* + button with popover */}
          <div ref={popoverRef} style={{ position: "relative", flexShrink: 0 }}>
            <button
              onClick={() => setShowPopover(v => !v)}
              title="Session options"
              style={{
                width: 28, height: 28, flexShrink: 0, margin: "8px 0 8px 8px",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "color-mix(in srgb, var(--text) 6%, transparent)",
                border: "1px solid color-mix(in srgb, var(--text) 10%, transparent)",
                borderRadius: "50%", cursor: "pointer",
                color: showPopover ? "var(--text)" : "var(--text-muted)",
                transition: "all 80ms", position: "relative",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--text)"; }}
              onMouseLeave={e => { if (!showPopover) e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M5.5 1.5v8M1.5 5.5h8"/>
              </svg>
              {hasActiveOption && (
                <span style={{ position: "absolute", top: 2, right: 2, width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", pointerEvents: "none" }} />
              )}
            </button>

            {showPopover && (
              <ComposePopover
                session={session}
                patchSession={patchSession}
                onSessionUpdate={onSessionUpdate}
                fileEdits={fileEdits}
                showDiffPane={showDiffPane}
                onToggleDiffPane={onToggleDiffPane}
                onToggleSystemPrompt={onToggleSystemPrompt}
                onToggleNotes={onToggleNotes}
                onClose={() => setShowPopover(false)}
              />
            )}
          </div>

          <textarea
            ref={inputRef}
            value={input}
            onChange={e => { onInputChange(e.target.value); handleAtInput(e.target.value, e.target.selectionStart); }}
            onKeyDown={handleKeyDown}
            placeholder={streaming ? "Waiting for response..." : "Send a follow-up"}
            disabled={streaming}
            rows={1}
            style={{
              flex: 1, resize: "none", background: "none", border: "none", outline: "none",
              fontSize: 13, lineHeight: 1.6, color: streaming ? "var(--text-muted)" : "var(--text)",
              maxHeight: 180, overflowY: "auto", fontFamily: "var(--font-sans)",
              padding: "10px 10px 10px 10px", boxSizing: "border-box",
            }}
            onInput={e => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 180)}px`; }}
          />

          {/* Right controls: model + token budget + send */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px 6px 0", flexShrink: 0, alignSelf: "flex-end" }}>
            <button
              onClick={onToggleModelPicker}
              style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: "3px 6px", borderRadius: 6, transition: "all 80ms", whiteSpace: "nowrap" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-active)"; e.currentTarget.style.color = "var(--text)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              {session.model.split("/").pop()?.replace("claude-", "").replace(/-\d{8}$/, "") ?? session.model}
              <span style={{ opacity: 0.5, fontSize: 9 }}>▾</span>
            </button>

            {budgetEditing ? (
              <input
                autoFocus
                style={{ width: 52, fontSize: 10, padding: "1px 5px", height: 20, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", fontFamily: "var(--font-mono)", outline: "none" }}
                value={budgetDraft ?? ""}
                placeholder="k tokens"
                onChange={e => onBudgetDraftChange?.(e.target.value.replace(/[^\d]/g, ""))}
                onBlur={() => onBudgetSave?.(budgetDraft ?? "")}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") onBudgetCancel?.(); }}
              />
            ) : (contextPct > 5 || session.token_budget) ? (
              <button
                title={session.token_budget ? `Budget: ${Math.round(session.token_budget / 1000)}k per turn${lastTurnTokens ? ` · last used ${Math.round(lastTurnTokens / 1000)}k` : ""}` : `Context: ${Math.round(contextPct)}% · click to set budget`}
                onClick={() => onBudgetEditStart?.()}
                style={{
                  background: "none", border: "none", cursor: "pointer", flexShrink: 0,
                  color: session.token_budget ? (lastTurnTokens && session.token_budget && lastTurnTokens >= session.token_budget * 0.8 ? "var(--orange)" : "var(--text-muted)") : contextPct > 80 ? "var(--red)" : contextPct > 50 ? "var(--orange)" : "var(--text-muted)",
                  fontSize: 10, padding: "2px 4px", fontFamily: "var(--font-mono)", opacity: 0.65,
                }}
              >
                {session.token_budget ? (lastTurnTokens ? `${Math.round(lastTurnTokens / 1000)}k/${Math.round(session.token_budget / 1000)}k` : `${Math.round(session.token_budget / 1000)}k lim`) : `${Math.round(contextPct)}%`}
              </button>
            ) : null}

            {streaming ? (
              <button onClick={stopStream} style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--text)", border: "none", borderRadius: "50%", cursor: "pointer", color: "var(--bg)", flexShrink: 0 }} title="Stop">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="2" y="2" width="6" height="6" rx="1"/></svg>
              </button>
            ) : (
              <button
                onClick={() => { void send(input); onInputChange(""); }}
                disabled={!input.trim()} aria-label="Send"
                style={{ width: 30, height: 30, flexShrink: 0, background: input.trim() ? "var(--text)" : "var(--bg-active)", borderRadius: "50%", border: "none", cursor: input.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", transition: "background var(--transition)" }}
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M5.5 9V2M2 5l3.5-3.5L9 5" stroke={input.trim() ? "var(--bg)" : "var(--text-muted)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
