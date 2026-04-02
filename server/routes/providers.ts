import { Hono } from "hono";
import { loadProviders, saveProviders, detectCLIs } from "../lib/providers.js";
import { PROVIDERS } from "../lib/ai-provider.js";
import {
  discoverProviders,
  probeOllama,
  validateApiKey,
  recommendProvider,
} from "../lib/provider-discovery.js";
import type { WorkspaceCtx } from "./workspaces.js";

/** Build models list from provider registry, with overrides for CLI-only tools. */
function getStaticModels(id: string): string[] {
  const registered = PROVIDERS[id];
  if (registered) return registered.models;

  // CLI-only tools not in the streaming registry
  const CLI_MODELS: Record<string, string[]> = {
    claude:  PROVIDERS.anthropic.models,
    codex:   PROVIDERS.openai.models,
    aider:   ["gpt-4o", "claude-sonnet-4-6", "deepseek-chat"],
    amp:     ["amp-default"],
    goose:   ["goose-default"],
    copilot: ["copilot-default"],
  };
  return CLI_MODELS[id] ?? [];
}

export function providersRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  // GET /api/providers
  app.get("/", (c) => {
    const store = loadProviders(ctx.dataDir);
    const cliResults = detectCLIs(ctx.projectDir);
    const cliInstalled = new Set(cliResults.filter(r => r.installed).map(r => r.id));
    const masked = store.providers.map(({ apiKey, ...rest }) => ({
      ...rest,
      hasKey: Boolean(apiKey && apiKey.length > 0),
      cliDetected: cliInstalled.has(rest.id),
    }));
    return c.json({ active: store.active, model: store.model, providers: masked });
  });

  // GET /api/providers/registry — full list of supported providers from the registry
  app.get("/registry", (c) => {
    const registry = Object.values(PROVIDERS).map((p) => ({
      id: p.id,
      name: p.name,
      models: p.models,
      requiresKey: p.requiresKey,
      envKey: p.envKey ?? null,
    }));
    return c.json({ providers: registry });
  });

  // GET /api/providers/detect — scan system for installed AI CLI tools
  app.get("/detect", (c) => {
    const providers = detectCLIs(ctx.projectDir);
    return c.json({ providers });
  });

  // PUT /api/providers/active
  app.put("/active", async (c) => {
    const body = await c.req.json<{ providerId?: string; model?: string }>();
    if (!body.providerId) return c.json({ error: "providerId required" }, 400);

    const store = loadProviders(ctx.dataDir);
    const provider = store.providers.find(p => p.id === body.providerId);
    if (!provider) return c.json({ error: "Provider not found" }, 404);

    store.active = body.providerId;
    if (body.model) store.model = body.model;
    saveProviders(ctx.dataDir, store);

    return c.json({ active: store.active, model: store.model });
  });

  // PUT /api/providers/:id/key
  app.put("/:id/key", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ apiKey?: string }>();
    if (body.apiKey === undefined) return c.json({ error: "apiKey required" }, 400);

    const store = loadProviders(ctx.dataDir);
    const provider = store.providers.find(p => p.id === id);
    if (!provider) return c.json({ error: "Provider not found" }, 404);

    provider.apiKey = body.apiKey;
    provider.enabled = body.apiKey.length > 0;
    saveProviders(ctx.dataDir, store);

    return c.json({ ok: true, hasKey: body.apiKey.length > 0 });
  });

  // GET /api/providers/models/:id
  app.get("/models/:id", async (c) => {
    const id = c.req.param("id");
    const store = loadProviders(ctx.dataDir);
    const provider = store.providers.find(p => p.id === id);
    if (!provider) return c.json({ error: "Provider not found" }, 404);

    if (id === "ollama") {
      const base = provider.baseUrl ?? "http://localhost:11434";
      try {
        const res = await fetch(`${base}/api/tags`);
        if (!res.ok) throw new Error(`Ollama responded with ${res.status}`);
        const data = await res.json() as { models?: Array<{ name: string }> };
        const models = (data.models ?? []).map(m => m.name);
        return c.json({ models });
      } catch (err) {
        return c.json({ models: [], error: err instanceof Error ? err.message : String(err) });
      }
    }

    const models = getStaticModels(id);
    return c.json({ models });
  });

  // PUT /api/providers/:id/baseUrl — for ollama custom URL
  app.put("/:id/baseUrl", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ baseUrl?: string }>();
    if (!body.baseUrl) return c.json({ error: "baseUrl required" }, 400);

    const store = loadProviders(ctx.dataDir);
    const provider = store.providers.find(p => p.id === id);
    if (!provider) return c.json({ error: "Provider not found" }, 404);

    provider.baseUrl = body.baseUrl;
    saveProviders(ctx.dataDir, store);

    return c.json({ ok: true });
  });

  // ── Discovery endpoints ─────────────────────────────────────────────────────

  // GET /api/providers/discover — probe all providers, return availability + models
  app.get("/discover", async (c) => {
    const goal = (c.req.query("goal") as "quality" | "speed" | "cost" | "balanced") || undefined;
    const discovered = await discoverProviders(ctx.projectDir, ctx.dataDir);
    const recommendation = goal ? recommendProvider(discovered, goal) : recommendProvider(discovered, "balanced");
    return c.json({ providers: discovered, recommendation });
  });

  // POST /api/providers/discover/ollama — specifically probe Ollama
  app.post("/discover/ollama", async (c) => {
    const body = await c.req.json<{ baseUrl?: string }>().catch(() => ({} as { baseUrl?: string }));
    const result = await probeOllama(body.baseUrl);
    return c.json(result);
  });

  // POST /api/providers/validate — validate an API key for a specific provider
  app.post("/validate", async (c) => {
    const body = await c.req.json<{ provider?: string; apiKey?: string }>();
    if (!body.provider) return c.json({ error: "provider required" }, 400);
    if (!body.apiKey) return c.json({ error: "apiKey required" }, 400);
    const valid = await validateApiKey(body.provider, body.apiKey);
    return c.json({ provider: body.provider, valid });
  });

  return app;
}
