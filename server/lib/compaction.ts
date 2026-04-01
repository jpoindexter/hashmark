/**
 * Microcompaction -- truncate large tool results in conversation history.
 *
 * When resending history (for non-resume sessions), tool results that are
 * longer than MAX_TOOL_RESULT_CHARS get truncated to save tokens.
 * The original content is preserved in DB; only the API-sent copy is trimmed.
 *
 * Why assistant messages? In the stored history, assistant messages contain
 * full tool output (file reads, bash results, long code blocks). These are
 * the biggest token sinks when replayed. User messages are typically short
 * and worth keeping intact.
 */

const MAX_TOOL_RESULT_CHARS = 2000;
const TRUNCATION_MARKER = "\n\n[... truncated for context efficiency ...]\n";

type Message = { role: string; content: string };

export function microcompact(messages: Message[]): Message[] {
  return messages.map((msg) => {
    if (msg.role !== "assistant") return msg;
    if (msg.content.length <= MAX_TOOL_RESULT_CHARS) return msg;
    return {
      ...msg,
      content: msg.content.slice(0, MAX_TOOL_RESULT_CHARS) + TRUNCATION_MARKER,
    };
  });
}

/**
 * Context window sizes by model family.
 * Sonnet/Haiku = 200K, Opus = 200K (1M with extended, but default to 200K).
 * Default to 200K for unknown models.
 */
export function getContextWindow(_model: string): number {
  // All models default to 200K. Opus has 1M extended but we cap at 200K.
  return 200_000;
}

/**
 * Check if total token usage exceeds a threshold of the context window.
 * Returns a warning message if usage > 80%, or null if fine.
 */
export function checkContextUsage(
  inputTokens: number,
  outputTokens: number,
  model: string
): string | null {
  const contextWindow = getContextWindow(model);
  const total = inputTokens + outputTokens;
  const pct = Math.round((total / contextWindow) * 100);
  if (pct >= 80) {
    return `Context is ${pct}% full. Consider starting a new session.`;
  }
  return null;
}

/**
 * Check if a session should trigger auto-compaction.
 * Returns true when total tokens exceed 80% of the model's context window.
 */
export function shouldAutoCompact(totalTokens: number, model: string): boolean {
  const window = getContextWindow(model);
  return totalTokens > window * 0.8;
}
