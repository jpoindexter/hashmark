/**
 * Multi-Format Generator
 *
 * One scan, every format. The core product differentiator.
 * Takes ScanResult and produces context files for every AI coding tool.
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

/** All supported formats with metadata */
export const FORMAT_REGISTRY: Record<FormatId, { tool: string; path: string; description: string }> = {
  "agents-md": {
    tool: "Universal (Cursor, Copilot, Gemini, Zed, 20+)",
    path: "AGENTS.md",
    description: "Universal AI context file (AAIF standard)",
  },
  "claude-md": {
    tool: "Claude Code",
    path: "CLAUDE.md",
    description: "Claude Code project instructions",
  },
  "cursorrules": {
    tool: "Cursor (legacy)",
    path: ".cursorrules",
    description: "Cursor AI rules (legacy single-file format)",
  },
  "cursor-mdc": {
    tool: "Cursor (new)",
    path: ".cursor/rules/",
    description: "Cursor AI rules (new MDC format, split by domain)",
  },
  "copilot-md": {
    tool: "GitHub Copilot",
    path: ".github/copilot-instructions.md",
    description: "GitHub Copilot custom instructions",
  },
  "windsurf-rules": {
    tool: "Windsurf (Codeium)",
    path: ".windsurfrules",
    description: "Windsurf AI rules",
  },
  "gemini-md": {
    tool: "Google Gemini CLI",
    path: "GEMINI.md",
    description: "Google Gemini CLI context",
  },
  "cline-rules": {
    tool: "Cline / Roo Code",
    path: ".clinerules",
    description: "Cline and Roo Code project rules",
  },
};

/** Options for format generation */
export interface FormatOptions {
  /** Custom rules to inject into generated files */
  customRules?: string[];
  /** Generator options (compact, etc.) */
  generatorOptions?: GeneratorOptions;
}

/**
 * Generate a single format
 */
export function generateFormat(
  format: FormatId,
  scan: ScanResult,
  options: FormatOptions = {},
): GeneratedFile {
  const meta = FORMAT_REGISTRY[format];
  const { customRules = [], generatorOptions = {} } = options;

  let content: string;

  switch (format) {
    case "agents-md":
      content = generateAgentsMd(scan, generatorOptions);
      break;
    case "claude-md":
      content = generateClaudeMd(scan, customRules);
      break;
    case "cursorrules":
      content = generateCursorRules(scan, customRules);
      break;
    case "cursor-mdc":
      // For MDC, we return the main rules file; individual files handled by generateAllCursorMdc
      content = generateCursorMdc(scan, customRules).map(f => `--- ${f.path} ---\n${f.content}`).join("\n\n");
      break;
    case "copilot-md":
      content = generateCopilotMd(scan, customRules);
      break;
    case "windsurf-rules":
      content = generateWindsurfRules(scan, customRules);
      break;
    case "gemini-md":
      content = generateGeminiMd(scan, customRules);
      break;
    case "cline-rules":
      content = generateClineRules(scan, customRules);
      break;
  }

  return {
    format,
    path: meta.path,
    content,
    tool: meta.tool,
  };
}

/**
 * Generate ALL formats from a single scan result.
 * The core product: one scan, every format.
 */
export function generateAllFormats(
  scan: ScanResult,
  options: FormatOptions = {},
): GeneratedFile[] {
  const formats: FormatId[] = [
    "agents-md",
    "claude-md",
    "cursorrules",
    "copilot-md",
    "windsurf-rules",
    "gemini-md",
    "cline-rules",
  ];

  const files: GeneratedFile[] = formats.map(f => generateFormat(f, scan, options));

  // Add cursor MDC files individually (they're split into multiple files)
  const mdcFiles = generateCursorMdc(scan, options.customRules || []);
  for (const mdc of mdcFiles) {
    files.push({
      format: "cursor-mdc",
      path: mdc.path,
      content: mdc.content,
      tool: "Cursor (new)",
    });
  }

  return files;
}

export { generateClaudeMd } from "./claude-md.js";
export { generateCursorRules } from "./cursor-rules.js";
export { generateCursorMdc } from "./cursor-mdc.js";
export { generateCopilotMd } from "./copilot-md.js";
export { generateWindsurfRules } from "./windsurf-rules.js";
export { generateGeminiMd } from "./gemini-md.js";
export { generateClineRules } from "./cline-rules.js";
