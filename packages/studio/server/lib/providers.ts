import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

function detectInstalledCLIs(): Set<string> {
  const detected = new Set<string>();
  try {
    execSync("which codex", { stdio: "pipe" });
    detected.add("codex");
  } catch { /* not found */ }
  if (process.env.OPENAI_API_KEY) detected.add("codex");
  if (process.env.ANTHROPIC_API_KEY) detected.add("claude");
  return detected;
}

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
  model: "claude-opus-4-5-20251001",
  providers: [
    { id: "claude",  name: "Claude",  enabled: true },
    { id: "openai",  name: "OpenAI",  enabled: false },
    { id: "gemini",  name: "Gemini",  enabled: false },
    { id: "mistral", name: "Mistral", enabled: false },
    { id: "grok",    name: "Grok",    enabled: false },
    { id: "ollama",  name: "Ollama",  baseUrl: "http://localhost:11434", enabled: false },
    { id: "codex",   name: "Codex (OpenAI)", enabled: false },
  ],
};

export function loadProviders(dataDir: string): ProvidersStore {
  const filePath = join(dataDir, "providers.json");
  if (!existsSync(filePath)) {
    const store = structuredClone(DEFAULT_STORE);
    const detected = detectInstalledCLIs();
    store.providers = store.providers.map(p =>
      detected.has(p.id) ? { ...p, enabled: true } : p
    );
    return store;
  }
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ProvidersStore>;
    // Merge with defaults to handle missing providers in saved config
    const providerIds = new Set((parsed.providers ?? []).map(p => p.id));
    const merged: ProvidersStore = {
      active: parsed.active ?? DEFAULT_STORE.active,
      model: parsed.model ?? DEFAULT_STORE.model,
      providers: [
        ...(parsed.providers ?? []),
        ...DEFAULT_STORE.providers.filter(p => !providerIds.has(p.id)),
      ],
    };
    return merged;
  } catch {
    return structuredClone(DEFAULT_STORE);
  }
}

export function saveProviders(dataDir: string, store: ProvidersStore): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const filePath = join(dataDir, "providers.json");
  writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}
