/**
 * CLAUDE.md Generator — 5-Layer Model Workspace Protocol (MWP)
 *
 * Output is structured as 5 cognitive layers per arxiv 2603.16021:
 *   1. Identity   — who the agent is, what this project is
 *   2. Orientation — file map, entry points, key architectural files
 *   3. Operations  — how to run, build, test, deploy
 *   4. Constraints — what NOT to do, non-delegation zones, hard rules
 *   5. Knowledge   — complexity hotspots, discovered patterns, API surface
 *
 * @module formats/claude-md
 */

import type { ScanResult, ComplexityDelta } from "../types.js";
import type { SectionFreshness } from "../lib/freshness.js";
import { getStackPatternSections } from "../templates/stack-patterns.js";

// ============================================================================
// Helper functions
// ============================================================================

/** Returns a rationale annotation for a hub file based on heuristics. */
function hubRationale(file: string, importedByCount: number, scan: ScanResult): string {
  if (/auth|session|jwt|clerk/i.test(file)) return " — security-sensitive, changes need human review";
  if (/billing|stripe|payment|webhook/i.test(file)) return " — security-sensitive, changes need human review";

  if (scan.stats?.largestFiles) {
    const found = scan.stats.largestFiles.find(f => f.path === file || f.path.endsWith(file));
    if (found && found.lines > 500) return " — high blast radius, keep edits focused";
  }

  if (scan.aiRecommendations?.complexFiles) {
    const cf = scan.aiRecommendations.complexFiles.find(f => f.path === file || f.path.endsWith(file));
    if (cf) {
      const funcs = cf.functions ?? [];
      if (funcs.some(fn => fn.cyclomatic > 15)) return " — complex branching, read full function before modifying";
      if ((cf.maintainabilityIndex ?? 100) < 40) return " — hard to reason about, prefer additive changes";
    }
  }

  if (importedByCount > 10) return ` — ${importedByCount} downstream files break if this changes`;
  return "";
}

/** Render complexity delta lines for embedding in the Knowledge section. */
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

/** Infer a risk class for the project based on what it handles. */
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

/** Build a specialist routing table based on detected project shape. */
function buildRoutingTable(scan: ScanResult): string[] {
  const rows: string[] = [];
  const { framework, database, apiRoutes } = scan;

  if (database) {
    rows.push(`- **DB changes** (\`*.prisma\`, \`migrations/**\`): Run \`npm run db:generate && npm run db:push\` — review schema diff before merging`);
  }
  if (framework.name === "Next.js") {
    rows.push(`- **Auth code** (\`src/lib/auth.*\`, \`app/api/auth/**\`): Check session handling, CSRF, token expiry`);
    rows.push(`- **Server Actions** (\`app/**/*.ts\` with \`'use server'\`): Validate inputs with Zod, never trust client data`);
    rows.push(`- **API routes** (\`app/api/**\`): Verify auth guards on every route`);
  }
  if (apiRoutes.some(r => r.path.includes("billing") || r.path.includes("webhook"))) {
    rows.push(`- **Billing/webhooks** (\`*billing*\`, \`*webhook*\`): HIGH risk — verify idempotency, validate webhook signatures`);
  }
  rows.push(`- **UI components** (\`src/components/**\`): Check existing ${scan.components.length} components before adding new ones`);
  rows.push(`- **Config/deps** (\`package.json\`, \`tsconfig.json\`, \`next.config.*\`): Scope change carefully — affects entire build`);

  return rows;
}

/** Non-delegation zones: operations that must NOT be autonomously changed by an AI agent. */
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

  if (importGraph && importGraph.hubFiles.length > 0) {
    const criticalHubs = importGraph.hubFiles.filter(h => h.importedByCount > 10);
    for (const hub of criticalHubs.slice(0, 4)) {
      zones.push(`- \`${hub.file}\` — ${hub.importedByCount} dependents, changes cascade widely`);
    }
  }

  const sensitivePatterns = /auth|billing|payment|stripe|migration|seed|\.env/i;
  const knownPaths = new Set<string>();

  for (const route of apiRoutes) {
    if (sensitivePatterns.test(route.path)) {
      const segment = route.path.split("/").filter(Boolean).slice(0, 3).join("/");
      if (!knownPaths.has(segment)) {
        knownPaths.add(segment);
        zones.push(`- \`${segment}/\` — sensitive route, verify auth guards and side effects`);
      }
    }
  }

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

/** Delegation-safe zones: low blast-radius areas suitable for autonomous agent edits. */
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

// ============================================================================
// Layer builders
// ============================================================================

function buildIdentityLayer(scan: ScanResult, generatedAt: string): string[] {
  const { framework, database, components, stats, utilities } = scan;
  const lines: string[] = [];

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

  const isJs = framework.language === "TypeScript" || framework.language === "JavaScript";
  const compInfo = isJs && components.length > 0 ? `, ${components.length} components` : "";
  const codebaseInfo = stats ? `${stats.totalFiles} files, ${stats.totalLines.toLocaleString()} lines${compInfo}` : "";

  lines.push(`> Auto-generated by [hashmark](https://hashmark.md) on ${generatedAt}. Stack: ${stackParts.join(" • ")}. ${codebaseInfo}.`);
  lines.push(`> Re-run \`npx hashmark\` when the codebase changes significantly.`);

  return lines;
}

function buildOrientationLayer(scan: ScanResult): string[] {
  const { components, framework, hooks, utilities, barrels, importGraph } = scan;
  const lines: string[] = [];

  lines.push("## Orientation");
  lines.push("");

  // Key imports
  if (utilities.hasCn || utilities.hasMode || barrels.length > 0) {
    lines.push("**Key imports**:");
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
    lines.push("**High-impact files** (edit carefully — many dependents):");
    lines.push("");
    for (const hub of importGraph.hubFiles.slice(0, 6)) {
      const rationale = hubRationale(hub.file, hub.importedByCount, scan);
      lines.push(`- \`${hub.file}\` (${hub.importedByCount} dependents)${rationale}`);
    }
    lines.push("");
  }

  // Architecture / route groups
  if (framework.name === "Next.js" && framework.router === "App Router") {
    lines.push("**Architecture**: Next.js App Router — `(marketing)` for public routes, `(dashboard)` for authenticated routes");
    lines.push("");
  }

  // Components grouped by directory
  if (components.length > 0) {
    lines.push(`**Components** (${components.length} total):`);
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

  // Custom hooks
  if (hooks.length > 0) {
    lines.push("**Custom hooks**:");
    lines.push("");
    for (const hook of hooks) {
      const clientNote = hook.isClientOnly ? " *(client only)*" : "";
      lines.push(`- \`${hook.name}\` from \`${hook.importPath}\`${clientNote}`);
    }
    lines.push("");
  }

  return lines;
}

function buildOperationsLayer(scan: ScanResult): string[] {
  const { commands, latentHooks } = scan;
  const lines: string[] = [];

  lines.push("## Operations");
  lines.push("");
  lines.push("```bash");

  if (commands.dev) {
    lines.push("# Development");
    lines.push("npm run dev");
  }
  if (commands.build) lines.push("npm run build");
  if (commands.test) lines.push("npm test");
  if (commands.lint) lines.push("npm run lint");
  if (commands.typecheck) lines.push("npm run typecheck");

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

  if (latentHooks && latentHooks.length > 0) {
    lines.push("**AI automation hooks**:");
    lines.push("");
    for (const hook of latentHooks) {
      const patternDesc = hook.pattern ? ` (for \`${hook.pattern}\`)` : "";
      lines.push(`- **${hook.event}**: \`${hook.command}\`${patternDesc}`);
    }
    lines.push("");
  }

  return lines;
}

function buildConstraintsLayer(scan: ScanResult, customRules: string[] = []): string[] {
  const { components, framework, utilities } = scan;
  const lines: string[] = [];

  lines.push("## Constraints");
  lines.push("");

  const zones = buildNonDelegationZones(scan);
  if (zones.length > 0) {
    lines.push("### Non-Delegation Zones");
    lines.push("");
    lines.push("> Do not change these without explicit human instruction:");
    lines.push("");
    for (const zone of zones) lines.push(zone);
    lines.push("");
  }

  const safeZones = buildDelegationSafeZones(scan);
  if (safeZones.length > 0) {
    lines.push("### Safe Zones");
    lines.push("");
    lines.push("Low blast radius — agents can edit freely:");
    lines.push("");
    for (const zone of safeZones) lines.push(zone);
    lines.push("");
  }

  lines.push("### Hard Rules");
  lines.push("");

  if (components.length > 0) {
    lines.push(`- **ALWAYS** check existing ${components.length} components before creating new ones`);
  }
  if (Object.keys(scan.tokens.colors).length > 0) {
    lines.push("- **NEVER** hardcode colors — use semantic tokens: `bg-primary`, `text-foreground`, `border-border`");
  }
  if (utilities.hasCn) {
    lines.push(`- **ALWAYS** use \`cn()\` from \`${utilities.cnPath}\` for conditional classes`);
  }
  if (utilities.hasMode) {
    lines.push(`- **ALWAYS** use \`mode\` from \`${utilities.modePath}\` for theme-aware styling`);
  }
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

  if (framework.language === "Python") {
    lines.push("- **ALWAYS** use type hints on function signatures");
    lines.push("- **NEVER** use bare `except:` — catch specific exceptions");
    if (framework.name === "FastAPI") {
      lines.push("- **ALWAYS** use Pydantic models for request/response schemas");
    } else if (framework.name === "Django") {
      lines.push("- **ALWAYS** use Django ORM — avoid raw SQL unless necessary");
    }
  }
  if (framework.language === "Go") {
    lines.push("- **NEVER** ignore error return values — handle all errors explicitly");
    lines.push("- **ALWAYS** pass `context.Context` as the first parameter");
  }
  if (framework.language === "Rust") {
    lines.push("- **NEVER** use `.unwrap()` or `.expect()` in production paths — handle Result/Option");
    lines.push("- **ALWAYS** propagate errors with `?` operator in functions returning Result");
  }
  if (framework.language === "Java" || framework.language === "Kotlin") {
    if (framework.name === "Spring Boot") {
      lines.push("- **ALWAYS** use constructor injection over `@Autowired` field injection");
      lines.push("- **ALWAYS** annotate data-modifying service methods with `@Transactional`");
    }
    if (framework.language === "Kotlin") {
      lines.push("- **NEVER** use `!!` (non-null assertion) — use safe calls or explicit null handling");
    }
  }

  for (const rule of customRules) {
    lines.push(`- ${rule}`);
  }

  if (scan.existingContext.hasClaudeMd && scan.existingContext.claudeMdContent) {
    const existingLines = scan.existingContext.claudeMdContent.split("\n");
    for (const line of existingLines) {
      if ((line.includes("NEVER") || line.includes("ALWAYS") || line.includes("MUST")) && line.trim().length > 20) {
        if (/check existing \d+ components/i.test(line)) continue;
        const cleanLine = line.replace(/^[\s\-\*\d\.]+/, "").trim();
        const coreContent = cleanLine.replace(/\*\*/g, "").toLowerCase();
        if (!lines.some(l => l.replace(/\*\*/g, "").toLowerCase().includes(coreContent.slice(0, 40)))) {
          lines.push(`- ${cleanLine}`);
        }
      }
    }
  }

  lines.push("");
  return lines;
}

function buildKnowledgeLayer(scan: ScanResult): string[] {
  const { apiRoutes, database, patterns, envVars, framework } = scan;
  const lines: string[] = [];

  lines.push("## Knowledge");
  lines.push("");

  // Complexity hotspots
  if (scan.aiRecommendations?.complexFiles && scan.aiRecommendations.complexFiles.length > 0) {
    const hasCompl = scan.aiRecommendations.complexFiles.some(
      f => (f.functions ?? []).some(fn => fn.cyclomatic > 10 || fn.cognitive > 15)
    );
    if (hasCompl) {
      const deltaTitle = scan.complexityDelta ? " (vs last scan)" : "";
      lines.push(`### Complexity Hotspots${deltaTitle}`);
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
        let note = "";
        if (funcs.some(fn => fn.cyclomatic > 15)) note = " — complex branching, read before modifying";
        else if (mi < 40) note = " — low maintainability, prefer additive changes";
        lines.push(`- \`${cf.path}\` (CC: ${maxCC}, MI: ${Math.round(mi)})${note}`);
      }
      lines.push("");
    }
  }

  // Known patterns
  if (patterns.patterns.length > 0) {
    lines.push("### Known Patterns");
    lines.push("");
    for (const pattern of patterns.patterns) lines.push(`- ${pattern}`);
    lines.push("");
  }

  // Non-JS stack patterns
  const isJs = framework.language === "TypeScript" || framework.language === "JavaScript";
  if (!isJs) {
    const stackSections = getStackPatternSections(framework);
    for (const section of stackSections) {
      lines.push(`### ${section.title}`);
      lines.push("");
      lines.push(section.content);
      lines.push("");
    }
  }

  // Design tokens
  if (Object.keys(scan.tokens.colors).length > 0) {
    lines.push("### Design Tokens");
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

  // API surface
  if (apiRoutes.length > 0) {
    lines.push("### API Surface");
    lines.push("");
    for (const route of apiRoutes.slice(0, 20)) {
      const methods = route.methods.join(", ");
      const auth = route.isProtected ? " (auth)" : "";
      lines.push(`- \`${methods}\` \`${route.path}\`${auth}`);
    }
    lines.push("");
  }

  // Database models
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

  // Required env vars
  if (envVars.length > 0) {
    const required = envVars.filter(e => e.required);
    if (required.length > 0) {
      lines.push("### Required Env Vars");
      lines.push("");
      lines.push("```bash");
      for (const env of required.slice(0, 15)) lines.push(env.name);
      lines.push("```");
      lines.push("");
    }
  }

  return lines;
}

// ============================================================================
// Router variant — lean ~800 token routing document
// ============================================================================

/**
 * MWP router document — lean routing file that points to CONTEXT.md for detail.
 * Structured as 5 layers but kept compact for token efficiency.
 * Ref: arxiv 2603.16021 — Model Workspace Protocol
 */
export function generateClaudeMdRouter(scan: ScanResult, customRules: string[] = []): string {
  const { framework, commands, database, components, envVars, apiRoutes, stats } = scan;
  const lines: string[] = [];
  const generatedAt = new Date().toISOString().split("T")[0];
  const riskClass = inferRiskClass(scan);

  lines.push("# CLAUDE.md");
  lines.push("");

  // Layer 1: Identity
  const stackParts: string[] = [];
  if (framework.name !== "Unknown") stackParts.push(framework.version ? `${framework.name} ${framework.version}` : framework.name);
  if (framework.router) stackParts.push(framework.router);
  if (framework.language === "TypeScript") stackParts.push(framework.versions?.typescript ? `TypeScript ${framework.versions.typescript}` : "TypeScript");
  if (framework.styling) stackParts.push(framework.styling);
  if (database) stackParts.push(`${database.provider} (${database.models.length} models)`);
  const compInfo = components.length > 0 ? `, ${components.length} components` : "";
  const codebaseInfo = stats ? `${stats.totalFiles} files, ${stats.totalLines.toLocaleString()} lines${compInfo}` : "";
  lines.push(`> Auto-generated by [hashmark](https://hashmark.md) on ${generatedAt}. Stack: ${stackParts.join(" • ")}. ${codebaseInfo}.`);
  lines.push(`> Re-run \`npx hashmark\` when the codebase changes significantly.`);
  lines.push("");

  // Layer 2: Orientation (pointer to CONTEXT.md)
  lines.push("## Orientation");
  lines.push("");
  lines.push("- **CONTEXT.md** — full architecture, components, hooks, API routes, DB models, patterns");
  if (envVars.filter(e => e.required).length > 0) lines.push("- **CONTEXT.md#environment-variables** — required env vars");
  if (apiRoutes.length > 0) lines.push("- **CONTEXT.md#api-routes** — full route list with auth flags");
  lines.push("");
  lines.push("> Read CONTEXT.md when you need architectural detail. CLAUDE.md is routing only.");
  lines.push("");

  // Layer 3: Operations
  lines.push("## Operations");
  lines.push("");
  lines.push("```bash");
  if (commands.dev) lines.push("npm run dev");
  if (commands.build) lines.push("npm run build");
  if (commands.test) lines.push("npm test");
  if (commands.lint) lines.push("npm run lint");
  if (commands.typecheck) lines.push("npm run typecheck");
  if (commands.db && Object.keys(commands.db).length > 0) {
    for (const [name] of Object.entries(commands.db)) lines.push(`npm run ${name}`);
  }
  lines.push("```");
  lines.push("");

  // Layer 4: Constraints (compact)
  lines.push("## Constraints");
  lines.push("");
  lines.push(`**Risk**: ${riskClass}`);
  const toolList = ["Read", "Edit", "Write", "Grep", "Glob", "Bash (safe)"];
  if (commands.test) toolList.push("Bash (npm test)");
  if (commands.lint) toolList.push("Bash (npm run lint)");
  lines.push(`**Permitted**: ${toolList.join(", ")}`);
  lines.push(`**Confirm first**: migrations, git push, billing changes, destructive ops`);
  lines.push("");

  const routingRows = buildRoutingTable(scan);
  if (routingRows.length > 0) {
    lines.push("### Routing");
    lines.push("");
    for (const row of routingRows) lines.push(row);
    lines.push("");
  }

  const zones = buildNonDelegationZones(scan);
  if (zones.length > 0) {
    lines.push("### Non-Delegation Zones");
    lines.push("");
    for (const zone of zones) lines.push(zone);
    lines.push("");
  }

  const safeZones = buildDelegationSafeZones(scan);
  if (safeZones.length > 0) {
    lines.push("### Safe Zones");
    lines.push("");
    for (const zone of safeZones) lines.push(zone);
    lines.push("");
  }

  const rules: string[] = [];
  if (components.length > 0) rules.push(`**ALWAYS** check existing ${components.length} components before creating new ones`);
  if (framework.name === "Next.js" && framework.router === "App Router") {
    rules.push("**Prefer** Server Components — only add `'use client'` when needed");
    rules.push("**ALWAYS** use `next/image` for images and `next/link` for navigation");
  }
  if (framework.language === "TypeScript") rules.push("**NEVER** use `any` — use `unknown` or proper types");
  if (framework.styling === "Tailwind CSS") rules.push("**NEVER** use arbitrary values (`w-[137px]`) — use Tailwind scale");
  for (const rule of customRules.slice(0, 3)) rules.push(rule);

  if (rules.length > 0) {
    lines.push("### Hard Rules");
    lines.push("");
    for (const rule of rules.slice(0, 6)) lines.push(`- ${rule}`);
    lines.push("");
  }

  // Layer 5: Knowledge (stub — detail in CONTEXT.md)
  lines.push("## Knowledge");
  lines.push("");
  lines.push("See CONTEXT.md for complexity hotspots, patterns, and API surface.");
  lines.push("");

  return lines.join("\n");
}

// ============================================================================
// CONTEXT.md — full detail document
// ============================================================================

/**
 * Full project context document — architecture, components, hooks, routes, models, patterns.
 * Ref: arxiv 2603.16021 — Model Workspace Protocol
 */
export function generateContextMd(scan: ScanResult): string {
  const { components, framework, hooks, utilities, apiRoutes, envVars, patterns, database, stats, importGraph, barrels, variants, latentHooks } = scan;
  const lines: string[] = [];

  lines.push("# CONTEXT.md");
  lines.push("");
  lines.push("> Full project context for Claude Code. Read this when you need architectural detail.");
  lines.push("> Auto-generated by [hashmark](https://hashmark.md)");
  lines.push("");

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
        if (funcs.some(fn => fn.cyclomatic > 15)) rationale = " — complex branching, read full function before modifying";
        else if (mi < 40) rationale = " — hard to reason about, prefer additive changes";
        lines.push(`- \`${cf.path}\` (CC: ${maxCC}, MI: ${Math.round(mi)})${rationale}`);
      }
      lines.push("");
    }
  }

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

  if (hooks.length > 0) {
    lines.push("## Custom Hooks");
    lines.push("");
    for (const hook of hooks) {
      const clientNote = hook.isClientOnly ? " *(client only)*" : "";
      lines.push(`- \`${hook.name}\` from \`${hook.importPath}\`${clientNote}`);
    }
    lines.push("");
  }

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

  if (patterns.patterns.length > 0) {
    lines.push("## Code Patterns");
    lines.push("");
    for (const pattern of patterns.patterns) lines.push(`- ${pattern}`);
    lines.push("");
  }

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

  if (variants && variants.length > 0) {
    lines.push("## Component Variants (CVA)");
    lines.push("");
    for (const v of variants.slice(0, 8)) {
      const variantNames = Object.entries(v.variants).map(([name, opts]) => `${name}(${opts.join("|")})`).join(", ");
      lines.push(`- **${v.component}**: ${variantNames}`);
    }
    lines.push("");
  }

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

  return lines.join("\n");
}

// ============================================================================
// Main generator — full 5-layer CLAUDE.md
// ============================================================================

/** Build a staleness annotation comment for a section, or empty string if fresh. */
function stalenessComment(sectionName: string, freshnessInfo: SectionFreshness[]): string {
  const info = freshnessInfo.find(f => f.section === sectionName);
  if (!info || info.isNew || info.scansStale === 0) return "";
  if (info.scansStale >= 5) {
    return `<!-- 🔴 This section unchanged for ${info.scansStale} scans — likely stale -->`;
  }
  if (info.scansStale >= 2) {
    return `<!-- ⚠️ This section unchanged for ${info.scansStale} scans — consider re-running hashmark -->`;
  }
  return "";
}

/** Build the freshness summary line for the top of the document. */
function buildFreshnessSummary(freshnessInfo: SectionFreshness[], scanCount: number): string | null {
  const stale = freshnessInfo.filter(f => !f.isNew && f.scansStale >= 2);
  if (stale.length === 0) return null;
  const detail = stale.map(f => `${f.section}: ${f.scansStale} scans`).join(", ");
  return `> Scan #${scanCount} · ${stale.length} section${stale.length === 1 ? "" : "s"} stale (${detail})`;
}

/**
 * Full 5-layer CLAUDE.md following the Model Workspace Protocol.
 * Ref: arxiv 2603.16021 — Folder Structure as Agentic Architecture
 */
export function generateClaudeMd(
  scan: ScanResult,
  customRules: string[] = [],
  freshnessInfo?: SectionFreshness[],
  scanCount?: number
): string {
  const lines: string[] = [];
  const generatedAt = new Date().toISOString().split("T")[0];

  lines.push("# CLAUDE.md");
  lines.push("");
  lines.push("<!--");
  lines.push(" 5-Layer Model Workspace Protocol (MWP) — arxiv 2603.16021");
  lines.push(" Layer 1: Identity   — what this project is");
  lines.push(" Layer 2: Orientation — file map, entry points, key files");
  lines.push(" Layer 3: Operations  — how to run, build, test");
  lines.push(" Layer 4: Constraints — what NOT to do, non-delegation zones");
  lines.push(" Layer 5: Knowledge   — hotspots, patterns, API surface");
  lines.push("-->");
  lines.push("");

  // Layer 1: Identity
  for (const l of buildIdentityLayer(scan, generatedAt)) lines.push(l);

  // Freshness summary after identity lines
  if (freshnessInfo && scanCount !== undefined) {
    const summary = buildFreshnessSummary(freshnessInfo, scanCount);
    if (summary) {
      lines.push(summary);
    }
  }
  lines.push("");

  // Layer 2: Orientation
  const orientationLines = buildOrientationLayer(scan);
  for (const l of orientationLines) lines.push(l);
  if (freshnessInfo) {
    const comment = stalenessComment("Orientation", freshnessInfo);
    if (comment) {
      // Insert after the ## Orientation header line
      const headerIdx = lines.lastIndexOf("## Orientation");
      if (headerIdx !== -1) lines.splice(headerIdx + 1, 0, comment);
    }
  }

  // Layer 3: Operations
  const operationsLines = buildOperationsLayer(scan);
  for (const l of operationsLines) lines.push(l);
  if (freshnessInfo) {
    const comment = stalenessComment("Operations", freshnessInfo);
    if (comment) {
      const headerIdx = lines.lastIndexOf("## Operations");
      if (headerIdx !== -1) lines.splice(headerIdx + 1, 0, comment);
    }
  }

  // Layer 4: Constraints
  const constraintsLines = buildConstraintsLayer(scan, customRules);
  for (const l of constraintsLines) lines.push(l);
  if (freshnessInfo) {
    const comment = stalenessComment("Constraints", freshnessInfo);
    if (comment) {
      const headerIdx = lines.lastIndexOf("## Constraints");
      if (headerIdx !== -1) lines.splice(headerIdx + 1, 0, comment);
    }
  }

  // Layer 5: Knowledge
  const knowledgeLines = buildKnowledgeLayer(scan);
  for (const l of knowledgeLines) lines.push(l);
  if (freshnessInfo) {
    const comment = stalenessComment("Knowledge", freshnessInfo);
    if (comment) {
      const headerIdx = lines.lastIndexOf("## Knowledge");
      if (headerIdx !== -1) lines.splice(headerIdx + 1, 0, comment);
    }
  }

  return lines.join("\n");
}
