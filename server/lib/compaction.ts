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
 * Returns true when total tokens exceed 80% of the model's context window.
 */
export function shouldAutoCompact(totalTokens: number, model: string): boolean {
  const window = getContextWindow(model);
  return totalTokens > window * 0.8;
}
