import { fetchApi } from "./api";

export interface ModelEntry {
  id: string;
  label: string;
  provider: string;
  providerId: string;
  note?: string;
}

export interface ProviderRegistry {
  id: string;
  name: string;
  models: string[];
  requiresKey: boolean;
  envKey: string | null;
}

// Hardcoded fallback if the registry fetch fails
const FALLBACK_MODELS: ModelEntry[] = [
  { id: "claude-opus-4-6", label: "Opus 4.6", provider: "Anthropic", providerId: "anthropic", note: "1M ctx" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", provider: "Anthropic", providerId: "anthropic", note: "default" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", provider: "Anthropic", providerId: "anthropic", note: "fast" },
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI", providerId: "openai" },
  { id: "o3", label: "o3", provider: "OpenAI", providerId: "openai", note: "reasoning" },
  { id: "gemini-2.0-flash", label: "2.0 Flash", provider: "Google Gemini", providerId: "google", note: "fast" },
];

// Pretty label from model ID
function modelLabel(id: string): string {
  // Known pretty names
  const LABELS: Record<string, string> = {
    "claude-opus-4-6": "Opus 4.6",
    "claude-sonnet-4-6": "Sonnet 4.6",
    "claude-sonnet-4-5-20251001": "Sonnet 4.5",
    "claude-haiku-4-5-20251001": "Haiku 4.5",
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "gpt-4.1": "GPT-4.1",
    "gpt-4.1-mini": "GPT-4.1 Mini",
    "o3": "o3",
    "o3-mini": "o3 Mini",
    "o4-mini": "o4 Mini",
    "gemini-2.5-pro-preview-06-05": "Gemini 2.5 Pro",
    "gemini-2.5-flash-preview-05-20": "Gemini 2.5 Flash",
    "gemini-2.0-flash": "Gemini 2.0 Flash",
    "deepseek-chat": "DeepSeek V3",
    "deepseek-reasoner": "DeepSeek R1",
    "mistral-large-latest": "Mistral Large",
    "mistral-small-latest": "Mistral Small",
    "codestral-latest": "Codestral",
    "grok-3": "Grok 3",
    "grok-3-mini": "Grok 3 Mini",
    "grok-3-fast": "Grok 3 Fast",
  };
  if (LABELS[id]) return LABELS[id];
  // Fallback: strip common prefixes, title case
  return id
    .replace(/^accounts\/fireworks\/models\//, "")
    .replace(/^meta-llama\//, "")
    .replace(/^anthropic\//, "")
    .replace(/^openai\//, "")
    .replace(/^google\//, "")
    .replace(/^deepseek\//, "")
    .replace(/^mistralai\//, "")
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Notes for specific models
function modelNote(id: string): string | undefined {
  const NOTES: Record<string, string> = {
    "claude-opus-4-6": "1M ctx",
    "claude-sonnet-4-6": "default",
    "claude-haiku-4-5-20251001": "fast",
    "o3": "reasoning",
    "o3-mini": "reasoning",
    "o4-mini": "reasoning",
    "deepseek-reasoner": "reasoning",
    "gemini-2.0-flash": "fast",
    "gemini-2.5-flash-preview-05-20": "fast",
    "llama-3.1-8b-instant": "fast",
    "grok-3-fast": "fast",
  };
  return NOTES[id];
}

let _cachedModels: ModelEntry[] | null = null;
let _cachedProviders: ProviderRegistry[] | null = null;
let _fetchPromise: Promise<void> | null = null;

export async function fetchModelRegistry(): Promise<{ models: ModelEntry[]; providers: ProviderRegistry[] }> {
  if (_cachedModels && _cachedProviders) {
    return { models: _cachedModels, providers: _cachedProviders };
  }

  if (_fetchPromise) {
    await _fetchPromise;
    return { models: _cachedModels ?? FALLBACK_MODELS, providers: _cachedProviders ?? [] };
  }

  _fetchPromise = (async () => {
    try {
      const res = await fetchApi("/api/providers/registry");
      const data = await res.json() as { providers: ProviderRegistry[] };
      _cachedProviders = data.providers;

      const entries: ModelEntry[] = [];
      for (const p of data.providers) {
        for (const m of p.models) {
          entries.push({
            id: m,
            label: modelLabel(m),
            provider: p.name,
            providerId: p.id,
            note: modelNote(m),
          });
        }
      }
      _cachedModels = entries;
    } catch {
      _cachedModels = FALLBACK_MODELS;
      _cachedProviders = [];
    }
  })();

  await _fetchPromise;
  return { models: _cachedModels ?? FALLBACK_MODELS, providers: _cachedProviders ?? [] };
}

/** Invalidate cache so next call refetches. */
export function invalidateModelCache() {
  _cachedModels = null;
  _cachedProviders = null;
  _fetchPromise = null;
}

/** Synchronous access to MODELS (returns fallback if not yet fetched). */
export const MODELS: ModelEntry[] = FALLBACK_MODELS;
