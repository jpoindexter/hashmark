/**
 * Multi-Format Generator
 *
 * One scan, every format. The core product differentiator.
 *
 * Architecture: pluggable adapter pattern.
 * Each format is a self-describing `FormatAdapter` that carries its own
 * metadata and generate() method. Adding a new format requires only
 * creating an adapter and adding it to ADAPTERS — no switch statements,
 * no FormatId union edits, no scattered registration across four call sites.
 *
 * @module formats
 */

import type { ScanResult } from "../types.js";
import { generateAgentsMd, type GeneratorOptions } from "../generator.js";
import { generateClaudeMd } from "./claude-md.js";
import { generateCursorRules } from "./cursor-rules.js";
import { generateCursorMdc } from "./cursor-mdc.js";
import { generateCopilotMd } from "./copilot-md.js";
import { generateWindsurfRules } from "./windsurf-rules.js";
import { generateGeminiMd } from "./gemini-md.js";
import { generateClineRules } from "./cline-rules.js";

/** Supported output format identifiers */
export type FormatId =
  | "agents-md"
  | "claude-md"
  | "cursorrules"
  | "cursor-mdc"
  | "copilot-md"
  | "windsurf-rules"
  | "gemini-md"
  | "cline-rules";

/** A generated output file */
export interface GeneratedFile {
  /** Format identifier */
  format: FormatId;
  /** Output file path relative to project root */
  path: string;
  /** File content */
  content: string;
  /** AI tool this file targets */
  tool: string;
}

/** Options passed to every format adapter */
export interface FormatOptions {
  /** Custom rules to inject into generated files */
  customRules?: string[];
  /** Generator options (compact, etc.) */
  generatorOptions?: GeneratorOptions;
}

/**
 * Pluggable format adapter interface.
 *
 * Each adapter is self-describing: it carries its own id, metadata, and
 * generate() method. To add a new format, implement this interface and
 * add an instance to ADAPTERS — nothing else needs to change.
 */
export interface FormatAdapter {
  readonly id: FormatId;
  readonly tool: string;
  readonly description: string;
  /**
   * Generate one or more output files for this format.
   * Most formats return a single file. Formats like cursor-mdc that split
   * output across multiple files return an array.
   */
  generate(scan: ScanResult, options: FormatOptions): GeneratedFile[];
}

// ---------------------------------------------------------------------------
// Adapter implementations
// ---------------------------------------------------------------------------

const agentsMdAdapter: FormatAdapter = {
  id: "agents-md",
  tool: "Universal (Cursor, Copilot, Gemini, Zed, 20+)",
  description: "Universal AI context file (AAIF standard)",
  generate(scan, { generatorOptions = {} }) {
    return [{ format: this.id, path: "AGENTS.md", tool: this.tool, content: generateAgentsMd(scan, generatorOptions) }];
  },
};

const claudeMdAdapter: FormatAdapter = {
  id: "claude-md",
  tool: "Claude Code",
  description: "Claude Code project instructions",
  generate(scan, { customRules = [] }) {
    return [{ format: this.id, path: "CLAUDE.md", tool: this.tool, content: generateClaudeMd(scan, customRules) }];
  },
};

const cursorRulesAdapter: FormatAdapter = {
  id: "cursorrules",
  tool: "Cursor (legacy)",
  description: "Cursor AI rules (legacy single-file format)",
  generate(scan, { customRules = [] }) {
    return [{ format: this.id, path: ".cursorrules", tool: this.tool, content: generateCursorRules(scan, customRules) }];
  },
};

const cursorMdcAdapter: FormatAdapter = {
  id: "cursor-mdc",
  tool: "Cursor (new)",
  description: "Cursor AI rules (new MDC format, split by domain)",
  generate(scan, { customRules = [] }) {
    return generateCursorMdc(scan, customRules).map(f => ({
      format: this.id,
      path: f.path,
      tool: this.tool,
      content: f.content,
    }));
  },
};

const copilotMdAdapter: FormatAdapter = {
  id: "copilot-md",
  tool: "GitHub Copilot",
  description: "GitHub Copilot custom instructions",
  generate(scan, { customRules = [] }) {
    return [{ format: this.id, path: ".github/copilot-instructions.md", tool: this.tool, content: generateCopilotMd(scan, customRules) }];
  },
};

const windsurfRulesAdapter: FormatAdapter = {
  id: "windsurf-rules",
  tool: "Windsurf (Codeium)",
  description: "Windsurf AI rules",
  generate(scan, { customRules = [] }) {
    return [{ format: this.id, path: ".windsurfrules", tool: this.tool, content: generateWindsurfRules(scan, customRules) }];
  },
};

const geminiMdAdapter: FormatAdapter = {
  id: "gemini-md",
  tool: "Google Gemini CLI",
  description: "Google Gemini CLI context",
  generate(scan, { customRules = [] }) {
    return [{ format: this.id, path: "GEMINI.md", tool: this.tool, content: generateGeminiMd(scan, customRules) }];
  },
};

const clineRulesAdapter: FormatAdapter = {
  id: "cline-rules",
  tool: "Cline / Roo Code",
  description: "Cline and Roo Code project rules",
  generate(scan, { customRules = [] }) {
    return [{ format: this.id, path: ".clinerules", tool: this.tool, content: generateClineRules(scan, customRules) }];
  },
};

// ---------------------------------------------------------------------------
// Registry: the single source of truth for all formats
// ---------------------------------------------------------------------------

/** All registered format adapters, in display order. */
export const ADAPTERS: FormatAdapter[] = [
  agentsMdAdapter,
  claudeMdAdapter,
  cursorRulesAdapter,
  cursorMdcAdapter,
  copilotMdAdapter,
  windsurfRulesAdapter,
  geminiMdAdapter,
  clineRulesAdapter,
];

/** Map from FormatId to adapter for O(1) lookup. Built from ADAPTERS. */
const ADAPTER_MAP = new Map<FormatId, FormatAdapter>(ADAPTERS.map(a => [a.id, a]));

/**
 * Legacy metadata registry — kept for backwards compatibility with callers
 * that read FORMAT_REGISTRY[id].{tool,path,description}.
 * Path is the primary output path (for multi-file formats, the containing dir).
 */
export const FORMAT_REGISTRY: Record<FormatId, { tool: string; path: string; description: string }> = Object.fromEntries(
  ADAPTERS.map(a => [
    a.id,
    {
      tool: a.tool,
      description: a.description,
      // Primary path: first file generated by a dry-run adapter call with empty scan.
      // We store this statically to avoid side effects at import time.
      path: {
        "agents-md": "AGENTS.md",
        "claude-md": "CLAUDE.md",
        "cursorrules": ".cursorrules",
        "cursor-mdc": ".cursor/rules/",
        "copilot-md": ".github/copilot-instructions.md",
        "windsurf-rules": ".windsurfrules",
        "gemini-md": "GEMINI.md",
        "cline-rules": ".clinerules",
      }[a.id] as string,
    },
  ])
) as Record<FormatId, { tool: string; path: string; description: string }>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a single format. Returns an array because some formats (cursor-mdc)
 * produce multiple files. For single-file formats this is always length 1.
 */
export function generateFormat(
  format: FormatId,
  scan: ScanResult,
  options: FormatOptions = {},
): GeneratedFile {
  const adapter = ADAPTER_MAP.get(format);
  if (!adapter) throw new Error(`Unknown format: ${format}`);
  const files = adapter.generate(scan, options);
  // Return the first file for API compatibility; callers wanting all files
  // for multi-file formats should use generateAllFormats or call the adapter directly.
  return files[0];
}

/**
 * Generate ALL formats from a single scan result.
 * The core product: one scan, every format.
 */
export function generateAllFormats(
  scan: ScanResult,
  options: FormatOptions = {},
): GeneratedFile[] {
  return ADAPTERS.flatMap(adapter => adapter.generate(scan, options));
}

export { generateClaudeMd } from "./claude-md.js";
export { generateCursorRules } from "./cursor-rules.js";
export { generateCursorMdc } from "./cursor-mdc.js";
export { generateCopilotMd } from "./copilot-md.js";
export { generateWindsurfRules } from "./windsurf-rules.js";
export { generateGeminiMd } from "./gemini-md.js";
export { generateClineRules } from "./cline-rules.js";
