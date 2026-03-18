/**
 * hashmark compact
 *
 * Compresses a conversation/session export (array of {role, content} messages)
 * by stripping tool noise and summarizing early context.
 */

export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}

export interface CompactOptions {
  output?: string;
  format?: "json" | "text";
  threshold?: number;
}

export interface CompactResult {
  messages: Message[];
  originalTokens: number;
  compactedTokens: number;
  reductionPct: number;
  summary: string;
}

// Known boilerplate system message patterns
const BOILERPLATE_PATTERNS = [
  /^you are a helpful assistant\.?$/i,
  /^you are claude\.?$/i,
  /^you are an ai assistant\.?$/i,
  /^be helpful, harmless, and honest\.?$/i,
  /^respond helpfully\.?$/i,
  /^answer the user'?s? questions?\.?$/i,
];

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

function isBoilerplateSystem(msg: Message): boolean {
  if (msg.role !== "system") return false;
  const text = msg.content.trim();
  if (text.length < 100) return true;
  return BOILERPLATE_PATTERNS.some((p) => p.test(text));
}

function truncateToolOutput(content: string, threshold: number): string {
  if (content.length <= threshold) return content;
  return content.slice(0, 200) + "...[truncated]";
}

function summarizeMessages(messages: Message[]): string {
  if (messages.length === 0) return "";

  const parts: string[] = [];
  for (const msg of messages) {
    const role = msg.role === "user" ? "User" : "Assistant";
    const preview = msg.content.length > 300
      ? msg.content.slice(0, 297) + "..."
      : msg.content;
    parts.push(`${role}: ${preview}`);
  }

  return `## Conversation Summary\n\nEarly context (${messages.length} messages):\n\n${parts.join("\n\n")}`;
}

export function compactMessages(messages: Message[], opts: CompactOptions = {}): CompactResult {
  const threshold = opts.threshold ?? 500;

  const originalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  // Step 1: strip boilerplate system messages
  let working = messages.filter((m) => !isBoilerplateSystem(m));

  // Step 2: truncate tool outputs over threshold
  working = working.map((m) => {
    if (m.role === "tool" && m.content.length > threshold) {
      return { ...m, content: truncateToolOutput(m.content, threshold) };
    }
    // Also truncate very long assistant messages that look like tool dumps
    // (no punctuation variety — likely raw output)
    if (m.role === "assistant" && m.content.length > threshold) {
      const newlineRatio = (m.content.match(/\n/g) ?? []).length / m.content.length;
      const isProbablyToolDump = newlineRatio < 0.01 && m.content.length > 1000;
      if (isProbablyToolDump) {
        return { ...m, content: truncateToolOutput(m.content, threshold) };
      }
    }
    return m;
  });

  // Step 3: drop consecutive duplicate assistant messages (keep latest)
  const deduplicated: Message[] = [];
  for (let i = 0; i < working.length; i++) {
    const curr = working[i];
    const next = working[i + 1];
    if (
      curr.role === "assistant" &&
      next?.role === "assistant" &&
      curr.content === next.content
    ) {
      continue; // skip — next is identical and will be kept
    }
    deduplicated.push(curr);
  }
  working = deduplicated;

  // Step 4: summarize the first 20% of messages into a single system block
  const earlyCount = Math.floor(working.length * 0.2);
  let compacted: Message[] = working;
  let summary = "";

  if (earlyCount >= 2) {
    const early = working.slice(0, earlyCount);
    const rest = working.slice(earlyCount);
    summary = summarizeMessages(early);
    compacted = [{ role: "system", content: summary }, ...rest];
  }

  const compactedTokens = compacted.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const reductionPct = originalTokens > 0
    ? Math.round((1 - compactedTokens / originalTokens) * 100)
    : 0;

  return { messages: compacted, originalTokens, compactedTokens, reductionPct, summary };
}
