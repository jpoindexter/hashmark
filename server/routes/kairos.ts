/**
 * /api/kairos — persistent intelligent mode routes.
 * Enable/disable the always-on background watcher,
 * list and dismiss surfaced actions.
 */

import { Hono } from "hono";
import type { WorkspaceCtx } from "./workspaces.js";
import {
  getKairosStatus,
  getPendingActions,
  getAllActions,
  dismissAction,
  dismissAllActions,
  enableKairos,
  disableKairos,
} from "../lib/kairos.js";

export function kairosRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  // GET /api/kairos/status -- current state + pending action count
  app.get("/status", (c) => {
    return c.json(getKairosStatus());
  });

  // GET /api/kairos/actions -- list pending (non-dismissed) actions
  app.get("/actions", (c) => {
    const all = c.req.query("all") === "true";
    return c.json({ actions: all ? getAllActions() : getPendingActions() });
  });

  // POST /api/kairos/enable -- turn on the background loop
  app.post("/enable", (c) => {
    enableKairos(ctx.projectDir, ctx.dataDir);
    return c.json({ ok: true, enabled: true });
  });

  // POST /api/kairos/disable -- turn off the background loop
  app.post("/disable", (c) => {
    disableKairos(ctx.dataDir);
    return c.json({ ok: true, enabled: false });
  });

  // POST /api/kairos/dismiss/:id -- dismiss a single action
  app.post("/dismiss/:id", (c) => {
    const id = c.req.param("id");
    const found = dismissAction(id);
    if (!found) {
      return c.json({ error: "Action not found" }, 404);
    }
    return c.json({ ok: true });
  });

  // POST /api/kairos/dismiss-all -- dismiss everything
  app.post("/dismiss-all", (c) => {
    dismissAllActions();
    return c.json({ ok: true });
  });

  return app;
}
