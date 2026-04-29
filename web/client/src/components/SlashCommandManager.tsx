import React, { useState, useEffect, useRef } from "react";

const LS_KEY = "hm-slash-commands";

export interface CustomSlashCommand {
  trigger: string;
  expansion: string;
}

function loadCustomCommands(): CustomSlashCommand[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomSlashCommand[];
  } catch {
    return [];
  }
}

function saveCustomCommands(cmds: CustomSlashCommand[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(cmds));
}

export { loadCustomCommands, saveCustomCommands };

interface SlashCommandManagerProps {
  onClose: () => void;
}

export function SlashCommandManager({ onClose }: SlashCommandManagerProps) {
  const [commands, setCommands] = useState<CustomSlashCommand[]>(() => loadCustomCommands());
  const [triggerDraft, setTriggerDraft] = useState("");
  const [expansionDraft, setExpansionDraft] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const triggerRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const save = () => {
    const trigger = triggerDraft.replace(/^\/+/, "").trim();
    const expansion = expansionDraft.trim();
    if (!trigger || !expansion) return;
    let updated: CustomSlashCommand[];
    if (editIdx !== null) {
      updated = commands.map((c, i) => i === editIdx ? { trigger, expansion } : c);
      setEditIdx(null);
    } else {
      if (commands.find(c => c.trigger === trigger)) return;
      updated = [...commands, { trigger, expansion }];
    }
    saveCustomCommands(updated);
    setCommands(updated);
    setTriggerDraft("");
    setExpansionDraft("");
  };

  const startEdit = (idx: number) => {
    const c = commands[idx];
    setTriggerDraft(c.trigger);
    setExpansionDraft(c.expansion);
    setEditIdx(idx);
    triggerRef.current?.focus();
  };

  const cancelEdit = () => {
    setEditIdx(null);
    setTriggerDraft("");
    setExpansionDraft("");
  };

  const remove = (idx: number) => {
    const updated = commands.filter((_, i) => i !== idx);
    saveCustomCommands(updated);
    setCommands(updated);
    if (editIdx === idx) cancelEdit();
  };

  return (
    <div
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "var(--overlay-bg)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{
        background: "var(--bg-panel)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", width: 480, maxWidth: "calc(100vw - 32px)",
        maxHeight: "80vh", display: "flex", flexDirection: "column",
        boxShadow: "var(--shadow-xl)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Slash Command Manager</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1, padding: "2px 4px" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
          >×</button>
        </div>

        {/* Command list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {commands.length === 0 && (
            <div style={{ padding: "16px 16px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
              No custom commands yet. Add one below.
            </div>
          )}
          {commands.map((cmd, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "8px 16px",
              background: editIdx === i ? "var(--bg-active)" : "transparent",
            }}>
              <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 600, flexShrink: 0, marginTop: 1 }}>/{cmd.trigger}</span>
              <span style={{ flex: 1, fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5, wordBreak: "break-word" }}>{cmd.expansion}</span>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button
                  onClick={() => startEdit(i)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text-muted)", padding: "2px 5px", borderRadius: "var(--radius-sm)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
                >Edit</button>
                <button
                  onClick={() => remove(i)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text-muted)", padding: "2px 5px", borderRadius: "var(--radius-sm)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--red) 12%, transparent)"; e.currentTarget.style.color = "var(--red)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
                >Delete</button>
              </div>
            </div>
          ))}
        </div>

        {/* Add / edit form */}
        <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {editIdx !== null ? "Edit command" : "Add command"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 0, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", width: 140, flexShrink: 0 }}>
              <span style={{ padding: "0 6px 0 8px", fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)", userSelect: "none" }}>/</span>
              <input
                ref={triggerRef}
                value={triggerDraft}
                onChange={e => setTriggerDraft(e.target.value.replace(/[^a-z0-9_-]/gi, ""))}
                placeholder="trigger"
                onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }}
                style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12, color: "var(--text)", fontFamily: "var(--font-mono)", padding: "6px 8px 6px 0" }}
              />
            </div>
            <input
              value={expansionDraft}
              onChange={e => setExpansionDraft(e.target.value)}
              placeholder="Expansion text..."
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
              style={{ flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", outline: "none", fontSize: 12, color: "var(--text)", fontFamily: "var(--font-sans)", padding: "6px 10px" }}
            />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={save}
              disabled={!triggerDraft.trim() || !expansionDraft.trim()}
              style={{
                fontSize: 12, padding: "5px 12px",
                background: triggerDraft.trim() && expansionDraft.trim() ? "var(--accent)" : "var(--bg-active)",
                color: triggerDraft.trim() && expansionDraft.trim() ? "var(--text-on-accent)" : "var(--text-muted)",
                border: "none", borderRadius: "var(--radius-md)", cursor: triggerDraft.trim() && expansionDraft.trim() ? "pointer" : "default",
                fontFamily: "var(--font-sans)", transition: "background var(--transition)",
              }}
            >{editIdx !== null ? "Save changes" : "Add command"}</button>
            {editIdx !== null && (
              <button
                onClick={cancelEdit}
                style={{ fontSize: 12, padding: "5px 12px", background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer", color: "var(--text-muted)", fontFamily: "var(--font-sans)" }}
              >Cancel</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
