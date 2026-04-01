/**
 * POST /api/sessions/:id/chat — send message, stream response via Claude CLI
 * Extracted from sessions.ts to keep route files under 400 lines.
 */

import { Hono } from "hono";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, extname } from "path";
import { getDb, getStudioSetting } from "../db.js";
import { checkUsage, recordInvocation } from "../lib/claude-usage.js";
import { loadScanContext } from "../context.js";
import { loadProviders } from "../lib/providers.js";
import { streamAIResponse } from "../lib/ai-stream.js";
import {
  parseClaudeMdSections,
  updateAnalytics,
  flushAnalytics,
} from "../lib/context-analytics.js";
import { createStreamParser } from "../lib/claude-stream.js";
import { createCheckpoint } from "../lib/checkpoint.js";
import { microcompact, checkContextUsage, shouldAutoCompact } from "../lib/compaction.js";
import { loadProjectEnvVars } from "../lib/env.js";
import { createStudioMcpConfig } from "../lib/mcp-studio.js";
import { findBin } from "../lib/bin-resolver.js";
import type { WorkspaceCtx } from "./workspaces.js";
import type { SessionSharedState } from "./sessions-shared.js";

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

export function chatRoutes(ctx: WorkspaceCtx, shared: SessionSharedState) {
  const app = new Hono();

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

    // Snapshot ctx at request time -- prevents workspace switches from corrupting in-flight chat
    const projectDir = ctx.projectDir;
    const dataDir = ctx.dataDir;

    const db = getDb(dataDir);
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as {
      id: string; title: string; agent_name: string | null; claude_session_id: string | null;
    } | undefined;

    if (!session) return c.json({ error: "Not found" }, 404);

    // Track activity for idle eviction
    shared.sessionLastActivity.set(sessionId, Date.now());

    // Pre-turn checkpoint -- snapshot working tree before Claude touches anything
    await createCheckpoint(projectDir, `pre-turn-${sessionId.slice(0, 8)}`).catch(() => null);

    // Load conversation history (only sent messages)
    const rawHistory = db.prepare(
      "SELECT role, content FROM session_messages WHERE session_id = ? AND (role = 'assistant' OR sent_at IS NOT NULL) ORDER BY created_at ASC"
    ).all(sessionId) as Array<{ role: string; content: string }>;

    // Microcompact: truncate large assistant messages (tool output) before resending.
    // Skip for resumed Claude sessions -- they manage their own context window.
    const history = session.claude_session_id ? rawHistory : microcompact(rawHistory);

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
    const claudeMdPath = join(projectDir, "CLAUDE.md");
    let claudeSections: string[] = [];
    try {
      if (existsSync(claudeMdPath)) {
        const raw = readFileSync(claudeMdPath, "utf-8");
        claudeSections = parseClaudeMdSections(raw);
      }
    } catch { /* no CLAUDE.md -- analytics just won't fire */ }

    // Build system prompt -- scan context + agent identity + user's custom prompt
    const scanContext = body.skipContext ? null : loadScanContext(projectDir);
    const agentIdentity = session.agent_name ? `You are ${session.agent_name}, an AI assistant.` : null;
    const userSystemPrompt = body.systemPrompt ?? null;

    const effectiveSystemPrompt = [scanContext, agentIdentity, userSystemPrompt]
      .filter(Boolean)
      .join("\n\n---\n\n") || undefined;

    // Expand @file mentions -- inlines file content as fenced code blocks
    const expandedMessage = expandMentions(effectiveMessage, projectDir);

    // Build the full prompt with conversation history
    const fullPrompt = buildConversationPrompt(history, expandedMessage, effectiveSystemPrompt);

    const providersStore = loadProviders(dataDir);
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
          db.prepare("UPDATE session_messages SET sent_at = ? WHERE id = ?").run(now, userMsgId);
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

          shared.activeProcesses.set(sessionId, {
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
                updateAnalytics(dataDir, sessionId, text, claudeSections);
              }
            },
            onDone: () => {
              shared.activeProcesses.delete(sessionId);
              shared.sessionLastActivity.delete(sessionId);
              markMessagesSent();
              const savedText = fullText.trim() || "[no response]";
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

              flushAnalytics(dataDir, sessionId).catch(() => {});

              const updated = db.prepare(
                "SELECT total_input_tokens, total_output_tokens FROM sessions WHERE id = ?"
              ).get(sessionId) as { total_input_tokens: number; total_output_tokens: number } | undefined;
              if (updated) {
                const warning = checkContextUsage(updated.total_input_tokens, updated.total_output_tokens, actualModel);
                if (warning) send({ type: "warning", message: warning });
                const totalTokens = updated.total_input_tokens + updated.total_output_tokens;
                if (shouldAutoCompact(totalTokens, actualModel)) {
                  send({ type: "context_limit", needsCompaction: true });
                }
              }

              send({ type: "done", success: true });
              controller.close();
            },
            onError: (err) => {
              shared.activeProcesses.delete(sessionId);
              shared.sessionLastActivity.delete(sessionId);
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
          const cliBin = findBin(provider === "codex" ? "codex" : provider === "gemini" ? "gemini" : "claude", projectDir);

          let mcpConfigPath: string | null = null;
          try {
            mcpConfigPath = createStudioMcpConfig(projectDir, shared.studioPort);
          } catch {
            // MCP config generation failed -- continue without it
          }

          let cliArgs: string[];
          const projectEnv = loadProjectEnvVars(projectDir);
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
            if (session.claude_session_id) {
              cliArgs.push("--resume", session.claude_session_id);
            }
            if (body.thinking) cliArgs.push("--thinking");
            if (body.planMode) cliArgs.push("--permission-mode", "plan");
            if (mcpConfigPath) {
              cliArgs.unshift("--mcp-config", mcpConfigPath);
            }
            if (getStudioSetting(getDb(dataDir), "dangerousSkipPermissions", "false") === "true") {
              cliEnv.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = "1";
            }
          }

          const usage = checkUsage();
          if (!usage.allowed) {
            send({ type: "error", error: usage.reason ?? "Rate limited" });
            controller.close();
            return;
          }
          recordInvocation();

          const proc = spawn(cliBin, cliArgs, {
            cwd: projectDir,
            stdio: ["pipe", "pipe", "pipe"],
            env: cliEnv,
          });

          shared.activeProcesses.set(sessionId, { kill: () => proc.kill("SIGTERM") });

          proc.stdin.write(fullPrompt + "\n");
          proc.stdin.end();

          let fullText = "";
          const parser = createStreamParser();

          proc.stdout.on("data", (chunk: Buffer) => {
            const events = parser.push(chunk);
            for (const ev of events) {
              switch (ev.type) {
                case "text":
                  markMessagesSent();
                  fullText += ev.text;
                  send({ type: "text", text: ev.text });
                  if (claudeSections.length > 0) {
                    updateAnalytics(dataDir, sessionId, ev.text, claudeSections);
                  }
                  break;
                case "thinking":
                  markMessagesSent();
                  send({ type: "thinking", content: ev.content, id: ev.id });
                  break;
                case "tool_use":
                  markMessagesSent();
                  send({ type: "tool_use", tool: ev.tool, input: ev.input });
                  break;
                case "tool_result":
                  markMessagesSent();
                  send({ type: "tool_result", content: ev.content });
                  break;
                case "tool_progress":
                  send({ type: "tool_progress", tool: ev.tool, elapsed: ev.elapsed });
                  break;
                case "cost": {
                  markMessagesSent();
                  send({ type: "done", cost: ev.totalUsd, usage: ev.usage });
                  break;
                }
                case "session_id":
                  markMessagesSent();
                  db.prepare("UPDATE sessions SET claude_session_id = ? WHERE id = ?")
                    .run(ev.sessionId, sessionId);
                  break;
                case "rate_limit":
                  send({ type: "rate_limit", retryAfter: ev.retryAfter });
                  break;
                case "error":
                  send({ type: "error", error: ev.message });
                  break;
                case "progress":
                  send({ type: "progress", message: ev.message });
                  break;
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
            shared.activeProcesses.delete(sessionId);
            shared.sessionLastActivity.delete(sessionId);

            // Flush any remaining buffered data from the parser
            for (const ev of parser.flush()) {
              switch (ev.type) {
                case "text":
                  fullText += ev.text;
                  send({ type: "text", text: ev.text });
                  if (claudeSections.length > 0) {
                    updateAnalytics(dataDir, sessionId, ev.text, claudeSections);
                  }
                  break;
                case "session_id":
                  db.prepare("UPDATE sessions SET claude_session_id = ? WHERE id = ?")
                    .run(ev.sessionId, sessionId);
                  break;
                case "cost":
                  send({ type: "done", cost: ev.totalUsd, usage: ev.usage });
                  break;
                case "error":
                  send({ type: "error", error: ev.message });
                  break;
              }
            }

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

            flushAnalytics(dataDir, sessionId).catch(() => {});

            const cliModel = body.model || "claude-sonnet-4-6";
            const updated = db.prepare(
              "SELECT total_input_tokens, total_output_tokens FROM sessions WHERE id = ?"
            ).get(sessionId) as { total_input_tokens: number; total_output_tokens: number } | undefined;
            if (updated) {
              const warning = checkContextUsage(updated.total_input_tokens, updated.total_output_tokens, cliModel);
              if (warning) send({ type: "warning", message: warning });
              const totalTokens = updated.total_input_tokens + updated.total_output_tokens;
              if (shouldAutoCompact(totalTokens, cliModel)) {
                send({ type: "context_limit", needsCompaction: true });
              }
            }

            if (code !== 0 && !killed) {
              send({ type: "done", success: false });
            } else if (killed) {
              send({ type: "done", success: false, interrupted: true });
            }
            controller.close();
          });

          proc.on("error", (err: Error) => {
            shared.activeProcesses.delete(sessionId);
            shared.sessionLastActivity.delete(sessionId);
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

  return app;
}
