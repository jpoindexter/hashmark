/**
 * /api/sessions — multi-turn Claude chat sessions
 * Uses local claude CLI (no API key needed — reuses Claude Code auth)
 */

import { Hono } from "hono";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, extname } from "path";
import { getDb } from "../db.js";
import { loadScanContext } from "../context.js";
import { analyzeSessionLoop } from "../lib/loop-detector.js";
import { loadProviders } from "../lib/providers.js";
import { streamAIResponse } from "../lib/ai-stream.js";
import {
  parseClaudeMdSections,
  updateAnalytics,
  flushAnalytics,
  loadSessionAnalytics,
} from "../lib/context-analytics.js";
import { createCheckpoint } from "../lib/checkpoint.js";
import { loadProjectEnvVars } from "../lib/env.js";
import { createStudioMcpConfig } from "../lib/mcp-studio.js";
import { findBin, findClaudeBin } from "../lib/bin-resolver.js";
import type { WorkspaceCtx } from "./workspaces.js";

/**
 * Expand @file mentions in a message.
 * Each "@path/to/file" found in the message gets its file content appended as a
 * fenced code block so Claude has full context.
 */
function expandMentions(message: string, projectDir: string): string {
  const MAX_FILE_BYTES = 100_000;
  const mentionRe = /@([\w./\-]+)/g;
  const seen = new Set<string>();
  const blocks: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = mentionRe.exec(message)) !== null) {
    const relPath = match[1];
    if (seen.has(relPath)) continue;
    seen.add(relPath);

    // Prevent path traversal
    const fullPath = join(projectDir, relPath);
    if (!fullPath.startsWith(projectDir + "/") && fullPath !== projectDir) continue;
    if (!existsSync(fullPath)) continue;

    try {
      const raw = readFileSync(fullPath);
      if (raw.length > MAX_FILE_BYTES) {
        blocks.push(`\n\n**@${relPath}** (file too large to inline, ${raw.length} bytes)`);
        continue;
      }
      const content = raw.toString("utf-8");
      const ext = extname(relPath).slice(1) || "text";
      blocks.push(`\n\n**@${relPath}**\n\`\`\`${ext}\n${content}\n\`\`\``);
    } catch {
      // skip unreadable files
    }
  }

  return blocks.length > 0 ? message + blocks.join("") : message;
}

// Port extracted from the server startup -- set by sessionsRoutes caller
let studioPort = 3200;

/** Called by the server entrypoint to set the port for MCP bridge config */
export function setStudioPort(port: number) {
  studioPort = port;
}


/** Determine which CLI to use based on the model ID */
function resolveProvider(model: string): "claude" | "codex" | "gemini" {
  if (model.startsWith("o3") || model.startsWith("gpt-") || model === "codex") return "codex";
  if (model.startsWith("gemini")) return "gemini";
  return "claude";
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

/** Kill all running claude/agent processes — call before app exit */
export function killAllActiveSessions() {
  for (const proc of activeProcesses.values()) {
    try { proc.kill(); } catch {}
  }
  activeProcesses.clear();
  sessionLastActivity.clear();
}

export function sessionsRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  // GET /api/sessions/config — status check
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
        (SELECT COUNT(*) FROM session_messages WHERE session_id = s.id) as message_count
      FROM sessions s
      WHERE s.archived = ?
      ORDER BY s.updated_at DESC
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

  // POST /api/sessions/:id/chat — send message, stream response via claude CLI
  app.post("/:id/chat", async (c) => {
    const sessionId = c.req.param("id");
    const body = await c.req.json<{
      message: string;
      systemPrompt?: string;
      thinking?: boolean;
      planMode?: boolean;
      model?: string;
      skipContext?: boolean;
    }>();

    const db = getDb(ctx.dataDir);
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as {
      id: string; title: string; agent_name: string | null; claude_session_id: string | null;
    } | undefined;

    if (!session) return c.json({ error: "Not found" }, 404);

    // Track activity for idle eviction
    sessionLastActivity.set(sessionId, Date.now());

    // Pre-turn checkpoint -- snapshot working tree before Claude touches anything
    await createCheckpoint(ctx.projectDir, `pre-turn-${sessionId.slice(0, 8)}`).catch(() => null);

    // Load conversation history (only sent messages)
    const history = db.prepare(
      "SELECT role, content FROM session_messages WHERE session_id = ? AND (role = 'assistant' OR sent_at IS NOT NULL) ORDER BY created_at ASC"
    ).all(sessionId) as Array<{ role: string; content: string }>;

    // Check for pending (unsent) messages from previous failed attempts
    const pendingMessages = db.prepare(
      "SELECT id, content FROM session_messages WHERE session_id = ? AND role = 'user' AND sent_at IS NULL ORDER BY created_at ASC"
    ).all(sessionId) as Array<{ id: string; content: string }>;

    // Build the effective message: prepend any previously-unsent messages
    let effectiveMessage = body.message;
    if (pendingMessages.length > 0) {
      const pendingTexts = pendingMessages.map(m => m.content);
      pendingTexts.push(body.message);
      effectiveMessage = pendingTexts.join("\n\n---\n\n");
    }

    // Save user message in pending state (sent_at = NULL until first response)
    const userMsgId = randomUUID();
    const inputEstimate = Math.ceil(body.message.length / 4);
    db.prepare(`
      INSERT INTO session_messages (id, session_id, role, content, input_tokens, created_at, sent_at)
      VALUES (?, ?, 'user', ?, ?, ?, NULL)
    `).run(userMsgId, sessionId, body.message, inputEstimate, Date.now());

    // Auto-title from first message
    if (history.length === 0 && (session.title === "New Session" || session.title === "")) {
      const title = body.message.slice(0, 60).replace(/\n/g, " ");
      db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title, sessionId);
    }

    // Load CLAUDE.md sections for analytics heatmap
    const claudeMdPath = join(ctx.projectDir, "CLAUDE.md");
    let claudeSections: string[] = [];
    try {
      if (existsSync(claudeMdPath)) {
        const raw = readFileSync(claudeMdPath, "utf-8");
        claudeSections = parseClaudeMdSections(raw);
      }
    } catch { /* no CLAUDE.md — analytics just won't fire */ }

    // Build system prompt — scan context + agent identity + user's custom prompt
    const scanContext = body.skipContext ? null : loadScanContext(ctx.projectDir);
    const agentIdentity = session.agent_name ? `You are ${session.agent_name}, an AI assistant.` : null;
    const userSystemPrompt = body.systemPrompt ?? null;

    const effectiveSystemPrompt = [scanContext, agentIdentity, userSystemPrompt]
      .filter(Boolean)
      .join("\n\n---\n\n") || undefined;

    // Expand @file mentions -- inlines file content as fenced code blocks
    const expandedMessage = expandMentions(effectiveMessage, ctx.projectDir);

    // Build the full prompt with conversation history
    const fullPrompt = buildConversationPrompt(history, expandedMessage, effectiveSystemPrompt);

    const providersStore = loadProviders(ctx.dataDir);
    const activeProvider = providersStore.providers.find(p => p.id === providersStore.active);
    const useApiStream = providersStore.active !== "claude" || (activeProvider?.apiKey && activeProvider.apiKey.length > 0);

    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const send = (data: object) => {
          try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
        };

        // Mark the current + any previously-pending messages as sent.
        // Called once on first response chunk to confirm delivery.
        let messageMarkedSent = false;
        const markMessagesSent = () => {
          if (messageMarkedSent) return;
          messageMarkedSent = true;
          const now = Date.now();
          // Mark the message we just inserted
          db.prepare("UPDATE session_messages SET sent_at = ? WHERE id = ?").run(now, userMsgId);
          // Mark any previously-pending messages that were prepended
          for (const pm of pendingMessages) {
            db.prepare("UPDATE session_messages SET sent_at = ? WHERE id = ?").run(now, pm.id);
          }
        };

        const streamStart = Date.now();
        db.prepare("UPDATE sessions SET status = 'streaming', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?")
          .run(streamStart, streamStart, sessionId);

        if (useApiStream && activeProvider) {
          // -- Direct API stream path --
          const apiMessages = history.map(m => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));
          apiMessages.push({ role: "user", content: expandedMessage });

          let fullText = "";
          let aborted = false;

          activeProcesses.set(sessionId, {
            kill: () => { aborted = true; },
          });

          streamAIResponse({
            provider: providersStore.active,
            model: providersStore.model,
            apiKey: activeProvider.apiKey,
            baseUrl: activeProvider.baseUrl,
            messages: apiMessages,
            systemPrompt: effectiveSystemPrompt,
            onChunk: (text) => {
              if (aborted) return;
              markMessagesSent();
              fullText += text;
              send({ type: "text", text });
              if (claudeSections.length > 0) {
                updateAnalytics(ctx.dataDir, sessionId, text, claudeSections);
              }
            },
            onDone: () => {
              activeProcesses.delete(sessionId);
              sessionLastActivity.delete(sessionId);
              markMessagesSent();
              const savedText = fullText.trim() || "[no response]";
              // ~3.5 chars/token is more accurate than /4, especially for code
              const msgInputEstimate = Math.ceil(body.message.length / 3.5);
              const msgOutputEstimate = Math.ceil(savedText.length / 3.5);
              const actualModel = body.model || providersStore.model || "claude";

              db.prepare(`
                INSERT INTO session_messages (id, session_id, role, content, input_tokens, output_tokens, created_at, sent_at)
                VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)
              `).run(randomUUID(), sessionId, savedText, msgInputEstimate, msgOutputEstimate, Date.now(), Date.now());

              db.prepare(`
                UPDATE sessions
                SET status = 'idle',
                    model = ?,
                    total_input_tokens = total_input_tokens + ?,
                    total_output_tokens = total_output_tokens + ?,
                    ended_at = ?,
                    updated_at = ?
                WHERE id = ?
              `).run(actualModel, msgInputEstimate, msgOutputEstimate, Date.now(), Date.now(), sessionId);

              flushAnalytics(ctx.dataDir, sessionId).catch(() => {});
              send({ type: "done", success: true });
              controller.close();
            },
            onError: (err) => {
              activeProcesses.delete(sessionId);
              sessionLastActivity.delete(sessionId);
              send({ type: "error", message: err.message });

              db.prepare(`
                INSERT INTO session_messages (id, session_id, role, content, created_at, sent_at)
                VALUES (?, ?, 'assistant', ?, ?, ?)
              `).run(randomUUID(), sessionId, `Error: ${err.message}`, Date.now(), Date.now());

              db.prepare("UPDATE sessions SET status = 'idle', ended_at = ?, error_count = error_count + 1, updated_at = ? WHERE id = ?")
                .run(Date.now(), Date.now(), sessionId);

              controller.close();
            },
          }).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            send({ type: "error", message: msg });
            controller.close();
          });

        } else {
          // -- CLI streaming agent path (Claude, Codex, or Gemini) --
          const provider = resolveProvider(body.model || "claude-sonnet-4-6");
          const cliBin = findBin(provider === "codex" ? "codex" : provider === "gemini" ? "gemini" : "claude", ctx.projectDir);

          // Build merged MCP config: user servers + Studio tool bridge
          let mcpConfigPath: string | null = null;
          try {
            mcpConfigPath = createStudioMcpConfig(ctx.projectDir, studioPort);
          } catch {
            // MCP config generation failed -- continue without it
          }

          let cliArgs: string[];
          // Layer env vars: process.env < project .env/.env.local < explicit overrides
          const projectEnv = loadProjectEnvVars(ctx.projectDir);
          const cliEnv: Record<string, string> = {
            ...process.env as Record<string, string>,
            ...projectEnv,
          };

          if (provider === "codex") {
            cliArgs = ["--quiet"];
            if (body.model) cliArgs.push("--model", body.model);
          } else if (provider === "gemini") {
            cliArgs = [];
            if (body.model) cliArgs.push("--model", body.model);
          } else {
            // Claude CLI
            cliArgs = [
              "--output-format", "stream-json",
              "--verbose",
            ];
            // Resume previous Claude session if we captured its ID
            if (session.claude_session_id) {
              cliArgs.push("--resume", session.claude_session_id);
            }
            if (body.thinking) cliArgs.push("--thinking");
            if (body.planMode) cliArgs.push("--permission-mode", "plan");
            if (mcpConfigPath) {
              cliArgs.unshift("--mcp-config", mcpConfigPath);
            }
            cliEnv.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = "1";
          }

          const proc = spawn(cliBin, cliArgs, {
            cwd: ctx.projectDir,
            stdio: ["pipe", "pipe", "pipe"],
            env: cliEnv,
          });

          activeProcesses.set(sessionId, { kill: () => proc.kill("SIGTERM") });

          // Send prompt via stdin
          proc.stdin.write(fullPrompt + "\n");
          proc.stdin.end();

          let fullText = "";
          let jsonBuffer = "";

          proc.stdout.on("data", (chunk: Buffer) => {
            jsonBuffer += chunk.toString();
            const lines = jsonBuffer.split("\n");
            jsonBuffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const event = JSON.parse(line) as {
                  type: string;
                  session_id?: string;
                  message?: {
                    content?: Array<{
                      type: string;
                      id?: string;
                      text?: string;
                      name?: string;
                      input?: unknown;
                      content?: unknown;
                    }>;
                  };
                  total_cost_usd?: number;
                  usage?: unknown;
                };

                if (event.type === "assistant" && event.message?.content) {
                  markMessagesSent();
                  for (const block of event.message.content) {
                    if (block.type === "text" && block.text) {
                      fullText += block.text;
                      send({ type: "text", text: block.text });
                      if (claudeSections.length > 0) {
                        updateAnalytics(ctx.dataDir, sessionId, block.text, claudeSections);
                      }
                    }
                    if (block.type === "thinking") {
                      send({ type: "thinking", content: block.text ?? "", id: block.id ?? randomUUID() });
                    }
                    if (block.type === "tool_use") {
                      send({ type: "tool_use", tool: block.name, input: block.input });
                    }
                    if (block.type === "tool_result") {
                      send({ type: "tool_result", content: block.content });
                    }
                  }
                }

                // Capture Claude's internal session ID for --resume on next turn
                if (event.type === "result") {
                  markMessagesSent();
                  if (event.session_id) {
                    db.prepare("UPDATE sessions SET claude_session_id = ? WHERE id = ?")
                      .run(event.session_id, sessionId);
                  }
                  const cost = event.total_cost_usd ?? 0;
                  const usage = event.usage ?? {};
                  send({ type: "done", cost, usage });
                }
              } catch {
                // Not JSON -- plain-text progress line
                if (line.trim()) {
                  send({ type: "progress", message: line });
                }
              }
            }
          });

          proc.stderr.on("data", (chunk: Buffer) => {
            const line = chunk.toString().trim();
            if (line && !line.startsWith("\u256D") && !line.startsWith("\u2502") && !line.startsWith("\u2570")) {
              send({ type: "progress", message: line });
            }
          });

          proc.on("close", (code: number | null) => {
            activeProcesses.delete(sessionId);
            sessionLastActivity.delete(sessionId);

            const killed = code === null || code === 130 || code === 143;
            const savedText = fullText.trim() || (killed ? "[interrupted]" : "[no response]");
            const msgInputEstimate = Math.ceil(body.message.length / 4);
            const msgOutputEstimate = Math.ceil(savedText.length / 4);

            db.prepare(`
              INSERT INTO session_messages (id, session_id, role, content, input_tokens, output_tokens, created_at, sent_at)
              VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)
            `).run(randomUUID(), sessionId, savedText, msgInputEstimate, msgOutputEstimate, Date.now(), Date.now());

            db.prepare(`
              UPDATE sessions
              SET status = 'idle',
                  total_input_tokens = total_input_tokens + ?,
                  total_output_tokens = total_output_tokens + ?,
                  ended_at = ?,
                  updated_at = ?
              WHERE id = ?
            `).run(msgInputEstimate, msgOutputEstimate, Date.now(), Date.now(), sessionId);

            flushAnalytics(ctx.dataDir, sessionId).catch(() => {});
            if (code !== 0 && !killed) {
              send({ type: "done", success: false });
            } else if (killed) {
              send({ type: "done", success: false, interrupted: true });
            }
            controller.close();
          });

          proc.on("error", (err: Error) => {
            activeProcesses.delete(sessionId);
            sessionLastActivity.delete(sessionId);
            send({ type: "error", message: err.message });

            db.prepare(`
              INSERT INTO session_messages (id, session_id, role, content, created_at, sent_at)
              VALUES (?, ?, 'assistant', ?, ?, ?)
            `).run(randomUUID(), sessionId, `Error: ${err.message}`, Date.now(), Date.now());

            db.prepare("UPDATE sessions SET status = 'idle', ended_at = ?, error_count = error_count + 1, updated_at = ? WHERE id = ?")
              .run(Date.now(), Date.now(), sessionId);

            controller.close();
          });
        }
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

  // GET /api/sessions/:id/tokens
  app.get("/:id/tokens", (c) => {
    const db = getDb(ctx.dataDir);
    const sessionId = c.req.param("id");
    const session = db.prepare(`
      SELECT total_input_tokens, total_output_tokens,
        (SELECT COUNT(*) FROM session_messages WHERE session_id = ?) as message_count,
        (SELECT COUNT(*) FROM session_messages WHERE session_id = ? AND role = 'user') as user_count,
        (SELECT COUNT(*) FROM session_messages WHERE session_id = ? AND role = 'assistant') as assistant_count,
        (SELECT COALESCE(SUM(input_tokens),0) FROM session_messages WHERE session_id = ? AND role = 'user') as user_input_tokens,
        (SELECT COALESCE(SUM(output_tokens),0) FROM session_messages WHERE session_id = ? AND role = 'assistant') as assistant_output_tokens
      FROM sessions WHERE id = ?
    `).get(
      sessionId, sessionId, sessionId,
      sessionId, sessionId, sessionId
    ) as {
      total_input_tokens: number;
      total_output_tokens: number;
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
    // Average measured waste: 21.8%. Scales with message count — more turns = more dead output.
    const wasteEstimatePct = Math.min(35, Math.round(session.message_count * 1.2));

    // Stage breakdown: divide conversation into early/middle/recent thirds by message position
    const messages = db.prepare(
      "SELECT content FROM session_messages WHERE session_id = ? ORDER BY created_at ASC"
    ).all(sessionId) as Array<{ content: string }>;

    const msgCount = messages.length;
    const earlyEnd = Math.floor(msgCount * 0.33);
    const midEnd = Math.floor(msgCount * 0.66);

    const stageBreakdown = { early: 0, middle: 0, recent: 0 };
    for (let i = 0; i < msgCount; i++) {
      const tokens = Math.ceil(messages[i].content.length / 4);
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
