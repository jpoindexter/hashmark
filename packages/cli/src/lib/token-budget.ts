/**
 * Token budget trimmer for generated CLAUDE.md output.
 *
 * Drops Knowledge layer sections in priority order (lowest first) until the
 * content fits within the requested token budget. Identity and Orientation
 * layers are never dropped.
 */

/** Rough token estimate: ~4 chars per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface TrimResult {
  trimmed: string;
  dropped: string[];
  originalTokens: number;
  finalTokens: number;
}

/**
 * Priority scores for ## sections. Lower number = drop first.
 * Sections not in this map get score 50 (treated as medium-priority Knowledge).
 */
const SECTION_PRIORITY: Record<string, number> = {
  // Layer 2 — Orientation (never drop — protected by index guard)
  Orientation: 100,
  // Layer 3 — Operations
  Operations: 80,
  // Layer 4 — Constraints
  Constraints: 70,
  // Layer 5 — Knowledge subsections, ordered low → high
  // The top-level "Knowledge" heading is kept; we trim sub-sections within it
  // when we can't trim enough from top-level sections.
  // For top-level ## sections that map to Knowledge sub-content:
  "Dependency Table": 10,
  Dependencies: 10,
  "Custom Hooks": 20,
  Hooks: 20,
  Components: 30,
  "API Routes": 40,
  "Database Models": 40,
  "API Surface": 40,
  Knowledge: 60,
};

function scoreof(heading: string): number {
  const trimmed = heading.trim();
  if (trimmed in SECTION_PRIORITY) return SECTION_PRIORITY[trimmed];
  // Partial match heuristics for generated sub-section names
  if (/hook/i.test(trimmed)) return 20;
  if (/component/i.test(trimmed)) return 30;
  if (/api|route/i.test(trimmed)) return 40;
  if (/database|model/i.test(trimmed)) return 40;
  if (/depend/i.test(trimmed)) return 10;
  // Default: treat as medium Knowledge
  return 50;
}

/**
 * Trim a generated CLAUDE.md string to fit within `maxTokens`.
 *
 * Strategy:
 * 1. Split on `\n## ` to isolate top-level sections.
 * 2. The first element (index 0) is the Identity layer — never dropped.
 * 3. The second element (index 1) should be Orientation — never dropped.
 * 4. Remaining sections are sorted by priority score ascending and dropped
 *    one by one until we are under budget.
 * 5. Surviving sections are reassembled in original order.
 */
export function trimToBudget(content: string, maxTokens: number): TrimResult {
  const originalTokens = estimateTokens(content);

  if (originalTokens <= maxTokens) {
    return { trimmed: content, dropped: [], originalTokens, finalTokens: originalTokens };
  }

  // Split preserving the `## ` prefix on every section after the first.
  // e.g. ["# CLAUDE.md\n...\n", "## Orientation\n...", "## Operations\n..."]
  const parts = content.split(/\n(?=## )/);

  // Each part[i >= 1] starts with "## SectionName\n..."
  function headingOf(part: string): string {
    const m = part.match(/^## ([^\n]+)/);
    return m ? m[1].trim() : "";
  }

  // Build index of droppable sections (index >= 2, so Identity=0 and Orientation=1 are safe)
  // We also protect index 1 even if it doesn't look like Orientation.
  interface Candidate {
    index: number;
    heading: string;
    score: number;
    tokens: number;
  }

  const candidates: Candidate[] = [];
  for (let i = 2; i < parts.length; i++) {
    const heading = headingOf(parts[i]);
    candidates.push({
      index: i,
      heading,
      score: scoreof(heading),
      tokens: estimateTokens(parts[i]),
    });
  }

  // Sort ascending by score so we drop the lowest-priority first.
  // Stable sort: ties keep original order (so we drop later sections of equal
  // priority before earlier ones — more conservative).
  candidates.sort((a, b) => a.score - b.score || b.index - a.index);

  const dropped: string[] = [];
  const droppedIndices = new Set<number>();
  let currentTokens = originalTokens;

  for (const candidate of candidates) {
    if (currentTokens <= maxTokens) break;
    droppedIndices.add(candidate.index);
    dropped.push(candidate.heading);
    // Subtract the section tokens plus the leading newline we added during split
    currentTokens -= candidate.tokens + 1;
  }

  const remaining = parts.filter((_, i) => !droppedIndices.has(i));
  const trimmed = remaining.join("\n");
  const finalTokens = estimateTokens(trimmed);

  return { trimmed, dropped, originalTokens, finalTokens };
}
