import { streamClaude } from "./stream-claude.js";
import { streamOpenAICompat, streamGemini, streamOllama, streamCodex } from "./stream-compat.js";

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
}

export interface AIStreamOptions {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string | ContentBlock[] }>;
  systemPrompt?: string;
  tools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
  thinkingBudget?: number;
  onChunk: (text: string) => void;
  onBlock?: (block: ContentBlock) => void;
  onUsage?: (usage: StreamUsage) => void;
  onDone: () => void;
  onError: (err: Error) => void;
  signal?: AbortSignal;
}

export async function streamAIResponse(opts: AIStreamOptions): Promise<void> {
  try {
    switch (opts.provider) {
      case "claude":
      case "anthropic":  return await streamClaude(opts);
      case "openai":     return await streamOpenAICompat(opts, "https://api.openai.com/v1/chat/completions");
      case "gemini":
      case "google":     return await streamGemini(opts);
      case "mistral":    return await streamOpenAICompat(opts, "https://api.mistral.ai/v1/chat/completions");
      case "grok":       return await streamOpenAICompat(opts, "https://api.x.ai/v1/chat/completions");
      case "groq":       return await streamOpenAICompat(opts, "https://api.groq.com/openai/v1/chat/completions");
      case "deepseek":   return await streamOpenAICompat(opts, "https://api.deepseek.com/v1/chat/completions");
      case "openrouter": return await streamOpenAICompat(opts, "https://openrouter.ai/api/v1/chat/completions");
      case "together":   return await streamOpenAICompat(opts, "https://api.together.xyz/v1/chat/completions");
      case "fireworks":  return await streamOpenAICompat(opts, "https://api.fireworks.ai/inference/v1/chat/completions");
      case "vercel":     return await streamOpenAICompat(opts, opts.baseUrl ?? "https://api.v0.dev/v1/chat/completions");
      case "302ai":      return await streamOpenAICompat(opts, opts.baseUrl ?? "https://api.302.ai/v1/chat/completions");
      case "ollama":     return await streamOllama(opts);
      case "codex":      return await streamCodex(opts);
      default:
        throw new Error(`Unknown provider: ${opts.provider}`);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    opts.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
