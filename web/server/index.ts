import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { join, resolve } from "path";
import { readFileSync, existsSync } from "fs";
import { WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import { getDb } from "./db.js";
import { getStudioToken } from "./token.js";
import { authMiddleware } from "./auth.js";
import { rateLimitMiddleware } from "./ratelimit.js";
import { loadProviders } from "./providers.js";
import { hasOAuthCredentials } from "./oauth.js";
import { startWorkflowRun } from "./workflow.js";
import { loadGitHubConfig, verifyGitHubSignature, parseWebhookEvent } from "./github.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerIssueRoutes } from "./routes/issues.js";
import { registerProviderRoutes } from "./routes/providers.js";
import { registerWorkflowRoutes } from "./routes/workflows.js";
import { registerMiscRoutes } from "./routes/misc.js";
import { registerFileRoutes } from "./routes/files.js";

const PORT = Number(process.env.HASHMARK_PORT ?? 3200);
const PROJECT_DIR = resolve(process.env.HASHMARK_PROJECT_DIR ?? process.cwd());
const DATA_DIR = join(PROJECT_DIR, ".hashmark");

export function createServer() {
  const app = new Hono();
  const token = getStudioToken(DATA_DIR);
  const ctx = { dataDir: DATA_DIR, projectDir: PROJECT_DIR };

  app.use("*", cors({ origin: ["http://localhost:3200", "http://127.0.0.1:3200", `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`], allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"] }));

  const isLocalhost = (c: Context) => {
    // Use the TCP socket peer address — not spoofable via headers
    const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
    const addr = incoming?.socket?.remoteAddress ?? "";
    return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1" || addr === "";
  };

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/token", (c) => {
    if (!isLocalhost(c)) return c.json({ error: "forbidden" }, 403);
    return c.json({ token });
  });
  app.get("/api/info", (c) => {
    const oAuth = hasOAuthCredentials();
    const ps = loadProviders(DATA_DIR);
    const activeProvider = ps.providers.find(p => p.id === ps.active);
    const hasProviderKey = !!(activeProvider?.apiKey || (ps.active === "claude" && oAuth));
    return c.json({ projectDir: PROJECT_DIR, dataDir: DATA_DIR, hasOAuth: oAuth, hasProviderKey, version: "2.0.0" });
  });

  app.get("/", (c) => {
    const distPath = join(import.meta.dirname ?? "", "../dist/public/index.html");
    const devFallback = join(import.meta.dirname ?? "", "../client/index.html");
    const htmlPath = existsSync(distPath) ? distPath : existsSync(devFallback) ? devFallback : null;
    if (!htmlPath) return c.text("Studio not built. Run: npm run build", 503);
    const html = readFileSync(htmlPath, "utf-8").replace(
      "</head>",
      `<script>window.__STUDIO_TOKEN__=${JSON.stringify(token)};window.__PROJECT_DIR__=${JSON.stringify(PROJECT_DIR)};</script></head>`
    );
    return c.html(html);
  });

  // GitHub webhook registered BEFORE auth middleware -- GitHub signs with HMAC, no bearer token
  app.post("/api/github/webhook", async (c) => {
    const cfg = loadGitHubConfig(DATA_DIR);
    if (!cfg.enabled || !cfg.webhookSecret) return c.json({ error: "GitHub adapter not configured" }, 400);

    const sig = c.req.header("x-hub-signature-256") ?? "";
    const rawBody = await c.req.text();
    if (!verifyGitHubSignature(cfg.webhookSecret, rawBody, sig)) return c.json({ error: "invalid signature" }, 401);

    const event = c.req.header("x-github-event") ?? "";
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(rawBody) as Record<string, unknown>; } catch { return c.json({ error: "bad payload" }, 400); }

    const parsed = parseWebhookEvent(event, payload);
    if (!parsed) return c.json({ ok: true, skipped: true });

    const workflowId = parsed.type === "issue_opened" ? cfg.autoWorkflowId : cfg.prWorkflowId;
    if (!workflowId) return c.json({ ok: true, skipped: true, reason: "no workflow configured for event type" });

    void startWorkflowRun({
      workflowId, dataDir: DATA_DIR, projectDir: PROJECT_DIR,
      env: { GITHUB_EVENT_TITLE: parsed.title, GITHUB_EVENT_BODY: parsed.body, GITHUB_EVENT_URL: parsed.url },
    }).catch(() => {});
    return c.json({ ok: true, triggered: workflowId, event: parsed.type });
  });

  app.use("/api/*", authMiddleware(token));
  app.use("/api/sessions/*", rateLimitMiddleware(120, 60_000, "sessions"));

  registerSessionRoutes(app, ctx);
  registerIssueRoutes(app, ctx);
  registerProviderRoutes(app, ctx);
  registerWorkflowRoutes(app, ctx);
  registerMiscRoutes(app, ctx);
  registerFileRoutes(app, ctx);

  app.use("/*", serveStatic({ root: "./dist/public" }));
  return app;
}

const app = createServer();
const token = getStudioToken(DATA_DIR);
// On startup, any session still marked 'running' is stale -- the process that
// owned it is gone. Reset to 'idle' so the UI doesn't show them as running
// and so pending approval callbacks (which are in-memory) aren't waited on.
const _startupDb = getDb(DATA_DIR);
_startupDb.prepare("UPDATE sessions SET status = 'idle', updated_at = ? WHERE status = 'running'").run(Date.now());

const shutdown = () => {
  try { getDb(DATA_DIR).pragma("wal_checkpoint(TRUNCATE)"); } catch {}
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const httpServer = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[studio] starting on port ${info.port}, project: ${PROJECT_DIR}`);
  console.log(`[studio] oauth: ${hasOAuthCredentials() ? "detected" : "not found"}`);
});

// ── Terminal WebSocket ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(httpServer as any).on("upgrade", (req: IncomingMessage, socket: unknown, head: unknown) => {
  const destroy = () => (socket as { destroy: () => void }).destroy();
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname !== "/api/terminal") { destroy(); return; }

  // Enforce localhost-only for the terminal
  const remoteAddr = (req.socket as { remoteAddress?: string }).remoteAddress ?? "";
  if (remoteAddr !== "127.0.0.1" && remoteAddr !== "::1" && remoteAddr !== "::ffff:127.0.0.1") { destroy(); return; }

  const queryToken = url.searchParams.get("token");
  if (queryToken !== token) { destroy(); return; }

  wss.handleUpgrade(req, socket as never, head as Buffer, (ws) => { wss.emit("connection", ws, req); });
});

wss.on("connection", (ws) => {
  import("node-pty").then(({ default: pty }) => {
    const shell = process.env.SHELL ?? "/bin/zsh";
    const term = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: PROJECT_DIR,
      env: { ...process.env } as Record<string, string>,
    });

    term.onData((data) => {
      try { ws.send(JSON.stringify({ type: "output", data })); } catch {}
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { type: string; data?: string; cols?: number; rows?: number };
        if (msg.type === "input" && msg.data) term.write(msg.data);
        if (msg.type === "resize" && msg.cols && msg.rows) term.resize(msg.cols, msg.rows);
      } catch {}
    });

    ws.on("close", () => { try { term.kill(); } catch {} });
    term.onExit(() => { try { ws.close(); } catch {} });
  }).catch((err) => {
    ws.send(JSON.stringify({ type: "error", data: `Terminal error: ${err.message}` }));
    ws.close();
  });
});
