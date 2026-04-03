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
 * Smart pruning -- OpenCode-style selective context management.
 *
 * Instead of truncating ALL large assistant messages (microcompact),
 * selectively prune tool outputs from older turns while keeping the
 * conversation flow intact.
 *
 * Strategy:
 * 1. Never prune the last PROTECTED_TURNS turns (keep recent context)
 * 2. For older turns, find tool output blocks and large code fences
 * 3. Replace with a compact summary preserving the first PREVIEW_CHARS
 * 4. Never prune user messages or system prompts
 * 5. Work oldest-first, stop when targetFreeTokens reached
 *
 * Ported from OpenCode's compaction.ts prune() -- adapted for our
 * flat message format (string content, not structured parts).
 */

const PROTECTED_TURNS = 3;
const PREVIEW_CHARS = 200;
const MIN_BLOCK_SIZE = 500;
const CHARS_PER_TOKEN = 4;

// Tool output headers from Claude CLI stream format
const TOOL_HEADER_RE = /^\[(Read|Edit|Write|Bash|Glob|Grep|Search|Agent|TodoRead|TodoWrite)\]/;

// Fenced code blocks: triple-backtick lang\n...\ntriple-backtick
const CODE_FENCE_PATTERN = /```[\w]*\n[\s\S]*?\n```/g;

// JSON blobs: { ... } spanning 500+ chars
const JSON_BLOB_PATTERN = /\{[\s\S]{500,}?\}/g;

interface PrunableBlock {
  start: number;
  end: number;
  original: string;
  lineCount: number;
}

/** Find tool output sections in assistant message content */
function findToolOutputBlocks(content: string): PrunableBlock[] {
  const blocks: PrunableBlock[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    if (TOOL_HEADER_RE.test(lines[i])) {
      // Tool output block: starts at header, ends at next blank line
      // or next tool header or end of content
      const blockStart = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== "" && !TOOL_HEADER_RE.test(lines[j])) {
        j++;
      }
      const blockEnd = lines.slice(0, j).join("\n").length;
      const original = content.slice(blockStart, blockEnd);
      if (original.length >= MIN_BLOCK_SIZE) {
        blocks.push({ start: blockStart, end: blockEnd, original, lineCount: j - i });
      }
      i = j;
    } else {
      i++;
    }
  }

  return blocks;
}

/** Find large fenced code blocks */
function findCodeFenceBlocks(content: string): PrunableBlock[] {
  const blocks: PrunableBlock[] = [];
  const re = new RegExp(CODE_FENCE_PATTERN.source, "g");
  let match: RegExpExecArray | null = re.exec(content);

  while (match !== null) {
    if (match[0].length >= MIN_BLOCK_SIZE) {
      const lineCount = match[0].split("\n").length;
      blocks.push({
        start: match.index,
        end: match.index + match[0].length,
        original: match[0],
        lineCount,
      });
    }
    match = re.exec(content);
  }

  return blocks;
}

/** Find large inline JSON blobs */
function findJsonBlobs(content: string): PrunableBlock[] {
  const blocks: PrunableBlock[] = [];
  const re = new RegExp(JSON_BLOB_PATTERN.source, "g");
  let match: RegExpExecArray | null = re.exec(content);

  while (match !== null) {
    const lineCount = match[0].split("\n").length;
    if (lineCount >= 3) {
      blocks.push({
        start: match.index,
        end: match.index + match[0].length,
        original: match[0],
        lineCount,
      });
    }
    match = re.exec(content);
  }

  return blocks;
}

/** Build a truncation summary for a pruned block */
function buildBlockSummary(block: PrunableBlock): string {
  const preview = block.original.slice(0, PREVIEW_CHARS).trimEnd();
  const charCount = block.original.length;
  return `${preview}\n\n[pruned -- ${charCount} chars, ${block.lineCount} lines]`;
}

/** Merge overlapping blocks and sort by position */
function dedupeBlocks(blocks: PrunableBlock[]): PrunableBlock[] {
  if (blocks.length === 0) return [];
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  const merged: PrunableBlock[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr.start <= prev.end) {
      // Overlapping -- keep the larger one
      if (curr.original.length > prev.original.length) {
        merged[merged.length - 1] = curr;
      }
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

/** Replace blocks in content string, working backward to preserve offsets */
function applyReplacements(
  content: string,
  blocks: PrunableBlock[],
): { content: string; freedChars: number } {
  // Sort descending by start position so replacements don't shift indices
  const sorted = [...blocks].sort((a, b) => b.start - a.start);
  let result = content;
  let freedChars = 0;

  for (const block of sorted) {
    const summary = buildBlockSummary(block);
    result = result.slice(0, block.start) + summary + result.slice(block.end);
    freedChars += block.original.length - summary.length;
  }

  return { content: result, freedChars };
}

export function smartPrune(
  messages: Message[],
  targetFreeTokens: number = 20_000,
): { messages: Message[]; freedTokens: number } {
  const result = messages.map((m) => ({ ...m }));
  let totalFreedChars = 0;
  const targetFreeChars = targetFreeTokens * CHARS_PER_TOKEN;

  // Count turns from the end to find the protection boundary.
  // A "turn" = one user message + the following assistant message(s).
  let turnCount = 0;
  let protectionBoundary = result.length;
  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].role === "user") {
      turnCount++;
      if (turnCount >= PROTECTED_TURNS) {
        protectionBoundary = i;
        break;
      }
    }
  }

  // Walk oldest-first through unprotected assistant messages
  for (let i = 0; i < protectionBoundary; i++) {
    if (totalFreedChars >= targetFreeChars) break;

    const msg = result[i];
    if (msg.role !== "assistant") continue;
    if (msg.content.length < MIN_BLOCK_SIZE) continue;

    // Collect all prunable blocks from this message
    const toolBlocks = findToolOutputBlocks(msg.content);
    const codeBlocks = findCodeFenceBlocks(msg.content);
    const jsonBlocks = findJsonBlobs(msg.content);
    const allBlocks = dedupeBlocks([...toolBlocks, ...codeBlocks, ...jsonBlocks]);

    if (allBlocks.length === 0) continue;

    const { content, freedChars } = applyReplacements(msg.content, allBlocks);
    msg.content = content;
    totalFreedChars += freedChars;
  }

  // If smart pruning didn't free enough, fall back to microcompact
  // on remaining unprotected assistant messages
  if (totalFreedChars < targetFreeChars) {
    for (let i = 0; i < protectionBoundary; i++) {
      if (totalFreedChars >= targetFreeChars) break;

      const msg = result[i];
      if (msg.role !== "assistant") continue;
      if (msg.content.length <= MAX_TOOL_RESULT_CHARS) continue;

      const before = msg.content.length;
      msg.content = msg.content.slice(0, MAX_TOOL_RESULT_CHARS) + TRUNCATION_MARKER;
      totalFreedChars += before - msg.content.length;
    }
  }

  return {
    messages: result,
    freedTokens: Math.floor(totalFreedChars / CHARS_PER_TOKEN),
  };
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
 * Returns true when total tokens exceed 75% of the model's context window.
 * (75% gives enough headroom for the summary + new turn before hitting limits)
 */
export function shouldAutoCompact(totalTokens: number, model: string): boolean {
  const window = getContextWindow(model);
  return totalTokens > window * 0.75;
}

// ---------------------------------------------------------------------------
// Traditional compaction -- structured summarization
// ---------------------------------------------------------------------------
// Ported from Claw Code Parity (Rust) compact.rs.
// Generates a local metadata summary of old messages (no API call).
// Replaces old messages with a single system summary + recent messages.

const PRESERVE_RECENT_TURNS = 3; // keep last N user+assistant turn pairs
const MIN_MESSAGES_TO_COMPACT = 8; // don't bother compacting tiny histories
const COMPACT_CONTINUATION_PREAMBLE =
  "This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.\n\n";
const COMPACT_RECENT_MESSAGES_NOTE = "Recent messages are preserved verbatim.";
const COMPACT_DIRECT_RESUME_INSTRUCTION =
  "Continue the conversation from where it left off without asking the user any further questions. Resume directly -- do not acknowledge the summary, do not recap what was happening, and do not preface with continuation text.";

/** Estimate token count from message content (chars / 4, same heuristic as Claude Code) */
export function estimateTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
}

/** Extract file paths mentioned in message content */
function extractFilePaths(content: string): string[] {
  // Match common file path patterns
  const pathRe = /(?:^|\s|`)((?:\/|\.\/|\.\.\/)?[\w\-.]+(?:\/[\w\-.]+)+\.[\w]+)/g;
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pathRe.exec(content)) !== null) {
    paths.push(match[1]);
  }
  return [...new Set(paths)];
}

/** Extract tool names from assistant messages (tool output headers) */
function extractToolNames(messages: Message[]): string[] {
  const toolRe = /^\[(Read|Edit|Write|Bash|Glob|Grep|Search|Agent|TodoRead|TodoWrite|WebFetch|WebSearch)\]/gm;
  const tools = new Set<string>();
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    let match: RegExpExecArray | null;
    while ((match = toolRe.exec(msg.content)) !== null) {
      tools.add(match[1]);
    }
  }
  return [...tools].sort();
}

/** Collect the last N user messages as short summaries */
function collectRecentUserSummaries(messages: Message[], count: number): string[] {
  return messages
    .filter(m => m.role === "user")
    .slice(-count)
    .map(m => m.content.slice(0, 160).replace(/\n/g, " ").trim());
}

/** Infer pending/unfinished work from recent messages */
function inferPendingWork(messages: Message[]): string[] {
  const keywords = ["todo", "next", "pending", "follow up", "remaining", "still need"];
  return messages
    .filter(m => {
      const lower = m.content.toLowerCase();
      return keywords.some(kw => lower.includes(kw));
    })
    .slice(-3)
    .map(m => m.content.slice(0, 160).replace(/\n/g, " ").trim());
}

/** Build a structured summary of compacted messages (no API call) */
function summarizeMessages(messages: Message[]): string {
  const userCount = messages.filter(m => m.role === "user").length;
  const assistantCount = messages.filter(m => m.role === "assistant").length;

  const toolNames = extractToolNames(messages);
  const allContent = messages.map(m => m.content).join("\n");
  const keyFiles = extractFilePaths(allContent).slice(0, 8);
  const recentRequests = collectRecentUserSummaries(messages, 3);
  const pendingWork = inferPendingWork(messages);

  const lines: string[] = [
    "<summary>",
    "Conversation summary:",
    `- Scope: ${messages.length} earlier messages compacted (user=${userCount}, assistant=${assistantCount}).`,
  ];

  if (toolNames.length > 0) {
    lines.push(`- Tools used: ${toolNames.join(", ")}.`);
  }

  if (recentRequests.length > 0) {
    lines.push("- Recent user requests:");
    for (const req of recentRequests) {
      lines.push(`  - ${req}`);
    }
  }

  if (pendingWork.length > 0) {
    lines.push("- Pending work:");
    for (const item of pendingWork) {
      lines.push(`  - ${item}`);
    }
  }

  if (keyFiles.length > 0) {
    lines.push(`- Key files referenced: ${keyFiles.join(", ")}.`);
  }

  // Brief timeline of the conversation
  lines.push("- Key timeline:");
  for (const msg of messages) {
    const role = msg.role;
    const snippet = msg.content.slice(0, 120).replace(/\n/g, " ").trim();
    lines.push(`  - ${role}: ${snippet}`);
  }

  lines.push("</summary>");
  return lines.join("\n");
}

/** Merge an existing compaction summary with a new one (for re-compaction) */
function mergeCompactSummaries(existing: string | null, newSummary: string): string {
  if (!existing) return newSummary;

  const lines: string[] = [
    "<summary>",
    "Conversation summary:",
    "- Previously compacted context:",
    ...existing
      .replace(/<\/?summary>/g, "")
      .split("\n")
      .filter(l => l.trim().startsWith("-"))
      .map(l => `  ${l.trim()}`),
    "- Newly compacted context:",
    ...newSummary
      .replace(/<\/?summary>/g, "")
      .split("\n")
      .filter(l => l.trim().startsWith("-"))
      .map(l => `  ${l.trim()}`),
    "</summary>",
  ];

  return lines.join("\n");
}

/** Format a summary into the continuation message injected as first message */
function buildContinuationMessage(summary: string, hasRecentMessages: boolean): string {
  let msg = COMPACT_CONTINUATION_PREAMBLE;

  // Strip <summary> tags for display
  msg += summary
    .replace(/<summary>\n?/, "Summary:\n")
    .replace(/\n?<\/summary>/, "");

  if (hasRecentMessages) {
    msg += "\n\n" + COMPACT_RECENT_MESSAGES_NOTE;
  }

  msg += "\n" + COMPACT_DIRECT_RESUME_INSTRUCTION;
  return msg;
}

export interface CompactionResult {
  /** The compacted message array (summary + recent messages) */
  messages: Message[];
  /** The raw summary text (for storage/merging on next compaction) */
  summary: string;
  /** How many messages were removed */
  removedCount: number;
}

/**
 * Compact a session's messages by replacing old messages with a structured summary.
 *
 * Flow:
 * 1. Find the protection boundary (last N turns kept verbatim)
 * 2. Summarize everything before the boundary
 * 3. Return: [summary message] + [preserved recent messages]
 *
 * If an existing compaction summary is provided (from a previous compaction),
 * it gets merged with the new summary to preserve full history context.
 */
export function compactSession(
  messages: Message[],
  existingSummary: string | null = null,
): CompactionResult | null {
  if (messages.length < MIN_MESSAGES_TO_COMPACT) return null;

  // Find the protection boundary: keep last N turns
  let turnCount = 0;
  let protectionBoundary = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      turnCount++;
      if (turnCount >= PRESERVE_RECENT_TURNS) {
        protectionBoundary = i;
        break;
      }
    }
  }

  // Skip the existing summary message if present (role = "user" with summary content)
  const startIdx = existingSummary ? 1 : 0;
  const toCompact = messages.slice(startIdx, protectionBoundary);
  const preserved = messages.slice(protectionBoundary);

  if (toCompact.length === 0) return null;

  const rawSummary = summarizeMessages(toCompact);
  const mergedSummary = mergeCompactSummaries(existingSummary, rawSummary);
  const continuationMsg = buildContinuationMessage(mergedSummary, preserved.length > 0);

  const compactedMessages: Message[] = [
    { role: "user", content: continuationMsg },
    ...preserved,
  ];

  return {
    messages: compactedMessages,
    summary: mergedSummary,
    removedCount: toCompact.length,
  };
}
