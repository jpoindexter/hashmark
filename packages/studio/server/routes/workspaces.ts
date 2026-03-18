/**
 * /api/workspaces — workspace registry
 * Tracks recently opened projects and allows switching the active one.
 * The registry itself lives in the global DB (initial dataDir).
 */

import { Hono } from "hono";
import { randomUUID } from "crypto";
import { existsSync, readFileSync, statSync } from "fs";
import { join, basename } from "path";
import { getDb, resetDb } from "../db.js";

export interface WorkspaceCtx {
  projectDir: string;
  dataDir: string;
}

function readProjectName(projectDir: string): string {
  const pkgPath = join(projectDir, "package.json");
  try {
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: string };
      if (pkg.name) return pkg.name;
    }
  } catch {}
  return basename(projectDir);
}

export function workspacesRoutes(globalDataDir: string, ctx: WorkspaceCtx) {
  const app = new Hono();

  // GET /api/workspaces
  app.get("/", (c) => {
    const db = getDb(globalDataDir);
    const rows = db.prepare(
      "SELECT id, name, path, last_opened, is_active FROM workspaces ORDER BY last_opened DESC"
    ).all() as Array<{ id: string; name: string; path: string; last_opened: number; is_active: number }>;
    return c.json({ workspaces: rows });
  });

  // POST /api/workspaces — add a workspace by path
  app.post("/", async (c) => {
    const body = await c.req.json<{ path?: string }>();
    const rawPath = body?.path?.trim();
    if (!rawPath) return c.json({ error: "path required" }, 400);

    let stat;
    try { stat = statSync(rawPath); } catch {
      return c.json({ error: "path does not exist" }, 400);
    }
    if (!stat.isDirectory()) return c.json({ error: "path must be a directory" }, 400);

    const name = readProjectName(rawPath);
    const db = getDb(globalDataDir);
    const existing = db.prepare("SELECT id FROM workspaces WHERE path = ?").get(rawPath) as { id: string } | undefined;

    if (existing) {
      db.prepare("UPDATE workspaces SET name = ?, last_opened = ? WHERE id = ?")
        .run(name, Date.now(), existing.id);
      const updated = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(existing.id);
      return c.json({ workspace: updated });
    }

    const id = randomUUID();
    db.prepare("INSERT INTO workspaces (id, name, path, last_opened, is_active) VALUES (?, ?, ?, ?, 0)")
      .run(id, name, rawPath, Date.now());
    const created = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id);
    return c.json({ workspace: created }, 201);
  });

  // POST /api/workspaces/:id/activate — switch active workspace
  app.post("/:id/activate", (c) => {
    const id = c.req.param("id");
    const db = getDb(globalDataDir);
    const ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as
      | { id: string; name: string; path: string } | undefined;

    if (!ws) return c.json({ error: "workspace not found" }, 404);

    if (!existsSync(ws.path)) return c.json({ error: "workspace path no longer exists" }, 400);

    db.prepare("UPDATE workspaces SET is_active = 0").run();
    db.prepare("UPDATE workspaces SET is_active = 1, last_opened = ? WHERE id = ?")
      .run(Date.now(), id);

    // Reset per-project DB so next request opens the new project's DB
    resetDb();

    // Update the mutable context so inline server routes pick up the new dir
    ctx.projectDir = ws.path;
    ctx.dataDir = `${ws.path}/.hashmark`;

    return c.json({ ok: true, path: ws.path, name: ws.name });
  });

  // DELETE /api/workspaces/:id — remove from registry (does NOT delete files)
  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const db = getDb(globalDataDir);
    const ws = db.prepare("SELECT id FROM workspaces WHERE id = ?").get(id);
    if (!ws) return c.json({ error: "workspace not found" }, 404);
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(id);
    return c.json({ ok: true }, 200);
  });

  return app;
}
