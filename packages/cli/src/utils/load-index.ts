/**
 * Load Relationship Index
 *
 * Shared utility for loading `.hashmark/index.json` with fallback
 * to on-demand sync if the index is missing or stale.
 *
 * @module utils/load-index
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import type { RelationshipIndex } from "../sync.js";

/** Maximum age before index is considered stale (10 minutes) */
const MAX_AGE_MS = 10 * 60 * 1000;

/** In-memory cache */
let cachedIndex: RelationshipIndex | null = null;
let cachedDir: string | null = null;
let cachedAt = 0;
const MEMORY_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Loads the relationship index from `.hashmark/index.json`.
 *
 * Falls back to running `sync()` if the index is missing or stale.
 *
 * @param dir - Project root directory
 * @param autoSync - Whether to auto-sync if index is missing/stale (default: true)
 * @returns The relationship index, or null if unavailable and autoSync is false
 */
export async function loadIndex(dir: string, autoSync = true): Promise<RelationshipIndex | null> {
  const absDir = resolve(dir);

  // Check memory cache first
  if (cachedIndex && cachedDir === absDir && Date.now() - cachedAt < MEMORY_TTL) {
    return cachedIndex;
  }

  const indexPath = join(absDir, ".hashmark", "index.json");

  // Try to load from disk
  if (existsSync(indexPath)) {
    try {
      const stat = statSync(indexPath);
      const age = Date.now() - stat.mtimeMs;

      // If fresh enough, use it
      if (age < MAX_AGE_MS) {
        const content = readFileSync(indexPath, "utf-8");
        const index = JSON.parse(content) as RelationshipIndex;
        cachedIndex = index;
        cachedDir = absDir;
        cachedAt = Date.now();
        return index;
      }
    } catch {
      // Corrupt file — fall through to sync
    }
  }

  // Index missing or stale — run sync
  if (autoSync) {
    const { buildRelationshipIndex } = await import("../sync.js");
    const { writeFileSync, mkdirSync } = await import("fs");

    const index = await buildRelationshipIndex(absDir);

    // Write the index
    const hashmarkDir = join(absDir, ".hashmark");
    if (!existsSync(hashmarkDir)) {
      mkdirSync(hashmarkDir, { recursive: true });
    }
    writeFileSync(join(hashmarkDir, "index.json"), JSON.stringify(index, null, 2), "utf-8");

    cachedIndex = index;
    cachedDir = absDir;
    cachedAt = Date.now();
    return index;
  }

  return null;
}

/**
 * Clears the in-memory index cache.
 * Call this after sync to force a re-read on next access.
 */
export function clearIndexCache(): void {
  cachedIndex = null;
  cachedDir = null;
  cachedAt = 0;
}
