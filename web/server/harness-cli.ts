import { randomUUID } from "crypto";
import { spawn, execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { getDb } from "./db.js";
import type { AgentTurnOpts } from "./harness.js";

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";

export async function runClaudeCli(opts: AgentTurnOpts): Promise<void> {
  const db = getDb(opts.dataDir);

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(opts.sessionId) as Record<string, unknown> | undefined;
  if (!session) throw new Error("session not found");

  let claudeSessionId = session.claude_session_id as string | null | undefined;
  const isNew = !claudeSessionId;
  if (!claudeSessionId) {
    claudeSessionId = randomUUID();
    db.prepare("UPDATE sessions SET claude_session_id = ? WHERE id = ?").run(claudeSessionId, opts.sessionId);
  }

  db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)")
    .run(randomUUID(), opts.sessionId, opts.message, Date.now());

  let gitCheckpoint: string | null = null;
  try {
    gitCheckpoint = execSync("git rev-parse HEAD", { cwd: opts.projectDir, timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch { /* not a git repo or no commits yet */ }

  const turnStart = Date.now();

  const args: string[] = [
    "--print",
    "--output-format", "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
    "--model", String(session.model ?? opts.model),
    "--include-partial-messages",
  ];

  args.push("--thinking", (opts.thinkingBudget ?? 0) > 0 ? "adaptive" : "disabled");

  const fullSystemPrompt = opts.systemPrompt
    ? opts.systemPrompt + "\n\nWhen you have fully completed the task, emit <factory-complete> on its own line to signal clean completion."
    : "When you have fully completed the task, emit <factory-complete> on its own line to signal clean completion.";
  args.push(isNew ? "--system-prompt" : "--append-system-prompt", fullSystemPrompt);

  if (isNew) {
    args.push("--session-id", claudeSessionId);
  } else {
    args.push("--resume", claudeSessionId);
  }

  args.push(opts.message);

  return new Promise<void>((resolve, reject) => {
    const proc = spawn(CLAUDE_BIN, args, {
      cwd: opts.projectDir,
      env: { ...process.env as Record<string, string> },
    });

    if (opts.signal) {
      opts.signal.addEventListener("abort", () => { try { proc.kill(); } catch {} });
    }

    let buf = "";
    let fullText = "";
    let totalInput = 0;
    let totalOutput = 0;
    const pendingTools = new Map<number, { id: string; name: string; jsonBuf: string }>();
    const pendingThinking = new Map<number, { buf: string }>();
    const thinkingBlocks: Array<{ type: "thinking"; text: string }> = [];
    const toolUseBlocks: Array<{ type: "tool_use"; id: string; name: string; input: Record<string, unknown> }> = [];
    const toolResultBlocks: Array<{ type: "tool_result"; id: string; content: string; isError: boolean }> = [];
    const toolNameById = new Map<string, string>();

    proc.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (t) try { handle(JSON.parse(t) as Record<string, unknown>); } catch {}
      }
    });

    proc.stderr.on("data", () => {});

    proc.on("error", (err) => {
      opts.send({ type: "error", error: `Claude CLI: ${err.message}` });
      reject(err);
    });

    proc.on("close", () => {
      if (opts.signal?.aborted) { reject(new Error("cancelled")); return; }

      const blocks = [
        ...thinkingBlocks,
        ...(fullText ? [{ type: "text" as const, text: fullText }] : []),
        ...toolUseBlocks,
        ...toolResultBlocks,
      ];
      const blocksJson = blocks.length > 0 ? JSON.stringify(blocks) : null;

      const asst_msg_id = randomUUID();
      const duration_ms = Date.now() - turnStart;
      db.prepare("INSERT INTO messages (id, session_id, role, content, blocks, created_at, duration_ms, git_checkpoint) VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)")
        .run(asst_msg_id, opts.sessionId, fullText || "[no response]", blocksJson, Date.now(), duration_ms, gitCheckpoint);
      db.prepare("UPDATE sessions SET status = 'idle', updated_at = ? WHERE id = ?").run(Date.now(), opts.sessionId);

      if (fullText) {
        try {
          const artifactDir = join(opts.dataDir, "artifacts", opts.sessionId);
          mkdirSync(artifactDir, { recursive: true });
          writeFileSync(join(artifactDir, "output.md"), fullText, "utf-8");
        } catch {}
      }

      opts.send({ type: "done", usage: { input_tokens: totalInput, output_tokens: totalOutput } });
      resolve();
    });

    function handle(ev: Record<string, unknown>) {
      switch (ev.type) {
        case "stream_event": {
          const e = ev.event as Record<string, unknown>;
          if (!e) break;

          if (e.type === "content_block_start") {
            const block = e.content_block as Record<string, unknown>;
            if (block?.type === "tool_use") {
              pendingTools.set(e.index as number, { id: block.id as string, name: block.name as string, jsonBuf: "" });
            } else if (block?.type === "thinking") {
              pendingThinking.set(e.index as number, { buf: "" });
            }
          } else if (e.type === "content_block_delta") {
            const delta = e.delta as Record<string, unknown>;
            if (delta?.type === "text_delta") {
              const text = delta.text as string;
              fullText += text;
              opts.send({ type: "text", text });
              if (fullText.includes("<factory-complete>")) {
                fullText = fullText.replace(/<factory-complete>/g, "").trim();
                try { proc.kill(); } catch {}
              }
            } else if (delta?.type === "input_json_delta") {
              const tool = pendingTools.get(e.index as number);
              if (tool) tool.jsonBuf += delta.partial_json as string;
            } else if (delta?.type === "thinking_delta") {
              const th = pendingThinking.get(e.index as number);
              const chunk = (delta.thinking as string) ?? "";
              if (th) th.buf += chunk;
              opts.send({ type: "thinking", content: chunk });
            }
          } else if (e.type === "content_block_stop") {
            const th = pendingThinking.get(e.index as number);
            if (th) {
              thinkingBlocks.push({ type: "thinking", text: th.buf });
              pendingThinking.delete(e.index as number);
            }
            const tool = pendingTools.get(e.index as number);
            if (tool) {
              try {
                const input = JSON.parse(tool.jsonBuf || "{}") as Record<string, unknown>;
                toolUseBlocks.push({ type: "tool_use", id: tool.id, name: tool.name, input });
                toolNameById.set(tool.id, tool.name);
                opts.send({ type: "tool_use", tool: tool.name, input, toolUseId: tool.id });
              } catch {}
              pendingTools.delete(e.index as number);
            }
          } else if (e.type === "message_delta") {
            const usage = e.usage as Record<string, unknown> | undefined;
            if (usage) {
              totalInput += (usage.input_tokens as number) ?? 0;
              totalOutput += (usage.output_tokens as number) ?? 0;
            }
            if (opts.tokenBudget && (totalInput + totalOutput) >= opts.tokenBudget) {
              opts.send({ type: "budget_exceeded", tokensUsed: totalInput + totalOutput, budget: opts.tokenBudget });
              try { proc.kill(); } catch {}
            }
          }
          break;
        }

        case "compaction": {
          const summary = (ev.summary ?? ev.content) as string | undefined;
          opts.send({ type: "compaction", summary: summary ?? "Context compacted" });
          db.prepare("UPDATE sessions SET freshly_compacted = 1 WHERE id = ?").run(opts.sessionId);
          break;
        }

        case "user": {
          const msg = ev.message as Record<string, unknown>;
          const content = msg?.content as Array<Record<string, unknown>> | undefined;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "tool_result") {
                const raw = block.content;
                const text = Array.isArray(raw)
                  ? raw.map((b: Record<string, unknown>) => b.text ?? "").join("")
                  : String(raw ?? "");
                const isErr = Boolean(block.is_error);
                toolResultBlocks.push({ type: "tool_result", id: block.tool_use_id as string, content: text, isError: isErr });
                opts.send({ type: "tool_result", toolUseId: block.tool_use_id as string, content: text, isError: isErr });
                const toolName = toolNameById.get(block.tool_use_id as string);
                if (toolName === "update_plan") {
                  try {
                    const result = JSON.parse(text) as { tasks: unknown[] };
                    opts.send({ type: "plan_update", tasks: result.tasks });
                  } catch {}
                }
                if (toolName === "spawn_agent" && !isErr) {
                  try {
                    const result = JSON.parse(text) as { session_id: string };
                    if (result.session_id) opts.send({ type: "new_session", sessionId: result.session_id });
                  } catch {}
                }
              }
            }
          }
          break;
        }
      }
    }
  });
}

export function runClaudeOnce(opts: {
  systemPrompt: string;
  message: string;
  model?: string;
  projectDir: string;
  onChunk: (text: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const args = [
    "--print",
    "--output-format", "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
    "--model", opts.model ?? "claude-sonnet-4-6",
    "--include-partial-messages",
    "--system-prompt", opts.systemPrompt,
    opts.message,
  ];

  return new Promise<string>((resolve, reject) => {
    const proc = spawn(CLAUDE_BIN, args, { cwd: opts.projectDir, env: { ...process.env as Record<string, string> } });
    if (opts.signal) opts.signal.addEventListener("abort", () => { try { proc.kill(); } catch {} });

    let buf = "";
    let fullText = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const ev = JSON.parse(line) as Record<string, unknown>;
          if (ev.type === "stream_event") {
            const e = ev.event as Record<string, unknown>;
            if (e?.type === "content_block_delta") {
              const delta = e.delta as Record<string, unknown>;
              if (delta?.type === "text_delta") {
                const text = delta.text as string;
                fullText += text;
                opts.onChunk(text);
              }
            }
          }
        } catch {}
      }
    });

    proc.stderr.on("data", () => {});
    proc.on("error", reject);
    proc.on("close", () => {
      if (opts.signal?.aborted) { reject(new Error("cancelled")); return; }
      resolve(fullText);
    });
  });
}
