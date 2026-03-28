import { useState, useEffect, useRef } from "react";
import { fetchApi } from "../lib/api";

interface ProviderInfo {
  id: string;
  name: string;
  enabled: boolean;
  hasKey: boolean;
  baseUrl?: string;
}

interface ProvidersData {
  active: string;
  model: string;
  providers: ProviderInfo[];
}

const PROVIDER_ICONS: Record<string, string> = {
  claude:  "✸",
  openai:  "◎",
  gemini:  "◈",
  mistral: "◇",
  grok:    "✦",
  ollama:  "◉",
};

export default function ProviderSelector() {
  const [data, setData] = useState<ProvidersData | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [keyInput, setKeyInput] = useState<{ providerId: string; value: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [baseUrlInput, setBaseUrlInput] = useState<string>("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProviders();
  }, []);

  function loadProviders() {
    fetchApi("/api/providers")
      .then(r => r.json())
      .then((d: ProvidersData) => {
        setData(d);
        return fetchModels(d.active);
      })
      .catch(() => {});
  }

  function fetchModels(providerId: string): Promise<void> {
    return fetchApi(`/api/providers/models/${providerId}`)
      .then(r => r.json())
      .then((d: { models: string[] }) => setModels(d.models ?? []))
      .catch(() => {});
  }

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setKeyInput(null);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  async function selectProvider(providerId: string) {
    if (!data) return;
    const provider = data.providers.find(p => p.id === providerId);
    if (!provider) return;

    // If provider needs a key and doesn't have one, show key input instead of switching
    if (providerId !== "claude" && providerId !== "ollama" && !provider.hasKey) {
      setKeyInput({ providerId, value: "" });
      return;
    }

    await fetchModels(providerId);
    // Pick the first model for the new provider
    const newModels = await fetchApi(`/api/providers/models/${providerId}`)
      .then(r => r.json())
      .then((d: { models: string[] }) => d.models ?? [])
      .catch(() => [] as string[]);

    const newModel = newModels[0] ?? data.model;
    await saveActive(providerId, newModel);
  }

  async function saveActive(providerId: string, model: string) {
    if (!data) return;
    setSaving(true);
    try {
      await fetchApi("/api/providers/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, model }),
      });
      setData(prev => prev ? { ...prev, active: providerId, model } : prev);
    } finally {
      setSaving(false);
    }
  }

  async function saveModel(model: string) {
    if (!data) return;
    setSaving(true);
    try {
      await fetchApi("/api/providers/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: data.active, model }),
      });
      setData(prev => prev ? { ...prev, model } : prev);
    } finally {
      setSaving(false);
    }
  }

  async function saveKey() {
    if (!keyInput || !data) return;
    setSaving(true);
    try {
      await fetchApi(`/api/providers/${keyInput.providerId}/key`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: keyInput.value }),
      });
      setKeyInput(null);
      // Now switch to the provider
      const newModels = await fetchApi(`/api/providers/models/${keyInput.providerId}`)
        .then(r => r.json())
        .then((d: { models: string[] }) => d.models ?? [])
        .catch(() => [] as string[]);
      const newModel = newModels[0] ?? data.model;
      await saveActive(keyInput.providerId, newModel);
      loadProviders();
    } finally {
      setSaving(false);
    }
  }

  async function saveBaseUrl() {
    if (!data) return;
    const ollamaProvider = data.providers.find(p => p.id === "ollama");
    if (!ollamaProvider) return;
    setSaving(true);
    try {
      await fetchApi("/api/providers/ollama/baseUrl", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: baseUrlInput }),
      });
      loadProviders();
    } finally {
      setSaving(false);
    }
  }

  if (!data) return null;

  const activeProvider = data.providers.find(p => p.id === data.active);
  const icon = PROVIDER_ICONS[data.active] ?? "◎";
  const displayModel = data.model.split("/").pop() ?? data.model;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "3px 8px", background: "none", border: "none", borderRadius: 4,
          color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-ui)",
          cursor: "pointer", transition: "background 0.1s, color 0.1s", whiteSpace: "nowrap",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--active-bg)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "none";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)";
        }}
      >
        <span style={{ color: "var(--accent)", fontSize: 13 }}>{icon}</span>
        <span>{activeProvider?.name ?? data.active}</span>
        <span style={{ color: "var(--text-dimmer)", fontSize: 10 }}>/ {displayModel}</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 4px)", left: 0, zIndex: 400,
          background: "var(--bg-3)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", minWidth: 260, maxWidth: 320,
          boxShadow: "0 -4px 20px rgba(0,0,0,0.5)", overflow: "hidden",
        }}>

          {/* Header */}
          <div style={{ padding: "8px 12px 6px", fontSize: 10, fontWeight: 600, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--border-dim)" }}>
            AI Provider
          </div>

          {/* Key input form */}
          {keyInput && (
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-dim)" }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>
                API key for{" "}
                <span style={{ color: "var(--text)", fontWeight: 600 }}>
                  {data.providers.find(p => p.id === keyInput.providerId)?.name ?? keyInput.providerId}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="password"
                  value={keyInput.value}
                  onChange={e => setKeyInput(prev => prev ? { ...prev, value: e.target.value } : null)}
                  onKeyDown={e => { if (e.key === "Enter") void saveKey(); if (e.key === "Escape") setKeyInput(null); }}
                  placeholder="sk-..."
                  autoFocus
                  style={{
                    flex: 1, background: "var(--bg-2)", border: "1px solid var(--border)",
                    borderRadius: "var(--radius)", color: "var(--text)", fontSize: 11,
                    fontFamily: "var(--font)", padding: "5px 8px", outline: "none",
                  }}
                />
                <button
                  onClick={() => void saveKey()}
                  disabled={saving || !keyInput.value.trim()}
                  style={{
                    padding: "5px 10px", background: "var(--accent)", border: "none",
                    borderRadius: "var(--radius)", color: "var(--bg)", fontSize: 11,
                    fontFamily: "var(--font-ui)", cursor: keyInput.value.trim() ? "pointer" : "default",
                    opacity: keyInput.value.trim() ? 1 : 0.4,
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => setKeyInput(null)}
                  style={{
                    padding: "5px 8px", background: "none", border: "1px solid var(--border-dim)",
                    borderRadius: "var(--radius)", color: "var(--text-dimmer)", fontSize: 11,
                    fontFamily: "var(--font-ui)", cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Provider list */}
          {!keyInput && data.providers.map(p => {
            const isActive = p.id === data.active;
            const needsKey = p.id !== "claude" && p.id !== "ollama" && !p.hasKey;
            return (
              <div
                key={p.id}
                onClick={() => void selectProvider(p.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 12px", cursor: "pointer",
                  background: isActive ? "var(--accent-bg)" : "transparent",
                  borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  transition: "background 0.05s",
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "var(--hover-bg)"; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                <span style={{ fontSize: 13, color: isActive ? "var(--accent)" : "var(--text-dimmer)", flexShrink: 0 }}>
                  {PROVIDER_ICONS[p.id] ?? "◎"}
                </span>
                <span style={{ flex: 1, fontSize: 12, color: isActive ? "var(--accent)" : "var(--text-dim)", fontWeight: isActive ? 600 : 400 }}>
                  {p.name}
                </span>
                {p.hasKey && !isActive && (
                  <span style={{ fontSize: 9, color: "var(--accent)", opacity: 0.7 }}>key set</span>
                )}
                {needsKey && (
                  <span style={{ fontSize: 9, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    add key
                  </span>
                )}
                {p.id === "ollama" && (
                  <span style={{ fontSize: 9, color: "var(--text-dimmer)" }}>local</span>
                )}
              </div>
            );
          })}

          {/* Ollama base URL editor (shown when ollama is active) */}
          {!keyInput && data.active === "ollama" && (() => {
            const ollama = data.providers.find(p => p.id === "ollama");
            return (
              <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border-dim)" }}>
                <div style={{ fontSize: 10, color: "var(--text-dimmer)", marginBottom: 4 }}>Ollama URL</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={baseUrlInput || ollama?.baseUrl || "http://localhost:11434"}
                    onChange={e => setBaseUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") void saveBaseUrl(); }}
                    style={{
                      flex: 1, background: "var(--bg-2)", border: "1px solid var(--border)",
                      borderRadius: "var(--radius)", color: "var(--text)", fontSize: 11,
                      fontFamily: "var(--font)", padding: "4px 7px", outline: "none",
                    }}
                  />
                  <button
                    onClick={() => void saveBaseUrl()}
                    disabled={saving}
                    style={{
                      padding: "4px 8px", background: "none", border: "1px solid var(--border-dim)",
                      borderRadius: "var(--radius)", color: "var(--text-dim)", fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Set
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Model selector (shown when not in key-input mode) */}
          {!keyInput && models.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border-dim)", padding: "6px 0" }}>
              <div style={{ padding: "2px 12px 4px", fontSize: 10, fontWeight: 600, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Model
              </div>
              {models.map(m => {
                const isActiveModel = m === data.model;
                return (
                  <div
                    key={m}
                    onClick={() => void saveModel(m)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "5px 12px", cursor: "pointer", fontSize: 11,
                      color: isActiveModel ? "var(--accent)" : "var(--text-dim)",
                      background: isActiveModel ? "var(--accent-bg)" : "transparent",
                      borderLeft: isActiveModel ? "2px solid var(--accent)" : "2px solid transparent",
                      transition: "background 0.05s",
                    }}
                    onMouseEnter={e => { if (!isActiveModel) (e.currentTarget as HTMLDivElement).style.background = "var(--hover-bg)"; }}
                    onMouseLeave={e => { if (!isActiveModel) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                  >
                    <span style={{ fontFamily: "var(--font)", fontWeight: isActiveModel ? 600 : 400 }}>{m}</span>
                    {isActiveModel && <span style={{ fontSize: 9, opacity: 0.7 }}>active</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer hint */}
          <div style={{ padding: "5px 12px 7px", fontSize: 10, color: "var(--text-dimmer)", borderTop: "1px solid var(--border-dim)" }}>
            Claude uses CLI auth by default (no key needed)
          </div>
        </div>
      )}
    </div>
  );
}
