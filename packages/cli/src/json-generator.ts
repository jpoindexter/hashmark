/**
 * JSON Index Generator
 *
 * Generates AGENTS.index.json - a machine-readable companion file
 * to AGENTS.md. Useful for programmatic access to component data.
 *
 * Used with the --json flag: hashmark --json
 *
 * @module json-generator
 */

import type { ScanResult, ExistingContext, AIRecommendations } from "./types.js";
import { estimateTokens } from "./utils/tokens.js";
import { extractRulesFromContent } from "./scanners/existing-context.js";

/** Structure of the AGENTS.index.json file */
export interface AgentsIndex {
  /** Schema version */
  version: string;
  /** ISO timestamp of generation */
  generated: string;
  /** Project metadata */
  project: {
    framework: string;
    language: string;
    styling?: string;
  };
  /** Codebase statistics */
  stats: {
    components: number;
    hooks: number;
    routes: number;
    models: number;
    files: number;
    lines: number;
    tokens: number;
  };
  /** Component list with metadata */
  components: Array<{
    name: string;
    path: string;
    exports: string[];
    props?: string[];
    description?: string;
    complexity?: {
      propCount: number;
      importCount: number;
      lineCount: number;
      hasState: boolean;
      hasEffects: boolean;
      hasContext: boolean;
    };
  }>;
  /** Custom hooks */
  hooks: Array<{
    name: string;
    path: string;
    clientOnly: boolean;
  }>;
  /** API routes */
  routes: Array<{
    path: string;
    methods: string[];
    protected: boolean;
  }>;
  /** Database models */
  models: Array<{
    name: string;
    fields: string[];
    relations: string[];
  }>;
  /** Barrel exports for cleaner imports */
  barrels: Array<{
    path: string;
    exports: string[];
  }>;
  /** Rules extracted from existing context files */
  existingRules?: Array<{
    source: string;
    rules: string[];
  }>;
  /** AI automation hooks */
  latentHooks?: Array<{
    event: string;
    command: string;
    description?: string;
    pattern?: string;
  }>;
  /** AI readiness score */
  aiReadiness?: {
    total: number;
    breakdown: Record<string, number>;
    recommendations: string[];
  };
  /** AST-based complexity analysis */
  complexity?: {
    topFunctions: Array<{
      name: string;
      file: string;
      line: number;
      cyclomatic: number;
      cognitive: number;
      halstead: { volume: number; effort: number; estimatedBugs: number };
      maintainabilityIndex: number;
    }>;
    fileScores: Array<{
      path: string;
      score: number;
      level: string;
      maintainabilityIndex?: number;
    }>;
  };
}

/**
 * Generates JSON index from scan results
 *
 * @param result - Complete scan results
 * @param markdownContent - Generated markdown content (for token count)
 * @returns JSON string of the index
 */
export function generateAgentsIndex(result: ScanResult, markdownContent: string): string {
  const { components, framework, hooks, apiRoutes, database, stats, barrels, existingContext, aiRecommendations, latentHooks, aiReadiness } = result;

  const index: AgentsIndex = {
    version: "1.0",
    generated: new Date().toISOString(),
    project: {
      framework: `${framework.name}${framework.version ? ` ${framework.version}` : ""}${framework.router ? ` (${framework.router})` : ""}`,
      language: framework.language,
      ...(framework.styling && { styling: framework.styling }),
    },
    stats: {
      components: components.length,
      hooks: hooks.length,
      routes: apiRoutes.length,
      models: database?.models.length || 0,
      files: stats.totalFiles,
      lines: stats.totalLines,
      tokens: estimateTokens(markdownContent),
    },
    components: components.map(c => ({
      name: c.name,
      path: c.importPath,
      exports: c.exports,
      ...(c.props && { props: c.props }),
      ...(c.description && { description: c.description }),
      ...(c.complexity && { complexity: c.complexity }),
    })),
    hooks: hooks.map(h => ({
      name: h.name,
      path: h.importPath,
      clientOnly: h.isClientOnly,
    })),
    routes: apiRoutes.map(r => ({
      path: r.path,
      methods: r.methods,
      protected: r.isProtected,
    })),
    models: database?.models.map(m => ({
      name: m.name,
      fields: m.fields,
      relations: m.relations,
    })) || [],
    barrels: barrels.map(b => ({
      path: b.importPath,
      exports: b.exports.filter(e => !e.startsWith("*")),
    })),
    ...(latentHooks && latentHooks.length > 0 && {
      latentHooks: latentHooks.map(h => ({
        event: h.event,
        command: h.command,
        ...(h.description && { description: h.description }),
        ...(h.pattern && { pattern: h.pattern }),
      })),
    }),
    ...(aiReadiness && {
      aiReadiness,
    }),
    ...(existingContext.allRules.length > 0 && {
      existingRules: buildExistingRulesSources(existingContext),
    }),
    ...(aiRecommendations && {
      complexity: buildComplexityData(aiRecommendations),
    }),
  };

  return JSON.stringify(index, null, 2);
}

/** Build per-source rules list for the JSON index */
function buildExistingRulesSources(ctx: ExistingContext): Array<{ source: string; rules: string[] }> {
  const sources: Array<{ source: string; rules: string[] }> = [];

  if (ctx.claudeMdContent) {
    const rules = extractRulesFromContent(ctx.claudeMdContent);
    if (rules.length > 0) sources.push({ source: "CLAUDE.md", rules });
  }
  if (ctx.cursorRulesContent) {
    const rules = extractRulesFromContent(ctx.cursorRulesContent);
    if (rules.length > 0) sources.push({ source: ".cursorrules", rules });
  }
  if (ctx.windsurfRulesContent) {
    const rules = extractRulesFromContent(ctx.windsurfRulesContent);
    if (rules.length > 0) sources.push({ source: ".windsurfrules", rules });
  }
  if (ctx.clineRulesContent) {
    const rules = extractRulesFromContent(ctx.clineRulesContent);
    if (rules.length > 0) sources.push({ source: ".clinerules", rules });
  }
  if (ctx.geminiMdContent) {
    const rules = extractRulesFromContent(ctx.geminiMdContent);
    if (rules.length > 0) sources.push({ source: "GEMINI.md", rules });
  }
  if (ctx.copilotInstructionsContent) {
    const rules = extractRulesFromContent(ctx.copilotInstructionsContent);
    if (rules.length > 0) sources.push({ source: "copilot-instructions.md", rules });
  }

  return sources;
}

/** Build complexity data for the JSON index from AI recommendations */
function buildComplexityData(ai: AIRecommendations): AgentsIndex["complexity"] {
  const allFunctions = ai.complexFiles
    .flatMap((f) =>
      (f.functions ?? []).map((fn) => ({
        name: fn.name,
        file: f.path,
        line: fn.startLine,
        cyclomatic: fn.cyclomatic,
        cognitive: fn.cognitive,
        halstead: {
          volume: fn.halstead.volume,
          effort: fn.halstead.effort,
          estimatedBugs: fn.halstead.estimatedBugs,
        },
        maintainabilityIndex: fn.maintainabilityIndex,
      }))
    )
    .sort((a, b) => b.cognitive - a.cognitive)
    .slice(0, 20);

  const fileScores = ai.complexFiles.map((f) => ({
    path: f.path,
    score: f.score,
    level: f.level,
    maintainabilityIndex: f.maintainabilityIndex,
  }));

  return { topFunctions: allFunctions, fileScores };
}
