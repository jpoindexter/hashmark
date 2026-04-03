import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync, spawnSync } from "child_process";

// ── CLI tool definitions for auto-detection ─────────────────────────────────

export interface CLITool {
  id: string;
  name: string;
  bin: string;
  versionFlag: string;
}

const CLI_TOOLS: CLITool[] = [
  { id: "claude",  name: "Claude Code",      bin: "claude",            versionFlag: "--version" },
  { id: "codex",   name: "OpenAI Codex",     bin: "codex",             versionFlag: "--version" },
  { id: "gemini",  name: "Google Gemini CLI", bin: "gemini",            versionFlag: "--version" },
  { id: "aider",   name: "Aider",            bin: "aider",             versionFlag: "--version" },
  { id: "copilot", name: "GitHub Copilot",   bin: "github-copilot-cli", versionFlag: "--version" },
  { id: "amp",     name: "Amp",              bin: "amp",               versionFlag: "--version" },
  { id: "goose",   name: "Goose",            bin: "goose",             versionFlag: "--version" },
];

// Fallback paths beyond $PATH -- local installs, Conductor.app, homebrew
const EXTRA_BIN_DIRS = [
  "/usr/local/bin",
  "/opt/homebrew/bin",
  "/Applications/Conductor.app/Contents/Resources/bin",
];

export interface DetectedCLI {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
  path?: string;
}

function tryExec(cmd: string): string | null {
  try {
    return execSync(cmd, { stdio: "pipe", timeout: 2000 }).toString().trim();
  } catch {
    return null;
  }
}

function trySpawn(bin: string, args: string[]): string | null {
  try {
    const result = spawnSync(bin, args, { stdio: "pipe", timeout: 2000, encoding: "utf-8" });
    if (result.error || result.status !== 0) return null;
    return result.stdout?.trim() ?? null;
  } catch {
    return null;
  }
}

/** Resolve the binary path for a tool -- checks $PATH then fallback directories */
function resolveBinPath(bin: string, projectDir?: string): string | null {
  // 1. `which` covers $PATH -- use spawnSync to avoid shell injection
  const whichResult = trySpawn("which", [bin]);
  if (whichResult) return whichResult;

  // 2. Project-local node_modules
  if (projectDir) {
    const localBin = join(projectDir, "node_modules", ".bin", bin);
    if (existsSync(localBin)) return localBin;
  }

  // 3. Fallback directories
  for (const dir of EXTRA_BIN_DIRS) {
    const fullPath = join(dir, bin);
    if (existsSync(fullPath)) return fullPath;
  }

  return null;
}

/** Extract version string -- strips common prefixes like "v" or tool names */
function extractVersion(raw: string): string {
  // Many CLIs output "tool-name 1.2.3" or "v1.2.3" or just "1.2.3"
  const lines = raw.split("\n");
  const first = lines[0].trim();
  const versionMatch = first.match(/(\d+\.\d+[\w.+-]*)/);
  return versionMatch ? versionMatch[1] : first.slice(0, 40);
}

/** Detect all known AI CLI tools on this system */
export function detectCLIs(projectDir?: string): DetectedCLI[] {
  return CLI_TOOLS.map((tool) => {
    const binPath = resolveBinPath(tool.bin, projectDir);
    if (!binPath) {
      return { id: tool.id, name: tool.name, installed: false };
    }

    const versionRaw = trySpawn(binPath, [tool.versionFlag]);
    const version = versionRaw ? extractVersion(versionRaw) : undefined;

    return { id: tool.id, name: tool.name, installed: true, version, path: binPath };
  });
}

/** Quick check returning just the IDs of installed tools (used by loadProviders) */
function detectInstalledCLIs(): Set<string> {
  const detected = new Set<string>();
  for (const result of detectCLIs()) {
    if (result.installed) detected.add(result.id);
  }
  // Also check env vars as fallback signals
  if (process.env.OPENAI_API_KEY) detected.add("codex");
  if (process.env.ANTHROPIC_API_KEY) detected.add("claude");
  return detected;
}

export interface ProviderConfig {
  id: string;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
}

export interface ProvidersStore {
  active: string;
  model: string;
  providers: ProviderConfig[];
}

const DEFAULT_STORE: ProvidersStore = {
  active: "claude",
  model: "claude-opus-4-5-20251001",
  providers: [
    // CLI tools (spawn a process)
    { id: "claude",  name: "Claude Code",     enabled: true },
    { id: "codex",   name: "Codex (OpenAI)",  enabled: false },
    // API providers (streaming HTTP)
    { id: "anthropic", name: "Anthropic",      enabled: false },
    { id: "openai",    name: "OpenAI",         enabled: false },
    { id: "google",    name: "Google Gemini",  enabled: false },
    { id: "groq",      name: "Groq",           enabled: false },
    { id: "deepseek",  name: "DeepSeek",       enabled: false },
    { id: "mistral",   name: "Mistral",        enabled: false },
    { id: "grok",      name: "xAI Grok",       enabled: false },
    { id: "openrouter", name: "OpenRouter",    enabled: false },
    { id: "together",  name: "Together AI",    enabled: false },
    { id: "fireworks", name: "Fireworks AI",   enabled: false },
    { id: "ollama",    name: "Ollama", baseUrl: "http://localhost:11434", enabled: false },
  ],
};

export function loadProviders(dataDir: string): ProvidersStore {
  const filePath = join(dataDir, "providers.json");
  if (!existsSync(filePath)) {
    const store = structuredClone(DEFAULT_STORE);
    const detected = detectInstalledCLIs();
    store.providers = store.providers.map(p =>
      detected.has(p.id) ? { ...p, enabled: true } : p
    );
    return store;
  }
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ProvidersStore>;
    // Merge with defaults to handle missing providers in saved config
    const providerIds = new Set((parsed.providers ?? []).map(p => p.id));
    const merged: ProvidersStore = {
      active: parsed.active ?? DEFAULT_STORE.active,
      model: parsed.model ?? DEFAULT_STORE.model,
      providers: [
        ...(parsed.providers ?? []),
        ...DEFAULT_STORE.providers.filter(p => !providerIds.has(p.id)),
      ],
    };
    return merged;
  } catch {
    return structuredClone(DEFAULT_STORE);
  }
}

export function saveProviders(dataDir: string, store: ProvidersStore): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const filePath = join(dataDir, "providers.json");
  writeFileSync(filePath, JSON.stringify(store, null, 2), { encoding: "utf-8", mode: 0o600 });
}
