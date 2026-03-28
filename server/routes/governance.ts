import { Hono } from "hono";
import { getDb } from "../db.js";
import { randomUUID } from "crypto";
import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import type { WorkspaceCtx } from "./workspaces.js";

export function governanceRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  // GET /api/governance/policies
  app.get("/policies", (c) => {
    const db = getDb(ctx.dataDir);
    const policies = db.prepare("SELECT * FROM governance_policies ORDER BY created_at DESC").all();
    type RawPolicy = { rules: string; [k: string]: unknown };
    return c.json({ policies: policies.map(p => { const r = p as RawPolicy; return { ...r, rules: JSON.parse(r.rules) }; }) });
  });

  // POST /api/governance/policies
  app.post("/policies", async (c) => {
    const body = await c.req.json<{ name: string; description?: string; scope?: string; rules?: unknown[] }>();
    const db = getDb(ctx.dataDir);
    const id = randomUUID().slice(0, 8);
    db.prepare(
      "INSERT INTO governance_policies (id, name, description, scope, rules, enabled, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)"
    ).run(id, body.name, body.description ?? "", body.scope ?? "all", JSON.stringify(body.rules ?? []), Date.now());
    return c.json({ id }, 201);
  });

  // PUT /api/governance/policies/:id
  app.put("/policies/:id", async (c) => {
    const body = await c.req.json<{ name?: string; description?: string; scope?: string; rules?: unknown[]; enabled?: boolean }>();
    const db = getDb(ctx.dataDir);
    const fields: string[] = [];
    const vals: unknown[] = [];
    if (body.name !== undefined) { fields.push("name=?"); vals.push(body.name); }
    if (body.description !== undefined) { fields.push("description=?"); vals.push(body.description); }
    if (body.scope !== undefined) { fields.push("scope=?"); vals.push(body.scope); }
    if (body.rules !== undefined) { fields.push("rules=?"); vals.push(JSON.stringify(body.rules)); }
    if (body.enabled !== undefined) { fields.push("enabled=?"); vals.push(body.enabled ? 1 : 0); }
    if (fields.length) {
      vals.push(c.req.param("id"));
      db.prepare(`UPDATE governance_policies SET ${fields.join(", ")} WHERE id=?`).run(...vals);
    }
    return c.json({ ok: true });
  });

  // DELETE /api/governance/policies/:id
  app.delete("/policies/:id", (c) => {
    const db = getDb(ctx.dataDir);
    db.prepare("DELETE FROM governance_policies WHERE id=?").run(c.req.param("id"));
    return c.json({ ok: true });
  });

  // GET /api/governance/actions
  app.get("/actions", (c) => {
    const db = getDb(ctx.dataDir);
    const limit = parseInt(c.req.query("limit") ?? "100");
    const offset = parseInt(c.req.query("offset") ?? "0");
    const agentId = c.req.query("agentId");
    const outcome = c.req.query("outcome");

    let query = "SELECT * FROM agent_actions";
    const conditions: string[] = [];
    const filterParams: unknown[] = [];
    if (agentId) { conditions.push("agent_id=?"); filterParams.push(agentId); }
    if (outcome) { conditions.push("outcome=?"); filterParams.push(outcome); }
    if (conditions.length) query += " WHERE " + conditions.join(" AND ");
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";

    const actions = db.prepare(query).all(...filterParams, limit, offset);
    const countQuery = `SELECT COUNT(*) as c FROM agent_actions${conditions.length ? " WHERE " + conditions.join(" AND ") : ""}`;
    const total = (db.prepare(countQuery).get(...filterParams) as { c: number } | undefined)?.c ?? 0;
    return c.json({ actions, total });
  });

  // POST /api/governance/actions
  app.post("/actions", async (c) => {
    const body = await c.req.json<{ sessionId?: string; agentId?: string; actionType: string; target?: string; outcome?: string; policyId?: string }>();
    const db = getDb(ctx.dataDir);
    db.prepare(
      "INSERT INTO agent_actions (session_id, agent_id, action_type, target, outcome, policy_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(body.sessionId ?? null, body.agentId ?? null, body.actionType, body.target ?? null, body.outcome ?? "allowed", body.policyId ?? null, Date.now());
    return c.json({ ok: true }, 201);
  });

  // GET /api/governance/summary
  app.get("/summary", (c) => {
    const db = getDb(ctx.dataDir);
    const total = (db.prepare("SELECT COUNT(*) as c FROM agent_actions").get() as { c: number })?.c ?? 0;
    const blocked = (db.prepare("SELECT COUNT(*) as c FROM agent_actions WHERE outcome='blocked'").get() as { c: number })?.c ?? 0;
    const flagged = (db.prepare("SELECT COUNT(*) as c FROM agent_actions WHERE outcome='flagged'").get() as { c: number })?.c ?? 0;
    const byType = db.prepare("SELECT action_type, COUNT(*) as count FROM agent_actions GROUP BY action_type").all();
    const recentBlocked = db.prepare("SELECT * FROM agent_actions WHERE outcome IN ('blocked','flagged') ORDER BY created_at DESC LIMIT 5").all();
    return c.json({ total, blocked, flagged, byType, recentBlocked });
  });

  // GET /api/governance/action-log?limit=100&offset=0&runId=&agentId=
  app.get("/action-log", (c) => {
    const logPath = join(ctx.dataDir, "agent-actions.jsonl");
    if (!existsSync(logPath)) return c.json({ events: [], total: 0 });

    const limit = parseInt(c.req.query("limit") ?? "100");
    const offset = parseInt(c.req.query("offset") ?? "0");
    const filterRunId = c.req.query("runId");
    const filterAgentId = c.req.query("agentId");

    // Guard: skip if file exceeds 50 MB to avoid OOM on runaway logs
    const MAX_LOG_BYTES = 50 * 1024 * 1024;
    const stat = statSync(logPath);
    if (stat.size > MAX_LOG_BYTES) {
      return c.json({ error: "action log too large to read in memory", bytes: stat.size }, 413);
    }

    const lines = readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean);
    let events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    events.reverse();
    if (filterRunId) events = events.filter((e: { runId: string }) => e.runId === filterRunId);
    if (filterAgentId) events = events.filter((e: { agentId: string }) => e.agentId === filterAgentId);
    const total = events.length;
    return c.json({ events: events.slice(offset, offset + limit), total });
  });

  return app;
}
