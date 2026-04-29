import React, { useState, useRef, useEffect } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";
import { getContextLimit } from "../lib/modelConfig";
import type { Session } from "../types";
import type { FileEdit } from "./DiffPane";

interface ComposeToolbarProps {
  session: Session;
  patchSession: (updates: Partial<Session>) => Promise<void>;
  onSessionUpdate: (updates: Partial<Session>) => void;
  gitBranch: string | null;
  fileEdits: FileEdit[];
  showDiffPane: boolean;
  onToggleDiffPane: () => void;
  onToggleModelPicker: () => void;
  onToggleSystemPrompt: () => void;
  onToggleNotes: () => void;
  lastTurnTokens?: number | null;
  budgetEditing?: boolean;
  budgetDraft?: string;
  onBudgetEditStart?: () => void;
  onBudgetDraftChange?: (v: string) => void;
  onBudgetSave?: (v: string) => void;
  onBudgetCancel?: () => void;
}

export function ComposeToolbar({
  session, patchSession, onSessionUpdate,
  gitBranch, fileEdits, showDiffPane,
  onToggleDiffPane, onToggleModelPicker, onToggleSystemPrompt, onToggleNotes,
  lastTurnTokens, budgetEditing, budgetDraft,
  onBudgetEditStart, onBudgetDraftChange, onBudgetSave, onBudgetCancel,
}: ComposeToolbarProps) {
  const contextLimit = getContextLimit(session.model);
  const totalTokens = (session.input_tokens ?? 0) + (session.output_tokens ?? 0);
  const contextPct = Math.min(100, (totalTokens / contextLimit) * 100);
  const [showOverflow, setShowOverflow] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showOverflow) return;
    const h = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) setShowOverflow(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showOverflow]);

  const hasSecondaryActive = !!(fileEdits.length > 0 || showDiffPane || session.system_prompt || session.notes || session.worktree_dir);

  const tbtn = (active: boolean, color = "var(--accent)"): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 4, fontSize: 10,
    color: active ? color : "var(--text-muted)",
    background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 4,
    opacity: active ? 1 : 0.6, transition: "opacity 80ms, color 80ms",
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, paddingTop: 5, paddingLeft: 2, paddingRight: 2 }}>
      <select
        value={session.thinking_level ?? "none"}
        onChange={e => void patchSession({ thinking_level: e.target.value })}
        title="Thinking level"
        style={{
          ...tbtn(!!(session.thinking_level && session.thinking_level !== "none")),
          fontFamily: "var(--font-sans)", appearance: "none",
        }}
      >
        <option value="none">Think: Off</option>
        <option value="low">Think: Low</option>
        <option value="medium">Think: Med</option>
        <option value="high">Think: High</option>
        <option value="xhigh">Think: Max</option>
      </select>

      <button
        onClick={() => void patchSession({ plan_mode: session.plan_mode ? 0 : 1 })}
        title={session.plan_mode ? "Plan mode on" : "Plan mode off"}
        style={tbtn(!!session.plan_mode)}
        onMouseEnter={e => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = session.plan_mode ? "1" : "0.6"; }}
      >Plan</button>

      <button
        onClick={() => void patchSession({ fast_mode: session.fast_mode ? 0 : 1 })}
        title={session.fast_mode ? "Fast mode on" : "Fast mode off"}
        style={tbtn(!!session.fast_mode, "var(--yellow)")}
        onMouseEnter={e => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = session.fast_mode ? "1" : "0.6"; }}
      >Fast</button>

      <button
        onClick={() => void patchSession({ require_tool_approval: session.require_tool_approval !== 0 ? 0 : 1 })}
        title={session.require_tool_approval !== 0 ? "Approvals on" : "Approvals off"}
        style={tbtn(session.require_tool_approval !== 0)}
        onMouseEnter={e => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = session.require_tool_approval !== 0 ? "1" : "0.6"; }}
      >Approvals</button>

      <div style={{ flex: 1 }} />

      {/* Token budget */}
      {budgetEditing ? (
        <input
          autoFocus
          className="input input-mono"
          style={{ width: 60, fontSize: 10, padding: "1px 5px", height: 18, flexShrink: 0 }}
          value={budgetDraft ?? ""}
          placeholder="k tokens"
          onChange={e => onBudgetDraftChange?.(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={() => onBudgetSave?.(budgetDraft ?? "")}
          onKeyDown={e => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") onBudgetCancel?.();
          }}
        />
      ) : session.token_budget || contextPct > 0 ? (
        <button
          title={session.token_budget
            ? `Budget: ${Math.round(session.token_budget / 1000)}k per turn${lastTurnTokens ? ` · last used ${Math.round(lastTurnTokens / 1000)}k` : ""}`
            : `Context: ${Math.round(contextPct)}% · click to set budget`}
          onClick={() => onBudgetEditStart?.()}
          style={{
            background: "none", border: "none", cursor: "pointer", flexShrink: 0,
            color: session.token_budget
              ? (lastTurnTokens && session.token_budget && lastTurnTokens >= session.token_budget * 0.8 ? "var(--orange)" : "var(--text-muted)")
              : contextPct > 80 ? "var(--red)" : contextPct > 50 ? "var(--orange)" : "var(--text-muted)",
            fontSize: 10, padding: "2px 4px", fontFamily: "var(--font-mono)", opacity: 0.7,
          }}
        >
          {session.token_budget
            ? (lastTurnTokens
                ? `${Math.round(lastTurnTokens / 1000)}k/${Math.round(session.token_budget / 1000)}k`
                : `${Math.round(session.token_budget / 1000)}k lim`)
            : `${Math.round(contextPct)}% ctx`}
        </button>
      ) : null}

      {gitBranch && (
        <span style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 3, padding: "2px 4px", opacity: 0.6 }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="3" cy="2.5" r="1.2" stroke="currentColor" strokeWidth="1"/><circle cx="3" cy="7.5" r="1.2" stroke="currentColor" strokeWidth="1"/><circle cx="7.5" cy="2.5" r="1.2" stroke="currentColor" strokeWidth="1"/><path d="M3 3.7v2.6M3 3.7C3 5.5 7.5 5.5 7.5 3.7" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
          {gitBranch}
        </span>
      )}

      {/* Overflow: diff, system, notes, worktree */}
      <div style={{ position: "relative" }} ref={overflowRef}>
        <button
          onClick={() => setShowOverflow(v => !v)}
          title="More options"
          style={{
            fontSize: 11, padding: "2px 5px", cursor: "pointer", border: "none", borderRadius: 3,
            color: hasSecondaryActive ? "var(--accent)" : "var(--text-muted)",
            background: showOverflow ? "var(--bg-hover)" : "none",
            display: "flex", alignItems: "center", letterSpacing: "0.05em", opacity: 0.7,
            position: "relative",
          }}
        >
          ···
          {hasSecondaryActive && (
            <span style={{ position: "absolute", top: 1, right: 1, width: 4, height: 4, borderRadius: "50%", background: "var(--accent)" }} />
          )}
        </button>

        {showOverflow && (
          <div style={{
            position: "absolute", right: 0, bottom: "calc(100% + 6px)", zIndex: 50,
            background: "var(--bg-panel)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)", padding: "4px 0", minWidth: 140,
            boxShadow: "0 -4px 20px rgba(0,0,0,0.3)",
          }}>
            <button
              onClick={() => { onToggleDiffPane(); setShowOverflow(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                cursor: "pointer", border: "none", background: "none", fontSize: 12,
                color: fileEdits.length > 0 ? "var(--green)" : showDiffPane ? "var(--text)" : "var(--text-dim)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M2 3h10M2 7h6M2 11h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                <path d="M10 9l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Diff {fileEdits.length > 0 ? `(${fileEdits.length})` : ""}
            </button>

            <button
              onClick={() => { onToggleSystemPrompt(); setShowOverflow(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                cursor: "pointer", border: "none", background: "none", fontSize: 12,
                color: session.system_prompt ? "var(--accent-text)" : "var(--text-dim)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.1"/>
                <path d="M6 4v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <circle cx="6" cy="8.5" r="0.6" fill="currentColor"/>
              </svg>
              System {session.system_prompt ? "●" : ""}
            </button>

            <button
              onClick={() => { onToggleNotes(); setShowOverflow(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                cursor: "pointer", border: "none", background: "none", fontSize: 12,
                color: session.notes ? "var(--accent-text)" : "var(--text-dim)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                <path d="M2 2h8v8H2zM4 4h4M4 6h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
              </svg>
              Notes {session.notes ? "●" : ""}
            </button>

            <button
              onClick={async () => {
                setShowOverflow(false);
                if (session.worktree_dir) {
                  await fetchApi(`/api/sessions/${session.id}/worktree`, { method: "DELETE" });
                  onSessionUpdate({ worktree_dir: null });
                  toast.success("Worktree removed");
                } else {
                  const res = await fetchApi<{ worktreeDir?: string; error?: string }>(`/api/sessions/${session.id}/worktree`, { method: "POST" });
                  if (res.error) { toast.error(res.error); return; }
                  onSessionUpdate({ worktree_dir: res.worktreeDir });
                  toast.success("Worktree created");
                }
              }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                cursor: "pointer", border: "none", background: "none", fontSize: 12,
                color: session.worktree_dir ? "var(--green)" : "var(--text-dim)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="3" cy="3" r="1.5" stroke="currentColor" strokeWidth="1"/>
                <circle cx="9" cy="3" r="1.5" stroke="currentColor" strokeWidth="1"/>
                <circle cx="3" cy="9" r="1.5" stroke="currentColor" strokeWidth="1"/>
                <path d="M3 4.5v3M4.5 3h3M3 4.5C3 7 9 7 9 4.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
              </svg>
              Worktree {session.worktree_dir ? "●" : ""}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
