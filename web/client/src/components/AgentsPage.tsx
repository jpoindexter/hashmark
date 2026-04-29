import { useState, useEffect, useCallback } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";
import type { Agent } from "../types";

export function AgentsPage({ onRunAgent }: { onRunAgent?: (agent: Agent) => void }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchApi<Agent[]>("/api/agents");
      setAgents(data);
    } catch { toast.error("Failed to load agents"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    try {
      const a = await fetchApi<Agent>("/api/agents", {
        method: "POST",
        body: JSON.stringify({ name: "New Agent", system_prompt: "" }),
      });
      setAgents(prev => [a, ...prev]);
      setSelected(a);
    } catch { toast.error("Failed to create agent"); }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this agent?")) return;
    try {
      await fetchApi(`/api/agents/${id}`, { method: "DELETE" });
      setAgents(prev => prev.filter(a => a.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch { toast.error("Failed to delete"); }
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* List */}
      <div style={{ width: 220, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ padding: "6px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center" }}>
          <div style={{ flex: 1 }} />
          <button onClick={create} className="btn btn-secondary btn-xs">+ New</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && <div style={{ padding: 14, fontSize: 12, color: "var(--text-muted)" }}>Loading...</div>}
          {!loading && agents.length === 0 && (
            <div style={{ padding: "32px 14px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
              No agents yet.<br />
              <button onClick={create} style={{ marginTop: 8, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>Create one</button>
            </div>
          )}
          {agents.map(a => (
            <div
              key={a.id}
              onClick={() => setSelected(a)}
              style={{
                padding: "8px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                background: selected?.id === a.id ? "var(--bg-active)" : "none",
                display: "flex", alignItems: "center", gap: 6,
              }}
              onMouseEnter={e => { if (selected?.id !== a.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { if (selected?.id !== a.id) e.currentTarget.style.background = "none"; }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                {a.description && <div style={{ fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.description}</div>}
              </div>
              {onRunAgent && (
                <button
                  className="btn btn-primary btn-xs"
                  onClick={e => { e.stopPropagation(); onRunAgent(a); }}
                  title="Run this agent in a new session"
                  style={{ opacity: 0, transition: "opacity 80ms" }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "0")}
                >Run</button>
              )}
              <button
                className="btn btn-ghost btn-sm"
                onClick={e => { e.stopPropagation(); void del(a.id); }}
                style={{ fontSize: 14, opacity: 0 }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "0")}
              >×</button>
            </div>
          ))}
        </div>
      </div>

      {/* Editor */}
      {selected ? (
        <AgentEditor
          key={selected.id}
          agent={selected}
          onSave={(updated) => {
            setAgents(prev => prev.map(a => a.id === updated.id ? updated : a));
            setSelected(updated);
          }}
          onRun={onRunAgent}
        />
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>
          Select an agent to edit
        </div>
      )}
    </div>
  );
}

function AgentEditor({ agent, onSave, onRun }: { agent: Agent; onSave: (a: Agent) => void; onRun?: (a: Agent) => void }) {
  const [name, setName] = useState(agent.name);
  const [desc, setDesc] = useState(agent.description ?? "");
  const [prompt, setPrompt] = useState(agent.system_prompt);
  const [saving, setSaving] = useState(false);
  const dirty = name !== agent.name || desc !== (agent.description ?? "") || prompt !== agent.system_prompt;

  const save = async () => {
    setSaving(true);
    try {
      const updated = await fetchApi<Agent>(`/api/agents/${agent.id}`, {
        method: "PUT",
        body: JSON.stringify({ name, description: desc || null, model: agent.model, system_prompt: prompt }),
      });
      onSave(updated);
      toast.success("Agent saved");
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          style={{ flex: 1, background: "none", border: "none", color: "var(--text)", fontSize: 13, fontWeight: 600, outline: "none", fontFamily: "var(--font-mono)" }}
        />
        {dirty && (
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        )}
        {onRun && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onRun(agent)}
            title="Open a new session with this agent's system prompt"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2.5 2l7 3.5-7 3.5V2z" fill="currentColor"/></svg>
            Run
          </button>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, padding: "14px", overflow: "auto" }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Description</div>
          <input
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="One-line description of this agent's role"
            style={{ width: "100%", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontSize: 12, padding: "6px 8px", outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>System Prompt</div>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="You are a specialized AI agent..."
            style={{
              flex: 1, minHeight: 300, width: "100%", background: "var(--bg-elevated)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", color: "var(--text)", fontSize: 12, padding: "8px 10px",
              outline: "none", resize: "vertical", fontFamily: "var(--font-mono)", lineHeight: 1.6, boxSizing: "border-box",
            }}
          />
        </div>
      </div>
    </div>
  );
}
