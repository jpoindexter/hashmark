/**
 * Session analytics endpoints — token usage, loop detection, context heatmap.
 * Extracted from sessions.ts to keep route files under 400 lines.
 */

import { Hono } from "hono";
import { getDb } from "../db.js";
import { analyzeSessionLoop } from "../lib/loop-detector.js";
import { loadSessionAnalytics } from "../lib/context-analytics.js";
import { getContextWindow, shouldAutoCompact } from "../lib/compaction.js";
import type { WorkspaceCtx } from "./workspaces.js";

export function analyticsRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  // GET /api/sessions/:id/analytics — context section heatmap
  app.get("/:id/analytics", async (c) => {
    const id = c.req.param("id");
    const db = getDb(ctx.dataDir);
    const session = db.prepare("SELECT id FROM sessions WHERE id = ?").get(id);
    if (!session) return c.json({ error: "Not found" }, 404);
    const analytics = await loadSessionAnalytics(ctx.dataDir, id);
    return c.json(analytics);
  });

  // GET /api/sessions/:id/loop-analysis — detect behavioral loops in conversation
  app.get("/:id/loop-analysis", (c) => {
    const db = getDb(ctx.dataDir);
    const session = db.prepare("SELECT id FROM sessions WHERE id = ?").get(c.req.param("id"));
    if (!session) return c.json({ error: "Not found" }, 404);
    const messages = db.prepare(
      "SELECT role, content FROM session_messages WHERE session_id = ? ORDER BY created_at ASC"
    ).all(c.req.param("id")) as Array<{ role: string; content: string }>;
    return c.json(analyzeSessionLoop(messages));
  });

  // GET /api/sessions/:id/context — context window usage summary
  app.get("/:id/context", (c) => {
    const db = getDb(ctx.dataDir);
    const session = db.prepare(
      "SELECT total_input_tokens, total_output_tokens, model FROM sessions WHERE id = ?"
    ).get(c.req.param("id")) as {
      total_input_tokens: number;
      total_output_tokens: number;
      model: string;
    } | undefined;

    if (!session) return c.json({ error: "Not found" }, 404);

    const inputTokens = session.total_input_tokens;
    const outputTokens = session.total_output_tokens;
    const totalTokens = inputTokens + outputTokens;
    const model = session.model || "claude-sonnet-4-6";
    const contextWindow = getContextWindow(model);
    const usagePercent = Math.round((totalTokens / contextWindow) * 1000) / 10; // 1 decimal
    const needsCompaction = shouldAutoCompact(totalTokens, model);

    return c.json({
      inputTokens,
      outputTokens,
      totalTokens,
      contextWindow,
      usagePercent,
      model,
      needsCompaction,
    });
  });

  // GET /api/sessions/:id/tokens
  app.get("/:id/tokens", (c) => {
    const db = getDb(ctx.dataDir);
    const sessionId = c.req.param("id");
    const session = db.prepare(`
      SELECT s.total_input_tokens, s.total_output_tokens, s.cost_usd,
        COUNT(m.id) as message_count,
        SUM(CASE WHEN m.role='user' THEN 1 ELSE 0 END) as user_count,
        SUM(CASE WHEN m.role='assistant' THEN 1 ELSE 0 END) as assistant_count,
        COALESCE(SUM(CASE WHEN m.role='user' THEN m.input_tokens ELSE 0 END),0) as user_input_tokens,
        COALESCE(SUM(CASE WHEN m.role='assistant' THEN m.output_tokens ELSE 0 END),0) as assistant_output_tokens
      FROM sessions s
      LEFT JOIN session_messages m ON m.session_id = s.id
      WHERE s.id = ?
    `).get(sessionId) as {
      total_input_tokens: number;
      total_output_tokens: number;
      cost_usd: number;
      message_count: number;
      user_count: number;
      assistant_count: number;
      user_input_tokens: number;
      assistant_output_tokens: number;
    } | undefined;

    if (!session) return c.json({ error: "Not found" }, 404);

    const total = session.total_input_tokens + session.total_output_tokens;
    const contextWindow = 200000;
    const pct = Math.min(100, Math.round((total / contextWindow) * 100));

    // Structural waste estimate based on Missing Memory Hierarchy paper (2603.09023):
    // Sessions accumulate dead tool output (~26.5%), unused schemas (~20.2%), static re-sends (~11%).
    // Average measured waste: 21.8%. Scales with message count -- more turns = more dead output.
    const wasteEstimatePct = Math.min(35, Math.round(session.message_count * 1.2));

    // Stage breakdown: divide conversation into early/middle/recent thirds by message position
    // Use LENGTH() in SQL to avoid loading full message content into memory
    const messageLengths = db.prepare(
      "SELECT LENGTH(content) as len, role FROM session_messages WHERE session_id = ? ORDER BY created_at ASC"
    ).all(sessionId) as Array<{ len: number; role: string }>;

    const msgCount = messageLengths.length;
    const earlyEnd = Math.floor(msgCount * 0.33);
    const midEnd = Math.floor(msgCount * 0.66);

    const stageBreakdown = { early: 0, middle: 0, recent: 0 };
    for (let i = 0; i < msgCount; i++) {
      const tokens = Math.ceil(messageLengths[i].len / 4);
      if (i < earlyEnd) stageBreakdown.early += tokens;
      else if (i < midEnd) stageBreakdown.middle += tokens;
      else stageBreakdown.recent += tokens;
    }

    const avgMessageTokens = msgCount > 0 ? Math.round(total / msgCount) : 0;

    return c.json({
      inputTokens: session.total_input_tokens,
      outputTokens: session.total_output_tokens,
      userInputTokens: session.user_input_tokens,
      assistantOutputTokens: session.assistant_output_tokens,
      userCount: session.user_count,
      assistantCount: session.assistant_count,
      total,
      contextWindow,
      pct,
      messageCount: session.message_count,
      wasteEstimatePct,
      stageBreakdown,
      avgMessageTokens,
    });
  });

  // GET /api/sessions/analytics/summary — aggregate stats for the app dashboard
  app.get("/analytics/summary", (c) => {
    const db = getDb(ctx.dataDir);
    const now = Date.now();
    const day = 86400000;

    const totalSessions = (db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE archived = 0").get() as { n: number }).n;
    const activeLast7d = (db.prepare(
      "SELECT COUNT(*) AS n FROM sessions WHERE archived = 0 AND updated_at > ?"
    ).get(now - 7 * day) as { n: number }).n;

    const tokenRow = db.prepare(
      "SELECT COALESCE(SUM(total_input_tokens),0) AS inp, COALESCE(SUM(total_output_tokens),0) AS out FROM sessions WHERE archived = 0"
    ).get() as { inp: number; out: number };

    const avgDuration = (db.prepare(
      "SELECT COALESCE(AVG(ended_at - started_at), 0) AS avg FROM sessions WHERE archived = 0 AND started_at IS NOT NULL AND ended_at IS NOT NULL"
    ).get() as { avg: number }).avg;

    const errorRow = db.prepare(
      "SELECT COALESCE(SUM(error_count), 0) AS n FROM sessions WHERE archived = 0"
    ).get() as { n: number };

    const totalRuns = (db.prepare("SELECT COUNT(*) AS n FROM runs").get() as { n: number }).n;
    const completedRuns = (db.prepare("SELECT COUNT(*) AS n FROM runs WHERE status = 'complete'").get() as { n: number }).n;

    return c.json({
      sessions: {
        total: totalSessions,
        activeLast7d,
        totalInputTokens: tokenRow.inp,
        totalOutputTokens: tokenRow.out,
        avgDurationMs: Math.round(avgDuration),
        totalErrors: errorRow.n,
      },
      runs: {
        total: totalRuns,
        completed: completedRuns,
        successRate: totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : 0,
      },
    });
  });

  return app;
}
