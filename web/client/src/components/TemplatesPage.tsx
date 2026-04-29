import { useState, useEffect } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";
import type { Session, Template } from "../types";

export function TemplatesPage({ onCreateSession }: { onCreateSession: (session: Session) => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "", system_prompt: "", model: "" });

  useEffect(() => {
    fetchApi<Template[]>("/api/templates").then(setTemplates).catch(() => {});
  }, []);

  const save = async () => {
    if (!draft.name.trim()) { toast.error("Name required"); return; }
    try {
      const t = await fetchApi<Template>("/api/templates", {
        method: "POST",
        body: JSON.stringify({ name: draft.name.trim(), description: draft.description || null, system_prompt: draft.system_prompt || null, model: draft.model || null }),
      });
      setTemplates(prev => [t, ...prev]);
      setDraft({ name: "", description: "", system_prompt: "", model: "" });
      setCreating(false);
      toast.success("Template saved");
    } catch { toast.error("Failed to save"); }
  };

  const deleteTemplate = async (id: string) => {
    await fetchApi(`/api/templates/${id}`, { method: "DELETE" });
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const useTemplate = async (t: Template) => {
    try {
      const session = await fetchApi<Session>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          title: t.name,
          model: t.model ?? undefined,
          system_prompt: t.system_prompt ?? undefined,
          project_dir: t.project_dir ?? undefined,
        }),
      });
      onCreateSession(session);
      toast.success(`Session started from "${t.name}"`);
    } catch { toast.error("Failed to create session"); }
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Session Templates</span>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(v => !v)}>
          {creating ? "Cancel" : "+ New"}
        </button>
      </div>

      {creating && (
        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            autoFocus
            placeholder="Template name *"
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            style={{ padding: "6px 8px", fontSize: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", outline: "none" }}
          />
          <input
            placeholder="Description (optional)"
            value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            style={{ padding: "6px 8px", fontSize: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", outline: "none" }}
          />
          <textarea
            placeholder="System prompt (optional)"
            value={draft.system_prompt}
            onChange={e => setDraft(d => ({ ...d, system_prompt: e.target.value }))}
            rows={4}
            style={{ padding: "6px 8px", fontSize: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", outline: "none", resize: "vertical", fontFamily: "var(--font-mono)" }}
          />
          <input
            placeholder="Default model (optional, e.g. claude-sonnet-4-6)"
            value={draft.model}
            onChange={e => setDraft(d => ({ ...d, model: e.target.value }))}
            style={{ padding: "6px 8px", fontSize: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", outline: "none", fontFamily: "var(--font-mono)" }}
          />
          <button className="btn btn-primary" style={{ alignSelf: "flex-start", fontSize: 12 }} onClick={save}>Save Template</button>
        </div>
      )}

      {templates.length === 0 && !creating && (
        <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", padding: "24px 0" }}>
          No templates yet. Create one to quickly start sessions with a preset system prompt and model.
        </div>
      )}

      {templates.map(t => (
        <div key={t.id} className="card" style={{ padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{t.name}</div>
              {t.description && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{t.description}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                {t.model && <span style={{ fontSize: 10, color: "var(--accent)", fontFamily: "var(--font-mono)" }}>{t.model}</span>}
                {t.system_prompt && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{t.system_prompt.slice(0, 60)}{t.system_prompt.length > 60 ? "…" : ""}</span>}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => void useTemplate(t)}>Use</button>
            <button className="btn btn-sm" onClick={() => void deleteTemplate(t.id)} style={{ color: "var(--text-muted)" }}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
