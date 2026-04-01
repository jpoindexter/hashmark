export interface ModelEntry {
  id: string;
  label: string;
  provider: string;
  note?: string;
}

export const MODELS: ModelEntry[] = [
  { id: "auto", label: "Auto", provider: "Smart Routing" },
  { id: "claude-opus-4-6", label: "Opus 4.6", provider: "Claude", note: "1M ctx" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", provider: "Claude", note: "default" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", provider: "Claude", note: "fast" },
  { id: "o3", label: "o3", provider: "Codex", note: "reasoning" },
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { id: "gemini-2.0-flash", label: "2.0 Flash", provider: "Gemini", note: "fast" },
  { id: "amp-default", label: "Default", provider: "Amp" },
];
