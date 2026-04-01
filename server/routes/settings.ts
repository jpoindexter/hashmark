/**
 * /api/settings — studio settings routes
 * Permission mode, feature flags, and other per-project settings.
 */

import { Hono } from "hono";
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

  return app;
}
