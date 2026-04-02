export const ALL_FORMATS = [
  { id: "CLAUDE.md",            label: "CLAUDE.md",            hint: "Anthropic Claude" },
  { id: "AGENTS.md",            label: "AGENTS.md",            hint: "OpenAI Agents" },
  { id: ".cursorrules",         label: ".cursorrules",         hint: "Cursor" },
  { id: ".windsurfrules",       label: ".windsurfrules",       hint: "Windsurf" },
  { id: "openai-system-prompt", label: "openai-system-prompt", hint: "ChatGPT / API" },
  { id: "json",                 label: "JSON",                 hint: "Raw output" },
];

export interface ProjectInfo {
  projectName: string;
  projectDir: string;
  configured: boolean;
}

export interface StalenessInfo {
  exists: boolean;
  generatedAt: string | null;
  commitsSince: number | null;
  daysStale: number | null;
}

export interface ScanHistory {
  snapshots: Array<{
    scannedAt: number;
    totalFiles: number;
    totalLines: number;
    componentCount: number;
    apiRouteCount: number;
    aiReadiness: number | null;
    hubFileCount: number;
  }>;
}

export interface ScanConfig {
  formats: string[];
  maxTokens: number;
  watchDebounceMs: number;
  autoRescan: boolean;
}

export interface GeneratedFileInfo {
  name: string;
  tokens?: number;
  bytes?: number;
  path?: string;
}

export type PageState = "idle" | "scanning" | "done" | "error";

export function freshnessLabel(info: StalenessInfo): { text: string; cls: string } {
  if (!info.exists) return { text: "No CLAUDE.md", cls: "badge-zinc" };
  if (info.commitsSince === null) return { text: "Unknown freshness", cls: "badge-zinc" };
  if (info.commitsSince === 0) return { text: "Fresh", cls: "badge-green" };
  if (info.commitsSince < 5) return { text: `${info.commitsSince} commits stale`, cls: "badge-yellow" };
  return { text: `${info.commitsSince} commits stale`, cls: "badge-red" };
}

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export function fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k tokens`;
  return `${n} tokens`;
}
