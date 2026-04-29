import { Hono } from "hono";
import { randomUUID } from "crypto";
import { execSync } from "child_process";
import { getDb } from "../db.js";
import { loadProviders } from "../providers.js";
import { getOAuthApiKey } from "../oauth.js";
import { runAgentTurn } from "../harness.js";
import { rateLimitMiddleware } from "../ratelimit.js";

const pendingApprovals = new Map<string, { resolve: (v: boolean) => void }>();
const activeRuns = new Map<string, AbortController>();

export function registerSessionRunRoutes(app: Hono, ctx: { dataDir: string; projectDir: string }) {
  const { dataDir: DATA_DIR, projectDir: PROJECT_DIR } = ctx;

  app.post("/api/sessions/:id/shell", async (c) => {
    const { command } = await c.req.json().catch(() => ({}));
    const db = getDb(DATA_DIR);
    const session = db.prepare("SELECT project_dir FROM sessions WHERE id = ?").get(c.req.param("id")) as { project_dir: string } | undefined;
    try {
      const output = execSync(String(command), { cwd: session?.project_dir ?? PROJECT_DIR, timeout: 30000, encoding: "utf-8" });
      return c.json({ output });
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      return c.json({ output: e.stdout ?? "", error: e.stderr ?? String(e.message ?? "") });
    }
  });

  app.post("/api/sessions/:id/chat", rateLimitMiddleware(20, 60_000, "chat"), async (c) => {
    const sessionId = c.req.param("id") as string;
    const db = getDb(DATA_DIR);
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as Record<string, unknown> | undefined;
    if (!session) return c.json({ error: "session not found" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const message = String(body.message ?? "").trim();
    if (!message) return c.json({ error: "message required" }, 400);

    const providers = loadProviders(DATA_DIR);
    const provider = String(session.provider ?? providers.active);
    const streamProvider = provider === "gemini" ? "google" : provider;
    let apiKey: string | undefined;

    if (provider === "claude" || provider === "anthropic") {
      apiKey = (await getOAuthApiKey()) ?? process.env.ANTHROPIC_API_KEY ?? undefined;
      if (!apiKey) return c.json({ error: "No Claude auth. Run: claude auth login — or add ANTHROPIC_API_KEY to .env.local" }, 400);
    } else {
      const pConfig = providers.providers.find(p => p.id === streamProvider) ?? providers.providers.find(p => p.id === provider);
      apiKey = pConfig?.apiKey
        ?? process.env[`${streamProvider.toUpperCase().replace(/-/g, "_")}_API_KEY`]
        ?? process.env[`${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`]
        ?? undefined;
      if (!apiKey) return c.json({ error: `No API key for ${provider}. Add it in Settings → API Keys.` }, 400);
    }

    let autoTitleEmit: string | null = null;
    if (session.title === "New Session") {
      const autoTitle = message.split("\n")[0].slice(0, 60).trim() || "Session";
      db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(autoTitle, sessionId);
      autoTitleEmit = autoTitle;
    }

    activeRuns.get(sessionId)?.abort();
    const ac = new AbortController();
    activeRuns.set(sessionId, ac);
    db.prepare("UPDATE sessions SET status = 'running', updated_at = ? WHERE id = ?").run(Date.now(), sessionId);

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (data: object) => {
          try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
        };
        if (autoTitleEmit) send({ type: "title_updated", title: autoTitleEmit });
        const sendWithTokens = (data: object) => {
          const d = data as Record<string, unknown>;
          if (d.type === "done") {
            const usage = d.usage as { input_tokens?: number; output_tokens?: number } | undefined;
            db.prepare("UPDATE sessions SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, status = 'idle', updated_at = ? WHERE id = ?")
              .run(usage?.input_tokens ?? 0, usage?.output_tokens ?? 0, Date.now(), sessionId);
          }
          send(data);
        };
        try {
          await runAgentTurn({
            sessionId, message,
            model: String(session.model ?? "claude-sonnet-4-6"),
            apiKey: apiKey!,
            provider: streamProvider,
            baseUrl: providers.providers.find(p => p.id === streamProvider)?.baseUrl ?? providers.providers.find(p => p.id === provider)?.baseUrl,
            systemPrompt: [
              session.system_prompt ? String(session.system_prompt) : "",
              session.notes ? `\n\n## Session Notes\n${String(session.notes)}` : "",
            ].join("").trim(),
            projectDir: String(session.project_dir ?? PROJECT_DIR),
            dataDir: DATA_DIR,
            thinkingBudget: ((): number => {
              const THINKING_BUDGETS: Record<string, number> = { low: 1024, medium: 8192, high: 16000, xhigh: 63999 };
              return THINKING_BUDGETS[session.thinking_level as string] ?? 0;
            })(),
            tokenBudget: (session.token_budget as number | null) ?? undefined,
            signal: ac.signal,
            send: sendWithTokens,
            onApproval: async (toolName, input) => {
              if (session.require_tool_approval === 0) return true;
              const approvalId = randomUUID();
              sendWithTokens({ type: "tool_approval", tool: toolName, input, toolUseId: approvalId });
              return new Promise<boolean>((resolve) => {
                pendingApprovals.set(approvalId, { resolve });
                setTimeout(() => { if (pendingApprovals.delete(approvalId)) resolve(false); }, 300_000);
              });
            },
          });
        } catch (err) {
          if (err instanceof Error && err.message !== "cancelled") send({ type: "error", error: err.message });
        } finally {
          activeRuns.delete(sessionId);
          try { controller.close(); } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no" },
    });
  });

  app.post("/api/sessions/:id/approve", async (c) => {
    const { toolUseId, approved } = await c.req.json().catch(() => ({})) as { toolUseId: string; approved: boolean };
    const pending = pendingApprovals.get(toolUseId);
    if (!pending) return c.json({ error: "no pending approval" }, 404);
    pendingApprovals.delete(toolUseId);
    pending.resolve(Boolean(approved));
    return c.json({ ok: true });
  });

  app.post("/api/sessions/:id/cancel", (c) => {
    activeRuns.get(c.req.param("id"))?.abort();
    return c.json({ ok: true });
  });

  app.post("/api/sessions/dispatch", rateLimitMiddleware(5, 60_000, "dispatch"), async (c) => {
    const body = await c.req.json().catch(() => ({})) as { message?: string; count?: number; title?: string };
    const message = String(body.message ?? "").trim();
    const count = Math.min(Math.max(1, Number(body.count ?? 2)), 8);
    if (!message) return c.json({ error: "message required" }, 400);

    const db = getDb(DATA_DIR);
    const providers = loadProviders(DATA_DIR);
    const provider = providers.active;
    let apiKey: string | undefined;

    if (provider === "claude") {
      apiKey = (await getOAuthApiKey()) ?? process.env.ANTHROPIC_API_KEY ?? undefined;
      if (!apiKey) return c.json({ error: "No Claude auth" }, 400);
    } else {
      const pConfig = providers.providers.find(p => p.id === provider);
      apiKey = pConfig?.apiKey ?? process.env[`${provider.toUpperCase()}_API_KEY`] ?? undefined;
      if (!apiKey) return c.json({ error: `No API key for ${provider}` }, 400);
    }

    const now = Date.now();
    const sessionIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = randomUUID();
      const title = body.title ? `${body.title} #${i + 1}` : `Agent ${i + 1}`;
      db.prepare(
        "INSERT INTO sessions (id, title, model, provider, system_prompt, project_dir, status, created_at, updated_at) VALUES (?, ?, ?, ?, null, ?, 'running', ?, ?)"
      ).run(id, title, providers.model, provider, PROJECT_DIR, now, now);
      sessionIds.push(id);

      void (async () => {
        const ac = new AbortController();
        activeRuns.set(id, ac);
        try {
          await runAgentTurn({
            sessionId: id, message,
            model: providers.model,
            apiKey: apiKey!,
            provider,
            baseUrl: providers.providers.find(p => p.id === provider)?.baseUrl,
            systemPrompt: "",
            projectDir: PROJECT_DIR,
            dataDir: DATA_DIR,
            signal: ac.signal,
            send: (data) => {
              if (data.type === "done") {
                const usage = (data as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
                db.prepare("UPDATE sessions SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, status = 'idle', updated_at = ? WHERE id = ?")
                  .run(usage?.input_tokens ?? 0, usage?.output_tokens ?? 0, Date.now(), id);
              }
            },
          });
        } catch (err) {
          console.error(`[dispatch] session ${id} failed:`, err);
          activeRuns.delete(id);
          db.prepare("UPDATE sessions SET status = 'error', updated_at = ? WHERE id = ?").run(Date.now(), id);
          return;
        }
        activeRuns.delete(id);
        db.prepare("UPDATE sessions SET status = 'idle', updated_at = ? WHERE id = ?").run(Date.now(), id);
      })();
    }

    const sessions = db.prepare(`SELECT * FROM sessions WHERE id IN (${sessionIds.map(() => "?").join(",")})`)
      .all(...sessionIds);
    return c.json({ sessions, count }, 201);
  });
}
