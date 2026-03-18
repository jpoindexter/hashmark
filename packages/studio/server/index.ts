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

export interface ServerOptions {
  projectDir: string;
  staticDir: string;
  port: number;
}

export function createServer(opts: ServerOptions) {
  const app = new Hono();

  app.use("*", cors({ origin: "*" }));

  // Project info
  app.get("/api/info", async (c) => {
    const { join: pathJoin, basename: pathBasename } = await import("path");
    const { existsSync: fsExists, readFileSync: fsRead } = await import("fs");

    const pkgPath = pathJoin(opts.projectDir, "package.json");
    let projectName = pathBasename(opts.projectDir);

    try {
      if (fsExists(pkgPath)) {
        const pkg = JSON.parse(fsRead(pkgPath, "utf-8")) as { name?: string };
        projectName = pkg.name ?? projectName;
      }
    } catch {}

    return c.json({
      projectName,
      projectDir: opts.projectDir,
      configured: opts.projectDir !== "__unset__",
    });
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
