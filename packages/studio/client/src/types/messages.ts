export type MessagePart =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string; id: string }
  | { type: "tool_use"; name: string; input: Record<string, unknown>; id: string }
  | { type: "tool_result"; output: string; id: string; isError?: boolean }
  | { type: "agent"; description: string; id: string }
  | { type: "skill"; name: string; id: string }
  | { type: "progress"; text: string }
  | { type: "error"; message: string };

export interface StructuredMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
}
