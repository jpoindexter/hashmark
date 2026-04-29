import { randomUUID } from "crypto";
import { execSync } from "child_process";
import { getDb } from "./db.js";
import { streamAIResponse, type ContentBlock } from "./stream.js";
import { TOOL_SCHEMAS, executeTool, needsApproval } from "./tools.js";
import type { AgentTurnOpts } from "./harness.js";

export async function runDirectApi(opts: AgentTurnOpts): Promise<void> {
  const { sessionId, model, apiKey, systemPrompt, projectDir, dataDir, send, signal } = opts;
  const provider = opts.provider ?? "openai";
  const db = getDb(dataDir);

  const rows = db.prepare(
    "SELECT role, content, blocks FROM messages WHERE session_id = ? ORDER BY rowid ASC LIMIT 100"
  ).all(sessionId) as Array<{ role: string; content: string; blocks: string | null }>;

  const messages: Array<{ role: "user" | "assistant"; content: string | ContentBlock[] }> = rows.map(r => ({
    role: r.role as "user" | "assistant",
    content: r.blocks ? JSON.parse(r.blocks) as ContentBlock[] : r.content,
  }));

  messages.push({ role: "user", content: opts.message });
  db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)")
    .run(randomUUID(), sessionId, opts.message, Date.now());

  let directGitCheckpoint: string | null = null;
  try {
    directGitCheckpoint = execSync("git rev-parse HEAD", { cwd: projectDir, timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch { /* not a git repo */ }

  const directTurnStart = Date.now();
  let continueLoop = true;
  let totalInput = 0;
  let totalOutput = 0;
  let iteration = 0;
  const MAX_ITERATIONS = 50;

  while (continueLoop && iteration < MAX_ITERATIONS) {
    if (signal?.aborted) throw new Error("cancelled");
    if (opts.tokenBudget && (totalInput + totalOutput) >= opts.tokenBudget) {
      send({ type: "budget_exceeded", tokensUsed: totalInput + totalOutput, budget: opts.tokenBudget });
      break;
    }
    continueLoop = false;
    iteration++;

    const blocks: ContentBlock[] = [];
    let textAccum = "";

    await streamAIResponse({
      provider,
      model,
      apiKey,
      baseUrl: opts.baseUrl,
      messages,
      systemPrompt,
      tools: TOOL_SCHEMAS as unknown as Array<{ name: string; description: string; input_schema: Record<string, unknown> }>,
      thinkingBudget: opts.thinkingBudget,
      signal,
      onChunk: (text) => {
        textAccum += text;
        send({ type: "text", text });
        if (textAccum.includes("<factory-complete>")) {
          textAccum = textAccum.replace(/<factory-complete>/g, "").trim();
          continueLoop = false;
        }
      },
      onBlock: (block) => {
        blocks.push(block);
        if (block.type === "thinking") send({ type: "thinking", content: block.text ?? "" });
        if (block.type === "tool_use") send({ type: "tool_use", tool: block.name, input: block.input, toolUseId: block.id });
      },
      onUsage: (usage) => { totalInput += usage.input_tokens ?? 0; totalOutput += usage.output_tokens ?? 0; },
      onDone: () => {},
      onError: (err) => send({ type: "error", error: err.message }),
    });

    const toolUses = blocks.filter(b => b.type === "tool_use" && b.name && b.input);

    if (toolUses.length > 0) {
      const assistantBlocks = [
        ...(textAccum ? [{ type: "text" as const, text: textAccum }] : []),
        ...blocks,
      ];
      db.prepare("INSERT INTO messages (id, session_id, role, content, blocks, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)")
        .run(randomUUID(), sessionId, textAccum, JSON.stringify(assistantBlocks), Date.now());
      messages.push({ role: "assistant", content: assistantBlocks });

      const toolResults: ContentBlock[] = [];
      for (const tool of toolUses) {
        if (signal?.aborted) throw new Error("cancelled");
        if (needsApproval(tool.name!) && opts.onApproval) {
          send({ type: "tool_approval", tool: tool.name, input: tool.input, toolUseId: tool.id });
          const approved = await opts.onApproval(tool.name!, tool.input!);
          if (!approved) {
            const denied: ContentBlock = { type: "tool_result", id: tool.id, name: tool.name, content: "Tool execution denied by user", isError: true };
            toolResults.push(denied);
            send({ type: "tool_result", toolUseId: tool.id, content: denied.content, isError: true });
            continue;
          }
        }
        const result = await executeTool(tool.name!, tool.input!, projectDir);
        const resultBlock: ContentBlock = { type: "tool_result", id: tool.id, name: tool.name, content: result.content, isError: result.isError };
        toolResults.push(resultBlock);
        send({ type: "tool_result", toolUseId: tool.id, content: result.content, isError: result.isError });
        if (tool.name === "update_plan") {
          try {
            const parsed = JSON.parse(result.content) as { tasks: unknown[] };
            send({ type: "plan_update", tasks: parsed.tasks });
          } catch {}
        }
        if (tool.name === "spawn_agent" && !result.isError) {
          try {
            const parsed = JSON.parse(result.content) as { session_id: string };
            if (parsed.session_id) send({ type: "new_session", sessionId: parsed.session_id });
          } catch {}
        }
      }

      messages.push({ role: "user", content: toolResults });
      continueLoop = true;
    } else {
      const nonText = blocks.filter(b => b.type !== "text");
      const finalBlocks = nonText.length > 0
        ? [...(textAccum ? [{ type: "text" as const, text: textAccum }] : []), ...blocks]
        : null;
      db.prepare("INSERT INTO messages (id, session_id, role, content, blocks, created_at, duration_ms, git_checkpoint) VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)")
        .run(randomUUID(), sessionId, textAccum || "[no response]", finalBlocks ? JSON.stringify(finalBlocks) : null, Date.now(), Date.now() - directTurnStart, directGitCheckpoint);
    }
  }

  if (iteration >= MAX_ITERATIONS) send({ type: "error", error: `Agent exceeded ${MAX_ITERATIONS} tool iterations.` });

  db.prepare("UPDATE sessions SET status = 'idle', updated_at = ? WHERE id = ?").run(Date.now(), sessionId);
  send({ type: "done", usage: { input_tokens: totalInput, output_tokens: totalOutput } });
}
