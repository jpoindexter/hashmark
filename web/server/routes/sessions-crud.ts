import { Hono } from "hono";
import { randomUUID } from "crypto";
import { getDb } from "../db.js";
import { loadProviders } from "../providers.js";

export function registerSessionCrudRoutes(app: Hono, ctx: { dataDir: string; projectDir: string }) {
  const { dataDir: DATA_DIR, projectDir: PROJECT_DIR } = ctx;

  app.get("/api/sessions", (c) => {
    const sessions = getDb(DATA_DIR).prepare(
      "SELECT s.id, s.title, s.model, s.provider, s.status, s.project_dir, s.input_tokens, s.output_tokens, s.created_at, s.updated_at, s.pinned, s.freshly_compacted, (SELECT COUNT(*) FROM messages WHERE session_id = s.id) as message_count FROM sessions s ORDER BY s.updated_at DESC LIMIT 50"
    ).all();
    return c.json(sessions);
  });

  app.post("/api/sessions", async (c) => {
    const db = getDb(DATA_DIR);
    const body = await c.req.json().catch(() => ({}));
    const providers = loadProviders(DATA_DIR);
    const id = randomUUID();
    const now = Date.now();
    db.prepare(
      "INSERT INTO sessions (id, title, model, provider, system_prompt, project_dir, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'idle', ?, ?)"
    ).run(id, body.title ?? "New Session", body.model ?? providers.model, body.provider ?? providers.active, body.system_prompt ?? null, body.project_dir ?? PROJECT_DIR, now, now);
    return c.json(db.prepare("SELECT * FROM sessions WHERE id = ?").get(id), 201);
  });

  app.get("/api/sessions/:id", (c) => {
    const db = getDb(DATA_DIR);
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(c.req.param("id"));
    if (!session) return c.json({ error: "not found" }, 404);
    db.prepare("UPDATE sessions SET freshly_compacted = 0 WHERE id = ? AND freshly_compacted = 1").run(c.req.param("id"));
    const messages = (db.prepare(
      "SELECT id, role, content, blocks, created_at, duration_ms FROM messages WHERE session_id = ? ORDER BY created_at ASC"
    ).all(c.req.param("id")) as Array<Record<string, unknown>>).map(m => ({
      ...m,
      blocks: typeof m.blocks === "string" ? JSON.parse(m.blocks) : m.blocks,
    }));
    return c.json({ session, messages });
  });

  app.patch("/api/sessions/:id", async (c) => {
    const db = getDb(DATA_DIR);
    const body = await c.req.json().catch(() => ({}));
    const allowed = ["title", "model", "provider", "system_prompt", "project_dir", "thinking_enabled", "thinking_level", "token_budget", "notes", "require_tool_approval", "freshly_compacted", "pinned"];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const key of allowed) {
      if (key in body) { sets.push(`${key} = ?`); vals.push(body[key]); }
    }
    if (!sets.length) return c.json({ error: "nothing to update" }, 400);
    sets.push("updated_at = ?");
    vals.push(Date.now(), c.req.param("id"));
    db.prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    return c.json(db.prepare("SELECT * FROM sessions WHERE id = ?").get(c.req.param("id")));
  });

  app.delete("/api/sessions/:id", (c) => {
    getDb(DATA_DIR).prepare("DELETE FROM sessions WHERE id = ?").run(c.req.param("id"));
    return c.body(null, 204);
  });

  app.delete("/api/sessions/:sessionId/messages/:msgId", (c) => {
    const { sessionId, msgId } = c.req.param();
    getDb(DATA_DIR).prepare("DELETE FROM messages WHERE id = ? AND session_id = ?").run(msgId, sessionId);
    return c.body(null, 204);
  });

  app.patch("/api/sessions/:sessionId/messages/:msgId", async (c) => {
    const { sessionId, msgId } = c.req.param();
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const db = getDb(DATA_DIR);
    if ("bookmarked" in body) {
      db.prepare("UPDATE messages SET bookmarked = ? WHERE id = ? AND session_id = ?").run(body.bookmarked ? 1 : 0, msgId, sessionId);
    }
    return c.json(db.prepare("SELECT * FROM messages WHERE id = ?").get(msgId));
  });

  app.delete("/api/sessions/:id/messages", (c) => {
    getDb(DATA_DIR).prepare("DELETE FROM messages WHERE session_id = ?").run(c.req.param("id"));
    return c.body(null, 204);
  });
}
