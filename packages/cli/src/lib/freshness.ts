import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export interface SectionHash {
  section: string;
  hash: string;
  scanCount: number;
}

export interface FreshnessStore {
  scanCount: number;
  sections: SectionHash[];
  updatedAt: number;
}

const STORE_FILE = ".hashmark/freshness.json";

export function loadFreshnessStore(projectDir: string): FreshnessStore {
  const path = join(projectDir, STORE_FILE);
  if (!existsSync(path)) return { scanCount: 0, sections: [], updatedAt: 0 };
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return { scanCount: 0, sections: [], updatedAt: 0 }; }
}

export function saveFreshnessStore(projectDir: string, store: FreshnessStore): void {
  const dir = join(projectDir, ".hashmark");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(projectDir, STORE_FILE), JSON.stringify(store, null, 2));
}

export function hashSection(content: string): string {
  return createHash("sha1").update(content).digest("hex").slice(0, 12);
}

export interface SectionFreshness {
  section: string;
  scansStale: number;
  isNew: boolean;
}

export function computeFreshness(
  sections: Record<string, string>,
  store: FreshnessStore
): SectionFreshness[] {
  const storedMap = new Map(store.sections.map(s => [s.section, s]));
  const result: SectionFreshness[] = [];
  for (const [name, content] of Object.entries(sections)) {
    const hash = hashSection(content);
    const stored = storedMap.get(name);
    if (!stored) {
      result.push({ section: name, scansStale: 0, isNew: true });
    } else {
      const scansStale = stored.hash === hash ? store.scanCount - stored.scanCount : 0;
      result.push({ section: name, scansStale, isNew: false });
    }
  }
  return result;
}

export function updateFreshnessStore(
  sections: Record<string, string>,
  store: FreshnessStore
): FreshnessStore {
  const newScanCount = store.scanCount + 1;
  const existingMap = new Map(store.sections.map(s => [s.section, s]));
  const updatedSections: SectionHash[] = [];
  for (const [name, content] of Object.entries(sections)) {
    const hash = hashSection(content);
    const existing = existingMap.get(name);
    if (existing && existing.hash === hash) {
      updatedSections.push(existing);
    } else {
      updatedSections.push({ section: name, hash, scanCount: newScanCount });
    }
  }
  return { scanCount: newScanCount, sections: updatedSections, updatedAt: Date.now() };
}
