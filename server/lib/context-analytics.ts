/**
 * Context analytics — tracks which CLAUDE.md sections get referenced
 * during agent runs by scanning output chunks for heading text matches.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface SectionHit {
  heading: string;
  hitCount: number;
  lastHitAt: number; // ms timestamp
}

export interface SessionAnalytics {
  sessionId: string;
  sectionHits: SectionHit[];
  updatedAt: number;
}

/**
 * Parse all markdown headings from a CLAUDE.md content string.
 * Returns the heading text stripped of # prefix and whitespace.
 */
export function parseClaudeMdSections(content: string): string[] {
  const headings: string[] = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^#{1,6}\s+(.+)$/);
    if (m) {
      const heading = m[1].trim();
      if (heading) headings.push(heading);
    }
  }
  return headings;
}

/**
 * Score a chunk of agent output against known section headings.
 * A section is "referenced" if its heading text appears (case-insensitive)
 * in the output. Returns map of heading -> hit count for this chunk.
 */
export function scoreOutputChunk(chunk: string, sections: string[]): Map<string, number> {
  const hits = new Map<string, number>();
  if (!chunk || sections.length === 0) return hits;

  const lowerChunk = chunk.toLowerCase();

  for (const heading of sections) {
    // Use at least 4-char subsequence of the heading to avoid noise
    const key = heading.toLowerCase();
    if (key.length < 4) continue;

    // Count non-overlapping occurrences
    let count = 0;
    let pos = 0;
    while ((pos = lowerChunk.indexOf(key, pos)) !== -1) {
      count++;
      pos += key.length;
    }

    if (count > 0) {
      hits.set(heading, count);
    }
  }

  return hits;
}

function analyticsPath(dataDir: string, sessionId: string): string {
  return join(dataDir, "analytics", `${sessionId}.json`);
}

function ensureDir(dataDir: string) {
  const dir = join(dataDir, "analytics");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// In-memory buffer: accumulate hits during a stream, flush to disk at stream end
const pendingAnalytics = new Map<string, SessionAnalytics>();

export async function loadSessionAnalytics(
  dataDir: string,
  sessionId: string
): Promise<SessionAnalytics> {
  const path = analyticsPath(dataDir, sessionId);
  if (!existsSync(path)) {
    return { sessionId, sectionHits: [], updatedAt: Date.now() };
  }
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as SessionAnalytics;
  } catch {
    return { sessionId, sectionHits: [], updatedAt: Date.now() };
  }
}

export async function saveSessionAnalytics(
  dataDir: string,
  analytics: SessionAnalytics
): Promise<void> {
  ensureDir(dataDir);
  const path = analyticsPath(dataDir, analytics.sessionId);
  writeFileSync(path, JSON.stringify(analytics, null, 2), "utf-8");
}

/**
 * Accumulate chunk hits in memory. Does NOT write to disk.
 * Call flushAnalytics() at stream end to persist.
 */
export function updateAnalytics(
  dataDir: string,
  sessionId: string,
  outputChunk: string,
  sections: string[]
): void {
  const newHits = scoreOutputChunk(outputChunk, sections);
  if (newHits.size === 0) return;

  if (!pendingAnalytics.has(sessionId)) {
    pendingAnalytics.set(sessionId, { sessionId, sectionHits: [], updatedAt: Date.now() });
  }
  const pending = pendingAnalytics.get(sessionId)!;
  const now = Date.now();

  for (const [heading, count] of newHits) {
    const existing = pending.sectionHits.find((h) => h.heading === heading);
    if (existing) {
      existing.hitCount += count;
      existing.lastHitAt = now;
    } else {
      pending.sectionHits.push({ heading, hitCount: count, lastHitAt: now });
    }
  }
  pending.updatedAt = now;
  // Suppress unused dataDir warning — kept in signature for callers who pass it
  void dataDir;
}

/**
 * Merge buffered hits with on-disk state and write once. Called at stream end.
 */
export async function flushAnalytics(dataDir: string, sessionId: string): Promise<void> {
  const pending = pendingAnalytics.get(sessionId);
  if (!pending || pending.sectionHits.length === 0) return;

  pendingAnalytics.delete(sessionId);

  const stored = await loadSessionAnalytics(dataDir, sessionId);
  const now = Date.now();

  for (const hit of pending.sectionHits) {
    const existing = stored.sectionHits.find((h) => h.heading === hit.heading);
    if (existing) {
      existing.hitCount += hit.hitCount;
      existing.lastHitAt = now;
    } else {
      stored.sectionHits.push({ heading: hit.heading, hitCount: hit.hitCount, lastHitAt: now });
    }
  }
  stored.updatedAt = now;
  await saveSessionAnalytics(dataDir, stored);
}
