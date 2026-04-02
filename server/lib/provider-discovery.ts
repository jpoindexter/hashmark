/**
 * Provider discovery -- probes local and remote AI providers to find what's available.
 *
 * Detects Ollama (local), Claude CLI, and API-key-backed providers (Anthropic,
 * OpenAI, Google, Groq, DeepSeek, etc.). Returns availability, model lists,
 * and latency. Also recommends the best provider for a given goal.
 */

import { spawnSync } from "child_process";
import { findClaudeBin } from "./bin-resolver.js";
import { loadProviders, type ProvidersStore } from "./providers.js";
import { PROVIDERS } from "./ai-provider.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscoveredProvider {
  id: string;
  name: string;
  available: boolean;
  models: string[];
  source: "local" | "api" | "cli";
  latencyMs?: number;
}

export interface OllamaProbeResult {
  available: boolean;
  models: string[];
  latencyMs?: number;
}

export interface Recommendation {
  provider: string;
  model: string;
  reason: string;
}

// ── Timeout helper ────────────────────────────────────────────────────────────

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

// ── Ollama probe ──────────────────────────────────────────────────────────────

function normalizeOllamaUrl(baseUrl?: string): string {
  const raw = baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  return raw.replace(/\/+$/, "");
}

export async function probeOllama(
  baseUrl?: string,
): Promise<OllamaProbeResult> {
  const url = normalizeOllamaUrl(baseUrl);
  const { signal, clear } = withTimeout(3000);
  const start = Date.now();
  try {
    const res = await fetch(`${url}/api/tags`, { method: "GET", signal });
    const latencyMs = Date.now() - start;
    if (!res.ok) return { available: false, models: [] };
    const data = (await res.json()) as {
      models?: Array<{ name?: string }>;
    };
    const models = (data.models ?? [])
      .filter((m) => Boolean(m.name))
      .map((m) => m.name!);
    return { available: true, models, latencyMs };
  } catch {
    return { available: false, models: [] };
  } finally {
    clear();
  }
}

// ── Claude CLI probe ──────────────────────────────────────────────────────────

function probeClaude(projectDir: string): {
  available: boolean;
  version?: string;
} {
  try {
    const bin = findClaudeBin(projectDir);
    const r = spawnSync(bin, ["--version"], {
      stdio: "pipe",
      timeout: 3000,
      encoding: "utf-8",
    });
    if (r.status === 0) {
      const version = r.stdout?.trim().match(/(\d+\.\d+[\w.+-]*)/)?.[1];
      return { available: true, version };
    }
    // Fallback through login shell
    const shell = process.env.SHELL || "/bin/zsh";
    const r2 = spawnSync(shell, ["-ilc", "claude --version"], {
      stdio: "pipe",
      timeout: 3000,
      encoding: "utf-8",
    });
    return { available: r2.status === 0 };
  } catch {
    return { available: false };
  }
}

// ── API key probes ────────────────────────────────────────────────────────────

/** Map of provider id -> env var name for API key detection */
const ENV_KEY_MAP: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  groq: "GROQ_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  mistral: "MISTRAL_API_KEY",
  grok: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  together: "TOGETHER_API_KEY",
  fireworks: "FIREWORKS_API_KEY",
};

/** Lightweight validation endpoints per provider */
const VALIDATION_ENDPOINTS: Record<
  string,
  { url: string; headers: (key: string) => Record<string, string> }
> = {
  anthropic: {
    url: "https://api.anthropic.com/v1/models",
    headers: (key) => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    }),
  },
  openai: {
    url: "https://api.openai.com/v1/models?limit=1",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  google: {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    headers: () => ({}),
  },
  groq: {
    url: "https://api.groq.com/openai/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  deepseek: {
    url: "https://api.deepseek.com/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  mistral: {
    url: "https://api.mistral.ai/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  grok: {
    url: "https://api.x.ai/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/models?limit=1",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  together: {
    url: "https://api.together.xyz/v1/models?limit=1",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  fireworks: {
    url: "https://api.fireworks.ai/inference/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
};

/** Resolve the API key for a provider -- checks stored config then env vars */
function resolveApiKey(
  providerId: string,
  store: ProvidersStore,
): string | undefined {
  const stored = store.providers.find((p) => p.id === providerId);
  if (stored?.apiKey && stored.apiKey.length > 0) return stored.apiKey;
  const envVar = ENV_KEY_MAP[providerId];
  if (envVar) return process.env[envVar] || undefined;
  return undefined;
}

export async function validateApiKey(
  provider: string,
  apiKey: string,
): Promise<boolean> {
  const endpoint = VALIDATION_ENDPOINTS[provider];
  if (!endpoint) return false;

  const { signal, clear } = withTimeout(3000);
  try {
    // Google uses query param auth
    const url =
      provider === "google" ? `${endpoint.url}?key=${apiKey}` : endpoint.url;
    const res = await fetch(url, {
      method: "GET",
      headers: endpoint.headers(apiKey),
      signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clear();
  }
}

/** Probe a single API provider -- checks key existence + optional validation */
async function probeApiProvider(
  providerId: string,
  store: ProvidersStore,
): Promise<DiscoveredProvider | null> {
  const providerDef = PROVIDERS[providerId];
  if (!providerDef) return null;

  const apiKey = resolveApiKey(providerId, store);
  const hasKey = Boolean(apiKey);
  const models = providerDef.models;

  // If they have a key, do a quick validation
  let available = false;
  let latencyMs: number | undefined;
  if (hasKey && apiKey) {
    const start = Date.now();
    available = await validateApiKey(providerId, apiKey);
    latencyMs = Date.now() - start;
  }

  return {
    id: providerId,
    name: providerDef.name,
    available,
    models,
    source: "api" as const,
    latencyMs,
  };
}

// ── Full discovery ────────────────────────────────────────────────────────────

export async function discoverProviders(
  projectDir: string,
  dataDir: string,
): Promise<DiscoveredProvider[]> {
  const store = loadProviders(dataDir);

  // Run all probes in parallel
  const ollamaStore = store.providers.find((p) => p.id === "ollama");
  const ollamaBaseUrl = ollamaStore?.baseUrl;

  const apiProviderIds = Object.keys(PROVIDERS).filter(
    (id) => id !== "ollama",
  );

  const [ollamaResult, claudeResult, ...apiResults] = await Promise.all([
    probeOllama(ollamaBaseUrl),
    Promise.resolve(probeClaude(projectDir)),
    ...apiProviderIds.map((id) => probeApiProvider(id, store)),
  ]);

  const discovered: DiscoveredProvider[] = [];

  // Ollama
  discovered.push({
    id: "ollama",
    name: "Ollama",
    available: ollamaResult.available,
    models: ollamaResult.models,
    source: "local",
    latencyMs: ollamaResult.latencyMs,
  });

  // Claude CLI
  discovered.push({
    id: "claude",
    name: "Claude Code",
    available: claudeResult.available,
    models: PROVIDERS.anthropic.models,
    source: "cli",
  });

  // API providers
  for (const result of apiResults) {
    if (result) discovered.push(result);
  }

  return discovered;
}

// ── Recommendation engine ─────────────────────────────────────────────────────

/** Provider tiers per goal -- ordered by preference (first match wins) */
const RANKINGS: Record<string, Array<{ provider: string; model: string }>> = {
  quality: [
    { provider: "claude", model: "claude-opus-4-6" },
    { provider: "anthropic", model: "claude-opus-4-6" },
    { provider: "openai", model: "gpt-4o" },
    { provider: "anthropic", model: "claude-sonnet-4-6" },
    { provider: "google", model: "gemini-2.5-pro-preview-06-05" },
    { provider: "deepseek", model: "deepseek-reasoner" },
    { provider: "grok", model: "grok-3" },
    { provider: "ollama", model: "llama3:70b" },
  ],
  speed: [
    { provider: "ollama", model: "" }, // first available local model
    { provider: "groq", model: "llama-3.1-8b-instant" },
    { provider: "google", model: "gemini-2.0-flash" },
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "fireworks", model: "accounts/fireworks/models/llama-v3p3-70b-instruct" },
    { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
    { provider: "claude", model: "claude-haiku-4-5-20251001" },
  ],
  cost: [
    { provider: "ollama", model: "" }, // free
    { provider: "deepseek", model: "deepseek-chat" },
    { provider: "google", model: "gemini-2.0-flash" },
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "groq", model: "llama-3.3-70b-versatile" },
    { provider: "together", model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo" },
    { provider: "fireworks", model: "accounts/fireworks/models/llama-v3p3-70b-instruct" },
    { provider: "claude", model: "claude-sonnet-4-6" },
  ],
  balanced: [
    { provider: "claude", model: "claude-sonnet-4-6" },
    { provider: "anthropic", model: "claude-sonnet-4-6" },
    { provider: "openai", model: "gpt-4o" },
    { provider: "google", model: "gemini-2.5-pro-preview-06-05" },
    { provider: "ollama", model: "" },
    { provider: "groq", model: "llama-3.3-70b-versatile" },
    { provider: "deepseek", model: "deepseek-chat" },
    { provider: "grok", model: "grok-3" },
  ],
};

const REASONS: Record<string, Record<string, string>> = {
  quality: {
    claude: "Claude Opus via CLI -- best reasoning, uses your existing auth",
    anthropic: "Claude Opus via API -- best reasoning quality",
    openai: "GPT-4o -- strong general quality across tasks",
    google: "Gemini 2.5 Pro -- competitive with top models",
    deepseek: "DeepSeek Reasoner -- strong reasoning at low cost",
    grok: "Grok 3 -- xAI's flagship model",
    ollama: "Local model -- no API latency, full privacy",
  },
  speed: {
    ollama: "Local inference -- zero network latency",
    groq: "Groq -- fastest inference API (specialized hardware)",
    google: "Gemini Flash -- fast and capable",
    openai: "GPT-4o-mini -- fast and cheap",
    fireworks: "Fireworks -- optimized inference infrastructure",
    anthropic: "Claude Haiku -- fast Anthropic model",
    claude: "Claude Haiku via CLI -- fast, uses existing auth",
  },
  cost: {
    ollama: "Ollama -- completely free, runs on your hardware",
    deepseek: "DeepSeek -- $0.27/M tokens, best price-to-quality ratio",
    google: "Gemini Flash -- $0.075/M tokens, very capable",
    openai: "GPT-4o-mini -- $0.15/M tokens, good value",
    groq: "Groq -- free tier available, fast inference",
    together: "Together AI -- competitive pricing on open models",
    fireworks: "Fireworks -- competitive pricing, fast inference",
    claude: "Claude Sonnet via CLI -- uses your existing subscription",
  },
  balanced: {
    claude: "Claude Sonnet via CLI -- great quality, uses existing auth",
    anthropic: "Claude Sonnet via API -- strong all-around performer",
    openai: "GPT-4o -- reliable across all task types",
    google: "Gemini 2.5 Pro -- competitive quality and speed",
    ollama: "Local model -- free, private, no network dependency",
    groq: "Groq -- fast and free tier available",
    deepseek: "DeepSeek -- great quality at very low cost",
    grok: "Grok 3 -- strong alternative from xAI",
  },
};

export function recommendProvider(
  discovered: DiscoveredProvider[],
  goal: "quality" | "speed" | "cost" | "balanced",
): Recommendation {
  const availableIds = new Set(
    discovered.filter((d) => d.available).map((d) => d.id),
  );
  const ranking = RANKINGS[goal] ?? RANKINGS.balanced;

  for (const candidate of ranking) {
    if (!availableIds.has(candidate.provider)) continue;

    // For Ollama, pick the first available model if none specified
    let model = candidate.model;
    if (candidate.provider === "ollama" && !model) {
      const ollamaEntry = discovered.find((d) => d.id === "ollama");
      model = ollamaEntry?.models[0] ?? "llama3";
    }

    const reason =
      REASONS[goal]?.[candidate.provider] ??
      `${candidate.provider} is available for ${goal}`;

    return { provider: candidate.provider, model, reason };
  }

  // Nothing available
  return {
    provider: "none",
    model: "",
    reason:
      "No providers detected. Install Ollama for free local inference, or add an API key in Settings.",
  };
}
