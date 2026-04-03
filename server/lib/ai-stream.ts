import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

export interface ContentBlock {
  type: "text" | "thinking" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
  isError?: boolean;
}

export interface StreamUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface AIStreamOptions {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string | ContentBlock[] }>;
  systemPrompt?: string;
  tools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
  thinking?: boolean;
  onChunk: (text: string) => void;
  onBlock?: (block: ContentBlock) => void;
  onUsage?: (usage: StreamUsage) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

/** Extract string content from messages (for non-Claude providers that don't support blocks) */
function toStringMessages(messages: AIStreamOptions["messages"]): Array<{ role: string; content: string }> {
  return messages.map(m => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : m.content.filter(b => b.type === "text").map(b => b.text ?? "").join(""),
  }));
}

export async function streamAIResponse(opts: AIStreamOptions): Promise<void> {
  try {
    switch (opts.provider) {
      case "claude":   return await streamClaude(opts);
      case "openai":   return await streamOpenAI(opts);
      case "gemini":   return await streamGemini(opts);
      case "mistral":  return await streamOpenAICompat(opts, "https://api.mistral.ai/v1/chat/completions");
      case "grok":     return await streamOpenAICompat(opts, "https://api.x.ai/v1/chat/completions");
      case "ollama":   return await streamOllama(opts);
      case "codex":    return await streamCodex(opts);
      default:
        throw new Error(`Unknown provider: ${opts.provider}`);
    }
  } catch (err) {
    opts.onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// ── SSE line parser ────────────────────────────────────────────────────────────

async function* readSSELines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) yield line;
    }
    if (buf) yield buf;
  } finally {
    reader.releaseLock();
  }
}

async function* readJSONLines(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try { yield JSON.parse(trimmed); } catch {}
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Claude ─────────────────────────────────────────────────────────────────────

async function streamClaude(opts: AIStreamOptions): Promise<void> {
  if (!opts.apiKey) throw new Error("Claude provider requires an API key");

  const userMessages = opts.messages.filter(m => m.role !== "system");
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: 16384,
    stream: true,
    messages: userMessages,
  };
  if (opts.systemPrompt) body.system = opts.systemPrompt;
  if (opts.tools?.length) body.tools = opts.tools;
  if (opts.thinking) {
    body.thinking = { type: "enabled", budget_tokens: 10000 };
    body.max_tokens = 32768;
  }

  const baseUrl = opts.baseUrl || "https://api.anthropic.com";
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }

  // Track blocks as they stream
  let currentBlockType: string | null = null;
  let currentBlockId: string | null = null;
  let currentToolName: string | null = null;
  let currentToolInput = "";

  for await (const line of readSSELines(res.body)) {
    if (!line.startsWith("data: ")) continue;
    const raw = line.slice(6).trim();
    if (raw === "[DONE]" || !raw) continue;
    try {
      const evt = JSON.parse(raw) as Record<string, unknown>;
      const type = evt.type as string;

      if (type === "content_block_start") {
        const block = evt.content_block as Record<string, unknown>;
        currentBlockType = block.type as string;
        if (currentBlockType === "tool_use") {
          currentBlockId = block.id as string;
          currentToolName = block.name as string;
          currentToolInput = "";
          opts.onBlock?.({ type: "tool_use", id: currentBlockId, name: currentToolName, input: {} });
        } else if (currentBlockType === "thinking") {
          opts.onBlock?.({ type: "thinking", text: "" });
        }
      }

      if (type === "content_block_delta") {
        const delta = evt.delta as Record<string, unknown>;
        const deltaType = delta.type as string;

        if (deltaType === "text_delta" && delta.text) {
          opts.onChunk(delta.text as string);
        }
        if (deltaType === "thinking_delta" && delta.thinking) {
          opts.onBlock?.({ type: "thinking", text: delta.thinking as string });
        }
        if (deltaType === "input_json_delta" && delta.partial_json) {
          currentToolInput += delta.partial_json as string;
        }
      }

      if (type === "content_block_stop") {
        if (currentBlockType === "tool_use" && currentToolName) {
          let parsedInput: Record<string, unknown> = {};
          try { parsedInput = JSON.parse(currentToolInput); } catch {}
          opts.onBlock?.({ type: "tool_use", id: currentBlockId ?? undefined, name: currentToolName, input: parsedInput });
        }
        currentBlockType = null;
        currentBlockId = null;
        currentToolName = null;
        currentToolInput = "";
      }

      if (type === "message_delta") {
        const usage = (evt as Record<string, unknown>).usage as StreamUsage | undefined;
        if (usage) opts.onUsage?.(usage);
      }

      if (type === "message_start") {
        const msg = evt.message as Record<string, unknown>;
        const usage = msg?.usage as StreamUsage | undefined;
        if (usage) opts.onUsage?.(usage);
      }
    } catch {}
  }

  opts.onDone();
}

// ── OpenAI (and OpenAI-compatible) ────────────────────────────────────────────

async function streamOpenAICompat(opts: AIStreamOptions, url: string): Promise<void> {
  if (!opts.apiKey) throw new Error(`${opts.provider} provider requires an API key`);

  const messages = opts.systemPrompt
    ? [{ role: "system" as const, content: opts.systemPrompt }, ...opts.messages]
    : opts.messages;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({ model: opts.model, stream: true, messages }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${opts.provider} API error ${res.status}: ${text}`);
  }

  for await (const line of readSSELines(res.body)) {
    if (!line.startsWith("data: ")) continue;
    const raw = line.slice(6).trim();
    if (raw === "[DONE]" || !raw) continue;
    try {
      const evt = JSON.parse(raw) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const text = evt.choices?.[0]?.delta?.content;
      if (text) opts.onChunk(text);
    } catch {}
  }

  opts.onDone();
}

async function streamOpenAI(opts: AIStreamOptions): Promise<void> {
  return streamOpenAICompat(opts, "https://api.openai.com/v1/chat/completions");
}

// ── Gemini ─────────────────────────────────────────────────────────────────────

async function streamGemini(opts: AIStreamOptions): Promise<void> {
  if (!opts.apiKey) throw new Error("Gemini provider requires an API key");

  const contents = opts.messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = { contents };
  if (opts.systemPrompt) {
    body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:streamGenerateContent?key=${opts.apiKey}&alt=sse`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  for await (const line of readSSELines(res.body)) {
    if (!line.startsWith("data: ")) continue;
    const raw = line.slice(6).trim();
    if (!raw) continue;
    try {
      const evt = JSON.parse(raw) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const text = evt.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) opts.onChunk(text);
    } catch {}
  }

  opts.onDone();
}

// ── Codex CLI ──────────────────────────────────────────────────────────────────

async function streamCodex(opts: AIStreamOptions): Promise<void> {
  const candidates = [
    join(process.cwd(), "node_modules", ".bin", "codex"),
    "/usr/local/bin/codex",
    "codex",
  ];
  const codexBin = candidates.find(p => { try { return existsSync(p); } catch { return false; } }) ?? "codex";

  const lastUser = [...opts.messages].reverse().find(m => m.role === "user");
  const prompt = typeof lastUser?.content === "string" ? lastUser.content : "";

  return new Promise((resolve, reject) => {
    const args = ["--approval-mode", "full-auto", "-q", prompt];
    if (opts.model) args.unshift("--model", opts.model);

    const proc = spawn(codexBin, args, {
      env: { ...process.env, OPENAI_API_KEY: opts.apiKey ?? process.env.OPENAI_API_KEY ?? "" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout.on("data", (chunk: Buffer) => opts.onChunk(chunk.toString()));
    proc.stderr.on("data", () => {});
    proc.on("close", (code) => {
      if (code === 0 || code === null) { opts.onDone(); resolve(); }
      else { const e = new Error(`codex exited with code ${code}`); opts.onError(e); reject(e); }
    });
    proc.on("error", (err) => { opts.onError(err); reject(err); });
  });
}

// ── Ollama ─────────────────────────────────────────────────────────────────────

async function streamOllama(opts: AIStreamOptions): Promise<void> {
  const base = opts.baseUrl ?? "http://localhost:11434";

  const messages = opts.systemPrompt
    ? [{ role: "system" as const, content: opts.systemPrompt }, ...opts.messages]
    : opts.messages;

  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: opts.model, stream: true, messages }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  for await (const line of readJSONLines(res.body)) {
    const evt = line as { message?: { content?: string }; done?: boolean };
    if (evt.message?.content) opts.onChunk(evt.message.content);
    if (evt.done) break;
  }

  opts.onDone();
}
