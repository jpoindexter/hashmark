import { SectionView, InfoNote, ApiKeyStatus, type EnvVar } from "./SettingsPrimitives";
import ProviderPanel from "./ProviderPanel";
import ScanConfigPanel from "./ScanConfigPanel";

export function ProvidersSection({ envVars }: { envVars: EnvVar[] }) {
  return (
    <SectionView title="Providers" description="Configure AI providers, API keys, and model selection.">
      <InfoNote>
        Claude uses CLI auth by default -- no key needed. For other providers, enter your API key below or set the corresponding env var in <code style={{ color: "var(--accent)" }}>.env.local</code>.
      </InfoNote>
      <ProviderPanel envVars={envVars} />
    </SectionView>
  );
}

export function ScanSection() {
  return (
    <SectionView title="Scan" description="Default behavior for hashmark scans and output generation.">
      <ScanConfigPanel />
    </SectionView>
  );
}

export function ApiKeysSection({ envVars }: { envVars: EnvVar[] }) {
  return (
    <SectionView title="API Keys" description="Keys read from environment variables. Never stored by Studio.">
      <InfoNote>
        API keys are loaded from <code style={{ color: "var(--accent)" }}>.env.local</code> or your shell environment.
        Set them there -- Studio only reads, never writes.
      </InfoNote>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        {([
          ["ANTHROPIC_API_KEY", "Claude (Anthropic)", "claude-*"],
          ["OPENAI_API_KEY", "OpenAI / GPT", "gpt-*, o*"],
          ["GOOGLE_AI_API_KEY", "Google Gemini", "gemini-*"],
          ["XAI_API_KEY", "xAI Grok", "grok-*"],
          ["MISTRAL_API_KEY", "Mistral", "mistral-*"],
          ["GROQ_API_KEY", "Groq", "mixtral-*, llama*"],
        ] as const).map(([key, label, models]) => (
          <div
            key={key}
            style={{
              background: "var(--bg-2)", border: "1px solid var(--border-dim)",
              borderRadius: "var(--radius)", padding: "10px 14px",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "var(--text)" }}>{label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                <code style={{ fontSize: 10, color: "var(--accent)", fontFamily: "var(--font)" }}>{key}</code>
                <span style={{ fontSize: 10, color: "var(--text-dimmer)" }}>-- {models}</span>
              </div>
            </div>
            <ApiKeyStatus envKey={key} envVars={envVars} />
          </div>
        ))}
      </div>
    </SectionView>
  );
}
