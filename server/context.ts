/**
 * Load latest scan context for injection into Claude chat sessions.
 * Looks for CLAUDE.md (hashmark's generated project instructions) in the project root.
 * Falls back to .hashmark/index.json if CLAUDE.md is absent.
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";

const MAX_CHARS = 50_000;

// mtime-keyed cache so CLAUDE.md is only re-read when the file actually changes
const _claudeCache = new Map<string, { mtime: number; content: string | null }>();

export function loadScanContext(projectDir: string): string | null {
  // Primary: CLAUDE.md — the rich markdown context hashmark generates
  const claudeMdPath = join(projectDir, "CLAUDE.md");
  if (existsSync(claudeMdPath)) {
    try {
      const mtime = statSync(claudeMdPath).mtimeMs;
      const cached = _claudeCache.get(claudeMdPath);
      if (cached && cached.mtime === mtime) return cached.content;
      const raw = readFileSync(claudeMdPath, "utf-8").trim();
      if (!raw) { _claudeCache.set(claudeMdPath, { mtime, content: null }); return null; }
      const content = `## Project Context\n\n${raw.length > MAX_CHARS ? raw.slice(0, MAX_CHARS) + "\n\n... [truncated — context exceeds 50,000 chars]" : raw}`;
      _claudeCache.set(claudeMdPath, { mtime, content });
      return content;
    } catch {
      _claudeCache.delete(claudeMdPath);
      // fall through to index.json
    }
  }

  // Fallback: .hashmark/index.json — import graph from last scan
  const indexPath = join(projectDir, ".hashmark", "index.json");
  if (existsSync(indexPath)) {
    try {
      const raw = readFileSync(indexPath, "utf-8").trim();
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        fileCount?: number;
        generatedAt?: string;
        files?: Record<string, unknown>;
      };
      const fileCount = parsed.fileCount ?? Object.keys(parsed.files ?? {}).length;
      const generatedAt = parsed.generatedAt
        ? new Date(parsed.generatedAt).toLocaleString()
        : "unknown";
      const summary = `Scan index — ${fileCount} files, generated ${generatedAt}`;
      const jsonStr = JSON.stringify(parsed, null, 2);
      const content = jsonStr.length > MAX_CHARS
        ? jsonStr.slice(0, MAX_CHARS) + "\n\n... [truncated]"
        : jsonStr;
      return `## Project Context\n\n${summary}\n\n\`\`\`json\n${content}\n\`\`\``;
    } catch {
      return null;
    }
  }

  return null;
}

export function getScanContextMeta(projectDir: string): {
  available: boolean;
  source: "CLAUDE.md" | "index.json" | null;
  charCount: number;
  preview: string | null;
  modifiedAt: string | null;
} {
  const claudeMdPath = join(projectDir, "CLAUDE.md");
  if (existsSync(claudeMdPath)) {
    try {
      const raw = readFileSync(claudeMdPath, "utf-8").trim();
      if (raw) {
        const stat = statSync(claudeMdPath);
        const content = `## Project Context\n\n${raw}`;
        return {
          available: true,
          source: "CLAUDE.md",
          charCount: Math.min(raw.length, MAX_CHARS),
          preview: raw.slice(0, 200) + (raw.length > 200 ? "..." : ""),
          modifiedAt: stat.mtime.toISOString(),
        };
      }
    } catch {}
  }

  const indexPath = join(projectDir, ".hashmark", "index.json");
  if (existsSync(indexPath)) {
    try {
      const raw = readFileSync(indexPath, "utf-8").trim();
      if (raw) {
        const stat = statSync(indexPath);
        return {
          available: true,
          source: "index.json",
          charCount: Math.min(raw.length, MAX_CHARS),
          preview: raw.slice(0, 200) + (raw.length > 200 ? "..." : ""),
          modifiedAt: stat.mtime.toISOString(),
        };
      }
    } catch {}
  }

  return { available: false, source: null, charCount: 0, preview: null, modifiedAt: null };
}
