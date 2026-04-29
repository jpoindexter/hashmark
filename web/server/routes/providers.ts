import { Hono } from "hono";
import { execSync } from "child_process";
import { loadProviders, saveProviders } from "../providers.js";
import { hasOAuthCredentials } from "../oauth.js";

export function registerProviderRoutes(app: Hono, ctx: { dataDir: string; projectDir: string }) {
  const { dataDir: DATA_DIR } = ctx;

  app.get("/api/providers", (c) => c.json(loadProviders(DATA_DIR)));

  app.put("/api/providers", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "invalid body" }, 400);
    saveProviders(DATA_DIR, body);
    return c.json(loadProviders(DATA_DIR));
  });

  // Detect installed CLIs and their auth status
  app.get("/api/providers/detect", (c) => {
    const check = (cmd: string): { installed: boolean; version?: string; authed?: boolean } => {
      try {
        const version = execSync(`${cmd} --version 2>/dev/null`, { timeout: 5000 }).toString().trim().split("\n")[0];
        return { installed: true, version };
      } catch { return { installed: false }; }
    };

    const checkAuth = (cmd: string): boolean => {
      try { execSync(`${cmd} 2>/dev/null`, { timeout: 5000 }); return true; } catch { return false; }
    };

    const claude = check(`${process.env.HOME}/.nvm/versions/node/v24.11.1/bin/claude`);
    if (claude.installed) claude.authed = hasOAuthCredentials();

    const gemini = check(`${process.env.HOME}/.nvm/versions/node/v24.11.1/bin/gemini`);
    if (gemini.installed) gemini.authed = checkAuth("gemini --version");

    const codex = check(`${process.env.HOME}/.nvm/versions/node/v24.11.1/bin/codex`);
    if (codex.installed) codex.authed = !!(process.env.OPENAI_API_KEY);

    const gh = check("/opt/homebrew/bin/gh");
    if (gh.installed) {
      try { execSync("gh auth status 2>&1"); gh.authed = true; } catch { gh.authed = false; }
    }

    return c.json({ claude, gemini, codex, gh });
  });

  // Test a provider's API key with a minimal request
  app.post("/api/providers/:id/test", async (c) => {
    const id = c.req.param("id");
    const store = loadProviders(DATA_DIR);
    const pConfig = store.providers.find(p => p.id === id);
    const apiKey = pConfig?.apiKey ?? process.env[`${id.toUpperCase().replace(/-/g, "_")}_API_KEY`] ?? undefined;
    if (!apiKey) return c.json({ ok: false, error: "No API key configured" });

    const PROVIDER_BASE: Record<string, { url: string; testModel: string; isAnthropic?: boolean }> = {
      anthropic:  { url: pConfig?.baseUrl ?? "https://api.anthropic.com", testModel: "claude-haiku-4-5-20251001", isAnthropic: true },
      openai:     { url: pConfig?.baseUrl ?? "https://api.openai.com",    testModel: "gpt-4o-mini" },
      google:     { url: pConfig?.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta/openai", testModel: "gemini-2.0-flash" },
      groq:       { url: pConfig?.baseUrl ?? "https://api.groq.com/openai",  testModel: "llama-3.1-8b-instant" },
      deepseek:   { url: pConfig?.baseUrl ?? "https://api.deepseek.com",     testModel: "deepseek-chat" },
      mistral:    { url: pConfig?.baseUrl ?? "https://api.mistral.ai",        testModel: "mistral-small-latest" },
      grok:       { url: pConfig?.baseUrl ?? "https://api.x.ai",             testModel: "grok-3-mini" },
      openrouter: { url: pConfig?.baseUrl ?? "https://openrouter.ai/api",    testModel: "openai/gpt-4o-mini" },
      together:   { url: pConfig?.baseUrl ?? "https://api.together.xyz",     testModel: "meta-llama/Llama-3-8b-chat-hf" },
      fireworks:  { url: pConfig?.baseUrl ?? "https://api.fireworks.ai/inference", testModel: "accounts/fireworks/models/llama-v3p1-8b-instruct" },
      vercel:     { url: pConfig?.baseUrl ?? "https://ai-gateway.vercel.sh", testModel: "gpt-4o-mini" },
      "302ai":    { url: pConfig?.baseUrl ?? "https://api.302.ai",           testModel: "gpt-4o-mini" },
    };
    const cfg = PROVIDER_BASE[id];
    if (!cfg) return c.json({ ok: false, error: "Unknown provider" });

    try {
      let res: Response;
      if (cfg.isAnthropic) {
        res = await fetch(`${cfg.url}/v1/messages`, {
          method: "POST",
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: cfg.testModel, max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
          signal: AbortSignal.timeout(10_000),
        });
      } else {
        res = await fetch(`${cfg.url}/v1/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model: cfg.testModel, max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
          signal: AbortSignal.timeout(10_000),
        });
      }
      if (res.ok || res.status === 400) return c.json({ ok: true }); // 400 = auth passed, model/param issue
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      return c.json({ ok: false, error: body?.error?.message ?? `HTTP ${res.status}` });
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : "Request failed" });
    }
  });
}
