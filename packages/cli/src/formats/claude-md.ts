/**
 * CLAUDE.md Generator
 *
 * Generates project instructions for Claude Code.
 * Claude Code reads CLAUDE.md from the project root for context.
 *
 * Focus areas:
 * - Commands (build, test, lint, dev)
 * - Critical rules (ALWAYS/NEVER directives)
 * - Architecture overview
 * - Key patterns and file structure
 *
 * @module formats/claude-md
 */

import type { ScanResult, ComplexityDelta } from "../types.js";
import type { ContextValidation, ValidationResult } from "../scanners/context-validator.js";
import { getStackPatternSections } from "../templates/stack-patterns.js";

function statusIcon(status: ValidationResult["status"]): string {
  switch (status) {
    case "pass": return "✅";
    case "warn": return "⚠️";
    case "fail": return "❌";
    case "skip": return "⏭️";
  }
}

function renderBuildHealth(validation: ContextValidation): string[] {
  const lines: string[] = [];
  lines.push("## Build Health");
  lines.push("");
  lines.push("> Auto-validated at scan time — reflects actual project state.");
  lines.push("");
  lines.push("| Check | Status | Detail |");
  lines.push("|-------|--------|--------|");
  for (const r of validation.results) {
    lines.push(`| ${r.check} | ${statusIcon(r.status)} ${r.status} | ${r.detail} |`);
  }
  lines.push("");
  return lines;
}

/** Returns a rationale annotation for a hub file based on heuristics. */
function hubRationale(file: string, importedByCount: number, scan: ScanResult): string {
  if (/auth|session|jwt|clerk/i.test(file)) return " — ⚠ Security-sensitive — changes need human review";
  if (/billing|stripe|payment|webhook/i.test(file)) return " — ⚠ Security-sensitive — changes need human review";

  if (scan.stats?.largestFiles) {
    const found = scan.stats.largestFiles.find(f => f.path === file || f.path.endsWith(file));
    if (found && found.lines > 500) return " — ⚠ High blast radius — keep edits focused";
  }

  if (scan.aiRecommendations?.complexFiles) {
    const cf = scan.aiRecommendations.complexFiles.find(f => f.path === file || f.path.endsWith(file));
    if (cf) {
      const funcs = cf.functions ?? [];
      if (funcs.some(fn => fn.cyclomatic > 15)) return " — ⚠ Complex branching — read full function before modifying";
      if ((cf.maintainabilityIndex ?? 100) < 40) return " — ⚠ Hard to reason about — prefer additive changes over rewrites";
    }
  }

  if (importedByCount > 10) return ` — ⚠ Changes here break ${importedByCount} downstream files`;
  return "";
}

/** Render complexity delta lines for embedding in the Complexity section. */
function renderComplexityDelta(delta: ComplexityDelta): string[] {
  const arrow = delta.trend === "degrading" ? "↑" : delta.trend === "improving" ? "↓" : "→";
  const cyclomaticSign = delta.avgCyclomaticDelta >= 0 ? "+" : "";
  const miSign = delta.maintainabilityDelta >= 0 ? "+" : "";
  const lines: string[] = [];
  lines.push(`Trend: ${arrow} ${delta.trend} (${cyclomaticSign}${delta.avgCyclomaticDelta} avg cyclomatic, ${miSign}${delta.maintainabilityDelta} MI)`);
  if (delta.topRegressions.length > 0) {
    const regList = delta.topRegressions
      .slice(0, 3)
      .map(r => `\`${r.file}\` (+${r.delta} ${r.metric})`)
      .join(", ");
    lines.push(`Top regressions: ${regList}`);
  }
  return lines;
}

/** Infer a risk class for the project based on what it handles */
function inferRiskClass(scan: ScanResult): "LOW" | "MEDIUM" | "HIGH" {
  const { database, apiRoutes, envVars } = scan;
  const hasAuth = apiRoutes.some(r => r.isProtected) ||
    envVars.some(e => /auth|clerk|jwt|session/i.test(e.name));
  const hasPayments = envVars.some(e => /stripe|payment|billing/i.test(e.name));
  const hasDb = !!database;
  if (hasPayments) return "HIGH";
  if (hasAuth && hasDb) return "MEDIUM";
  return "LOW";
}

/** Build a specialist routing table based on detected project shape */
function buildRoutingTable(scan: ScanResult): string[] {
  const rows: string[] = [];
  const { framework, database, apiRoutes } = scan;

  if (database) {
    rows.push(`- **DB changes** (\`*.prisma\`, \`migrations/**\`): Run \`npm run db:generate && npm run db:push\` — review schema diff before merging`);
  }
  if (framework.name === "Next.js") {
    rows.push(`- **Auth code** (\`src/lib/auth.*\`, \`app/api/auth/**\`): Auth specialist — check session handling, CSRF, token expiry`);
    rows.push(`- **Server Actions** (\`app/**/*.ts\` with \`'use server'\`): Validate inputs with Zod, never trust client data`);
    rows.push(`- **API routes** (\`app/api/**\`): Verify auth guards on every route — use middleware or explicit session check`);
  }
  if (apiRoutes.some(r => r.path.includes("billing") || r.path.includes("webhook"))) {
    rows.push(`- **Billing/webhooks** (\`*billing*\`, \`*webhook*\`): HIGH risk — verify idempotency, validate webhook signatures`);
  }
  rows.push(`- **UI components** (\`src/components/**\`): Check existing ${scan.components.length} components before adding new ones`);
  rows.push(`- **Config/deps** (\`package.json\`, \`tsconfig.json\`, \`next.config.*\`): Scope change carefully — affects entire build`);

  return rows;
}

/** Non-delegation zones: operations that must NOT be autonomously changed by an AI agent */
function buildNonDelegationZones(scan: ScanResult): string[] {
  const zones: string[] = [];
  const { apiRoutes, envVars, importGraph, stats } = scan;

  const hasMultiTenant = envVars.some(e => /org|tenant|team/i.test(e.name)) ||
    apiRoutes.some(r => /org|tenant/i.test(r.path));
  const hasAuth = apiRoutes.some(r => r.isProtected);
  const hasPayments = envVars.some(e => /stripe|payment/i.test(e.name));

  if (hasAuth) {
    zones.push("- **Auth & RBAC logic** — never modify permission checks, session handling, or token validation without human review");
  }
  if (hasMultiTenant) {
    zones.push("- **Tenant data isolation** — never change queries that scope by userId/orgId without explicit instruction");
  }
  if (hasPayments) {
    zones.push("- **Billing logic** — never modify price IDs, subscription state, or webhook handlers autonomously");
  }
  zones.push("- **Database migrations** — never run destructive migrations (`DROP`, `TRUNCATE`, column removal) without confirmation");
  zones.push("- **Secrets & credentials** — never log, expose, or commit env vars, API keys, or tokens");
  zones.push("- **Infrastructure config** — never change deployment configs, CI/CD pipelines, or domain settings unilaterally");

  // High-impact files from import graph (>10 dependents)
  if (importGraph && importGraph.hubFiles.length > 0) {
    const criticalHubs = importGraph.hubFiles.filter(h => h.importedByCount > 10);
    for (const hub of criticalHubs.slice(0, 4)) {
      zones.push(`- \`${hub.file}\` — ${hub.importedByCount} dependents, changes cascade widely`);
    }
  }

  // Path-pattern files from largest files list
  const sensitivePatterns = /auth|billing|payment|stripe|migration|seed|\.env/i;
  const knownPaths = new Set<string>();

  // Check API routes for sensitive path patterns
  for (const route of apiRoutes) {
    if (sensitivePatterns.test(route.path)) {
      const segment = route.path.split("/").filter(Boolean).slice(0, 3).join("/");
      if (!knownPaths.has(segment)) {
        knownPaths.add(segment);
        zones.push(`- \`${segment}/\` — sensitive route, verify auth guards and side effects`);
      }
    }
  }

  // Check largest files for sensitive names
  if (stats.largestFiles) {
    for (const f of stats.largestFiles) {
      if (sensitivePatterns.test(f.path) && !knownPaths.has(f.path)) {
        knownPaths.add(f.path);
        zones.push(`- \`${f.path}\` — sensitive file (${f.lines} lines), review changes carefully`);
      }
    }
  }

  return zones;
}

/** Delegation-safe zones: low blast-radius areas suitable for autonomous agent edits */
function buildDelegationSafeZones(scan: ScanResult): string[] {
  const zones: string[] = [];
  const { components, patterns, database } = scan;

  if (components.length > 0) {
    zones.push("- `src/components/` — UI components, low blast radius, easy to review");
  }
  if (patterns.hasVitest || patterns.hasJest || patterns.hasPlaywright) {
    zones.push("- `**/__tests__/`, `**/*.test.*`, `**/*.spec.*` — test files");
  }
  zones.push("- `docs/`, `*.md` — documentation");
  if (database) {
    zones.push("- `src/lib/` (non-auth utilities) — helpers and utilities with low coupling");
  }

  return zones;
}

/**
 * MWP Layer 0: lean routing document (~800 tokens)
 * Points agent to CONTEXT.md for architecture detail.
 * Ref: 2603.16021 — Model Workspace Protocol
 */
export function generateClaudeMdRouter(scan: ScanResult, customRules: string[] = []): string {
  const { framework, commands, database, components, envVars, apiRoutes, stats } = scan;
  const lines: string[] = [];
  const generatedAt = new Date().toISOString().split("T")[0];
  const riskClass = inferRiskClass(scan);

  lines.push("# CLAUDE.md");
  lines.push("");
  lines.push(`> Auto-generated by [hashmark](https://hashmark.md) — Project instructions for Claude Code`);
  lines.push(`> Generated: ${generatedAt} — re-run \`npx hashmark\` when the codebase changes significantly`);
  lines.push("");

  // Stack one-liner
  lines.push("## Project Overview");
  lines.push("");
  const stackParts: string[] = [];
  if (framework.name !== "Unknown") stackParts.push(framework.version ? `${framework.name} ${framework.version}` : framework.name);
  if (framework.router) stackParts.push(framework.router);
  if (framework.language === "TypeScript") stackParts.push(framework.versions?.typescript ? `TypeScript ${framework.versions.typescript}` : "TypeScript");
  if (framework.styling) stackParts.push(framework.styling);
  if (database) stackParts.push(`${database.provider} (${database.models.length} models)`);
  lines.push(`**Stack**: ${stackParts.join(" • ")}`);
  if (stats) {
    const compInfo = components.length > 0 ? `, ${components.length} components` : "";
    lines.push(`**Codebase**: ${stats.totalFiles} files, ${stats.totalLines.toLocaleString()} lines${compInfo}`);
  }
  lines.push("");

  // Commands (critical — always needed)
  lines.push("## Commands");
  lines.push("");
  lines.push("```bash");
  if (commands.dev) lines.push(`npm run dev`);
  if (commands.build) lines.push(`npm run build`);
  if (commands.test) lines.push(`npm test`);
  if (commands.lint) lines.push(`npm run lint`);
  if (commands.typecheck) lines.push(`npm run typecheck`);
  if (commands.db && Object.keys(commands.db).length > 0) {
    for (const [name] of Object.entries(commands.db)) lines.push(`npm run ${name}`);
  }
  lines.push("```");
  lines.push("");

  // Governance (compact)
  lines.push("## Agent Governance");
  lines.push("");
  lines.push(`**Risk**: ${riskClass}`);
  const toolList = ["Read", "Edit", "Write", "Grep", "Glob", "Bash (safe)"];
  if (commands.test) toolList.push("Bash (npm test)");
  if (commands.lint) toolList.push("Bash (npm run lint)");
  lines.push(`**Permitted**: ${toolList.join(", ")}`);
  lines.push(`**Confirm first**: migrations, git push, billing changes, destructive ops`);
  lines.push("");

  // Routing table (compact)
  const routingRows = buildRoutingTable(scan);
  if (routingRows.length > 0) {
    lines.push("## Routing");
    lines.push("");
    for (const row of routingRows) lines.push(row);
    lines.push("");
  }

  // Non-delegation (compact)
  const zones = buildNonDelegationZones(scan);
  if (zones.length > 0) {
    lines.push("## Non-Delegation Zones");
    lines.push("");
    for (const zone of zones) lines.push(zone);
    lines.push("");
  }

  // Delegation-safe zones (compact)
  const safeZones = buildDelegationSafeZones(scan);
  if (safeZones.length > 0) {
    lines.push("## Delegation-Safe Zones");
    lines.push("");
    for (const zone of safeZones) lines.push(zone);
    lines.push("");
  }

  // Critical rules (compact — top 6 max)
  lines.push("## Critical Rules");
  lines.push("");
  const rules: string[] = [];
  if (components.length > 0) rules.push(`**ALWAYS** check existing ${components.length} components before creating new ones`);
  if (framework.name === "Next.js" && framework.router === "App Router") {
    rules.push("**Prefer** Server Components — only add `'use client'` when needed");
    rules.push("**ALWAYS** use `next/image` for images and `next/link` for navigation");
  }
  if (framework.language === "TypeScript") rules.push("**NEVER** use `any` — use `unknown` or proper types");
  if (framework.styling === "Tailwind CSS") rules.push("**NEVER** use arbitrary values (`w-[137px]`) — use Tailwind scale");
  for (const rule of customRules.slice(0, 3)) rules.push(rule);
  for (const rule of rules.slice(0, 6)) lines.push(`- ${rule}`);
  lines.push("");

  // Context pointer (the MWP key: tell agent where to find detail)
  lines.push("## Context Files");
  lines.push("");
  lines.push("- **CONTEXT.md** — full architecture, components, hooks, API routes, DB models, patterns");
  if (envVars.filter(e => e.required).length > 0) {
    lines.push("- **CONTEXT.md#environment-variables** — required env vars");
  }
  if (apiRoutes.length > 0) {
    lines.push("- **CONTEXT.md#api-routes** — full route list with auth flags");
  }
  lines.push("");
  lines.push("> Read CONTEXT.md when you need architectural detail. CLAUDE.md is routing only.");
  lines.push("");

  return lines.join("\n");
}

/**
 * MWP Layer 1: detailed project context document
 * Architecture, components, hooks, routes, models, patterns.
 * Ref: 2603.16021 — Model Workspace Protocol
 */
export function generateContextMd(scan: ScanResult): string {
  const { components, framework, hooks, utilities, apiRoutes, envVars, patterns, database, stats, importGraph, barrels, variants, latentHooks } = scan;
  const lines: string[] = [];

  lines.push("# CONTEXT.md");
  lines.push("");
  lines.push("> Full project context for Claude Code. Read this when you need architectural detail.");
  lines.push("> Auto-generated by [hashmark](https://hashmark.md)");
  lines.push("");

  // Key imports
  if (utilities.hasCn || utilities.hasMode || barrels.length > 0) {
    lines.push("## Key Imports");
    lines.push("");
    lines.push("```typescript");
    if (utilities.hasCn) lines.push(`import { cn } from "${utilities.cnPath}";`);
    if (utilities.hasMode) lines.push(`import { mode } from "${utilities.modePath}";`);
    for (const barrel of barrels.slice(0, 3)) {
      const exports = barrel.exports.filter(e => !e.startsWith("*")).slice(0, 3).join(", ");
      if (exports) lines.push(`import { ${exports} } from "${barrel.importPath}";`);
    }
    lines.push("```");
    lines.push("");
  }

  // High-impact files
  if (importGraph && importGraph.hubFiles.length > 0) {
    lines.push("## High-Impact Files");
    lines.push("");
    lines.push("Changes to these files affect many dependents — edit carefully:");
    lines.push("");
    for (const hub of importGraph.hubFiles.slice(0, 6)) {
      const rationale = hubRationale(hub.file, hub.importedByCount, scan);
      lines.push(`- \`${hub.file}\` (${hub.importedByCount} dependents)${rationale}`);
    }
    lines.push("");
  }

  // Complexity section (with delta if available)
  if (scan.aiRecommendations?.complexFiles && scan.aiRecommendations.complexFiles.length > 0) {
    const hasCompl = scan.aiRecommendations.complexFiles.some(
      f => (f.functions ?? []).some(fn => fn.cyclomatic > 10 || fn.cognitive > 15)
    );
    if (hasCompl) {
      const deltaTitle = scan.complexityDelta ? " (vs last scan)" : "";
      lines.push(`## Complexity${deltaTitle}`);
      lines.push("");
      if (scan.complexityDelta) {
        for (const l of renderComplexityDelta(scan.complexityDelta)) lines.push(l);
        lines.push("");
      }
      const topComplex = scan.aiRecommendations.complexFiles.slice(0, 5);
      for (const cf of topComplex) {
        const funcs = cf.functions ?? [];
        const maxCC = funcs.reduce((m, fn) => Math.max(m, fn.cyclomatic), 0);
        const mi = cf.maintainabilityIndex ?? 100;
        let rationale = "";
        if (funcs.some(fn => fn.cyclomatic > 15)) rationale = " — ⚠ Complex branching — read full function before modifying";
        else if (mi < 40) rationale = " — ⚠ Hard to reason about — prefer additive changes over rewrites";
        lines.push(`- \`${cf.path}\` (CC: ${maxCC}, MI: ${Math.round(mi)})${rationale}`);
      }
      lines.push("");
    }
  }

  // Components
  if (components.length > 0) {
    lines.push("## Components");
    lines.push("");
    lines.push(`${components.length} components available. Check before creating new ones:`);
    lines.push("");
    const grouped: Record<string, string[]> = {};
    for (const comp of components) {
      const parts = comp.path.split("/");
      parts.pop();
      const dir = parts.pop() || "root";
      if (!grouped[dir]) grouped[dir] = [];
      grouped[dir].push(comp.name);
    }
    for (const [dir, names] of Object.entries(grouped)) {
      lines.push(`- **${dir}**: ${names.join(", ")}`);
    }
    lines.push("");
  }

  // Hooks
  if (hooks.length > 0) {
    lines.push("## Custom Hooks");
    lines.push("");
    for (const hook of hooks) {
      const clientNote = hook.isClientOnly ? " *(client only)*" : "";
      lines.push(`- \`${hook.name}\` from \`${hook.importPath}\`${clientNote}`);
    }
    lines.push("");
  }

  // API Routes
  if (apiRoutes.length > 0) {
    lines.push("## API Routes");
    lines.push("");
    for (const route of apiRoutes.slice(0, 30)) {
      const methods = route.methods.join(", ");
      const auth = route.isProtected ? " (auth)" : "";
      lines.push(`- \`${methods}\` \`${route.path}\`${auth}`);
    }
    lines.push("");
  }

  // Database Models
  if (database && database.models.length > 0) {
    lines.push("## Database Models");
    lines.push("");
    for (const model of database.models) {
      const fields = model.fields.slice(0, 5).join(", ");
      const more = model.fields.length > 5 ? ` +${model.fields.length - 5}` : "";
      lines.push(`- **${model.name}**: ${fields}${more}`);
    }
    lines.push("");
  }

  // Environment Variables
  if (envVars.length > 0) {
    const required = envVars.filter(e => e.required);
    if (required.length > 0) {
      lines.push("## Environment Variables");
      lines.push("");
      lines.push("```bash");
      for (const env of required.slice(0, 20)) lines.push(env.name);
      lines.push("```");
      lines.push("");
    }
  }

  // Patterns
  if (patterns.patterns.length > 0) {
    lines.push("## Code Patterns");
    lines.push("");
    for (const pattern of patterns.patterns) lines.push(`- ${pattern}`);
    lines.push("");
  }

  // Design tokens
  if (Object.keys(scan.tokens.colors).length > 0) {
    lines.push("## Design Tokens");
    lines.push("");
    lines.push("Use semantic classes, never hardcoded colors:");
    lines.push("");
    lines.push("```");
    lines.push("bg-background, bg-card, bg-muted, bg-primary, bg-secondary, bg-destructive");
    lines.push("text-foreground, text-muted-foreground, text-primary-foreground");
    lines.push("border-border, border-primary");
    lines.push("```");
    lines.push("");
  }

  // CVA variants
  if (variants && variants.length > 0) {
    lines.push("## Component Variants (CVA)");
    lines.push("");
    for (const v of variants.slice(0, 8)) {
      const variantNames = Object.entries(v.variants).map(([name, opts]) => `${name}(${opts.join("|")})`).join(", ");
      lines.push(`- **${v.component}**: ${variantNames}`);
    }
    lines.push("");
  }

  // AI Automation Hooks
  if (latentHooks && latentHooks.length > 0) {
    lines.push("## AI Automation Hooks");
    lines.push("");
    for (const hook of latentHooks) {
      const patternDesc = hook.pattern ? ` (for \`${hook.pattern}\`)` : "";
      lines.push(`- **${hook.event}**: \`${hook.command}\`${patternDesc}`);
    }
    lines.push("");
  }

  if (stats) {
    lines.push(`---`);
    lines.push(`*${stats.totalFiles} files · ${stats.totalLines.toLocaleString()} lines*`);
  }

  // Build Health
  if (scan.contextValidation) {
    lines.push("");
    for (const l of renderBuildHealth(scan.contextValidation)) lines.push(l);
  }

  return lines.join("\n");
}

export function generateClaudeMd(scan: ScanResult, customRules: string[] = []): string {
  const { components, framework, hooks, utilities, commands, apiRoutes, envVars, patterns, database, stats, existingContext, barrels, importGraph, variants, latentHooks } = scan;
  const lines: string[] = [];
  const generatedAt = new Date().toISOString().split("T")[0];
  const riskClass = inferRiskClass(scan);

  lines.push("# CLAUDE.md");
  lines.push("");
  lines.push(`> Auto-generated by [hashmark](https://hashmark.md) — Project instructions for Claude Code`);
  lines.push(`> Generated: ${generatedAt} — re-run \`npx hashmark\` when the codebase changes significantly`);
  lines.push("");

  // Project Overview
  lines.push("## Project Overview");
  lines.push("");
  const stackParts: string[] = [];
  if (framework.name !== "Unknown") {
    stackParts.push(framework.version ? `${framework.name} ${framework.version}` : framework.name);
  }
  if (framework.router) stackParts.push(framework.router);
  if (framework.language === "TypeScript") {
    stackParts.push(framework.versions?.typescript ? `TypeScript ${framework.versions.typescript}` : "TypeScript");
  }
  if (framework.styling) stackParts.push(framework.styling);
  if (utilities.hasShadcn) stackParts.push("shadcn/ui");
  if (database) stackParts.push(`${database.provider} (${database.models.length} models)`);

  lines.push(`**Stack**: ${stackParts.join(" • ")}`);
  if (stats) {
    const isJs = framework.language === "TypeScript" || framework.language === "JavaScript";
    const compInfo = isJs && components.length > 0 ? `, ${components.length} components` : "";
    lines.push(`**Codebase**: ${stats.totalFiles} files, ${stats.totalLines.toLocaleString()} lines${compInfo}`);
  }
  lines.push("");

  // Commands — Claude Code's most important section
  lines.push("## Commands");
  lines.push("");
  lines.push("```bash");
  if (commands.dev) lines.push(`# Development`);
  if (commands.dev) lines.push(`npm run dev`);
  if (commands.build) lines.push(`npm run build`);
  if (commands.test) lines.push(`npm test`);
  if (commands.lint) lines.push(`npm run lint`);
  if (commands.typecheck) lines.push(`npm run typecheck`);

  if (commands.db && Object.keys(commands.db).length > 0) {
    lines.push("");
    lines.push("# Database");
    for (const [name] of Object.entries(commands.db)) {
      lines.push(`npm run ${name}`);
    }
  }

  if (Object.keys(commands.custom).length > 0) {
    lines.push("");
    lines.push("# Other");
    for (const [name] of Object.entries(commands.custom).slice(0, 8)) {
      lines.push(`npm run ${name}`);
    }
  }
  lines.push("```");
  lines.push("");

  // Agent Governance
  lines.push("## Agent Governance");
  lines.push("");
  lines.push(`**Risk class**: ${riskClass}`);

  const toolList: string[] = ["Read", "Edit", "Write", "Bash (read-only commands)", "Grep", "Glob"];
  if (commands.test) toolList.push("Bash (npm test)");
  if (commands.lint) toolList.push("Bash (npm run lint)");
  if (commands.typecheck) toolList.push("Bash (npm run typecheck)");
  if (database) toolList.push("Bash (db:generate, db:push)");
  lines.push(`**Permitted operations**: ${toolList.join(", ")}`);
  lines.push(`**Requires confirmation**: destructive file ops, git push, schema migrations, billing changes`);
  lines.push("");

  // Specialist routing table
  const routingRows = buildRoutingTable(scan);
  if (routingRows.length > 0) {
    lines.push("### Routing Table");
    lines.push("");
    lines.push("When editing these areas, apply extra care:");
    lines.push("");
    for (const row of routingRows) {
      lines.push(row);
    }
    lines.push("");
  }

  // Non-delegation zones
  const zones = buildNonDelegationZones(scan);
  if (zones.length > 0) {
    lines.push("### Non-Delegation Zones");
    lines.push("");
    lines.push("Do NOT autonomously change these — ask first:");
    lines.push("");
    for (const zone of zones) {
      lines.push(zone);
    }
    lines.push("");
  }

  // Delegation-safe zones
  const safeZones = buildDelegationSafeZones(scan);
  if (safeZones.length > 0) {
    lines.push("### Delegation-Safe Zones");
    lines.push("");
    lines.push("Low blast radius — agents can edit freely:");
    lines.push("");
    for (const zone of safeZones) {
      lines.push(zone);
    }
    lines.push("");
  }

  // Critical Rules — Claude Code responds well to direct, imperative rules
  lines.push("## Critical Rules");
  lines.push("");

  // Component reuse
  if (components.length > 0) {
    lines.push(`- **ALWAYS** check existing ${components.length} components before creating new ones`);
  }

  // Design tokens
  if (Object.keys(scan.tokens.colors).length > 0) {
    lines.push("- **NEVER** hardcode colors — use semantic tokens: `bg-primary`, `text-foreground`, `border-border`");
  }

  // Utilities
  if (utilities.hasCn) {
    lines.push(`- **ALWAYS** use \`cn()\` from \`${utilities.cnPath}\` for conditional classes`);
  }
  if (utilities.hasMode) {
    lines.push(`- **ALWAYS** use \`mode\` from \`${utilities.modePath}\` for theme-aware styling`);
  }

  // Framework-specific
  if (framework.name === "Next.js" && framework.router === "App Router") {
    lines.push("- **Prefer** Server Components by default — only add `'use client'` when needed");
    lines.push("- **ALWAYS** use `next/image` for images and `next/link` for navigation");
  }
  if (framework.language === "TypeScript") {
    lines.push("- **NEVER** use `any` — use proper types or `unknown`");
  }
  if (framework.styling === "Tailwind CSS") {
    lines.push("- **NEVER** use arbitrary values (`w-[137px]`) — use Tailwind scale values");
  }
  if (utilities.hasShadcn) {
    lines.push("- **ALWAYS** use CVA variants for component styling");
  }

  // Python rules
  if (framework.language === "Python") {
    lines.push("- **ALWAYS** use type hints on function signatures");
    lines.push("- **NEVER** use bare `except:` — catch specific exceptions");
    if (framework.name === "FastAPI") {
      lines.push("- **ALWAYS** use Pydantic models for request/response schemas");
    } else if (framework.name === "Django") {
      lines.push("- **ALWAYS** use Django ORM — avoid raw SQL unless necessary");
    }
  }

  // Go rules
  if (framework.language === "Go") {
    lines.push("- **NEVER** ignore error return values — handle all errors explicitly");
    lines.push("- **ALWAYS** pass `context.Context` as the first parameter");
  }

  // Rust rules
  if (framework.language === "Rust") {
    lines.push("- **NEVER** use `.unwrap()` or `.expect()` in production paths — handle Result/Option");
    lines.push("- **ALWAYS** propagate errors with `?` operator in functions returning Result");
  }

  // Java/Kotlin rules
  if (framework.language === "Java" || framework.language === "Kotlin") {
    if (framework.name === "Spring Boot") {
      lines.push("- **ALWAYS** use constructor injection over `@Autowired` field injection");
      lines.push("- **ALWAYS** annotate data-modifying service methods with `@Transactional`");
    }
    if (framework.language === "Kotlin") {
      lines.push("- **NEVER** use `!!` (non-null assertion) — use safe calls or explicit null handling");
    }
  }

  // Custom rules
  for (const rule of customRules) {
    lines.push(`- ${rule}`);
  }

  // Rules extracted from existing CLAUDE.md (skip rules we already generate fresh)
  if (existingContext.hasClaudeMd && existingContext.claudeMdContent) {
    const existingLines = existingContext.claudeMdContent.split("\n");
    for (const line of existingLines) {
      if ((line.includes("NEVER") || line.includes("ALWAYS") || line.includes("MUST")) && line.trim().length > 20) {
        // Skip component-count rules — we generate these fresh with the current count
        if (/check existing \d+ components/i.test(line)) continue;
        const cleanLine = line.replace(/^[\s\-\*\d\.]+/, "").trim();
        // Deduplicate by checking if the core intent already appears
        const coreContent = cleanLine.replace(/\*\*/g, "").toLowerCase();
        if (!lines.some(l => l.replace(/\*\*/g, "").toLowerCase().includes(coreContent.slice(0, 40)))) {
          lines.push(`- ${cleanLine}`);
        }
      }
    }
  }
  lines.push("");

  // Architecture — Key file locations
  lines.push("## Architecture");
  lines.push("");

  // Key imports
  if (utilities.hasCn || utilities.hasMode || barrels.length > 0) {
    lines.push("### Key Imports");
    lines.push("");
    lines.push("```typescript");
    if (utilities.hasCn) lines.push(`import { cn } from "${utilities.cnPath}";`);
    if (utilities.hasMode) lines.push(`import { mode } from "${utilities.modePath}";`);
    for (const barrel of barrels.slice(0, 3)) {
      const exports = barrel.exports.filter(e => !e.startsWith("*")).slice(0, 3).join(", ");
      if (exports) lines.push(`import { ${exports} } from "${barrel.importPath}";`);
    }
    lines.push("```");
    lines.push("");
  }

  // High-impact files
  if (importGraph && importGraph.hubFiles.length > 0) {
    lines.push("### High-Impact Files");
    lines.push("");
    lines.push("Changes to these files affect many dependents — edit carefully:");
    lines.push("");
    for (const hub of importGraph.hubFiles.slice(0, 6)) {
      const rationale = hubRationale(hub.file, hub.importedByCount, scan);
      lines.push(`- \`${hub.file}\` (${hub.importedByCount} dependents)${rationale}`);
    }
    lines.push("");
  }

  // Complexity section (with delta if available)
  if (scan.aiRecommendations?.complexFiles && scan.aiRecommendations.complexFiles.length > 0) {
    const hasCompl = scan.aiRecommendations.complexFiles.some(
      f => (f.functions ?? []).some(fn => fn.cyclomatic > 10 || fn.cognitive > 15)
    );
    if (hasCompl) {
      const deltaTitle = scan.complexityDelta ? " (vs last scan)" : "";
      lines.push(`### Complexity${deltaTitle}`);
      lines.push("");
      if (scan.complexityDelta) {
        for (const l of renderComplexityDelta(scan.complexityDelta)) lines.push(l);
        lines.push("");
      }
      const topComplex = scan.aiRecommendations.complexFiles.slice(0, 5);
      for (const cf of topComplex) {
        const funcs = cf.functions ?? [];
        const maxCC = funcs.reduce((m, fn) => Math.max(m, fn.cyclomatic), 0);
        const mi = cf.maintainabilityIndex ?? 100;
        let rationale = "";
        if (funcs.some(fn => fn.cyclomatic > 15)) rationale = " — ⚠ Complex branching — read full function before modifying";
        else if (mi < 40) rationale = " — ⚠ Hard to reason about — prefer additive changes over rewrites";
        lines.push(`- \`${cf.path}\` (CC: ${maxCC}, MI: ${Math.round(mi)})${rationale}`);
      }
      lines.push("");
    }
  }

  // Components list (compact)
  if (components.length > 0) {
    lines.push("### Components");
    lines.push("");
    lines.push(`${components.length} components available. Check before creating new ones:`);
    lines.push("");

    const grouped: Record<string, string[]> = {};
    for (const comp of components) {
      const parts = comp.path.split("/");
      parts.pop();
      const dir = parts.pop() || "root";
      if (!grouped[dir]) grouped[dir] = [];
      grouped[dir].push(comp.name);
    }

    for (const [dir, names] of Object.entries(grouped)) {
      lines.push(`- **${dir}**: ${names.join(", ")}`);
    }
    lines.push("");
  }

  // Hooks
  if (hooks.length > 0) {
    lines.push("### Custom Hooks");
    lines.push("");
    for (const hook of hooks) {
      const clientNote = hook.isClientOnly ? " *(client only)*" : "";
      lines.push(`- \`${hook.name}\` from \`${hook.importPath}\`${clientNote}`);
    }
    lines.push("");
  }

  // API Routes
  if (apiRoutes.length > 0) {
    lines.push("### API Routes");
    lines.push("");
    for (const route of apiRoutes.slice(0, 20)) {
      const methods = route.methods.join(", ");
      const auth = route.isProtected ? " (auth)" : "";
      lines.push(`- \`${methods}\` \`${route.path}\`${auth}`);
    }
    lines.push("");
  }

  // Database Models
  if (database && database.models.length > 0) {
    lines.push("### Database Models");
    lines.push("");
    for (const model of database.models.slice(0, 15)) {
      const fields = model.fields.slice(0, 5).join(", ");
      const more = model.fields.length > 5 ? ` +${model.fields.length - 5}` : "";
      lines.push(`- **${model.name}**: ${fields}${more}`);
    }
    lines.push("");
  }

  // Environment Variables
  if (envVars.length > 0) {
    const required = envVars.filter(e => e.required);
    if (required.length > 0) {
      lines.push("### Required Environment Variables");
      lines.push("");
      lines.push("```bash");
      for (const env of required.slice(0, 15)) {
        lines.push(env.name);
      }
      lines.push("```");
      lines.push("");
    }
  }

  // Patterns
  if (patterns.patterns.length > 0) {
    lines.push("## Code Patterns");
    lines.push("");
    for (const pattern of patterns.patterns) {
      lines.push(`- ${pattern}`);
    }
    lines.push("");
  }

  // Non-JS stack patterns (Python / Go / Rust / Java / Kotlin)
  const isJs = framework.language === "TypeScript" || framework.language === "JavaScript";
  if (!isJs) {
    const stackSections = getStackPatternSections(framework);
    for (const section of stackSections) {
      lines.push(`## ${section.title}`);
      lines.push("");
      lines.push(section.content);
      lines.push("");
    }
  }

  // Design tokens (brief)
  if (Object.keys(scan.tokens.colors).length > 0) {
    lines.push("## Design Tokens");
    lines.push("");
    lines.push("Use semantic classes, never hardcoded colors:");
    lines.push("");
    lines.push("```");
    lines.push("bg-background, bg-card, bg-muted, bg-primary, bg-secondary, bg-destructive");
    lines.push("text-foreground, text-muted-foreground, text-primary-foreground");
    lines.push("border-border, border-primary");
    lines.push("```");
    lines.push("");
  }

  // AI Automation Hooks
  if (latentHooks && latentHooks.length > 0) {
    lines.push("## AI Automation Hooks");
    lines.push("");
    lines.push("Use these triggers to automate your workflow:");
    lines.push("");
    for (const hook of latentHooks) {
      const patternDesc = hook.pattern ? ` (for \`${hook.pattern}\`)` : "";
      lines.push(`- **${hook.event}**: \`${hook.command}\`${patternDesc}`);
    }
    lines.push("");
  }

  // Build Health
  if (scan.contextValidation) {
    for (const l of renderBuildHealth(scan.contextValidation)) lines.push(l);
  }

  return lines.join("\n");
}
