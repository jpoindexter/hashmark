import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

export interface AIStreamOptions {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  systemPrompt?: string;
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
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
    max_tokens: 8192,
    stream: true,
    messages: userMessages,
  };
  if (opts.systemPrompt) body.system = opts.systemPrompt;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
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

  for await (const line of readSSELines(res.body)) {
    if (!line.startsWith("data: ")) continue;
    const raw = line.slice(6).trim();
    if (raw === "[DONE]" || !raw) continue;
    try {
      const evt = JSON.parse(raw) as {
        type: string;
        delta?: { type?: string; text?: string };
      };
      if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) {
        opts.onChunk(evt.delta.text);
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
  const prompt = lastUser?.content ?? "";

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
