export const PROVIDER_ICONS: Record<string, string> = {
  claude: "\u2738", openai: "\u25CE", gemini: "\u25C8",
  mistral: "\u25C7", grok: "\u2726", ollama: "\u25C9", codex: "\u2B21",
};

export const PROVIDER_ENV_KEYS: Record<string, string> = {
  openai: "OPENAI_API_KEY", gemini: "GOOGLE_AI_API_KEY",
  mistral: "MISTRAL_API_KEY", grok: "XAI_API_KEY", codex: "OPENAI_API_KEY",
};

export interface ProviderInfo {
  id: string;
  name: string;
  enabled: boolean;
  hasKey: boolean;
  cliDetected: boolean;
  baseUrl?: string;
}

export interface ProviderRowProps {
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
}

export default function ProviderRow({
  provider, isActive, isExpanded, needsKey, hasEnvKey, effectivelyHasKey,
  onToggleExpand, keyInput, onKeyInputChange, showKey, onToggleShowKey,
  baseUrlInput, onBaseUrlChange, provModels, currentModel, testStatus: ts,
  saving, onSaveKey, onSaveBaseUrl, onSetActive, onTestConnection,
}: ProviderRowProps) {
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
      )}
    </div>
  );
}
