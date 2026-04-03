/**
 * WebSocket endpoint for bidirectional chat sessions.
 * Backend pushes: message, thinking, tool_use, tool_result, tool_approval, done, error
 * Frontend sends: user_message, approve_tool, deny_tool, cancel
 */

import { Hono } from "hono";
import { randomUUID } from "crypto";
import { getDb } from "../db.js";
import { streamAIResponse, type ContentBlock, type StreamUsage } from "../lib/ai-stream.js";
import { TOOL_SCHEMAS } from "../lib/tool-schemas.js";
import { executeTool, needsApproval, type ToolResult } from "../lib/tool-executor.js";
import type { WorkspaceCtx } from "./workspaces.js";

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

export function registerSessionWsRoutes(
  app: Hono,
  ctx: { projectDir: string; dataDir: string },
) {
  // This is a placeholder for the WebSocket upgrade.
  // Hono doesn't natively support WebSocket on Node.js (it does on Bun/Deno).
  // For Node.js, we'll use the existing HTTP upgrade pattern from the terminal WS.
  //
  // The actual WebSocket handler will be registered in server/index.ts
  // alongside the terminal WS, using the same upgrade mechanism.
  //
  // For now, export the message handler logic so it can be wired in.
}

/**
 * Run a full agentic conversation turn:
 * 1. Send user message to Claude with tools
 * 2. If Claude returns tool_use, execute tools and loop
 * 3. Stream all events to the client via send()
 */
export async function runAgentTurn(opts: {
  sessionId: string;
  message: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  projectDir: string;
  dataDir: string;
  thinking?: boolean;
  send: (data: WsMessage) => void;
  onApproval?: (toolName: string, input: Record<string, unknown>) => Promise<boolean>;
}) {
  const { sessionId, model, apiKey, systemPrompt, projectDir, dataDir, send } = opts;
  const db = getDb(dataDir);

  // Load conversation history
  const rows = db.prepare(
    "SELECT role, content, blocks FROM session_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 100"
  ).all(sessionId) as Array<{ role: string; content: string; blocks: string | null }>;

  const messages: Array<{ role: "user" | "assistant"; content: string | ContentBlock[] }> = rows.map(r => ({
    role: r.role as "user" | "assistant",
    content: r.blocks ? JSON.parse(r.blocks) : r.content,
  }));

  // Add the new user message
  messages.push({ role: "user", content: opts.message });

  // Save user message to DB
  const userMsgId = randomUUID();
  db.prepare(
    "INSERT INTO session_messages (id, session_id, role, content, created_at, sent_at) VALUES (?, ?, 'user', ?, ?, ?)"
  ).run(userMsgId, sessionId, opts.message, Date.now(), Date.now());

  // Agentic loop -- keep going until Claude stops requesting tools
  let continueLoop = true;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  while (continueLoop) {
    continueLoop = false;
    const blocks: ContentBlock[] = [];
    let textAccum = "";

    await streamAIResponse({
      provider: "claude",
      model,
      apiKey,
      messages,
      systemPrompt,
      tools: TOOL_SCHEMAS as unknown as Array<{ name: string; description: string; input_schema: Record<string, unknown> }>,
      thinking: opts.thinking,
      onChunk: (text) => {
        textAccum += text;
        send({ type: "text", text });
      },
      onBlock: (block) => {
        blocks.push(block);
        if (block.type === "thinking") {
          send({ type: "thinking", content: block.text ?? "" });
        }
        if (block.type === "tool_use") {
          send({ type: "tool_use", tool: block.name, input: block.input, toolUseId: block.id });
        }
      },
      onUsage: (usage) => {
        totalInputTokens += usage.input_tokens ?? 0;
        totalOutputTokens += usage.output_tokens ?? 0;
      },
      onDone: () => {},
      onError: (err) => {
        send({ type: "error", error: err.message });
      },
    });

    // Check if Claude requested tools
    const toolUseBlocks = blocks.filter(b => b.type === "tool_use" && b.name && b.input);
    if (toolUseBlocks.length > 0) {
      // Save assistant message with blocks
      const assistantMsgId = randomUUID();
      const assistantBlocks = [
        ...(textAccum ? [{ type: "text" as const, text: textAccum }] : []),
        ...blocks,
      ];
      db.prepare(
        "INSERT INTO session_messages (id, session_id, role, content, blocks, created_at, sent_at) VALUES (?, ?, 'assistant', ?, ?, ?, ?)"
      ).run(assistantMsgId, sessionId, textAccum, JSON.stringify(assistantBlocks), Date.now(), Date.now());

      // Add assistant response to conversation
      messages.push({ role: "assistant", content: assistantBlocks });

      // Execute each tool
      const toolResults: ContentBlock[] = [];
      for (const tool of toolUseBlocks) {
        // Check approval
        if (needsApproval(tool.name!) && opts.onApproval) {
          send({ type: "tool_approval", tool: tool.name, input: tool.input, toolUseId: tool.id });
          const approved = await opts.onApproval(tool.name!, tool.input!);
          if (!approved) {
            const denied: ContentBlock = {
              type: "tool_result",
              id: tool.id,
              content: "Tool execution denied by user",
              isError: true,
            };
            toolResults.push(denied);
            send({ type: "tool_result", toolUseId: tool.id, content: denied.content, isError: true });
            continue;
          }
        }

        // Execute
        const result = await executeTool(tool.name!, tool.input!, { projectDir });
        const resultBlock: ContentBlock = {
          type: "tool_result",
          id: tool.id,
          content: result.content,
          isError: result.isError,
        };
        toolResults.push(resultBlock);
        send({ type: "tool_result", toolUseId: tool.id, content: result.content, isError: result.isError });
      }

      // Add tool results to conversation for next API call
      messages.push({ role: "user", content: toolResults });
      continueLoop = true; // Loop back to get Claude's response to the tool results
    } else {
      // No tools -- save final assistant message
      const assistantMsgId = randomUUID();
      const finalBlocks = [
        ...(textAccum ? [{ type: "text" as const, text: textAccum }] : []),
        ...blocks,
      ];
      db.prepare(
        "INSERT INTO session_messages (id, session_id, role, content, blocks, input_tokens, output_tokens, created_at, sent_at) VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?)"
      ).run(assistantMsgId, sessionId, textAccum, JSON.stringify(finalBlocks), totalInputTokens, totalOutputTokens, Date.now(), Date.now());
    }
  }

  // Update session stats
  db.prepare(`
    UPDATE sessions SET
      status = 'idle',
      total_input_tokens = total_input_tokens + ?,
      total_output_tokens = total_output_tokens + ?,
      ended_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(totalInputTokens, totalOutputTokens, Date.now(), Date.now(), sessionId);

  send({ type: "done", usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens } });
}
