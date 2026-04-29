import { Hono } from "hono";
import { randomUUID } from "crypto";
import { join } from "path";
import { execSync, execFileSync } from "child_process";
import { mkdirSync } from "fs";
import { getDb } from "../db.js";

export function registerSessionManageRoutes(app: Hono, ctx: { dataDir: string; projectDir: string }) {
  const { dataDir: DATA_DIR, projectDir: PROJECT_DIR } = ctx;

  app.post("/api/sessions/:id/fork", async (c) => {
    const db = getDb(DATA_DIR);
    const body = await c.req.json().catch(() => ({})) as { upToMessageId?: string };
    const source = db.prepare("SELECT * FROM sessions WHERE id = ?").get(c.req.param("id")) as Record<string, unknown> | undefined;
    if (!source) return c.json({ error: "not found" }, 404);

    const msgs = db.prepare(
      "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC"
    ).all(c.req.param("id")) as Record<string, unknown>[];

    const cutoffIdx = body.upToMessageId
      ? msgs.findIndex(m => m.id === body.upToMessageId)
      : msgs.length - 1;
    const forkMsgs = msgs.slice(0, cutoffIdx + 1);

    const newId = randomUUID();
    const now = Date.now();
    db.prepare(
      "INSERT INTO sessions (id, title, model, provider, system_prompt, project_dir, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'idle', ?, ?)"
    ).run(newId, `Fork of ${(source.title as string) ?? "session"}`, source.model, source.provider, source.system_prompt, source.project_dir, now, now);

    for (const m of forkMsgs) {
      db.prepare(
        "INSERT INTO messages (id, session_id, role, content, blocks, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(randomUUID(), newId, m.role, m.content, m.blocks, m.created_at);
    }

    return c.json(db.prepare("SELECT * FROM sessions WHERE id = ?").get(newId));
  });

  app.post("/api/sessions/:id/rewind", async (c) => {
    const db = getDb(DATA_DIR);
    const body = await c.req.json().catch(() => ({})) as { messageId?: string };
    if (!body.messageId) return c.json({ error: "messageId required" }, 400);

    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(c.req.param("id")) as Record<string, unknown> | undefined;
    if (!session) return c.json({ error: "session not found" }, 404);

    const msg = db.prepare("SELECT * FROM messages WHERE id = ? AND session_id = ?").get(body.messageId, c.req.param("id")) as Record<string, unknown> | undefined;
    if (!msg) return c.json({ error: "message not found" }, 404);
    if (!msg.git_checkpoint) return c.json({ error: "no checkpoint for this turn" }, 400);

    const projectDir = (session.worktree_dir ?? session.project_dir) as string;
    try {
      execFileSync("git", ["reset", "--hard", String(msg.git_checkpoint)], { cwd: projectDir, timeout: 15000, stdio: "ignore" });
    } catch (e) {
      return c.json({ error: `git reset failed: ${(e as Error).message}` }, 500);
    }

    db.prepare("DELETE FROM messages WHERE session_id = ? AND rowid > (SELECT rowid FROM messages WHERE id = ?)").run(c.req.param("id"), body.messageId);
    db.prepare("UPDATE sessions SET status = 'idle', updated_at = ? WHERE id = ?").run(Date.now(), c.req.param("id"));
    return c.json({ ok: true, checkpoint: msg.git_checkpoint });
  });

  app.get("/api/sessions/:id/export", (c) => {
    const db = getDb(DATA_DIR);
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(c.req.param("id")) as Record<string, unknown> | undefined;
    if (!session) return c.json({ error: "not found" }, 404);
    const messages = db.prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC").all(c.req.param("id"));
    const payload = { version: 1, session, messages, exported_at: Date.now() };
    return new Response(JSON.stringify(payload, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="session-${String(session.title ?? "export").replace(/[^a-z0-9]/gi, "-")}.json"` },
    });
  });

  app.post("/api/sessions/import", async (c) => {
    const db = getDb(DATA_DIR);
    const body = await c.req.json().catch(() => null) as { session?: Record<string, unknown>; messages?: Record<string, unknown>[] } | null;
    if (!body?.session) return c.json({ error: "invalid export file" }, 400);
    const newId = randomUUID();
    const now = Date.now();
    const s = body.session;
    db.prepare(
      "INSERT INTO sessions (id, title, model, provider, system_prompt, project_dir, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'idle', ?, ?)"
    ).run(newId, `${String(s.title ?? "Imported")} (imported)`, s.model ?? "claude-sonnet-4-6", s.provider ?? "claude", s.system_prompt ?? null, s.project_dir ?? null, now, now);
    for (const m of body.messages ?? []) {
      db.prepare("INSERT INTO messages (id, session_id, role, content, blocks, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(randomUUID(), newId, m.role, m.content, m.blocks ?? null, m.created_at ?? now);
    }
    return c.json(db.prepare("SELECT * FROM sessions WHERE id = ?").get(newId));
  });

  app.post("/api/sessions/:id/worktree", async (c) => {
    const db = getDb(DATA_DIR);
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(c.req.param("id")) as Record<string, unknown> | undefined;
    if (!session) return c.json({ error: "session not found" }, 404);
    if (session.worktree_dir) return c.json({ worktreeDir: session.worktree_dir });

    const worktreeBase = join(DATA_DIR, "worktrees");
    mkdirSync(worktreeBase, { recursive: true });
    const worktreeDir = join(worktreeBase, c.req.param("id"));
    const branch = `hashmark/${c.req.param("id").slice(0, 8)}`;

    try {
      execSync(`git worktree add "${worktreeDir}" -b "${branch}"`, { cwd: PROJECT_DIR, stdio: "pipe" });
      db.prepare("UPDATE sessions SET worktree_dir = ?, project_dir = ?, updated_at = ? WHERE id = ?")
        .run(worktreeDir, worktreeDir, Date.now(), c.req.param("id"));
      return c.json({ worktreeDir, branch });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `git worktree add failed: ${msg}` }, 500);
    }
  });

  app.delete("/api/sessions/:id/worktree", (c) => {
    const db = getDb(DATA_DIR);
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(c.req.param("id")) as Record<string, unknown> | undefined;
    if (!session?.worktree_dir) return c.json({ ok: true });
    try {
      execSync(`git worktree remove --force "${session.worktree_dir}"`, { cwd: PROJECT_DIR, stdio: "pipe" });
    } catch {}
    try { execSync(`git branch -D "hashmark/${c.req.param("id").slice(0, 8)}"`, { cwd: PROJECT_DIR, stdio: "pipe" }); } catch {}
    db.prepare("UPDATE sessions SET worktree_dir = null, project_dir = ?, updated_at = ? WHERE id = ?")
      .run(PROJECT_DIR, Date.now(), c.req.param("id"));
    return c.json({ ok: true });
  });
}
