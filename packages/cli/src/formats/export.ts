/**
 * Export formats for hashmark scan results.
 *
 * Three modes:
 *   openai-system-prompt — plain text, no markdown, for direct system prompt injection
 *   json                 — structured JSON with named sections
 *   token-budget         — standard claude-md output truncated to fit a token budget
 *
 * @module formats/export
 */

import type { ScanResult } from "../types.js";
import { generateClaudeMd } from "./claude-md.js";

export type ExportFormat = "openai-system-prompt" | "json" | "token-budget";

export interface ExportOptions {
  format: ExportFormat;
  budgetTokens?: number;
}

export function exportContext(scan: ScanResult, opts: ExportOptions): string {
  switch (opts.format) {
    case "openai-system-prompt": return exportAsSystemPrompt(scan);
    case "json": return exportAsJson(scan);
    case "token-budget": return exportWithBudget(scan, opts.budgetTokens ?? 50000);
    default: throw new Error(`Unknown export format: ${(opts as ExportOptions).format}`);
  }
}

// ============================================================================
// openai-system-prompt
// ============================================================================

function exportAsSystemPrompt(scan: ScanResult): string {
  const { framework, commands, components, apiRoutes, importGraph, existingContext, stats, database } = scan;

  const lines: string[] = [];

  // Header line
  const stackParts: string[] = [];
  if (framework.name !== "Unknown") {
    stackParts.push(framework.version ? `${framework.name} ${framework.version}` : framework.name);
  }
  if (framework.router) stackParts.push(framework.router);
  if (framework.language) stackParts.push(framework.language);
  if (framework.styling) stackParts.push(framework.styling);
  if (database) stackParts.push(`${database.provider} (${database.models.length} models)`);

  lines.push(
    [
      stats ? `FILES: ${stats.totalFiles}` : null,
      stats ? `LINES: ${stats.totalLines.toLocaleString()}` : null,
      stackParts.length ? `STACK: ${stackParts.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" | ")
  );
  lines.push("");

  // Tech stack section
  if (stackParts.length > 0) {
    lines.push("TECH STACK");
    lines.push(stackParts.join(", "));
    lines.push("");
  }

  // Hub files
  if (importGraph && importGraph.hubFiles.length > 0) {
    lines.push("KEY FILES (edit carefully)");
    for (const hub of importGraph.hubFiles.slice(0, 10)) {
      lines.push(`${hub.file} (${hub.importedByCount} dependents)`);
    }
    lines.push("");
  }

  // Commands
  const cmdLines: string[] = [];
  if (commands.dev) cmdLines.push(`dev: ${commands.dev}`);
  if (commands.build) cmdLines.push(`build: ${commands.build}`);
  if (commands.test) cmdLines.push(`test: ${commands.test}`);
  if (commands.lint) cmdLines.push(`lint: ${commands.lint}`);
  if (commands.typecheck) cmdLines.push(`typecheck: ${commands.typecheck}`);
  if (cmdLines.length > 0) {
    lines.push("COMMANDS");
    for (const c of cmdLines) lines.push(c);
    lines.push("");
  }

  // Rules
  const rules = collectRules(scan);
  if (rules.length > 0) {
    lines.push("RULES");
    for (const rule of rules) lines.push(`- ${rule}`);
    lines.push("");
  }

  // API routes
  if (apiRoutes.length > 0) {
    lines.push("API ROUTES");
    for (const route of apiRoutes.slice(0, 20)) {
      const methods = route.methods.join(", ");
      const auth = route.isProtected ? " [auth]" : "";
      lines.push(`${methods} ${route.path}${auth}`);
    }
    lines.push("");
  }

  // Components
  if (components.length > 0) {
    lines.push("COMPONENTS");
    const grouped: Record<string, string[]> = {};
    for (const comp of components) {
      const parts = comp.path.split("/");
      parts.pop();
      const dir = parts.pop() || "root";
      if (!grouped[dir]) grouped[dir] = [];
      grouped[dir].push(comp.name);
    }
    for (const [dir, names] of Object.entries(grouped)) {
      lines.push(`${dir.toUpperCase()}: ${names.join(", ")}`);
    }
    lines.push("");
  }

  // Database models
  if (database && database.models.length > 0) {
    lines.push("DATABASE MODELS");
    for (const model of database.models.slice(0, 15)) {
      const fields = model.fields.slice(0, 5).join(", ");
      const more = model.fields.length > 5 ? ` +${model.fields.length - 5}` : "";
      lines.push(`${model.name}: ${fields}${more}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

// ============================================================================
// json
// ============================================================================

function exportAsJson(scan: ScanResult): string {
  const { framework, commands, components, apiRoutes, importGraph, existingContext, stats, database } = scan;

  const stackParts: string[] = [];
  if (framework.name !== "Unknown") {
    stackParts.push(framework.version ? `${framework.name} ${framework.version}` : framework.name);
  }
  if (framework.router) stackParts.push(framework.router);
  if (framework.language) stackParts.push(framework.language);
  if (framework.styling) stackParts.push(framework.styling);

  const hubFiles = (importGraph?.hubFiles ?? []).slice(0, 20).map(h => ({
    path: h.file,
    dependents: h.importedByCount,
  }));

  const componentNames = components.map(c => c.name);

  const routeList = apiRoutes.slice(0, 30).map(r => ({
    method: r.methods[0] ?? "GET",
    path: r.path,
    auth: r.isProtected,
  }));

  const rules = collectRules(scan);

  const out: Record<string, unknown> = {
    project: {
      stack: stackParts.join(" • "),
      fileCount: stats?.totalFiles ?? 0,
      lineCount: stats?.totalLines ?? 0,
    },
    commands: {
      dev: commands.dev ?? null,
      build: commands.build ?? null,
      test: commands.test ?? null,
      lint: commands.lint ?? null,
      typecheck: commands.typecheck ?? null,
    },
    hubFiles,
    components: componentNames,
    apiRoutes: routeList,
    rules,
    generatedAt: new Date().toISOString(),
  };

  if (database && database.models.length > 0) {
    out.database = {
      provider: database.provider,
      models: database.models.slice(0, 20).map(m => ({
        name: m.name,
        fields: m.fields.slice(0, 8),
      })),
    };
  }

  return JSON.stringify(out, null, 2);
}

// ============================================================================
// token-budget
// ============================================================================

function exportWithBudget(scan: ScanResult, budgetTokens: number): string {
  const full = generateClaudeMd(scan);
  if (estimateTokens(full) <= budgetTokens) return full;

  // Build sections we can strip, in drop-first order
  const stripped = stripSections(full, [
    // Section headings to drop, lowest priority first
    "Component Variants (CVA)",
    "AI Automation Hooks",
    "Design Tokens",
    "Known Patterns",
    "Components",
    "API Surface",
    "Complexity",
    "Custom Hooks",
  ], budgetTokens);

  return stripped;
}

/**
 * Iteratively removes markdown sections (## or ###) from lowest to highest
 * priority until the content fits within budgetTokens.
 */
function stripSections(content: string, sectionsToStrip: string[], budgetTokens: number): string {
  let result = content;

  for (const heading of sectionsToStrip) {
    if (estimateTokens(result) <= budgetTokens) break;
    result = removeSection(result, heading);
  }

  // Last resort: hard truncate
  if (estimateTokens(result) > budgetTokens) {
    const maxChars = budgetTokens * 4;
    result = result.slice(0, maxChars) + "\n\n[truncated to fit token budget]";
  }

  return result;
}

/**
 * Removes a markdown section (## or ### Heading) and all its content
 * up to the next section of the same or higher level.
 */
function removeSection(content: string, heading: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let inTarget = false;
  let targetLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      if (title === heading || title.startsWith(heading)) {
        inTarget = true;
        targetLevel = level;
        continue;
      }

      if (inTarget && level <= targetLevel) {
        inTarget = false;
      }
    }

    if (!inTarget) result.push(line);
  }

  return result.join("\n");
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

// ============================================================================
// Helpers
// ============================================================================

function collectRules(scan: ScanResult): string[] {
  const rules: string[] = [];
  const { framework, utilities, components } = scan;

  if (components.length > 0) {
    rules.push(`Check existing ${components.length} components before creating new ones`);
  }
  if (framework.name === "Next.js" && framework.router === "App Router") {
    rules.push("Prefer Server Components — only add 'use client' when needed");
    rules.push("Use next/image for images and next/link for navigation");
  }
  if (framework.language === "TypeScript") {
    rules.push("Never use any — use proper types or unknown");
  }
  if (framework.styling === "Tailwind CSS") {
    rules.push("Never use arbitrary values (w-[137px]) — use Tailwind scale values");
  }
  if (utilities.hasCn) {
    rules.push(`Use cn() from ${utilities.cnPath} for conditional classes`);
  }

  // Merge rules from existing context files
  if (scan.existingContext?.allRules) {
    for (const rule of scan.existingContext.allRules.slice(0, 10)) {
      const clean = rule.replace(/^[-*\s]+/, "").trim();
      if (clean.length > 10) rules.push(clean);
    }
  }

  return rules;
}
