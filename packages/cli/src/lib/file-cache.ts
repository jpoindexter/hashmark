import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from "fs";
import { join } from "path";

export interface FileMtimeCache {
  version: 1;
  files: Record<string, number>; // relative path -> mtime ms
  updatedAt: number;
}

const CACHE_FILE = ".hashmark/file-mtimes.json";

export function loadMtimeCache(projectDir: string): FileMtimeCache {
  const path = join(projectDir, CACHE_FILE);
  if (!existsSync(path)) return { version: 1, files: {}, updatedAt: 0 };
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { version: 1, files: {}, updatedAt: 0 };
  }
}

export function saveMtimeCache(projectDir: string, relativeFiles: string[]): void {
  const cache: FileMtimeCache = { version: 1, files: {}, updatedAt: Date.now() };
  for (const f of relativeFiles) {
    try {
      cache.files[f] = statSync(join(projectDir, f)).mtimeMs;
    } catch {}
  }
  const dir = join(projectDir, ".hashmark");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(projectDir, CACHE_FILE), JSON.stringify(cache, null, 2));
}

export function filterChangedFiles(
  allRelativeFiles: string[],
  projectDir: string,
  cache: FileMtimeCache
): { changedFiles: string[]; unchangedCount: number } {
  const changed: string[] = [];
  let unchangedCount = 0;
  for (const f of allRelativeFiles) {
    const cachedMtime = cache.files[f];
    if (!cachedMtime) {
      changed.push(f);
    } else {
      try {
        const currentMtime = statSync(join(projectDir, f)).mtimeMs;
        if (currentMtime !== cachedMtime) changed.push(f);
        else unchangedCount++;
      } catch {
        changed.push(f);
      }
    }
  }
  return { changedFiles: changed, unchangedCount };
}
