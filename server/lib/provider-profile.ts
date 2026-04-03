/**
 * Provider profiles -- per-project AI provider config.
 *
 * Stored at .hashmark/provider-profile.json with mode 0o600 (contains API keys).
 * Cleaner than the global providers.json/settings approach -- one file per project.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { loadProviders } from "./providers.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProviderProfile {
  provider: string;       // "anthropic" | "openai" | "google" | "ollama" | "groq" | "deepseek" | etc
  model: string;          // "claude-sonnet-4-6" | "gpt-4o" | "gemini-2.0-flash" | etc
  baseUrl?: string;       // custom endpoint (for Ollama, OpenRouter, etc)
  apiKey?: string;        // stored here OR in env var
  apiKeyEnvVar?: string;  // "OPENAI_API_KEY" -- prefer env var over stored key
  goal?: "quality" | "speed" | "cost" | "balanced";
  createdAt: string;
  updatedAt: string;
}

// ── Well-known env vars per provider ─────────────────────────────────────────

const PROVIDER_ENV_VARS: Record<string, string> = {
  anthropic:  "ANTHROPIC_API_KEY",
  openai:     "OPENAI_API_KEY",
  google:     "GOOGLE_API_KEY",
  groq:       "GROQ_API_KEY",
  deepseek:   "DEEPSEEK_API_KEY",
  mistral:    "MISTRAL_API_KEY",
  grok:       "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  together:   "TOGETHER_API_KEY",
  fireworks:  "FIREWORKS_API_KEY",
};

const PROFILE_FILENAME = "provider-profile.json";

// ── File operations ──────────────────────────────────────────────────────────

export function loadProfile(dataDir: string): ProviderProfile | null {
  const filePath = join(dataDir, PROFILE_FILENAME);
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ProviderProfile>;

    if (!parsed.provider || !parsed.model) return null;

    return {
      provider: parsed.provider,
      model: parsed.model,
      baseUrl: parsed.baseUrl,
      apiKey: parsed.apiKey,
      apiKeyEnvVar: parsed.apiKeyEnvVar,
      goal: parsed.goal,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveProfile(dataDir: string, profile: ProviderProfile): void {
  mkdirSync(dataDir, { recursive: true });
  const filePath = join(dataDir, PROFILE_FILENAME);
  writeFileSync(filePath, JSON.stringify(profile, null, 2), { encoding: "utf-8", mode: 0o600 });
}

export function deleteProfile(dataDir: string): void {
  const filePath = join(dataDir, PROFILE_FILENAME);
  if (existsSync(filePath)) unlinkSync(filePath);
}

// ── Resolution ───────────────────────────────────────────────────────────────

export interface ResolvedProvider {
  provider: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  source: "profile" | "settings" | "env" | "default";
}

/**
 * Resolve the effective provider config with cascading precedence:
 *   1. .hashmark/provider-profile.json (project-specific)
 *   2. Studio settings / providers.json (global)
 *   3. Environment variables
 *   4. Default: Claude CLI (no API key needed)
 */
export function resolveProvider(dataDir: string): ResolvedProvider {
  // 1. Project-level profile
  const profile = loadProfile(dataDir);
  if (profile) {
    let apiKey = profile.apiKey;

    // If an env var is specified, prefer it over the stored key
    if (profile.apiKeyEnvVar && process.env[profile.apiKeyEnvVar]) {
      apiKey = process.env[profile.apiKeyEnvVar];
    }

    return {
      provider: profile.provider,
      model: profile.model,
      baseUrl: profile.baseUrl,
      apiKey,
      source: "profile",
    };
  }

  // 2. Studio providers.json (global settings)
  try {
    const store = loadProviders(dataDir);
    if (store.active && store.active !== "claude") {
      const provider = store.providers.find(p => p.id === store.active);
      if (provider?.enabled) {
        let apiKey = provider.apiKey;
        const envVar = PROVIDER_ENV_VARS[store.active];
        if (!apiKey && envVar && process.env[envVar]) {
          apiKey = process.env[envVar];
        }

        return {
          provider: store.active,
          model: store.model,
          baseUrl: provider.baseUrl,
          apiKey,
          source: "settings",
        };
      }
    }
  } catch {}

  // 3. Environment variables -- detect which provider key is set
  for (const [provider, envVar] of Object.entries(PROVIDER_ENV_VARS)) {
    const key = process.env[envVar];
    if (key && key.length > 0) {
      const defaultModel = getDefaultModel(provider);
      return {
        provider,
        model: defaultModel,
        apiKey: key,
        source: "env",
      };
    }
  }

  // 4. Default -- Claude CLI, no API key needed
  return {
    provider: "claude",
    model: "claude-sonnet-4-6",
    source: "default",
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDefaultModel(provider: string): string {
  const defaults: Record<string, string> = {
    anthropic:  "claude-sonnet-4-6",
    openai:     "gpt-4o",
    google:     "gemini-2.0-flash",
    groq:       "llama-3.3-70b-versatile",
    deepseek:   "deepseek-chat",
    mistral:    "mistral-large-latest",
    grok:       "grok-3",
    openrouter: "anthropic/claude-sonnet-4-6",
    together:   "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    fireworks:  "accounts/fireworks/models/llama-v3p3-70b-instruct",
    ollama:     "llama3.1:8b",
  };
  return defaults[provider] ?? "claude-sonnet-4-6";
}

/** Mask an API key for display: show first 4 and last 4 chars. */
export function maskApiKey(key: string): string {
  if (key.length <= 12) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
