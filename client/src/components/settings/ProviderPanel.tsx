import { useState, useEffect } from "react";
import { fetchApi } from "../../lib/api";
import { SkeletonCard } from "../shared/Skeleton";
import type { EnvVar } from "./SettingsPrimitives";

interface ProviderInfo {
  id: string;
  name: string;
  enabled: boolean;
  hasKey: boolean;
  cliDetected: boolean;
  baseUrl?: string;
}

interface ProvidersData {
  active: string;
  model: string;
  providers: ProviderInfo[];
}

const PROVIDER_ICONS: Record<string, string> = {
  claude: "\u2738", openai: "\u25CE", gemini: "\u25C8",
  mistral: "\u25C7", grok: "\u2726", ollama: "\u25C9", codex: "\u2B21",
};

export const PROVIDER_ENV_KEYS: Record<string, string> = {
  openai: "OPENAI_API_KEY", gemini: "GOOGLE_AI_API_KEY",
  mistral: "MISTRAL_API_KEY", grok: "XAI_API_KEY", codex: "OPENAI_API_KEY",
};

export default function ProviderPanel({ envVars }: { envVars: EnvVar[] }) {
  const [data, setData] = useState<ProvidersData | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [baseUrlInputs, setBaseUrlInputs] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [testStatus, setTestStatus] = useState<Record<string, "idle" | "testing" | "ok" | "fail">>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetchApi("/api/providers").then(r => r.json()).then((d: ProvidersData) => setData(d)).catch(() => {});
  }, []);

  function loadModels(id: string) {
    if (models[id]) return;
    fetchApi(`/api/providers/models/${id}`)
      .then(r => r.json())
      .then((d: { models: string[] }) => setModels(prev => ({ ...prev, [id]: d.models ?? [] })))
      .catch(() => {});
  }

  function toggleExpand(id: string) {
    const next = expanded === id ? null : id;
    setExpanded(next);
    if (next) loadModels(next);
  }

  async function saveKey(providerId: string) {
    const key = keyInputs[providerId] ?? "";
    setSaving(providerId);
    try {
      await fetchApi(`/api/providers/${providerId}/key`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          providers: prev.providers.map(p =>
            p.id === providerId ? { ...p, hasKey: key.length > 0, enabled: key.length > 0 } : p
          ),
        };
      });
      setKeyInputs(prev => ({ ...prev, [providerId]: "" }));
    } finally {
      setSaving(null);
    }
  }

  async function saveBaseUrl(providerId: string) {
    const url = baseUrlInputs[providerId] ?? "";
    if (!url) return;
    setSaving(providerId);
    try {
      await fetchApi(`/api/providers/${providerId}/baseUrl`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: url }),
      });
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          providers: prev.providers.map(p =>
            p.id === providerId ? { ...p, baseUrl: url } : p
          ),
        };
      });
    } finally {
      setSaving(null);
    }
  }

  async function setActive(providerId: string, model?: string) {
    if (!data) return;
    const provModels = models[providerId] ?? [];
    const chosenModel = model ?? provModels[0] ?? data.model;
    await fetchApi("/api/providers/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId, model: chosenModel }),
    });
    setData(prev => prev ? { ...prev, active: providerId, model: chosenModel } : prev);
  }

  async function testConnection(providerId: string) {
    setTestStatus(prev => ({ ...prev, [providerId]: "testing" }));
    try {
      const res = await fetchApi(`/api/providers/models/${providerId}`);
      const d = await res.json() as { models?: string[]; error?: string };
      if (d.models && d.models.length > 0) {
        setModels(prev => ({ ...prev, [providerId]: d.models! }));
        setTestStatus(prev => ({ ...prev, [providerId]: "ok" }));
      } else {
        setTestStatus(prev => ({ ...prev, [providerId]: "fail" }));
      }
    } catch {
      setTestStatus(prev => ({ ...prev, [providerId]: "fail" }));
    }
    setTimeout(() => setTestStatus(prev => ({ ...prev, [providerId]: "idle" })), 3000);
  }

  if (!data) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[1, 2, 3].map(i => <SkeletonCard key={i} height={48} />)}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.providers.map(provider => {
        const isActive = data.active === provider.id;
        const needsKey = provider.id !== "claude" && provider.id !== "ollama";
        const hasEnvKey = envVars.some(v => v.key === PROVIDER_ENV_KEYS[provider.id]);
        const effectivelyHasKey = provider.hasKey || hasEnvKey || provider.cliDetected || provider.id === "claude" || provider.id === "ollama";

        return (
          <ProviderRow
            key={provider.id}
            provider={provider}
            isActive={isActive}
            isExpanded={expanded === provider.id}
            needsKey={needsKey}
            hasEnvKey={hasEnvKey}
            effectivelyHasKey={effectivelyHasKey}
            onToggleExpand={() => toggleExpand(provider.id)}
            keyInput={keyInputs[provider.id] ?? ""}
            onKeyInputChange={v => setKeyInputs(prev => ({ ...prev, [provider.id]: v }))}
            showKey={showKeys[provider.id] ?? false}
            onToggleShowKey={() => setShowKeys(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
            baseUrlInput={baseUrlInputs[provider.id] ?? provider.baseUrl ?? "http://localhost:11434"}
            onBaseUrlChange={v => setBaseUrlInputs(prev => ({ ...prev, [provider.id]: v }))}
            provModels={models[provider.id] ?? []}
            currentModel={data.model}
            testStatus={testStatus[provider.id] ?? "idle"}
            saving={saving}
            onSaveKey={() => void saveKey(provider.id)}
            onSaveBaseUrl={() => void saveBaseUrl(provider.id)}
            onSetActive={(m?: string) => void setActive(provider.id, m)}
            onTestConnection={() => void testConnection(provider.id)}
          />
        );
      })}
    </div>
  );
}

function ProviderRow({
  provider, isActive, isExpanded, needsKey, hasEnvKey, effectivelyHasKey,
  onToggleExpand, keyInput, onKeyInputChange, showKey, onToggleShowKey,
  baseUrlInput, onBaseUrlChange, provModels, currentModel, testStatus: ts,
  saving, onSaveKey, onSaveBaseUrl, onSetActive, onTestConnection,
}: {
  provider: ProviderInfo;
  isActive: boolean;
  isExpanded: boolean;
  needsKey: boolean;
  hasEnvKey: boolean;
  effectivelyHasKey: boolean;
  onToggleExpand: () => void;
  keyInput: string;
  onKeyInputChange: (v: string) => void;
  showKey: boolean;
  onToggleShowKey: () => void;
  baseUrlInput: string;
  onBaseUrlChange: (v: string) => void;
  provModels: string[];
  currentModel: string;
  testStatus: "idle" | "testing" | "ok" | "fail";
  saving: string | null;
  onSaveKey: () => void;
  onSaveBaseUrl: () => void;
  onSetActive: (m?: string) => void;
  onTestConnection: () => void;
}) {
  const icon = PROVIDER_ICONS[provider.id] ?? "\u25CE";

  return (
    <div style={{
      background: "var(--bg-2)",
      border: `1px solid ${isActive ? "var(--accent-border)" : "var(--border-dim)"}`,
      borderRadius: "var(--radius)", overflow: "hidden", transition: "border-color 0.15s",
    }}>
      <div
        onClick={onToggleExpand}
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
          cursor: "pointer", background: isActive ? "var(--accent-bg)" : "transparent",
        }}
      >
        <span style={{ fontSize: 14, color: isActive ? "var(--accent)" : "var(--text-dimmer)", flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: isActive ? "var(--accent)" : "var(--text)" }}>{provider.name}</span>
        {isActive && (
          <span style={{
            fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em",
            color: "var(--accent)", background: "var(--accent-bg)",
            border: "1px solid var(--accent-border)", borderRadius: 3,
            padding: "1px 6px", flexShrink: 0,
          }}>active</span>
        )}
        {provider.cliDetected && !isActive && (
          <span style={{ fontSize: 9, color: "var(--accent)", opacity: 0.8, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 10 }}>&#x2713;</span> CLI detected
          </span>
        )}
        {effectivelyHasKey && !provider.cliDetected && !isActive && (
          <span style={{ fontSize: 9, color: "var(--accent)", opacity: 0.6, flexShrink: 0 }}>key set</span>
        )}
        {needsKey && !effectivelyHasKey && (
          <span style={{ fontSize: 9, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>no key</span>
        )}
        <span style={{ fontSize: 10, color: "var(--text-dimmer)", flexShrink: 0, marginLeft: 4 }}>
          {isExpanded ? "\u25B2" : "\u25BC"}
        </span>
      </div>

      {isExpanded && (
        <ProviderExpandedContent
          provider={provider}
          isActive={isActive}
          needsKey={needsKey}
          hasEnvKey={hasEnvKey}
          effectivelyHasKey={effectivelyHasKey}
          keyInput={keyInput}
          onKeyInputChange={onKeyInputChange}
          showKey={showKey}
          onToggleShowKey={onToggleShowKey}
          baseUrlInput={baseUrlInput}
          onBaseUrlChange={onBaseUrlChange}
          provModels={provModels}
          currentModel={currentModel}
          testStatus={ts}
          saving={saving}
          onSaveKey={onSaveKey}
          onSaveBaseUrl={onSaveBaseUrl}
          onSetActive={onSetActive}
          onTestConnection={onTestConnection}
        />
      )}
    </div>
  );
}

function ProviderExpandedContent({
  provider, isActive, needsKey, hasEnvKey, effectivelyHasKey,
  keyInput, onKeyInputChange, showKey, onToggleShowKey,
  baseUrlInput, onBaseUrlChange, provModels, currentModel, testStatus: ts,
  saving, onSaveKey, onSaveBaseUrl, onSetActive, onTestConnection,
}: {
  provider: ProviderInfo;
  isActive: boolean;
  needsKey: boolean;
  hasEnvKey: boolean;
  effectivelyHasKey: boolean;
  keyInput: string;
  onKeyInputChange: (v: string) => void;
  showKey: boolean;
  onToggleShowKey: () => void;
  baseUrlInput: string;
  onBaseUrlChange: (v: string) => void;
  provModels: string[];
  currentModel: string;
  testStatus: "idle" | "testing" | "ok" | "fail";
  saving: string | null;
  onSaveKey: () => void;
  onSaveBaseUrl: () => void;
  onSetActive: (m?: string) => void;
  onTestConnection: () => void;
}) {
  return (
    <div style={{ borderTop: "1px solid var(--border-dim)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
      {needsKey && (
        <div>
          <div style={{ fontSize: 10, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            API Key
            {PROVIDER_ENV_KEYS[provider.id] && (
              <span style={{ marginLeft: 6, opacity: 0.6 }}>
                (or set <code style={{ color: "var(--accent)", fontFamily: "var(--font)" }}>{PROVIDER_ENV_KEYS[provider.id]}</code> in .env)
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <input
                type={showKey ? "text" : "password"}
                value={keyInput}
                onChange={e => onKeyInputChange(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") onSaveKey(); }}
                placeholder={provider.hasKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "sk-..."}
                style={{
                  width: "100%", background: "var(--bg-3)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius)", color: "var(--text)", fontSize: 11,
                  fontFamily: "var(--font)", padding: "5px 32px 5px 8px", outline: "none",
                }}
              />
              <button
                onClick={onToggleShowKey}
                style={{
                  position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 11, color: "var(--text-dimmer)", padding: 2,
                }}
                title={showKey ? "Hide" : "Show"}
              >
                {showKey ? "\u25C9" : "\u25CB"}
              </button>
            </div>
            <button
              className="btn btn-primary"
              onClick={onSaveKey}
              disabled={saving === provider.id || !keyInput.trim()}
              style={{ fontSize: 11, flexShrink: 0 }}
            >
              {saving === provider.id ? "..." : "Save"}
            </button>
          </div>
          {hasEnvKey && (
            <div style={{ fontSize: 10, color: "var(--accent)", marginTop: 4, opacity: 0.7 }}>Key detected in environment</div>
          )}
        </div>
      )}

      {provider.id === "ollama" && (
        <div>
          <div style={{ fontSize: 10, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Ollama URL</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={baseUrlInput}
              onChange={e => onBaseUrlChange(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") onSaveBaseUrl(); }}
              style={{
                flex: 1, background: "var(--bg-3)", border: "1px solid var(--border)",
                borderRadius: "var(--radius)", color: "var(--text)", fontSize: 11,
                fontFamily: "var(--font)", padding: "5px 8px", outline: "none",
              }}
            />
            <button
              onClick={onSaveBaseUrl}
              disabled={saving === provider.id}
              style={{
                padding: "5px 10px", background: "none", border: "1px solid var(--border)",
                borderRadius: "var(--radius)", color: "var(--text-dim)", fontSize: 11,
                fontFamily: "var(--font-ui)", cursor: "pointer", flexShrink: 0,
              }}
            >Set</button>
          </div>
        </div>
      )}

      {provider.id === "claude" && (
        <div style={{ fontSize: 11, color: "var(--text-dimmer)", lineHeight: 1.5 }}>
          Uses CLI auth -- no API key needed. Run <code style={{ color: "var(--accent)", fontFamily: "var(--font)" }}>claude auth</code> to authenticate.
        </div>
      )}

      {provModels.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Model</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {provModels.map(m => {
              const isCurrent = isActive && m === currentModel;
              return (
                <div
                  key={m}
                  onClick={() => { if (isActive) onSetActive(m); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "5px 10px", borderRadius: "var(--radius-sm)",
                    background: isCurrent ? "var(--accent-bg)" : "var(--bg-3)",
                    border: `1px solid ${isCurrent ? "var(--accent-border)" : "var(--border-dim)"}`,
                    cursor: isActive ? "pointer" : "default",
                  }}
                >
                  <code style={{ fontSize: 11, color: isCurrent ? "var(--accent)" : "var(--text-dim)", fontFamily: "var(--font)" }}>{m}</code>
                  {isCurrent && <span style={{ fontSize: 9, color: "var(--accent)", opacity: 0.7 }}>active</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {!isActive && (
          <button className={effectivelyHasKey ? "btn btn-primary" : "btn"} onClick={() => onSetActive()} style={{ fontSize: 11 }}>
            Set Active
          </button>
        )}
        <button
          className="btn btn-sm"
          onClick={onTestConnection}
          disabled={ts === "testing"}
          style={{ color: ts === "ok" ? "var(--accent)" : ts === "fail" ? "var(--red)" : undefined }}
        >
          {ts === "testing" ? "Testing..." : ts === "ok" ? "Connected" : ts === "fail" ? "Failed" : "Test connection"}
        </button>
      </div>
    </div>
  );
}
