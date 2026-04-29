import React from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";
import type { Session } from "../types";
import type { FileEdit } from "./DiffPane";

interface ComposePopoverProps {
  session: Session;
  patchSession: (updates: Partial<Session>) => Promise<void>;
  onSessionUpdate: (updates: Partial<Session>) => void;
  fileEdits: FileEdit[];
  showDiffPane: boolean;
  onToggleDiffPane: () => void;
  onToggleSystemPrompt: () => void;
  onToggleNotes: () => void;
  onClose: () => void;
}

function PopoverRow({ children, active, onClick, color = "var(--text)" }: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8,
        padding: "6px 12px", cursor: "pointer", border: "none", background: "none",
        fontSize: 12, color: active ? color : "var(--text-dim)", textAlign: "left",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "none")}
    >
      {children}
    </button>
  );
}

export function ComposePopover({
  session, patchSession, onSessionUpdate,
  fileEdits, showDiffPane,
  onToggleDiffPane, onToggleSystemPrompt, onToggleNotes, onClose,
}: ComposePopoverProps) {
  return (
    <div style={{
      position: "absolute", zIndex: 100,
      bottom: "calc(100% + 8px)", left: 0,
      background: "var(--bg-panel)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)", padding: "4px 0", minWidth: 180,
      boxShadow: "0 -4px 20px rgba(0,0,0,0.35)",
    }}>
      {/* Think level */}
      <div style={{ padding: "4px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Think</span>
        <select
          value={session.thinking_level ?? "none"}
          onChange={e => void patchSession({ thinking_level: e.target.value })}
          style={{
            fontSize: 11, background: "var(--bg-elevated)", color: "var(--text)",
            border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px",
            cursor: "pointer", fontFamily: "var(--font-sans)",
          }}
        >
          <option value="none">Off</option>
          <option value="low">Low</option>
          <option value="medium">Med</option>
          <option value="high">High</option>
          <option value="xhigh">Max</option>
        </select>
      </div>

      <PopoverRow
        active={!!session.plan_mode}
        color="var(--accent)"
        onClick={() => void patchSession({ plan_mode: session.plan_mode ? 0 : 1 })}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 3h8M2 6h5M2 9h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        Plan mode {session.plan_mode ? "●" : ""}
      </PopoverRow>

      <PopoverRow
        active={!!session.fast_mode}
        color="var(--yellow)"
        onClick={() => void patchSession({ fast_mode: session.fast_mode ? 0 : 1 })}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <path d="M7 1L2 7h4l-1 4 5-6H6l1-4z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
        </svg>
        Fast mode {session.fast_mode ? "●" : ""}
      </PopoverRow>

      <PopoverRow
        active={session.require_tool_approval !== 0}
        color="var(--accent)"
        onClick={() => void patchSession({ require_tool_approval: session.require_tool_approval !== 0 ? 0 : 1 })}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Approvals {session.require_tool_approval !== 0 ? "●" : ""}
      </PopoverRow>

      <div style={{ height: 1, background: "var(--border-dim)", margin: "4px 0" }} />

      <PopoverRow
        active={fileEdits.length > 0 || showDiffPane}
        color="var(--green)"
        onClick={() => { onToggleDiffPane(); onClose(); }}
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 3h10M2 7h6M2 11h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <path d="M10 9l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Diff {fileEdits.length > 0 ? `(${fileEdits.length})` : ""}
      </PopoverRow>

      <PopoverRow
        active={!!session.system_prompt}
        color="var(--accent-text)"
        onClick={() => { onToggleSystemPrompt(); onClose(); }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.1"/>
          <path d="M6 4v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          <circle cx="6" cy="8.5" r="0.6" fill="currentColor"/>
        </svg>
        System prompt {session.system_prompt ? "●" : ""}
      </PopoverRow>

      <PopoverRow
        active={!!session.notes}
        color="var(--accent-text)"
        onClick={() => { onToggleNotes(); onClose(); }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2 2h8v8H2zM4 4h4M4 6h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
        </svg>
        Notes {session.notes ? "●" : ""}
      </PopoverRow>

      <PopoverRow
        active={!!session.worktree_dir}
        color="var(--green)"
        onClick={async () => {
          onClose();
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
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="3" cy="3" r="1.5" stroke="currentColor" strokeWidth="1"/>
          <circle cx="9" cy="3" r="1.5" stroke="currentColor" strokeWidth="1"/>
          <circle cx="3" cy="9" r="1.5" stroke="currentColor" strokeWidth="1"/>
          <path d="M3 4.5v3M4.5 3h3M3 4.5C3 7 9 7 9 4.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
        </svg>
        Worktree {session.worktree_dir ? "●" : ""}
      </PopoverRow>
    </div>
  );
}
