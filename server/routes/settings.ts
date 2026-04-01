/**
 * /api/settings — studio settings routes
 * Permission mode, feature flags, and other per-project settings.
 */

import { Hono } from "hono";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { getDb } from "../db.js";
import {
  getPermissionMode,
  setPermissionMode,
  isValidPermissionMode,
  PERMISSION_MODES,
} from "../lib/permissions.js";
import type { WorkspaceCtx } from "./workspaces.js";

export function settingsRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  // GET /api/settings/permission-mode — current mode + all available modes
  app.get("/permission-mode", (c) => {
    const db = getDb(ctx.dataDir);
    const current = getPermissionMode(db);

    const modes = Object.entries(PERMISSION_MODES).map(([key, def]) => ({
      id: key,
      label: def.label,
      description: def.description,
      allowedTools: [...def.allowedTools],
      active: key === current,
    }));

    return c.json({ current, modes });
  });

  // PUT /api/settings/permission-mode — update the mode
  app.put("/permission-mode", async (c) => {
    const body = await c.req.json<{ mode?: unknown }>().catch(() => ({} as { mode?: unknown }));

    if (!isValidPermissionMode(body.mode)) {
      const valid = Object.keys(PERMISSION_MODES).join(", ");
      return c.json(
        { error: `Invalid permission mode. Valid values: ${valid}` },
        400,
      );
    }

    const db = getDb(ctx.dataDir);
    setPermissionMode(db, body.mode);

    return c.json({ ok: true, mode: body.mode });
  });

  // DELETE /api/settings/data — GDPR data deletion: wipe all user data
  app.delete("/data", (c) => {
    try {
      const db = getDb(ctx.dataDir);

      // Clear all rows from user-data tables (order matters for FK constraints)
      db.exec("DELETE FROM session_messages");
      db.exec("DELETE FROM sessions");
      db.exec("DELETE FROM swarm_workers");
      db.exec("DELETE FROM swarm_runs");
      db.exec("DELETE FROM runs");
      db.exec("DELETE FROM agent_actions");
      db.exec("DELETE FROM governance_policies");
      db.exec("DELETE FROM issues");

      // Clear FTS index contents
      try { db.exec("DELETE FROM sessions_fts"); } catch { /* table may not exist */ }

      // Delete file-based data stores
      const actionsLog = join(ctx.dataDir, "agent-actions.jsonl");
      if (existsSync(actionsLog)) unlinkSync(actionsLog);

      const providersFile = join(ctx.dataDir, "providers.json");
      if (existsSync(providersFile)) unlinkSync(providersFile);

      return c.json({ ok: true, message: "All studio data deleted" });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  return app;
}
