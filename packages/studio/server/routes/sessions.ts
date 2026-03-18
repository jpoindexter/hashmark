/**
 * /api/sessions — multi-turn Claude chat sessions
 * Uses local claude CLI (no API key needed — reuses Claude Code auth)
 */

import { Hono } from "hono";
import { randomUUID, createHash } from "crypto";
import { spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";
import { getDb } from "../db.js";
import { loadScanContext } from "../context.js";

/**
 * Resolve MCP config from project-level or global Claude config.
 * Writes a temp file and returns its path, or null if no MCP servers found.
 */
function resolveMcpConfig(projectDir: string): string | null {
  const candidates = [
    join(projectDir, ".mcp.json"),
    join(homedir(), ".claude", "claude_desktop_config.json"),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
      if (parsed.mcpServers && Object.keys(parsed.mcpServers).length > 0) {
        const hash = createHash("md5").update(raw).digest("hex");
        const tmpPath = join(tmpdir(), `studio-mcp-${hash}.json`);
        if (!existsSync(tmpPath)) {
          writeFileSync(tmpPath, raw, "utf-8");
        }
        return tmpPath;
      }
    } catch {
      // Malformed JSON — skip
    }
  }
  return null;
}

// Candidates for the claude binary — same as runner.ts
function findClaudeBin(projectDir: string): string {
  const candidates = [
    join(projectDir, "node_modules", ".bin", "claude"),
    "/Applications/Conductor.app/Contents/Resources/bin/claude",
    "/usr/local/bin/claude",
    "claude",
  ];
  return candidates.find((p) => {
    try { return existsSync(p); } catch { return false; }
  }) ?? "claude";
}

// Build a text-based conversation prompt for --print mode
function buildConversationPrompt(
  history: Array<{ role: string; content: string }>,
  newMessage: string,
  systemPrompt?: string
): string {
  const parts: string[] = [];

  if (systemPrompt) {
    parts.push(systemPrompt);
    parts.push("");
  }

  if (history.length > 0) {
    parts.push("Prior conversation:");
    for (const msg of history) {
      const role = msg.role === "user" ? "Human" : "Assistant";
      parts.push(`${role}: ${msg.content}`);
    }
    parts.push("");
  }

  parts.push(`Human: ${newMessage}`);

  return parts.join("\n");
}

// Active processes — allows interruption
const activeProcesses = new Map<string, { kill: () => void }>();

export function sessionsRoutes(projectDir: string) {
  const dataDir = `${projectDir}/.hashmark`;
  const app = new Hono();

  // GET /api/sessions/config — status check
  app.get("/config", (c) => {
    const claudeBin = findClaudeBin(projectDir);
    const claudeAvailable = existsSync(claudeBin) || claudeBin === "claude";
    return c.json({ claudeAvailable, claudeBin });
  });

  // GET /api/sessions
  app.get("/", (c) => {
    const db = getDb(dataDir);
    const sessions = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM session_messages WHERE session_id = s.id) as message_count
      FROM sessions s
      ORDER BY s.updated_at DESC
    `).all();
    return c.json({ sessions });
  });

  // POST /api/sessions
  app.post("/", async (c) => {
    const body = await c.req.json<{
      title?: string;
      agentId?: string | null;
      agentName?: string | null;
      systemPrompt?: string | null;
    }>();

    const db = getDb(dataDir);
    const id = randomUUID();
    const now = Date.now();

    db.prepare(`
      INSERT INTO sessions (id, title, agent_id, agent_name, model, status, total_input_tokens, total_output_tokens, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'claude', 'idle', 0, 0, ?, ?)
    `).run(id, body.title ?? "New Session", body.agentId ?? null, body.agentName ?? null, now, now);

    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
    return c.json({ session }, 201);
  });

  // GET /api/sessions/:id
  app.get("/:id", (c) => {
    const db = getDb(dataDir);
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(c.req.param("id"));
    if (!session) return c.json({ error: "Not found" }, 404);
    const messages = db.prepare(
      "SELECT * FROM session_messages WHERE session_id = ? ORDER BY created_at ASC"
    ).all(c.req.param("id"));
    return c.json({ session, messages });
  });

  // DELETE /api/sessions/:id
  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const active = activeProcesses.get(id);
    if (active) active.kill();
    const db = getDb(dataDir);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return c.json({ ok: true });
  });

  // PATCH /api/sessions/:id
  app.patch("/:id", async (c) => {
    const body = await c.req.json<{ title?: string }>();
    const db = getDb(dataDir);
    if (body.title) {
      db.prepare("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?")
        .run(body.title, Date.now(), c.req.param("id"));
    }
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(c.req.param("id"));
    return c.json({ session });
  });

  // POST /api/sessions/:id/interrupt
  app.post("/:id/interrupt", (c) => {
    const active = activeProcesses.get(c.req.param("id"));
    if (active) {
      active.kill();
      return c.json({ ok: true });
    }
    return c.json({ ok: false });
  });

  // POST /api/sessions/:id/chat — send message, stream response via claude CLI
  app.post("/:id/chat", async (c) => {
    const sessionId = c.req.param("id");
    const body = await c.req.json<{
      message: string;
      systemPrompt?: string;
    }>();

    const db = getDb(dataDir);
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as {
      id: string; title: string; agent_name: string | null;
    } | undefined;

    if (!session) return c.json({ error: "Not found" }, 404);

    // Load conversation history
    const history = db.prepare(
      "SELECT role, content FROM session_messages WHERE session_id = ? ORDER BY created_at ASC"
    ).all(sessionId) as Array<{ role: string; content: string }>;

    // Save user message with token estimate
    const inputEstimate = Math.ceil(body.message.length / 4);
    db.prepare(`
      INSERT INTO session_messages (id, session_id, role, content, input_tokens, created_at)
      VALUES (?, ?, 'user', ?, ?, ?)
    `).run(randomUUID(), sessionId, body.message, inputEstimate, Date.now());

    // Auto-title from first message
    if (history.length === 0 && (session.title === "New Session" || session.title === "")) {
      const title = body.message.slice(0, 60).replace(/\n/g, " ");
      db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title, sessionId);
    }

    // Build system prompt — scan context + agent identity + user's custom prompt
    const scanContext = loadScanContext(projectDir);
    const agentIdentity = session.agent_name ? `You are ${session.agent_name}, an AI assistant.` : null;
    const userSystemPrompt = body.systemPrompt ?? null;

    const effectiveSystemPrompt = [scanContext, agentIdentity, userSystemPrompt]
      .filter(Boolean)
      .join("\n\n---\n\n") || undefined;

    // Build the full prompt with conversation history
    const fullPrompt = buildConversationPrompt(history, body.message, effectiveSystemPrompt);

    const claudeBin = findClaudeBin(projectDir);
    const mcpConfigPath = resolveMcpConfig(projectDir);

    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const send = (data: object) => {
          try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
        };

        db.prepare("UPDATE sessions SET status = 'streaming', updated_at = ? WHERE id = ?")
          .run(Date.now(), sessionId);

        const claudeArgs = mcpConfigPath
          ? ["--mcp-config", mcpConfigPath, "--print", fullPrompt]
          : ["--print", fullPrompt];

        const proc = spawn(
          claudeBin,
          claudeArgs,
          {
            cwd: projectDir,
            stdio: ["ignore", "pipe", "pipe"],
            env: {
              ...process.env,
              CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1",
            },
          }
        );

        activeProcesses.set(sessionId, { kill: () => proc.kill("SIGTERM") });

        let fullText = "";
        let buffer = "";

        proc.stdout.on("data", (chunk: Buffer) => {
          const text = chunk.toString();
          buffer += text;
          fullText += text;
          send({ type: "text", text });
        });

        proc.stderr.on("data", (chunk: Buffer) => {
          const line = chunk.toString().trim();
          // Ignore typical claude CLI status lines
          if (line && !line.startsWith("╭") && !line.startsWith("│") && !line.startsWith("╰")) {
            send({ type: "progress", message: line });
          }
        });

        proc.on("close", (code: number | null) => {
          activeProcesses.delete(sessionId);

          const killed = code === null || code === 130 || code === 143;
          const finalText = fullText.trim();

          // Save assistant message with token estimates
          const savedText = finalText || (killed ? "[interrupted]" : "[no response]");
          const msgInputEstimate = Math.ceil(body.message.length / 4);
          const msgOutputEstimate = Math.ceil(savedText.length / 4);

          db.prepare(`
            INSERT INTO session_messages (id, session_id, role, content, input_tokens, output_tokens, created_at)
            VALUES (?, ?, 'assistant', ?, ?, ?, ?)
          `).run(randomUUID(), sessionId, savedText, msgInputEstimate, msgOutputEstimate, Date.now());

          // Update session totals + status
          db.prepare(`
            UPDATE sessions
            SET status = 'idle',
                total_input_tokens = total_input_tokens + ?,
                total_output_tokens = total_output_tokens + ?,
                updated_at = ?
            WHERE id = ?
          `).run(msgInputEstimate, msgOutputEstimate, Date.now(), sessionId);

          send({ type: "done", success: code === 0 || killed });
          controller.close();
        });

        proc.on("error", (err: Error) => {
          activeProcesses.delete(sessionId);
          send({ type: "error", message: err.message });

          db.prepare(`
            INSERT INTO session_messages (id, session_id, role, content, created_at)
            VALUES (?, ?, 'assistant', ?, ?)
          `).run(randomUUID(), sessionId, `Error: ${err.message}`, Date.now());

          db.prepare("UPDATE sessions SET status = 'idle', updated_at = ? WHERE id = ?")
            .run(Date.now(), sessionId);

          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  });

  // GET /api/sessions/:id/tokens
  app.get("/:id/tokens", (c) => {
    const db = getDb(dataDir);
    const session = db.prepare(`
      SELECT total_input_tokens, total_output_tokens,
        (SELECT COUNT(*) FROM session_messages WHERE session_id = ?) as message_count
      FROM sessions WHERE id = ?
    `).get(c.req.param("id"), c.req.param("id")) as {
      total_input_tokens: number;
      total_output_tokens: number;
      message_count: number;
    } | undefined;

    if (!session) return c.json({ error: "Not found" }, 404);

    const total = session.total_input_tokens + session.total_output_tokens;
    const contextWindow = 200000;
    const pct = Math.min(100, Math.round((total / contextWindow) * 100));

    return c.json({
      inputTokens: session.total_input_tokens,
      outputTokens: session.total_output_tokens,
      total,
      contextWindow,
      pct,
      messageCount: session.message_count,
    });
  });

  return app;
}
