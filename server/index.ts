/**
 * hashmark studio — Hono server
 * Serves static client + API routes
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { readFileSync, existsSync } from "fs";
import { join, basename } from "path";
import { execFile as execFileCb } from "child_process";
import { promisify } from "util";

const execFile = promisify(execFileCb);
import { randomUUID } from "crypto";
import { agentsRoutes } from "./routes/agents.js";
import { generateRoutes } from "./routes/generate.js";
import { scanRoutes } from "./routes/scan.js";
import { tasksRoutes } from "./routes/tasks.js";
import { sessionsRoutes, killAllActiveSessions, setStudioPort } from "./routes/sessions.js";
export { killAllActiveSessions };
import { attachTerminalWS } from "./routes/terminal.js";
import { filesRoutes } from "./routes/files.js";
import { workspaceRoutes } from "./routes/workspace.js";
import { checkpointRoutes } from "./routes/checkpoints.js";
import { mcpRoutes } from "./routes/mcp.js";
import { companyRoutes } from "./routes/company.js";
import { runRoutes } from "./routes/run.js";
import { swarmRoutes } from "./routes/swarm.js";
import { driftRoutes } from "./routes/drift.js";
import { providersRoutes } from "./routes/providers.js";
import { governanceRoutes } from "./routes/governance.js";
import { workspacesRoutes, type WorkspaceCtx } from "./routes/workspaces.js";
import { configRoutes } from "./routes/config.js";
import { sandboxRoutes } from "./routes/sandbox.js";
import { getDb } from "./db.js";
import { getStudioToken } from "./lib/studio-token.js";
import { studioAuthMiddleware } from "./lib/auth-middleware.js";
import { rateLimitMiddleware } from "./lib/rate-limit.js";

export interface ServerOptions {
  projectDir: string;
  staticDir: string;
  port: number;
}

export function createServer(opts: ServerOptions) {
  const app = new Hono();

  // Mutable context — routes that need dynamic project dir read from here
  const ctx: WorkspaceCtx = {
    projectDir: opts.projectDir,
    dataDir: `${opts.projectDir}/.hashmark`,
  };

  // Global DB lives at the initial dataDir — workspace registry stored here
  const globalDataDir = ctx.dataDir;

  // Upsert startup workspace into the registry
  if (opts.projectDir !== "__unset__") {
    try {
      const db = getDb(globalDataDir);
      const pkgPath = join(opts.projectDir, "package.json");
      let name = basename(opts.projectDir);
      try {
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: string };
          if (pkg.name) name = pkg.name;
        }
      } catch {}

      const existing = db.prepare("SELECT id FROM workspaces WHERE path = ?").get(opts.projectDir) as
        | { id: string } | undefined;

      if (existing) {
        db.prepare("UPDATE workspaces SET name = ?, last_opened = ?, is_active = 1 WHERE id = ?")
          .run(name, Date.now(), existing.id);
        db.prepare("UPDATE workspaces SET is_active = 0 WHERE id != ?").run(existing.id);
      } else {
        const id = randomUUID();
        db.prepare("UPDATE workspaces SET is_active = 0").run();
        db.prepare("INSERT INTO workspaces (id, name, path, last_opened, is_active) VALUES (?, ?, ?, ?, 1)")
          .run(id, name, opts.projectDir, Date.now());
      }
    } catch {}
  }

  // Tell the sessions module which port we're on so the MCP bridge can call back
  setStudioPort(opts.port);

  app.use("*", logger());
  app.use("*", cors({ origin: `http://localhost:${opts.port}` }));
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; font-src 'self' data:");
  });

  // Auth token — generated once, persisted to .hashmark/studio.token
  const studioToken = getStudioToken(ctx.dataDir);

  // Auth middleware — protects all /api/* except /api/health and /api/info
  app.use("/api/*", studioAuthMiddleware(studioToken));

  // Health check — verifies DB write access and claude binary exists
  app.get("/api/health", (c) => {
    const checks: Record<string, boolean> = {};

    try {
      const db = getDb(ctx.dataDir);
      db.prepare("SELECT 1").get();
      checks.db = true;
    } catch {
      checks.db = false;
    }

    try {
      const { spawnSync } = require("child_process") as typeof import("child_process");
      const r = spawnSync("which", ["claude"], { stdio: "pipe", timeout: 1000 });
      checks.claude = r.status === 0;
    } catch {
      checks.claude = false;
    }

    const ok = Object.values(checks).every(Boolean);
    return c.json({ ok, checks, timestamp: Date.now() }, ok ? 200 : 503);
  });

  // Project info — reads from mutable ctx so it reflects workspace switches
  app.get("/api/info", async (c) => {
    const { join: pathJoin, basename: pathBasename } = await import("path");
    const { existsSync: fsExists, readFileSync: fsRead } = await import("fs");

    const pkgPath = pathJoin(ctx.projectDir, "package.json");
    let projectName = pathBasename(ctx.projectDir);

    try {
      if (fsExists(pkgPath)) {
        const pkg = JSON.parse(fsRead(pkgPath, "utf-8")) as { name?: string };
        projectName = pkg.name ?? projectName;
      }
    } catch {}

    return c.json({
      projectName,
      projectDir: ctx.projectDir,
      configured: ctx.projectDir !== "__unset__",
      nodeVersion: process.versions.node,
      port: opts.port,
    });
  });

  // Settings — env var keys (names only, never values)
  app.get("/api/settings/env", async (c) => {
    const { join: pjoin } = await import("path");
    const { existsSync: fsExists, readFileSync: fsRead } = await import("fs");

    const vars: Array<{ key: string; source: string; set: boolean }> = [];
    const seen = new Set<string>();

    for (const fname of [".env.local", ".env"]) {
      const filePath = pjoin(ctx.projectDir, fname);
      if (!fsExists(filePath)) continue;
      try {
        for (const line of fsRead(filePath, "utf-8").split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eq = trimmed.indexOf("=");
          if (eq === -1) continue;
          const key = trimmed.slice(0, eq).trim();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          vars.push({ key, source: fname, set: trimmed.slice(eq + 1).trim().length > 0 });
        }
      } catch {}
    }

    return c.json({ vars });
  });

  // Rate limiting for AI-heavy routes — 10 requests/min per IP
  app.use("/api/sessions", rateLimitMiddleware(10, 60_000, "chat"));
  app.use("/api/sessions/*", rateLimitMiddleware(10, 60_000, "chat"));
  app.use("/api/run", rateLimitMiddleware(10, 60_000, "run"));

  // API routes
  app.route("/api/scan", scanRoutes(ctx));
  app.route("/api/agents", agentsRoutes(ctx));
  app.route("/api/generate", generateRoutes(ctx));
  app.route("/api/tasks", tasksRoutes(ctx));
  app.route("/api/sessions", sessionsRoutes(ctx));
  app.route("/api/files", filesRoutes(ctx));
  app.route("/api/workspace", workspaceRoutes(ctx));
  app.route("/api/checkpoints", checkpointRoutes(ctx));
  app.route("/api/mcp", mcpRoutes(ctx));
  app.route("/api/run", runRoutes(ctx));
  app.route("/api/swarm", swarmRoutes(ctx));
  app.route("/api/company", companyRoutes(ctx));
  app.route("/api/drift", driftRoutes(ctx));
  app.route("/api/providers", providersRoutes(ctx));
  app.route("/api/governance", governanceRoutes(ctx));
  app.route("/api/workspaces", workspacesRoutes(globalDataDir, ctx));
  app.route("/api/config", configRoutes(ctx));
  app.route("/api/sandbox", sandboxRoutes(ctx));

  // Serve static client files
  app.use(
    "/*",
    serveStatic({ root: opts.staticDir })
  );

  // SPA fallback — inject auth token so the client can authenticate API calls
  app.get("*", (c) => {
    const indexPath = join(opts.staticDir, "index.html");
    if (existsSync(indexPath)) {
      const raw = readFileSync(indexPath, "utf-8");
      const tokenScript = `<script>window.__STUDIO_TOKEN__="${studioToken}"</script>`;
      const html = raw.includes("</head>")
        ? raw.replace("</head>", `${tokenScript}</head>`)
        : tokenScript + raw;
      return c.html(html);
    }
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head><title>hashmark studio</title></head>
        <body style="background:#09090b;color:#71717a;font-family:monospace;padding:40px">
          <h2 style="color:#10b981"># hashmark studio</h2>
          <p>Studio client not built yet.</p>
          <p>Run: <code style="color:#fafafa">cd packages/studio && npm install && npm run build:client</code></p>
        </body>
      </html>
    `);
  });

  const server = serve({ fetch: app.fetch, port: opts.port, hostname: "localhost" }, () => {});

  // Attach WebSocket terminal (raw ws, not Hono's upgradeWebSocket)
  attachTerminalWS(server as Parameters<typeof attachTerminalWS>[0], opts.projectDir);

  // Clean up orphaned studio worktrees from previous crashed runs
  if (opts.projectDir !== "__unset__") {
    setImmediate(() => {
      execFile("git", ["worktree", "list", "--porcelain"], { cwd: opts.projectDir })
        .then(({ stdout }) => {
          const worktrees = stdout.split("\n\n").filter(Boolean);
          for (const wt of worktrees) {
            const pathMatch = wt.match(/^worktree (.+)$/m);
            const branchMatch = wt.match(/^branch refs\/heads\/(.+)$/m);
            if (!pathMatch || !branchMatch) continue;
            const wtPath = pathMatch[1];
            const branch = branchMatch[1];
            if (!branch.startsWith("studio-run-") && !branch.startsWith("swarm-")) continue;
            execFile("git", ["worktree", "remove", wtPath, "--force"], { cwd: opts.projectDir }).catch(() => {});
            execFile("git", ["branch", "-D", branch], { cwd: opts.projectDir }).catch(() => {});
          }
        })
        .catch(() => {});
    });
  }

  return { app, server };
}
