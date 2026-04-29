import { type AIStreamOptions, type ContentBlock } from "./stream.js";

type OpenAIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> }
  | { role: "tool"; tool_call_id: string; content: string };

export function toOpenAIMessages(messages: AIStreamOptions["messages"], systemPrompt?: string): OpenAIMessage[] {
  const result: OpenAIMessage[] = [];
  if (systemPrompt) result.push({ role: "system", content: systemPrompt });

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      if (msg.role === "system") result.push({ role: "system", content: msg.content });
      else if (msg.role === "user") result.push({ role: "user", content: msg.content });
      else result.push({ role: "assistant", content: msg.content });
      continue;
    }

    const blocks = msg.content as ContentBlock[];
    const toolResults = blocks.filter(b => b.type === "tool_result");
    const toolUses = blocks.filter(b => b.type === "tool_use");
    const text = blocks.filter(b => b.type === "text").map(b => b.text ?? "").join("");

    if (toolResults.length > 0) {
      for (const tr of toolResults) {
        result.push({ role: "tool", tool_call_id: tr.id ?? "", content: tr.content ?? "" });
      }
    } else if (toolUses.length > 0) {
      result.push({
        role: "assistant",
        content: text || null,
        tool_calls: toolUses.map(b => ({
          id: b.id ?? `call_${b.name}`,
          type: "function" as const,
          function: { name: b.name ?? "", arguments: JSON.stringify(b.input ?? {}) },
        })),
      });
    } else {
      result.push({ role: msg.role === "assistant" ? "assistant" : "user", content: text });
    }
  }

  return result;
}

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { output: string } } };

export function toGeminiMessages(messages: AIStreamOptions["messages"]): Array<{ role: "user" | "model"; parts: GeminiPart[] }> {
  const result: Array<{ role: "user" | "model"; parts: GeminiPart[] }> = [];

  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (typeof msg.content === "string") {
      result.push({ role: msg.role === "assistant" ? "model" : "user", parts: [{ text: msg.content }] });
      continue;
    }

    const blocks = msg.content as ContentBlock[];
    const toolResults = blocks.filter(b => b.type === "tool_result");
    const toolUses = blocks.filter(b => b.type === "tool_use");
    const textBlocks = blocks.filter(b => b.type === "text");

    if (toolResults.length > 0) {
      result.push({
        role: "user",
        parts: toolResults.map(tr => ({
          functionResponse: { name: tr.name ?? tr.id ?? "tool", response: { output: tr.content ?? "" } },
        })),
      });
    } else if (toolUses.length > 0) {
      const parts: GeminiPart[] = [];
      if (textBlocks.length) parts.push({ text: textBlocks.map(b => b.text ?? "").join("") });
      for (const tu of toolUses) parts.push({ functionCall: { name: tu.name ?? "", args: tu.input ?? {} } });
      result.push({ role: "model", parts });
    } else {
      result.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: textBlocks.map(b => ({ text: b.text ?? "" })),
      });
    }
  }

  return result;
}
