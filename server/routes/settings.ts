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

  // GET /api/settings/usage — aggregated usage stats across runs + sessions
  app.get("/usage", (c) => {
    const db = getDb(ctx.dataDir);

    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();
    const weekMs = todayMs - 6 * 86_400_000; // 7-day window including today

    // Totals from runs table
    const runTotals = db.prepare(`
      SELECT
        COUNT(*) as totalRuns,
        COALESCE(SUM(cost_usd), 0) as totalRunCost,
        COUNT(CASE WHEN started_at >= ? THEN 1 END) as runsToday,
        COUNT(CASE WHEN started_at >= ? THEN 1 END) as runsThisWeek
      FROM runs
    `).get(todayMs, weekMs) as {
      totalRuns: number;
      totalRunCost: number;
      runsToday: number;
      runsThisWeek: number;
    };

    // Total sessions
    const sessionTotals = db.prepare(`
      SELECT
        COUNT(*) as totalSessions,
        COALESCE(SUM(cost_usd), 0) as totalSessionCost
      FROM sessions
    `).get() as { totalSessions: number; totalSessionCost: number };

    const totalCostUsd = runTotals.totalRunCost + sessionTotals.totalSessionCost;
    const avgCostPerRun = runTotals.totalRuns > 0
      ? Math.round((runTotals.totalRunCost / runTotals.totalRuns) * 1000) / 1000
      : 0;

    // Top agents by run count
    const topAgents = db.prepare(`
      SELECT agent_name as agentName, COUNT(*) as runCount
      FROM runs
      WHERE agent_name IS NOT NULL AND agent_name != ''
      GROUP BY agent_name
      ORDER BY runCount DESC
      LIMIT 10
    `).all() as Array<{ agentName: string; runCount: number }>;

    // Model usage from sessions (sessions track the model)
    const modelRows = db.prepare(`
      SELECT
        model,
        COUNT(*) as sessions,
        COALESCE(SUM(cost_usd), 0) as cost
      FROM sessions
      WHERE model IS NOT NULL AND model != ''
      GROUP BY model
    `).all() as Array<{ model: string; sessions: number; cost: number }>;

    const modelUsage: Record<string, { sessions: number; cost: number }> = {};
    for (const row of modelRows) {
      modelUsage[row.model] = {
        sessions: row.sessions,
        cost: Math.round(row.cost * 1000) / 1000,
      };
    }

    return c.json({
      totalRuns: runTotals.totalRuns,
      totalSessions: sessionTotals.totalSessions,
      totalCostUsd: Math.round(totalCostUsd * 1000) / 1000,
      runsToday: runTotals.runsToday,
      runsThisWeek: runTotals.runsThisWeek,
      avgCostPerRun,
      topAgents,
      modelUsage,
    });
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
