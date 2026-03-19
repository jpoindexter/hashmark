import { Hono } from "hono";
import { loadProviders, saveProviders, detectCLIs } from "../lib/providers.js";

const STATIC_MODELS: Record<string, string[]> = {
  claude:  ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  openai:  ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini"],
  gemini:  ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  mistral: ["mistral-large-latest", "mistral-small-latest", "codestral-latest"],
  grok:    ["grok-3", "grok-3-mini"],
  codex:   ["gpt-4o", "gpt-4o-mini", "o3", "o3-mini", "o1", "o1-mini"],
  aider:   ["gpt-4o", "claude-sonnet-4-6", "deepseek-chat"],
  amp:     ["amp-default"],
  goose:   ["goose-default"],
  copilot: ["copilot-default"],
};

export function providersRoutes(projectDir: string) {
  const dataDir = `${projectDir}/.hashmark`;
  const app = new Hono();

  // GET /api/providers
  app.get("/", (c) => {
    const store = loadProviders(dataDir);
    const cliResults = detectCLIs(projectDir);
    const cliInstalled = new Set(cliResults.filter(r => r.installed).map(r => r.id));
    const masked = store.providers.map(({ apiKey, ...rest }) => ({
      ...rest,
      hasKey: Boolean(apiKey && apiKey.length > 0),
      cliDetected: cliInstalled.has(rest.id),
    }));
    return c.json({ active: store.active, model: store.model, providers: masked });
  });

  // GET /api/providers/detect — scan system for installed AI CLI tools
  app.get("/detect", (c) => {
    const providers = detectCLIs(projectDir);
    return c.json({ providers });
  });

  // PUT /api/providers/active
  app.put("/active", async (c) => {
    const body = await c.req.json<{ providerId?: string; model?: string }>();
    if (!body.providerId) return c.json({ error: "providerId required" }, 400);

    const store = loadProviders(dataDir);
    const provider = store.providers.find(p => p.id === body.providerId);
    if (!provider) return c.json({ error: "Provider not found" }, 404);

    store.active = body.providerId;
    if (body.model) store.model = body.model;
    saveProviders(dataDir, store);

    return c.json({ active: store.active, model: store.model });
  });

  // PUT /api/providers/:id/key
  app.put("/:id/key", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ apiKey?: string }>();
    if (body.apiKey === undefined) return c.json({ error: "apiKey required" }, 400);

    const store = loadProviders(dataDir);
    const provider = store.providers.find(p => p.id === id);
    if (!provider) return c.json({ error: "Provider not found" }, 404);

    provider.apiKey = body.apiKey;
    provider.enabled = body.apiKey.length > 0;
    saveProviders(dataDir, store);

    return c.json({ ok: true, hasKey: body.apiKey.length > 0 });
  });

  // GET /api/providers/models/:id
  app.get("/models/:id", async (c) => {
    const id = c.req.param("id");
    const store = loadProviders(dataDir);
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

    const models = STATIC_MODELS[id] ?? [];
    return c.json({ models });
  });

  // PUT /api/providers/:id/baseUrl — for ollama custom URL
  app.put("/:id/baseUrl", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ baseUrl?: string }>();
    if (!body.baseUrl) return c.json({ error: "baseUrl required" }, 400);

    const store = loadProviders(dataDir);
    const provider = store.providers.find(p => p.id === id);
    if (!provider) return c.json({ error: "Provider not found" }, 404);

    provider.baseUrl = body.baseUrl;
    saveProviders(dataDir, store);

    return c.json({ ok: true });
  });

  return app;
}
