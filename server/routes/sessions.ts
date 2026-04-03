/**
 * /api/sessions — multi-turn Claude chat sessions
 * Uses local claude CLI (no API key needed -- reuses Claude Code auth)
 *
 * Split into focused modules:
 *   sessions-shared.ts     — shared mutable state type
 *   sessions-chat.ts       — POST /:id/chat handler (~400 lines)
 *   sessions-analytics.ts  — analytics + token + loop endpoints
 */

import { Hono } from "hono";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { getDb } from "../db.js";
import { findClaudeBin } from "../lib/bin-resolver.js";
import { chatRoutes } from "./sessions-chat.js";
import { analyticsRoutes } from "./sessions-analytics.js";
import type { WorkspaceCtx } from "./workspaces.js";
import type { SessionSharedState } from "./sessions-shared.js";

// Port extracted from the server startup -- set by sessionsRoutes caller
let studioPort = 3200;

/** Called by the server entrypoint to set the port for MCP bridge config */
export function setStudioPort(port: number) {
  studioPort = port;
}

// Active processes -- allows interruption
const activeProcesses = new Map<string, { kill: () => void }>();

// Idle eviction: kill sessions with no messages for 30 minutes, cap at 5 concurrent
const SESSION_IDLE_TIMEOUT = 30 * 60 * 1000;
const MAX_ACTIVE_SESSIONS = 5;
const sessionLastActivity = new Map<string, number>();

setInterval(() => {
  const now = Date.now();

  // Evict idle sessions past timeout
  for (const [sid, lastActive] of sessionLastActivity) {
    if (now - lastActive > SESSION_IDLE_TIMEOUT && activeProcesses.has(sid)) {
      const proc = activeProcesses.get(sid);
      try { proc?.kill(); } catch {}
      activeProcesses.delete(sid);
      sessionLastActivity.delete(sid);
    }
  }

  // Enforce max concurrent -- evict least-recently-active first
  if (activeProcesses.size > MAX_ACTIVE_SESSIONS) {
    const sorted = [...sessionLastActivity.entries()].sort((a, b) => a[1] - b[1]);
    while (activeProcesses.size > MAX_ACTIVE_SESSIONS && sorted.length > 0) {
      const [sid] = sorted.shift()!;
      try { activeProcesses.get(sid)?.kill(); } catch {}
      activeProcesses.delete(sid);
      sessionLastActivity.delete(sid);
    }
  }
}, 60_000);

/** Kill all running claude/agent processes -- call before app exit */
export function killAllActiveSessions() {
  for (const proc of activeProcesses.values()) {
    try { proc.kill(); } catch {}
  }
  activeProcesses.clear();
  sessionLastActivity.clear();
}

export function sessionsRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  // Shared state object -- passed to sub-route modules so they can
  // read/write activeProcesses and sessionLastActivity
  const shared: SessionSharedState = {
    activeProcesses,
    sessionLastActivity,
    get studioPort() { return studioPort; },
  };

  // GET /api/sessions/config -- status check
  app.get("/config", (c) => {
    const claudeBin = findClaudeBin(ctx.projectDir);
    const claudeAvailable = existsSync(claudeBin) || claudeBin === "claude";
    return c.json({ claudeAvailable, claudeBin });
  });

  // GET /api/sessions/search?q=
  app.get("/search", (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (q.length < 2) return c.json({ results: [] });

    const db = getDb(ctx.dataDir);

    type SearchRow = {
      id: string; title: string; model: string;
      updated_at: number; total_input_tokens: number; total_output_tokens: number;
      snippet: string | null; snippet_role: string | null;
    };

    // FTS5 phrase search; wrap in double-quotes, strip any internal quotes to prevent syntax errors
    const ftsQuery = '"' + q.replace(/"/g, " ").trim() + '"';
    let rows: SearchRow[] = [];
    try {
      rows = db.prepare(`
        SELECT s.id, s.title, s.model, s.updated_at, s.total_input_tokens, s.total_output_tokens,
          f.body AS snippet, f.role AS snippet_role
        FROM (
          SELECT session_id, body, role, min(rank) AS best_rank
          FROM sessions_fts
          WHERE sessions_fts MATCH ?
          GROUP BY session_id
        ) f
        JOIN sessions s ON s.id = f.session_id
        WHERE s.archived = 0
        ORDER BY f.best_rank
        LIMIT 30
      `).all(ftsQuery) as SearchRow[];
    } catch {
      // Malformed FTS query -- fall back to LIKE
      const like = `%${q}%`;
      rows = db.prepare(`
        SELECT s.id, s.title, s.model, s.updated_at, s.total_input_tokens, s.total_output_tokens,
          m.content as snippet, m.role as snippet_role
        FROM sessions s
        LEFT JOIN session_messages m ON m.id = (
          SELECT id FROM session_messages
          WHERE session_id = s.id AND content LIKE ?
          ORDER BY created_at ASC LIMIT 1
        )
        WHERE s.title LIKE ? OR m.content LIKE ?
        GROUP BY s.id
        ORDER BY s.updated_at DESC
        LIMIT 30
      `).all(like, like, like) as SearchRow[];
    }

    const results = rows.map((r) => ({
      id: r.id,
      title: r.title,
      model: r.model,
      updatedAt: r.updated_at,
      snippet: r.snippet ? r.snippet.slice(0, 120) : null,
      snippetRole: r.snippet_role,
    }));

    return c.json({ results });
  });

  // GET /api/sessions?archived=true
  app.get("/", (c) => {
    const db = getDb(ctx.dataDir);
    const archived = c.req.query("archived") === "true" ? 1 : 0;
    const sessions = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM session_messages WHERE session_id = s.id) as message_count,
        (SELECT SUBSTR(content, 1, 120) FROM session_messages WHERE session_id = s.id AND role = 'assistant' ORDER BY created_at DESC LIMIT 1) as last_message
      FROM sessions s
      WHERE s.archived = ?
      ORDER BY s.updated_at DESC
      LIMIT 100
    `).all(archived);
    return c.json({ sessions });
  });

  // POST /api/sessions
  app.post("/", async (c) => {
    const body = await c.req.json<{
      title?: string;
      agentId?: string | null;
      agentName?: string | null;
      systemPrompt?: string | null;
      model?: string;
    }>();

    const db = getDb(ctx.dataDir);
    const id = randomUUID();
    const now = Date.now();

    db.prepare(`
      INSERT INTO sessions (id, title, agent_id, agent_name, model, status, total_input_tokens, total_output_tokens, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'idle', 0, 0, ?, ?)
    `).run(id, body.title ?? "New Session", body.agentId ?? null, body.agentName ?? null, body.model ?? '', now, now);

    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
    return c.json({ session }, 201);
  });

  // GET /api/sessions/:id
  // Supports optional pagination: ?limit=50&before=<message_id>
  // Returns last `limit` messages by default; pass `before` cursor to page backward
  app.get("/:id", (c) => {
    const db = getDb(ctx.dataDir);
    const id = c.req.param("id");
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
    if (!session) return c.json({ error: "Not found" }, 404);

    const limitParam = c.req.query("limit");
    const before = c.req.query("before");

    // If no pagination params, return all messages (backward-compatible)
    if (!limitParam && !before) {
      const messages = db.prepare(
        "SELECT * FROM session_messages WHERE session_id = ? ORDER BY created_at ASC"
      ).all(id);
      return c.json({ session, messages, hasMore: false });
    }

    const limit = Math.min(parseInt(limitParam ?? "50", 10), 200);

    type MsgRow = { id: string; created_at: number; [key: string]: unknown };

    let messages: MsgRow[];
    let hasMore = false;

    if (before) {
      const cursor = db.prepare(
        "SELECT created_at FROM session_messages WHERE id = ? AND session_id = ?"
      ).get(before, id) as { created_at: number } | undefined;

      if (!cursor) return c.json({ error: "invalid cursor" }, 400);

      const rows = db.prepare(`
        SELECT * FROM session_messages
        WHERE session_id = ? AND created_at < ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(id, cursor.created_at, limit + 1) as MsgRow[];

      hasMore = rows.length > limit;
      messages = rows.slice(0, limit).reverse();
    } else {
      const rows = db.prepare(`
        SELECT * FROM session_messages
        WHERE session_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(id, limit + 1) as MsgRow[];

      hasMore = rows.length > limit;
      messages = rows.slice(0, limit).reverse();
    }

    return c.json({ session, messages, hasMore });
  });

  // DELETE /api/sessions/:id
  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const active = activeProcesses.get(id);
    if (active) active.kill();
    activeProcesses.delete(id);
    sessionLastActivity.delete(id);
    const db = getDb(ctx.dataDir);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return c.json({ ok: true });
  });

  // PATCH /api/sessions/:id
  app.patch("/:id", async (c) => {
    const body = await c.req.json<{ title?: string; archived?: boolean }>();
    const db = getDb(ctx.dataDir);
    const id = c.req.param("id");
    if (body.title !== undefined) {
      db.prepare("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?")
        .run(body.title, Date.now(), id);
    }
    if (body.archived !== undefined) {
      db.prepare("UPDATE sessions SET archived = ?, updated_at = ? WHERE id = ?")
        .run(body.archived ? 1 : 0, Date.now(), id);
    }
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
    return c.json({ session });
  });

  // GET /api/sessions/:id/pending -- check for unsent messages
  app.get("/:id/pending", (c) => {
    const db = getDb(ctx.dataDir);
    const row = db.prepare(
      "SELECT id, content FROM session_messages WHERE session_id = ? AND role = 'user' AND sent_at IS NULL ORDER BY created_at ASC LIMIT 1"
    ).get(c.req.param("id")) as { id: string; content: string } | undefined;
    return c.json({ hasPending: !!row, message: row?.content ?? null });
  });

  // POST /api/sessions/:id/interrupt
  app.post("/:id/interrupt", (c) => {
    const id = c.req.param("id");
    const active = activeProcesses.get(id);
    if (active) {
      active.kill();
      activeProcesses.delete(id);
      sessionLastActivity.delete(id);
      return c.json({ ok: true });
    }
    return c.json({ ok: false });
  });

  // Mount sub-routes
  app.route("/", chatRoutes(ctx, shared));
  app.route("/", analyticsRoutes(ctx));

  return app;
}
