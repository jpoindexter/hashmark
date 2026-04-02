/**
 * Unified provider registry for streaming LLM completions.
 *
 * Most providers (OpenAI, Groq, DeepSeek, Together, Fireworks, OpenRouter,
 * Mistral, Grok/xAI) share the OpenAI-compatible chat completions API.
 * Only Anthropic and Google need custom request/response handling.
 *
 * This sits alongside ai-stream.ts -- the old module still works for the
 * CLI path. New code should use createProviderStream() from here.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface StreamChunk {
  text?: string;
  done?: boolean;
}

export interface ProviderDef {
  id: string;
  name: string;
  baseUrl: string;
  /** Well-known models. Empty = user must provide their own (e.g. Ollama). */
  models: string[];
  /** Auth header builder. Null for keyless providers like Ollama. */
  headers: ((apiKey: string) => Record<string, string>) | null;
  /** Build the JSON request body for this provider. */
  transformRequest: (messages: Message[], model: string, systemPrompt?: string) => unknown;
  /** Parse a single SSE `data:` line into a text chunk. Return null to skip. */
  parseStream: (line: string) => StreamChunk | null;
  /** Override the full URL (some providers need model in the path). */
  buildUrl?: (baseUrl: string, model: string) => string;
  /** True if response is newline-delimited JSON instead of SSE (e.g. Ollama). */
  ndjson?: boolean;
  /** Parse a single NDJSON line. Only used when ndjson=true. */
  parseNdjson?: (line: string) => StreamChunk | null;
  /** Env var that typically holds the API key for this provider. */
  envKey?: string;
  /** Whether this provider needs an API key to function. */
  requiresKey: boolean;
}

// ── Shared transforms ──────────────────────────────────────────────────────────

function openaiHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

function openaiTransform(
  messages: Message[],
  model: string,
  systemPrompt?: string,
): unknown {
  const msgs = systemPrompt
    ? [{ role: "system" as const, content: systemPrompt }, ...messages]
    : messages;
  return { model, stream: true, messages: msgs };
}

function openaiParseStream(line: string): StreamChunk | null {
  if (!line.startsWith("data: ")) return null;
  const raw = line.slice(6).trim();
  if (raw === "[DONE]" || !raw) return { done: true };
  try {
    const evt = JSON.parse(raw) as {
      choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
    };
    const text = evt.choices?.[0]?.delta?.content;
    const finished = evt.choices?.[0]?.finish_reason === "stop";
    if (text) return { text };
    if (finished) return { done: true };
    return null;
  } catch {
    return null;
  }
}

// ── Provider definitions ───────────────────────────────────────────────────────

const anthropic: ProviderDef = {
  id: "anthropic",
  name: "Anthropic",
  baseUrl: "https://api.anthropic.com/v1/messages",
  models: [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-sonnet-4-5-20251001",
    "claude-haiku-4-5-20251001",
  ],
  envKey: "ANTHROPIC_API_KEY",
  requiresKey: true,
  headers: (apiKey) => ({
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  }),
  transformRequest: (messages, model, systemPrompt) => {
    const userMessages = messages.filter((m) => m.role !== "system");
    const body: Record<string, unknown> = {
      model,
      max_tokens: 8192,
      stream: true,
      messages: userMessages,
    };
    if (systemPrompt) body.system = systemPrompt;
    return body;
  },
  parseStream: (line) => {
    if (!line.startsWith("data: ")) return null;
    const raw = line.slice(6).trim();
    if (raw === "[DONE]" || !raw) return { done: true };
    try {
      const evt = JSON.parse(raw) as {
        type: string;
        delta?: { type?: string; text?: string };
      };
      if (
        evt.type === "content_block_delta" &&
        evt.delta?.type === "text_delta" &&
        evt.delta.text
      ) {
        return { text: evt.delta.text };
      }
      if (evt.type === "message_stop") return { done: true };
      return null;
    } catch {
      return null;
    }
  },
};

const google: ProviderDef = {
  id: "google",
  name: "Google Gemini",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
  models: [
    "gemini-2.5-pro-preview-06-05",
    "gemini-2.5-flash-preview-05-20",
    "gemini-2.0-flash",
  ],
  envKey: "GOOGLE_API_KEY",
  requiresKey: true,
  headers: () => ({ "Content-Type": "application/json" }),
  buildUrl: (baseUrl, model) =>
    `${baseUrl}/${model}:streamGenerateContent?alt=sse`,
  transformRequest: (messages, _model, systemPrompt) => {
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const body: Record<string, unknown> = { contents };
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }
    return body;
  },
  parseStream: (line) => {
    if (!line.startsWith("data: ")) return null;
    const raw = line.slice(6).trim();
    if (!raw) return null;
    try {
      const evt = JSON.parse(raw) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const text = evt.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return { text };
      return null;
    } catch {
      return null;
    }
  },
};

/** Factory for OpenAI-compatible providers. Reduces boilerplate. */
function openaiCompat(
  id: string,
  name: string,
  baseUrl: string,
  models: string[],
  envKey: string,
  requiresKey = true,
): ProviderDef {
  return {
    id,
    name,
    baseUrl,
    models,
    envKey,
    requiresKey,
    headers: openaiHeaders,
    transformRequest: openaiTransform,
    parseStream: openaiParseStream,
  };
}

const ollama: ProviderDef = {
  id: "ollama",
  name: "Ollama",
  baseUrl: "http://localhost:11434/api/chat",
  models: [],
  envKey: undefined,
  requiresKey: false,
  headers: null,
  ndjson: true,
  transformRequest: (messages, model, systemPrompt) => {
    const msgs = systemPrompt
      ? [{ role: "system" as const, content: systemPrompt }, ...messages]
      : messages;
    return { model, stream: true, messages: msgs };
  },
  parseStream: () => null,
  parseNdjson: (line) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      const evt = JSON.parse(trimmed) as {
        message?: { content?: string };
        done?: boolean;
      };
      if (evt.done) return { done: true };
      if (evt.message?.content) return { text: evt.message.content };
      return null;
    } catch {
      return null;
    }
  },
};

// ── Registry ───────────────────────────────────────────────────────────────────

export const PROVIDERS: Record<string, ProviderDef> = {
  anthropic,
  openai: openaiCompat(
    "openai",
    "OpenAI",
    "https://api.openai.com/v1/chat/completions",
    ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o3", "o3-mini", "o4-mini"],
    "OPENAI_API_KEY",
  ),
  google,
  groq: openaiCompat(
    "groq",
    "Groq",
    "https://api.groq.com/openai/v1/chat/completions",
    ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it", "mixtral-8x7b-32768"],
    "GROQ_API_KEY",
  ),
  deepseek: openaiCompat(
    "deepseek",
    "DeepSeek",
    "https://api.deepseek.com/chat/completions",
    ["deepseek-chat", "deepseek-reasoner"],
    "DEEPSEEK_API_KEY",
  ),
  mistral: openaiCompat(
    "mistral",
    "Mistral",
    "https://api.mistral.ai/v1/chat/completions",
    ["mistral-large-latest", "mistral-small-latest", "codestral-latest", "mistral-medium-latest"],
    "MISTRAL_API_KEY",
  ),
  grok: openaiCompat(
    "grok",
    "xAI Grok",
    "https://api.x.ai/v1/chat/completions",
    ["grok-3", "grok-3-mini", "grok-3-fast"],
    "XAI_API_KEY",
  ),
  openrouter: openaiCompat(
    "openrouter",
    "OpenRouter",
    "https://openrouter.ai/api/v1/chat/completions",
    [
      "anthropic/claude-sonnet-4",
      "openai/gpt-4o",
      "google/gemini-2.5-pro-preview",
      "deepseek/deepseek-chat",
      "meta-llama/llama-3.3-70b-instruct",
    ],
    "OPENROUTER_API_KEY",
  ),
  together: openaiCompat(
    "together",
    "Together AI",
    "https://api.together.xyz/v1/chat/completions",
    [
      "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
      "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      "mistralai/Mixtral-8x22B-Instruct-v0.1",
      "Qwen/Qwen2.5-72B-Instruct-Turbo",
    ],
    "TOGETHER_API_KEY",
  ),
  fireworks: openaiCompat(
    "fireworks",
    "Fireworks AI",
    "https://api.fireworks.ai/inference/v1/chat/completions",
    [
      "accounts/fireworks/models/llama-v3p3-70b-instruct",
      "accounts/fireworks/models/qwen2p5-72b-instruct",
      "accounts/fireworks/models/deepseek-v3",
    ],
    "FIREWORKS_API_KEY",
  ),
  ollama,
};

/** Flat list of provider IDs. */
export const PROVIDER_IDS = Object.keys(PROVIDERS);

/** Lookup a provider by ID. Returns undefined for unknown providers. */
export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS[id];
}

// ── Streaming ──────────────────────────────────────────────────────────────────

export interface ProviderStreamOptions {
  providerId: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  messages: Message[];
  systemPrompt?: string;
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

async function* readSSELines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
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

/**
 * Stream a chat completion from any registered provider.
 *
 * Uses the provider registry to build the request and parse the response.
 * Falls back to env vars for API keys when none is provided explicitly.
 */
export async function createProviderStream(
  opts: ProviderStreamOptions,
): Promise<void> {
  const provider = getProvider(opts.providerId);
  if (!provider) {
    opts.onError(new Error(`Unknown provider: ${opts.providerId}`));
    return;
  }

  const apiKey =
    opts.apiKey || (provider.envKey ? process.env[provider.envKey] : undefined);

  if (provider.requiresKey && !apiKey) {
    opts.onError(
      new Error(
        `${provider.name} requires an API key. Set ${provider.envKey} or configure in Settings.`,
      ),
    );
    return;
  }

  const baseUrl = opts.baseUrl || provider.baseUrl;
  const url = provider.buildUrl
    ? provider.buildUrl(baseUrl, opts.model)
    : baseUrl;

  // Google needs the API key as a query param
  const finalUrl =
    provider.id === "google" && apiKey
      ? `${url}&key=${apiKey}`
      : url;

  const headers: Record<string, string> =
    provider.headers && apiKey ? provider.headers(apiKey) : { "Content-Type": "application/json" };

  const body = provider.transformRequest(
    opts.messages,
    opts.model,
    opts.systemPrompt,
  );

  try {
    const res = await fetch(finalUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`${provider.name} API error ${res.status}: ${text}`);
    }

    if (provider.ndjson && provider.parseNdjson) {
      // NDJSON stream (Ollama)
      for await (const line of readSSELines(res.body)) {
        const chunk = provider.parseNdjson(line);
        if (!chunk) continue;
        if (chunk.text) opts.onChunk(chunk.text);
        if (chunk.done) break;
      }
    } else {
      // SSE stream (everyone else)
      for await (const line of readSSELines(res.body)) {
        const chunk = provider.parseStream(line);
        if (!chunk) continue;
        if (chunk.text) opts.onChunk(chunk.text);
        if (chunk.done) break;
      }
    }

    opts.onDone();
  } catch (err) {
    opts.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
