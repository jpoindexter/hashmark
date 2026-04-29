import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { type AIStreamOptions, type StreamUsage } from "./stream.js";
import { readSSELines, readJSONLines } from "./stream-helpers.js";
import { toOpenAITools, toGeminiTools } from "./tools.js";
import { toOpenAIMessages, toGeminiMessages } from "./stream-converters.js";

export async function streamOpenAICompat(opts: AIStreamOptions, url: string): Promise<void> {
  if (!opts.apiKey) throw new Error(`${opts.provider} provider requires an API key`);

  const messages = toOpenAIMessages(opts.messages, opts.systemPrompt);
  const body: Record<string, unknown> = { model: opts.model, stream: true, messages };
  if (opts.tools?.length) body.tools = toOpenAITools(opts.tools as never);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${opts.apiKey}` },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${opts.provider} API error ${res.status}: ${text}`);
  }

  const tcMap = new Map<number, { id: string; name: string; args: string }>();

  for await (const line of readSSELines(res.body)) {
    if (!line.startsWith("data: ")) continue;
    const raw = line.slice(6).trim();
    if (raw === "[DONE]" || !raw) continue;
    try {
      const evt = JSON.parse(raw) as {
        choices?: Array<{
          delta?: {
            content?: string;
            tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
          };
          finish_reason?: string;
        }>;
        usage?: StreamUsage;
      };

      const delta = evt.choices?.[0]?.delta;
      if (delta?.content) opts.onChunk(delta.content);

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!tcMap.has(tc.index)) tcMap.set(tc.index, { id: tc.id ?? "", name: tc.function?.name ?? "", args: "" });
          const entry = tcMap.get(tc.index)!;
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name += tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
        }
      }

      const finish = evt.choices?.[0]?.finish_reason;
      if (finish === "tool_calls" || (finish === "stop" && tcMap.size > 0)) {
        for (const [, tc] of tcMap) {
          let input: Record<string, unknown> = {};
          try { input = JSON.parse(tc.args); } catch {}
          opts.onBlock?.({ type: "tool_use", id: tc.id, name: tc.name, input });
        }
        tcMap.clear();
      }

      if (evt.usage) opts.onUsage?.(evt.usage);
    } catch {}
  }

  for (const [, tc] of tcMap) {
    let input: Record<string, unknown> = {};
    try { input = JSON.parse(tc.args); } catch {}
    opts.onBlock?.({ type: "tool_use", id: tc.id, name: tc.name, input });
  }

  opts.onDone();
}

export async function streamGemini(opts: AIStreamOptions): Promise<void> {
  if (!opts.apiKey) throw new Error("Gemini provider requires an API key");

  const body: Record<string, unknown> = { contents: toGeminiMessages(opts.messages) };
  if (opts.systemPrompt) body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
  if (opts.tools?.length) body.tools = toGeminiTools(opts.tools as never);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:streamGenerateContent?key=${opts.apiKey}&alt=sse`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
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
        candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> } }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };

      for (const part of (evt.candidates?.[0]?.content?.parts ?? [])) {
        if (part.text) opts.onChunk(part.text);
        if (part.functionCall) {
          const fc = part.functionCall;
          opts.onBlock?.({ type: "tool_use", id: `gemini_${fc.name}_${Date.now()}`, name: fc.name, input: fc.args });
        }
      }

      if (evt.usageMetadata) {
        opts.onUsage?.({ input_tokens: evt.usageMetadata.promptTokenCount ?? 0, output_tokens: evt.usageMetadata.candidatesTokenCount ?? 0 });
      }
    } catch {}
  }

  opts.onDone();
}

export async function streamOllama(opts: AIStreamOptions): Promise<void> {
  const base = opts.baseUrl ?? "http://localhost:11434";
  const messages = toOpenAIMessages(opts.messages, opts.systemPrompt);
  const body: Record<string, unknown> = { model: opts.model, stream: true, messages };
  if (opts.tools?.length) body.tools = toOpenAITools(opts.tools as never);

  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  let callIndex = 0;
  for await (const line of readJSONLines(res.body)) {
    const evt = line as {
      message?: { content?: string; tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }> };
      done?: boolean;
    };
    if (evt.message?.content) opts.onChunk(evt.message.content);
    for (const tc of (evt.message?.tool_calls ?? [])) {
      opts.onBlock?.({ type: "tool_use", id: `ollama_${callIndex++}`, name: tc.function.name, input: tc.function.arguments });
    }
    if (evt.done) break;
  }

  opts.onDone();
}

export async function streamCodex(opts: AIStreamOptions): Promise<void> {
  const candidates = [join(process.cwd(), "node_modules", ".bin", "codex"), "/usr/local/bin/codex", "codex"];
  const bin = candidates.find(p => { try { return existsSync(p); } catch { return false; } }) ?? "codex";

  const lastUser = [...opts.messages].reverse().find(m => m.role === "user");
  const prompt = typeof lastUser?.content === "string" ? lastUser.content : "";

  return new Promise((resolve, reject) => {
    const args = ["--approval-mode", "full-auto", "-q", prompt];
    if (opts.model) args.unshift("--model", opts.model);

    const proc = spawn(bin, args, {
      env: { ...process.env, OPENAI_API_KEY: opts.apiKey ?? process.env.OPENAI_API_KEY ?? "" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout.on("data", (chunk: Buffer) => opts.onChunk(chunk.toString()));
    proc.stderr.on("data", () => {});
    proc.on("close", (code) => {
      if (code === 0 || code === null) { opts.onDone(); resolve(); }
      else { const e = new Error(`codex exited ${code}`); opts.onError(e); reject(e); }
    });
    proc.on("error", (err) => { opts.onError(err); reject(err); });
  });
}
