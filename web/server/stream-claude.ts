import { type AIStreamOptions, type StreamUsage } from "./stream.js";
import { readSSELines } from "./stream-helpers.js";

function injectCacheControl(messages: AIStreamOptions["messages"]): AIStreamOptions["messages"] {
  const result = messages.map(m => ({ ...m }));
  let marked = 0;
  for (let i = result.length - 1; i >= 0 && marked < 3; i--) {
    if (result[i].role !== "user") continue;
    const content = result[i].content;
    if (typeof content === "string") {
      result[i] = { ...result[i], content: [{ type: "text" as const, text: content, cache_control: { type: "ephemeral" } }] as unknown as string };
    } else if (Array.isArray(content) && content.length > 0) {
      const blocks = [...content];
      const last = { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral" } };
      blocks[blocks.length - 1] = last;
      result[i] = { ...result[i], content: blocks };
    }
    marked++;
  }
  return result;
}

export async function streamClaude(opts: AIStreamOptions): Promise<void> {
  if (!opts.apiKey) throw new Error("Claude provider requires an API key");

  const isOAuth = opts.apiKey.startsWith("sk-ant-oat01-");
  const thinkingActive = (opts.thinkingBudget ?? 0) > 0;
  const betaHeaders = [
    isOAuth ? "claude-code-20250219,oauth-2025-04-20" : null,
    thinkingActive ? "thinking-token-budgets-2025-02-19" : null,
  ].filter(Boolean).join(",");
  const authHeaders: Record<string, string> = isOAuth
    ? { "Authorization": `Bearer ${opts.apiKey}`, "anthropic-beta": betaHeaders }
    : { "x-api-key": opts.apiKey, ...(betaHeaders ? { "anthropic-beta": betaHeaders } : {}) };

  const userMessages = opts.messages.filter(m => m.role !== "system");
  const cachedMessages = injectCacheControl(userMessages);
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: thinkingActive ? 32768 : 16384,
    stream: true,
    messages: cachedMessages,
  };
  if (opts.systemPrompt) body.system = [{ type: "text", text: opts.systemPrompt, cache_control: { type: "ephemeral" } }];
  if (opts.tools?.length) body.tools = opts.tools;
  if (thinkingActive) body.thinking = { type: "enabled", budget_tokens: opts.thinkingBudget };

  const res = await fetch(`${opts.baseUrl ?? "https://api.anthropic.com"}/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", ...authHeaders },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }

  let blockType: string | null = null;
  let blockId: string | null = null;
  let toolName: string | null = null;
  let toolInputBuf = "";

  for await (const line of readSSELines(res.body)) {
    if (!line.startsWith("data: ")) continue;
    const raw = line.slice(6).trim();
    if (raw === "[DONE]" || !raw) continue;
    try {
      const evt = JSON.parse(raw) as Record<string, unknown>;
      const type = evt.type as string;

      if (type === "content_block_start") {
        const block = evt.content_block as Record<string, unknown>;
        blockType = block.type as string;
        if (blockType === "tool_use") {
          blockId = block.id as string;
          toolName = block.name as string;
          toolInputBuf = "";
          opts.onBlock?.({ type: "tool_use", id: blockId, name: toolName, input: {} });
        } else if (blockType === "thinking") {
          opts.onBlock?.({ type: "thinking", text: "" });
        }
      }

      if (type === "content_block_delta") {
        const delta = evt.delta as Record<string, unknown>;
        const dt = delta.type as string;
        if (dt === "text_delta" && delta.text) opts.onChunk(delta.text as string);
        if (dt === "thinking_delta" && delta.thinking) opts.onBlock?.({ type: "thinking", text: delta.thinking as string });
        if (dt === "input_json_delta" && delta.partial_json) toolInputBuf += delta.partial_json as string;
      }

      if (type === "content_block_stop" && blockType === "tool_use" && toolName) {
        let parsedInput: Record<string, unknown> = {};
        try { parsedInput = JSON.parse(toolInputBuf); } catch {}
        opts.onBlock?.({ type: "tool_use", id: blockId ?? undefined, name: toolName, input: parsedInput });
        blockType = null; blockId = null; toolName = null; toolInputBuf = "";
      }

      if (type === "message_start") {
        const usage = (evt.message as Record<string, unknown>)?.usage as StreamUsage | undefined;
        if (usage) opts.onUsage?.(usage);
      }
      if (type === "message_delta") {
        const usage = (evt as Record<string, unknown>).usage as StreamUsage | undefined;
        if (usage) opts.onUsage?.(usage);
      }
    } catch {}
  }

  opts.onDone();
}
