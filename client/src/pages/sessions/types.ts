import { MODELS } from "../../lib/models";

export interface Session {
  id: string;
  title: string;
  agent_name: string | null;
  model: string;
  status: "idle" | "streaming";
  total_input_tokens: number;
  total_output_tokens: number;
  message_count: number;
  created_at: number;
  updated_at: number;
  archived: number;
}

export interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
}

export interface SearchResult {
  id: string;
  title: string;
  model: string;
  updatedAt: number;
  snippet: string | null;
  snippetRole: string | null;
}

export const CTX_WINDOW: Record<string, number> = {
  "claude-opus-4-6": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-haiku-4-5-20251001": 200_000,
};

export function providerColor(model: string): string {
  if (model.includes("opus")) return "var(--yellow)";
  if (model.includes("sonnet")) return "var(--blue)";
  if (model.includes("haiku")) return "var(--accent)";
  return "var(--text-dimmer)";
}

export function modelShortLabel(model: string): string {
  const found = MODELS.find(m => m.id === model);
  return found?.label ?? model;
}

export function fmtCost(inputTok: number, outputTok: number, model: string) {
  const rates: Record<string, [number, number]> = {
    "claude-opus-4-6": [15, 75],
    "claude-sonnet-4-6": [3, 15],
    "claude-haiku-4-5-20251001": [0.8, 4],
  };
  const [i, o] = rates[model] ?? [3, 15];
  const cost = (inputTok * i + outputTok * o) / 1_000_000;
  if (cost < 0.01) return `<$0.01`;
  return `$${cost.toFixed(3)}`;
}

export function tokenBarColor(pct: number): string {
  if (pct < 50) return "var(--accent)";
  if (pct < 80) return "var(--yellow)";
  return "var(--red)";
}
