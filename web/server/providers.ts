import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export const PROVIDER_ENV_KEYS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  claude: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  codex: "OPENAI_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  gemini: "GOOGLE_AI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  grok: "XAI_API_KEY",
  groq: "GROQ_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  together: "TOGETHER_API_KEY",
  fireworks: "FIREWORKS_API_KEY",
  vercel: "VERCEL_API_TOKEN",
  "302ai": "302AI_API_KEY",
};

export interface ProviderConfig {
  id: string;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
}

export interface ProvidersStore {
  active: string;
  model: string;
  providers: ProviderConfig[];
}

const DEFAULT_STORE: ProvidersStore = {
  active: "claude",
  model: "claude-sonnet-4-6",
  providers: [
    { id: "claude",     name: "Claude (OAuth)",   enabled: true },
    { id: "anthropic",  name: "Anthropic API",    enabled: false },
    { id: "openai",     name: "OpenAI",           enabled: false },
    { id: "google",     name: "Google Gemini",    enabled: false },
    { id: "mistral",    name: "Mistral",          enabled: false },
    { id: "grok",       name: "xAI Grok",         enabled: false },
    { id: "groq",       name: "Groq",             enabled: false },
    { id: "deepseek",   name: "DeepSeek",         enabled: false },
    { id: "openrouter", name: "OpenRouter",       enabled: false },
    { id: "together",   name: "Together AI",      enabled: false },
    { id: "fireworks",  name: "Fireworks",        enabled: false },
    { id: "vercel",     name: "Vercel AI Gateway", baseUrl: "https://api.v0.dev/v1/chat/completions", enabled: false },
    { id: "302ai",      name: "302.AI",           baseUrl: "https://api.302.ai/v1/chat/completions", enabled: false },
    { id: "ollama",     name: "Ollama", baseUrl: "http://localhost:11434", enabled: false },
  ],
};

function applyEnvKeys(store: ProvidersStore): void {
  for (const p of store.providers) {
    const envKey = PROVIDER_ENV_KEYS[p.id];
    if (envKey && process.env[envKey] && !p.apiKey) p.enabled = true;
  }
}

export function loadProviders(dataDir: string): ProvidersStore {
  const filePath = join(dataDir, "providers.json");
  if (!existsSync(filePath)) {
    const store = structuredClone(DEFAULT_STORE);
    applyEnvKeys(store);
    return store;
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Partial<ProvidersStore>;
    const knownIds = new Set((parsed.providers ?? []).map(p => p.id));
    const store: ProvidersStore = {
      active: parsed.active ?? DEFAULT_STORE.active,
      model: parsed.model ?? DEFAULT_STORE.model,
      providers: [
        ...(parsed.providers ?? []),
        ...DEFAULT_STORE.providers.filter(p => !knownIds.has(p.id)),
      ],
    };
    applyEnvKeys(store);
    return store;
  } catch {
    return structuredClone(DEFAULT_STORE);
  }
}

export function saveProviders(dataDir: string, store: ProvidersStore): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "providers.json"), JSON.stringify(store, null, 2), { mode: 0o600 });
}
