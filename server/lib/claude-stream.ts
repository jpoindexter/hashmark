/**
 * Unified Claude Code stream-json parser.
 *
 * Parses ALL event types from `--output-format stream-json` and emits
 * normalized StudioEvent objects that routes forward to clients via SSE.
 *
 * Event types derived from Claude Code source: entrypoints/sdk/coreSchemas.ts
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD: number;
}

export type StudioEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; content: string; id: string }
  | { type: "tool_use"; tool: string; input: unknown; toolUseId: string }
  | { type: "tool_result"; content: unknown; toolUseId: string }
  | { type: "tool_progress"; tool: string; elapsed: number; toolUseId: string }
  | { type: "cost"; totalUsd: number; usage: Record<string, ModelUsage>; durationMs: number }
  | { type: "session_id"; sessionId: string }
  | { type: "error"; message: string }
  | { type: "rate_limit"; retryAfter?: number }
  | { type: "progress"; message: string }
  | { type: "task_started"; taskId: string; description: string }
  | { type: "task_progress"; taskId: string; message: string };

// ---------------------------------------------------------------------------
// Raw Claude SDK event shapes (minimal -- only fields we use)
// ---------------------------------------------------------------------------

interface ContentBlock {
  type: string;
  id?: string;
  text?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
  tool_use_id?: string;
}

interface SDKEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  uuid?: string;
  // assistant message
  message?: { content?: ContentBlock[] };
  // tool_progress
  tool_name?: string;
  tool_use_id?: string;
  elapsed_time_seconds?: number;
  task_id?: string;
  // result
  total_cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  usage?: unknown;
  modelUsage?: Record<string, ModelUsage>;
  result?: string;
  is_error?: boolean;
  errors?: string[];
  // rate_limit_event
  rate_limit_info?: { retry_after_seconds?: number };
  // system subtypes
  message_text?: string;
  status?: string;
  // task notifications
  description?: string;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a single JSON line from Claude's stream-json output.
 * Returns an array of StudioEvents (one SDK event can produce multiple).
 */
export function parseStreamLine(line: string): StudioEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  let event: SDKEvent;
  try {
    event = JSON.parse(trimmed) as SDKEvent;
  } catch {
    // Not JSON -- treat as plain text progress
    if (trimmed) return [{ type: "progress", message: trimmed }];
    return [];
  }

  const events: StudioEvent[] = [];

  switch (event.type) {
    case "assistant": {
      if (!event.message?.content) break;
      for (const block of event.message.content) {
        if (block.type === "text" && block.text) {
          events.push({ type: "text", text: block.text });
        }
        if (block.type === "thinking" && block.text) {
          events.push({ type: "thinking", content: block.text, id: block.id ?? "" });
        }
        if (block.type === "tool_use") {
          events.push({
            type: "tool_use",
            tool: block.name ?? "unknown",
            input: block.input,
            toolUseId: block.id ?? "",
          });
        }
        if (block.type === "tool_result") {
          events.push({
            type: "tool_result",
            content: block.content,
            toolUseId: block.tool_use_id ?? "",
          });
        }
      }
      break;
    }

    case "tool_progress": {
      events.push({
        type: "tool_progress",
        tool: event.tool_name ?? "unknown",
        elapsed: event.elapsed_time_seconds ?? 0,
        toolUseId: event.tool_use_id ?? "",
      });
      break;
    }

    case "result": {
      // Capture session ID for resume support
      if (event.session_id) {
        events.push({ type: "session_id", sessionId: event.session_id });
      }

      // Cost data
      if (event.total_cost_usd != null) {
        events.push({
          type: "cost",
          totalUsd: event.total_cost_usd,
          usage: event.modelUsage ?? {},
          durationMs: event.duration_api_ms ?? event.duration_ms ?? 0,
        });
      }

      // Errors
      if (event.is_error && event.errors?.length) {
        for (const err of event.errors) {
          events.push({ type: "error", message: err });
        }
      }
      break;
    }

    case "rate_limit_event": {
      events.push({
        type: "rate_limit",
        retryAfter: event.rate_limit_info?.retry_after_seconds,
      });
      break;
    }

    case "system": {
      switch (event.subtype) {
        case "task_started":
          events.push({
            type: "task_started",
            taskId: event.task_id ?? "",
            description: event.description ?? "",
          });
          break;
        case "task_progress":
          events.push({
            type: "task_progress",
            taskId: event.task_id ?? "",
            message: event.message_text ?? event.status ?? "",
          });
          break;
        case "api_retry":
          events.push({ type: "progress", message: "API retry..." });
          break;
        case "status":
          if (event.message_text) {
            events.push({ type: "progress", message: event.message_text });
          }
          break;
      }
      break;
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Stream buffer helper
// ---------------------------------------------------------------------------

/**
 * Creates a stateful line buffer for parsing chunked stdout data.
 * Call `push(chunk)` with each Buffer, get back parsed StudioEvents.
 */
export function createStreamParser() {
  let buffer = "";

  return {
    push(chunk: Buffer | string): StudioEvent[] {
      buffer += typeof chunk === "string" ? chunk : chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      const events: StudioEvent[] = [];
      for (const line of lines) {
        events.push(...parseStreamLine(line));
      }
      return events;
    },

    /** Flush any remaining data in the buffer. */
    flush(): StudioEvent[] {
      if (!buffer.trim()) return [];
      const events = parseStreamLine(buffer);
      buffer = "";
      return events;
    },
  };
}
