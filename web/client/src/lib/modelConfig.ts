export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Claude
  "claude-opus-4-6": 200000,
  "claude-opus-4-5": 200000,
  "claude-sonnet-4-6": 200000,
  "claude-sonnet-4-5": 200000,
  "claude-haiku-4-5": 200000,
  "claude-haiku-4-5-20251001": 200000,
  "claude-3-5-sonnet-20241022": 200000,
  "claude-3-5-haiku-20241022": 200000,
  "claude-3-opus-20240229": 200000,
  // OpenAI
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4-turbo": 128000,
  "gpt-4": 8192,
  "gpt-3.5-turbo": 16385,
  "o1": 200000,
  "o1-mini": 128000,
  "o3": 200000,
  "o3-mini": 200000,
  // Google
  "gemini-2.5-pro": 1000000,
  "gemini-2.5-flash": 1000000,
  "gemini-2.0-flash": 1000000,
  "gemini-1.5-pro": 2000000,
  "gemini-1.5-flash": 1000000,
  // Mistral
  "mistral-large-latest": 131000,
  "mistral-small-latest": 131000,
  "codestral-latest": 256000,
  // xAI
  "grok-2": 131072,
  "grok-beta": 131072,
  // Groq
  "llama-3.3-70b-versatile": 131072,
  "llama-3.1-70b-versatile": 131072,
  "mixtral-8x7b-32768": 32768,
  // DeepSeek
  "deepseek-chat": 64000,
  "deepseek-coder": 16000,
};

export function getContextLimit(model: string): number {
  if (MODEL_CONTEXT_LIMITS[model]) return MODEL_CONTEXT_LIMITS[model];
  if (model.startsWith("claude-")) return 200000;
  if (model.startsWith("gpt-4")) return 128000;
  if (model.startsWith("gemini-")) return 1000000;
  if (model.startsWith("o1") || model.startsWith("o3")) return 200000;
  return 128000;
}

export const SESSION_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-opus-4-5": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "o1": { input: 15, output: 60 },
  "o3": { input: 10, output: 40 },
};

export function getSessionCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = SESSION_PRICING[model] ?? { input: 3, output: 15 };
  return (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output;
}
