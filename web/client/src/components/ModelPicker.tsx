import { useState } from "react";

export interface ProviderConfig { id: string; name: string; enabled: boolean; }
export interface ProvidersStore { active: string; model: string; providers: ProviderConfig[]; }

export const MODEL_SUGGESTIONS: Record<string, string[]> = {
  claude:     ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  anthropic:  ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  openai:     ["gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
  codex:      ["gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
  google:     ["gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-flash"],
  gemini:     ["gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-flash"],
  gh:         ["claude-opus-4-6", "claude-sonnet-4-6", "gpt-4o"],
  mistral:    ["mistral-large-latest", "mistral-small-latest"],
  grok:       ["grok-3", "grok-3-mini"],
  groq:       ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
  deepseek:   ["deepseek-chat", "deepseek-reasoner"],
  openrouter: ["anthropic/claude-sonnet-4-6", "openai/gpt-4o"],
  ollama:     ["llama3.2", "mistral", "codestral"],
};

const CLI_PROVIDER_NAMES: Record<string, string> = {
  gemini: "Gemini CLI",
  codex: "Codex CLI",
  gh: "GitHub Copilot",
};

export function ModelPicker({
  currentModel, currentProvider, providers, onSelect,
}: {
  currentModel: string;
  currentProvider: string;
  providers: ProvidersStore;
  onSelect: (model: string, provider: string) => void;
}) {
  const [customModel, setCustomModel] = useState(currentModel);
  const [search, setSearch] = useState("");

  const enabledProviders = providers.providers.filter(p => p.enabled);
  const activeId = providers.active;
  const activeInList = enabledProviders.some(p => p.id === activeId);
  const activeCliSuggestions = MODEL_SUGGESTIONS[activeId] ?? [];
  const pickerProviders: Array<{ id: string; name: string }> = [
    ...((!activeInList && activeCliSuggestions.length > 0)
      ? [{ id: activeId, name: CLI_PROVIDER_NAMES[activeId] ?? activeId }]
      : []),
    ...enabledProviders.map(p => ({ id: p.id, name: p.name })),
  ];

  return (
    <div style={{
      position: "absolute", top: 0, left: 14, zIndex: 100,
      background: "var(--bg-panel)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)", padding: 12, width: 260,
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    }}>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search models..."
        autoFocus
        style={{
          width: "100%", padding: "6px 8px", marginBottom: 10,
          background: "var(--bg)", border: "1px solid var(--border-focus)",
          borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text)",
          outline: "none", boxSizing: "border-box",
        }}
      />
      {pickerProviders.map(p => {
        const suggestions = (MODEL_SUGGESTIONS[p.id] ?? []).filter(m =>
          !search || m.toLowerCase().includes(search.toLowerCase())
        );
        if (!suggestions.length) return null;
        return (
          <div key={p.id} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
              {p.name}
            </div>
            {suggestions.map(m => (
              <button
                key={m}
                onClick={() => onSelect(m, p.id)}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "4px 8px", fontSize: 12, borderRadius: 3,
                  background: m === currentModel && p.id === currentProvider ? "var(--bg-active)" : "none",
                  color: m === currentModel && p.id === currentProvider ? "var(--text)" : "var(--text-dim)",
                  cursor: "pointer", border: "none",
                  transition: "background var(--transition)",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = m === currentModel && p.id === currentProvider ? "var(--bg-active)" : "none")}
              >
                {m}
              </button>
            ))}
          </div>
        );
      })}

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 4 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>Custom model ID</div>
        <div style={{ display: "flex", gap: 4 }}>
          <input
            value={customModel}
            onChange={e => setCustomModel(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onSelect(customModel, currentProvider); }}
            style={{
              flex: 1, padding: "4px 7px", fontSize: 11, background: "var(--bg)",
              border: "1px solid var(--border)", borderRadius: 3, color: "var(--text)", outline: "none",
            }}
            placeholder="model-id"
          />
          <button
            onClick={() => onSelect(customModel, currentProvider)}
            style={{ padding: "4px 8px", fontSize: 11, background: "var(--accent)", color: "var(--text-on-accent)", border: "none", borderRadius: 3, cursor: "pointer" }}
          >
            Set
          </button>
        </div>
      </div>
    </div>
  );
}
