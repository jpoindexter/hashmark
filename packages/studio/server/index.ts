/**
 * hashmark studio — Hono server
 * Serves static client + API routes
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors";
import { readFileSync, existsSync } from "fs";
import { join, basename } from "path";
import { randomUUID } from "crypto";
import { agentsRoutes } from "./routes/agents.js";
import { generateRoutes } from "./routes/generate.js";
import { scanRoutes } from "./routes/scan.js";
import { tasksRoutes } from "./routes/tasks.js";
import { sessionsRoutes } from "./routes/sessions.js";
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
import { getDb } from "./db.js";

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

  app.use("*", cors({ origin: "*" }));

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

  // API routes
  app.route("/api/scan", scanRoutes(opts.projectDir));
  app.route("/api/agents", agentsRoutes(opts.projectDir));
  app.route("/api/generate", generateRoutes(opts.projectDir));
  app.route("/api/tasks", tasksRoutes(opts.projectDir));
  app.route("/api/sessions", sessionsRoutes(opts.projectDir));
  app.route("/api/files", filesRoutes(opts.projectDir));
  app.route("/api/workspace", workspaceRoutes(opts.projectDir));
  app.route("/api/checkpoints", checkpointRoutes(opts.projectDir));
  app.route("/api/mcp", mcpRoutes(opts.projectDir));
  app.route("/api/run", runRoutes(opts.projectDir));
  app.route("/api/swarm", swarmRoutes(opts.projectDir));
  app.route("/api/company", companyRoutes(opts.projectDir));
  app.route("/api/drift", driftRoutes(opts.projectDir));
  app.route("/api/providers", providersRoutes(opts.projectDir));
  app.route("/api/governance", governanceRoutes(opts.projectDir));
  app.route("/api/workspaces", workspacesRoutes(globalDataDir, ctx));

  // Serve static client files
  app.use(
    "/*",
    serveStatic({ root: opts.staticDir })
  );

  // SPA fallback
  app.get("*", (c) => {
    const indexPath = join(opts.staticDir, "index.html");
    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath, "utf-8");
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

  return { app, server };
}
