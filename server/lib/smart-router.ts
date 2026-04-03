/**
 * Cost/latency/quality-aware provider router.
 *
 * Tracks provider health via exponential moving average latency and
 * rolling error rates, then scores each provider per the chosen strategy.
 * Ported from OpenClaude's smart_router.py, adapted for the hashmark
 * provider registry.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProviderStats {
  id: string;
  avgLatencyMs: number;
  errorRate: number;
  costPer1kTokens: number;
  lastChecked: number;
  available: boolean;
  requestCount: number;
  errorCount: number;
}

export type RoutingStrategy = "quality" | "speed" | "cost" | "balanced";

// ── Cost table (USD per 1k input tokens) ───────────────────────────────────────

const PROVIDER_COSTS: Record<string, number> = {
  "claude-opus-4-6": 15.0,
  "claude-sonnet-4-6": 3.0,
  "gpt-4o": 2.5,
  "gpt-4o-mini": 0.15,
  "gpt-4.1": 2.0,
  "gpt-4.1-mini": 0.4,
  "o3": 10.0,
  "o3-mini": 1.1,
  "o4-mini": 1.1,
  "gemini-2.5-pro-preview-06-05": 1.25,
  "gemini-2.5-flash-preview-05-20": 0.15,
  "gemini-2.0-flash": 0.075,
  "deepseek-chat": 0.27,
  "deepseek-reasoner": 0.55,
  "groq-llama-3.3-70b": 0.59,
  "groq-llama-3.1-8b": 0.05,
  "mistral-large-latest": 2.0,
  "mistral-small-latest": 0.2,
  "codestral-latest": 0.3,
  "grok-3": 3.0,
  "grok-3-mini": 0.3,
  "ollama-local": 0.0,
};

// Quality tier -- higher = better. Used by "quality" and "balanced" strategies.
const QUALITY_RANK: Record<string, number> = {
  "claude-opus-4-6": 100,
  "claude-sonnet-4-6": 90,
  "o3": 88,
  "gpt-4.1": 85,
  "gpt-4o": 84,
  "gemini-2.5-pro-preview-06-05": 83,
  "grok-3": 80,
  "mistral-large-latest": 75,
  "deepseek-reasoner": 74,
  "deepseek-chat": 70,
  "gemini-2.5-flash-preview-05-20": 65,
  "o3-mini": 64,
  "o4-mini": 63,
  "gpt-4.1-mini": 62,
  "gpt-4o-mini": 60,
  "grok-3-mini": 58,
  "mistral-small-latest": 55,
  "codestral-latest": 54,
  "groq-llama-3.3-70b": 52,
  "gemini-2.0-flash": 50,
  "groq-llama-3.1-8b": 40,
  "ollama-local": 30,
};

// ── Health check URLs per provider ID (matches ai-provider.ts registry) ────────

const HEALTH_URLS: Record<string, string> = {
  anthropic: "https://api.anthropic.com/v1/messages",
  openai: "https://api.openai.com/v1/models",
  google: "https://generativelanguage.googleapis.com/v1/models",
  groq: "https://api.groq.com/openai/v1/models",
  deepseek: "https://api.deepseek.com/models",
  mistral: "https://api.mistral.ai/v1/models",
  grok: "https://api.x.ai/v1/models",
  openrouter: "https://openrouter.ai/api/v1/models",
  together: "https://api.together.xyz/v1/models",
  fireworks: "https://api.fireworks.ai/inference/v1/models",
  ollama: "http://localhost:11434/api/tags",
};

// ── Constants ──────────────────────────────────────────────────────────────────

const EMA_ALPHA = 0.3;
const ERROR_RATE_THRESHOLD = 0.2;
const ERROR_PENALTY = 500;
const STALE_CHECK_MS = 5 * 60_000; // re-check after 5 min of silence
const HEALTH_TIMEOUT_MS = 5_000;
const DEFAULT_LATENCY_MS = 9999;

// ── SmartRouter ────────────────────────────────────────────────────────────────

export class SmartRouter {
  private stats = new Map<string, ProviderStats>();
  private recheckTimers = new Map<string, NodeJS.Timeout>();

  constructor(providerIds?: string[]) {
    const ids = providerIds ?? Object.keys(HEALTH_URLS);
    for (const id of ids) {
      this.stats.set(id, {
        id,
        avgLatencyMs: DEFAULT_LATENCY_MS,
        errorRate: 0,
        costPer1kTokens: this.lookupCost(id),
        lastChecked: 0,
        available: false,
        requestCount: 0,
        errorCount: 0,
      });
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Pick the best provider+model for a request. */
  route(strategy: RoutingStrategy, preferredProvider?: string): string | null {
    // Honour preference if available and healthy
    if (preferredProvider) {
      const pref = this.stats.get(preferredProvider);
      if (pref?.available && pref.errorRate < ERROR_RATE_THRESHOLD) {
        return preferredProvider;
      }
    }

    const candidates = [...this.stats.values()].filter((s) => s.available);
    if (candidates.length === 0) return null;

    let best: ProviderStats | null = null;
    let bestScore = -Infinity;

    for (const s of candidates) {
      const sc = this.score(s, strategy);
      if (sc > bestScore) {
        bestScore = sc;
        best = s;
      }
    }

    return best?.id ?? null;
  }

  /** Record a completed request -- updates latency EMA + error rate. */
  recordResult(providerId: string, latencyMs: number, success: boolean): void {
    const s = this.stats.get(providerId);
    if (!s) return;

    s.requestCount += 1;
    s.lastChecked = Date.now();

    if (success) {
      // Exponential moving average
      s.avgLatencyMs =
        s.avgLatencyMs === DEFAULT_LATENCY_MS
          ? latencyMs
          : EMA_ALPHA * latencyMs + (1 - EMA_ALPHA) * s.avgLatencyMs;
    } else {
      s.errorCount += 1;
    }

    // Recompute rolling error rate
    s.errorRate = s.requestCount > 0 ? s.errorCount / s.requestCount : 0;

    // If error rate crosses threshold, mark unavailable and schedule re-check
    if (s.errorRate > ERROR_RATE_THRESHOLD && s.requestCount >= 3) {
      s.available = false;
      this.scheduleRecheck(providerId, 60_000);
    }
  }

  /** Health check all configured providers. Non-blocking -- fire and forget. */
  async checkHealth(): Promise<void> {
    const checks = [...this.stats.keys()].map((id) => this.pingProvider(id));
    await Promise.allSettled(checks);
  }

  /** Get current stats for all providers. */
  getStats(): ProviderStats[] {
    const now = Date.now();
    const result: ProviderStats[] = [];

    for (const s of this.stats.values()) {
      // Flag stale providers for re-check
      if (s.available && s.lastChecked > 0 && now - s.lastChecked > STALE_CHECK_MS) {
        this.pingProvider(s.id).catch(() => {});
      }
      result.push({ ...s });
    }

    return result;
  }

  /** Recommend the best provider for a strategy, returning full stats. */
  recommend(strategy: RoutingStrategy): {
    providerId: string | null;
    strategy: RoutingStrategy;
    stats: ProviderStats | null;
    allScores: Array<{ id: string; score: number; available: boolean }>;
  } {
    const providerId = this.route(strategy);
    const stats = providerId ? this.stats.get(providerId) ?? null : null;

    const allScores = [...this.stats.values()].map((s) => ({
      id: s.id,
      score: s.available ? Math.round(this.score(s, strategy) * 1000) / 1000 : 0,
      available: s.available,
    }));

    // Sort descending by score so highest-ranked appears first
    allScores.sort((a, b) => b.score - a.score);

    return {
      providerId,
      strategy,
      stats: stats ? { ...stats } : null,
      allScores,
    };
  }

  // ── Scoring ────────────────────────────────────────────────────────────────

  private score(s: ProviderStats, strategy: RoutingStrategy): number {
    const errorPenalty = s.errorRate > ERROR_RATE_THRESHOLD ? -ERROR_PENALTY : 0;

    switch (strategy) {
      case "quality":
        return this.qualityScore(s) + errorPenalty;

      case "speed":
        return this.speedScore(s) + errorPenalty;

      case "cost":
        return this.costScore(s) + errorPenalty;

      case "balanced":
        return (
          0.4 * this.qualityScore(s) +
          0.3 * this.speedScore(s) +
          0.3 * this.costScore(s) +
          errorPenalty
        );
    }
  }

  /** Higher = better quality. Based on model quality tier ranking. */
  private qualityScore(s: ProviderStats): number {
    return QUALITY_RANK[this.bestModelForProvider(s.id)] ?? 30;
  }

  /** Higher = faster. Inverts latency so lower latency = higher score. */
  private speedScore(s: ProviderStats): number {
    if (s.avgLatencyMs <= 0 || s.avgLatencyMs === DEFAULT_LATENCY_MS) return 1;
    // Ollama local gets a bonus -- no network round trip
    const localBonus = s.id === "ollama" ? 20 : 0;
    // Scale: 100ms -> 100, 500ms -> 20, 2000ms -> 5
    return Math.min(100, 10_000 / s.avgLatencyMs) + localBonus;
  }

  /** Higher = cheaper. Inverts cost so $0 = best. */
  private costScore(s: ProviderStats): number {
    if (s.costPer1kTokens <= 0) return 100; // free (ollama)
    // Scale: $0.075 -> 93, $3 -> 25, $15 -> 6
    return Math.min(100, 7 / s.costPer1kTokens);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async pingProvider(id: string): Promise<void> {
    const s = this.stats.get(id);
    if (!s) return;

    const url = HEALTH_URLS[id];
    if (!url) {
      s.available = false;
      return;
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: { "User-Agent": "hashmark-studio/smart-router" },
      });
      clearTimeout(timeout);

      const elapsed = Date.now() - start;

      // Reachable means healthy -- even 401/403 means the endpoint exists
      if (res.status < 500) {
        s.available = true;
        s.avgLatencyMs =
          s.avgLatencyMs === DEFAULT_LATENCY_MS
            ? elapsed
            : EMA_ALPHA * elapsed + (1 - EMA_ALPHA) * s.avgLatencyMs;
      } else {
        s.available = false;
      }
      s.lastChecked = Date.now();
    } catch {
      s.available = false;
      s.lastChecked = Date.now();
    }
  }

  /** Map provider ID to its best (most expensive/capable) model for quality ranking. */
  private bestModelForProvider(id: string): string {
    const map: Record<string, string> = {
      anthropic: "claude-sonnet-4-6",
      openai: "gpt-4o",
      google: "gemini-2.5-pro-preview-06-05",
      groq: "groq-llama-3.3-70b",
      deepseek: "deepseek-chat",
      mistral: "mistral-large-latest",
      grok: "grok-3",
      openrouter: "claude-sonnet-4-6",
      together: "groq-llama-3.3-70b",
      fireworks: "deepseek-chat",
      ollama: "ollama-local",
    };
    return map[id] ?? "ollama-local";
  }

  /** Look up the cost for a provider's default model. */
  private lookupCost(id: string): number {
    const model = this.bestModelForProvider(id);
    return PROVIDER_COSTS[model] ?? 1.0;
  }

  /** Schedule a health re-check after a delay. Only one timer per provider. */
  private scheduleRecheck(id: string, delayMs: number): void {
    const existing = this.recheckTimers.get(id);
    if (existing) return; // already scheduled

    const timer = setTimeout(() => {
      this.recheckTimers.delete(id);
      this.pingProvider(id).catch(() => {});
    }, delayMs);

    // Don't keep the process alive just for re-checks
    timer.unref();
    this.recheckTimers.set(id, timer);
  }
}
