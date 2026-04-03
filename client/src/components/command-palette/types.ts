import { fetchApi } from "../../lib/api";

export interface Command {
  id: string;
  section: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  keybind?: string;
  run: () => void;
}

export interface FileItem {
  name: string;
  path: string;
  ext?: string;
}

export interface SymbolItem {
  name: string;
  kind: "function" | "class" | "const" | "interface" | "type" | "method" | "variable";
  line: number;
}

export type PaletteMode = "commands" | "files";

export type ResultItem =
  | { kind: "command"; cmd: Command }
  | { kind: "file"; file: FileItem; section: "recent" | "files" }
  | { kind: "symbol"; symbol: SymbolItem }
  | { kind: "goto-line" };

export interface PaletteProps {
  open: boolean;
  onClose: () => void;
  mode?: PaletteMode;
}

export interface FuzzyResult {
  score: number;
  indices: number[];
}

export function fuzzyMatch(query: string, target: string): FuzzyResult {
  if (!query) return { score: 1, indices: [] };
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  const name = target.split("/").pop() ?? target;
  const nameLower = name.toLowerCase();
  const nameStart = target.length - name.length;
  const subIdx = nameLower.indexOf(q);
  if (subIdx !== -1) {
    const indices = Array.from({ length: q.length }, (_, i) => nameStart + subIdx + i);
    return { score: 100 + (subIdx === 0 ? 50 : 0), indices };
  }

  let qi = 0;
  let consecutive = 0;
  let score = 0;
  const indices: number[] = [];
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      consecutive++;
      score += consecutive * 2;
      indices.push(ti);
      qi++;
    } else {
      consecutive = 0;
    }
  }
  if (qi < q.length) return { score: -1, indices: [] };
  return { score, indices };
}

export function extColor(ext?: string): string {
  switch (ext) {
    case "ts": case "tsx": return "var(--accent)";
    case "js": case "jsx": return "#f0db4f";
    case "py": return "#3572A5";
    case "md": return "var(--text-dim)";
    case "json": return "#cbcb41";
    case "css": return "#563d7c";
    case "html": return "#e34c26";
    case "sh": case "bash": return "var(--text-dimmer)";
    default: return "var(--text-dimmer)";
  }
}

const RECENT_KEY = "studio:recent_files";
const MAX_RECENT = 10;

export function getRecentFiles(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

export function addRecentFile(path: string) {
  try {
    const prev = getRecentFiles().filter(p => p !== path);
    localStorage.setItem(RECENT_KEY, JSON.stringify([path, ...prev].slice(0, MAX_RECENT)));
  } catch { /* noop */ }
}

if (typeof window !== "undefined") {
  window.addEventListener("studio:open-file", ((e: CustomEvent) => {
    const path = typeof e.detail === "string" ? e.detail : e.detail?.path;
    if (path) addRecentFile(path);
  }) as EventListener);
}

let fileCache: FileItem[] | null = null;
let fileFetchPromise: Promise<FileItem[]> | null = null;

export function fetchFileList(): Promise<FileItem[]> {
  if (fileCache) return Promise.resolve(fileCache);
  if (fileFetchPromise) return fileFetchPromise;
  fileFetchPromise = fetchApi("/api/files/list")
    .then(r => r.json())
    .then((d: { files?: FileItem[] }) => {
      fileCache = d.files ?? [];
      fileFetchPromise = null;
      return fileCache;
    })
    .catch(() => {
      fileFetchPromise = null;
      return [] as FileItem[];
    });
  return fileFetchPromise;
}

if (typeof window !== "undefined") {
  window.addEventListener("studio:project-changed", () => {
    fileCache = null;
    fileFetchPromise = null;
  });
}

let symbolCache: Map<string, SymbolItem[]> = new Map();

export function fetchSymbols(filepath: string): Promise<SymbolItem[]> {
  if (symbolCache.has(filepath)) return Promise.resolve(symbolCache.get(filepath)!);
  return fetchApi(`/api/files/symbols?path=${encodeURIComponent(filepath)}`)
    .then(r => r.json())
    .then((d: { symbols?: SymbolItem[] }) => {
      const syms = d.symbols ?? [];
      symbolCache.set(filepath, syms);
      return syms;
    })
    .catch(() => []);
}

if (typeof window !== "undefined") {
  window.addEventListener("studio:project-changed", () => {
    symbolCache = new Map();
  });
}

export function getCurrentFilePath(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("path");
}

export function buildResults(
  isCommandMode: boolean,
  filterQuery: string,
  files: FileItem[],
  recentPaths: string[],
  commands: Command[],
): ResultItem[] {
  if (isCommandMode) {
    const matched = filterQuery
      ? commands.filter(c =>
          c.label.toLowerCase().includes(filterQuery.toLowerCase()) ||
          (c.description?.toLowerCase().includes(filterQuery.toLowerCase()) ?? false),
        )
      : commands;
    return matched.map(cmd => ({ kind: "command" as const, cmd }));
  }

  if (!filterQuery) {
    const recent = recentPaths
      .map(p => files.find(f => f.path === p))
      .filter((f): f is FileItem => f !== undefined)
      .slice(0, MAX_RECENT);
    return recent.map(file => ({ kind: "file" as const, file, section: "recent" as const }));
  }

  const recentSet = new Set(recentPaths);
  return files
    .map(file => ({ file, match: fuzzyMatch(filterQuery, file.path) }))
    .filter(x => x.match.score > 0)
    .sort((a, b) => {
      const aRecent = recentSet.has(a.file.path) ? 1000 : 0;
      const bRecent = recentSet.has(b.file.path) ? 1000 : 0;
      return (b.match.score + bRecent) - (a.match.score + aRecent);
    })
    .slice(0, 20)
    .map(x => ({
      kind: "file" as const,
      file: x.file,
      section: recentSet.has(x.file.path) ? "recent" as const : "files" as const,
    }));
}

export function buildSymbolResults(filterQuery: string, symbols: SymbolItem[]): ResultItem[] {
  if (!filterQuery) {
    return symbols.map(symbol => ({ kind: "symbol" as const, symbol }));
  }
  return symbols
    .filter(s => s.name.toLowerCase().includes(filterQuery.toLowerCase()))
    .map(symbol => ({ kind: "symbol" as const, symbol }));
}
