/**
 * .cursor/rules/*.mdc Generator
 *
 * Generates Cursor's new MDC format — rules split by domain.
 * Each file has YAML frontmatter with `description` and `globs`.
 *
 * Output:
 * - .cursor/rules/general.mdc — Project-wide rules
 * - .cursor/rules/components.mdc — Component rules (if components exist)
 * - .cursor/rules/api.mdc — API rules (if API routes exist)
 * - .cursor/rules/database.mdc — Database rules (if database exists)
 *
 * @module formats/cursor-mdc
 */

import type { ScanResult } from "../types.js";

interface MdcFile {
  path: string;
  content: string;
}

export function generateCursorMdc(scan: ScanResult, customRules: string[] = []): MdcFile[] {
  const files: MdcFile[] = [];

  // Always generate general rules
  files.push(generateGeneralMdc(scan, customRules));

  // Component rules (if components exist)
  if (scan.components.length > 0) {
    files.push(generateComponentsMdc(scan));
  }

  // API rules (if routes exist)
  if (scan.apiRoutes.length > 0) {
    files.push(generateApiMdc(scan));
  }

  // Database rules (if database exists)
  if (scan.database && scan.database.models.length > 0) {
    files.push(generateDatabaseMdc(scan));
  }

  return files;
}

function generateGeneralMdc(scan: ScanResult, customRules: string[]): MdcFile {
  const { framework, utilities, patterns, commands } = scan;
  const lines: string[] = [];

  // YAML frontmatter
  lines.push("---");
  lines.push("description: General project rules and conventions");
  lines.push("globs: **/*");
  lines.push("---");
  lines.push("");

  lines.push("# Project Rules");
  lines.push("");

  // Stack
  const stack: string[] = [];
  if (framework.name !== "Unknown") stack.push(framework.version ? `${framework.name} ${framework.version}` : framework.name);
  if (framework.language === "TypeScript") stack.push("TypeScript");
  if (framework.styling) stack.push(framework.styling);
  lines.push(`Stack: ${stack.join(" + ")}`);
  lines.push("");

  // Rules
  lines.push("## Rules");
  lines.push("");
  lines.push("- Use semantic design tokens (bg-primary, text-foreground). Never hardcode colors.");
  if (utilities.hasCn) {
    lines.push(`- Use \`cn()\` from \`${utilities.cnPath}\` for conditional classes.`);
  }
  if (utilities.hasMode) {
    lines.push(`- Use \`mode\` from \`${utilities.modePath}\` for theme-aware styling.`);
  }
  if (framework.language === "TypeScript") {
    lines.push("- Type all parameters. Avoid `any`.");
  }
  if (framework.styling === "Tailwind CSS") {
    lines.push("- Use Tailwind scale values. No arbitrary values like `w-[137px]`.");
  }
  if (framework.name === "Next.js" && framework.router === "App Router") {
    lines.push("- Default to Server Components. Add `'use client'` only for interactivity.");
  }

  for (const rule of customRules) {
    lines.push(`- ${rule}`);
  }
  lines.push("");

  // Commands
  lines.push("## Commands");
  lines.push("");
  if (commands.dev) lines.push(`- \`npm run dev\` — Development server`);
  if (commands.build) lines.push(`- \`npm run build\` — Production build`);
  if (commands.test) lines.push(`- \`npm test\` — Run tests`);
  if (commands.lint) lines.push(`- \`npm run lint\` — Lint code`);
  lines.push("");

  // Patterns
  if (patterns.patterns.length > 0) {
    lines.push("## Detected Patterns");
    lines.push("");
    for (const pattern of patterns.patterns) {
      lines.push(`- ${pattern}`);
    }
    lines.push("");
  }

  return { path: ".cursor/rules/general.mdc", content: lines.join("\n") };
}

function generateComponentsMdc(scan: ScanResult): MdcFile {
  const { components, utilities, variants, barrels } = scan;
  const lines: string[] = [];

  // Determine component globs
  const componentDirs = new Set<string>();
  for (const comp of components) {
    const parts = comp.path.split("/");
    if (parts.length >= 2) {
      componentDirs.add(parts.slice(0, -1).join("/") + "/**");
    }
  }
  const globs = componentDirs.size > 0
    ? Array.from(componentDirs).slice(0, 5).join(",")
    : "src/components/**";

  lines.push("---");
  lines.push("description: Component usage rules and inventory");
  lines.push(`globs: ${globs}`);
  lines.push("---");
  lines.push("");

  lines.push("# Component Rules");
  lines.push("");
  lines.push(`This project has ${components.length} components. Always use existing ones.`);
  lines.push("");

  // Rules
  lines.push("## Rules");
  lines.push("");
  lines.push("- Check this list before creating any new component.");
  lines.push("- Use `<Card>` not `<div className=\"rounded border\">`.");
  if (utilities.hasShadcn) {
    lines.push("- Use CVA variants for styling. Use `asChild` for composition.");
  }
  lines.push("");

  // Component list
  lines.push("## Available Components");
  lines.push("");

  const grouped: Record<string, typeof components> = {};
  for (const comp of components) {
    const parts = comp.path.split("/");
    parts.pop();
    const dir = parts.pop() || "root";
    if (!grouped[dir]) grouped[dir] = [];
    grouped[dir].push(comp);
  }

  for (const [dir, comps] of Object.entries(grouped)) {
    lines.push(`### ${dir}`);
    lines.push("");
    for (const comp of comps) {
      const exports = comp.exports.map(e => `\`${e}\``).join(", ");
      lines.push(`- ${exports} — \`${comp.importPath}\``);
      if (comp.props && comp.props.length > 0) {
        lines.push(`  Props: ${comp.props.slice(0, 5).join(", ")}`);
      }
    }
    lines.push("");
  }

  // Variants
  if (variants.length > 0) {
    lines.push("## Variants");
    lines.push("");
    for (const v of variants.slice(0, 10)) {
      const types = Object.entries(v.variants)
        .map(([type, options]) => `${type}: ${options.join(", ")}`)
        .join(" | ");
      lines.push(`- **${v.component}**: ${types}`);
    }
    lines.push("");
  }

  // Barrel imports
  if (barrels.length > 0) {
    lines.push("## Preferred Imports");
    lines.push("");
    for (const barrel of barrels.slice(0, 5)) {
      const exports = barrel.exports.filter(e => !e.startsWith("*")).slice(0, 4).join(", ");
      if (exports) lines.push(`- \`import { ${exports} } from "${barrel.importPath}"\``);
    }
    lines.push("");
  }

  return { path: ".cursor/rules/components.mdc", content: lines.join("\n") };
}

function generateApiMdc(scan: ScanResult): MdcFile {
  const { apiRoutes, framework, envVars } = scan;
  const lines: string[] = [];

  lines.push("---");
  lines.push("description: API route conventions and endpoints");
  lines.push("globs: src/app/api/**,app/api/**,pages/api/**");
  lines.push("---");
  lines.push("");

  lines.push("# API Rules");
  lines.push("");

  // Rules
  if (framework.name === "Next.js") {
    lines.push("- Use Route Handlers (GET, POST, PUT, DELETE exports).");
    lines.push("- Validate request bodies with Zod.");
    lines.push("- Return NextResponse.json() with proper status codes.");
    lines.push("- Check authentication before processing protected routes.");
  }
  lines.push("");

  // Endpoints
  lines.push("## Endpoints");
  lines.push("");
  for (const route of apiRoutes.slice(0, 20)) {
    const methods = route.methods.join(", ");
    const auth = route.isProtected ? " [AUTH]" : "";
    lines.push(`- \`${methods}\` \`${route.path}\`${auth}`);

    if (route.requestSchema && route.requestSchema.fields.length > 0) {
      const fields = route.requestSchema.fields.slice(0, 3).map(f => `${f.name}: ${f.type}`).join(", ");
      lines.push(`  Body: { ${fields} }`);
    }
  }
  lines.push("");

  // Env vars relevant to API
  const apiEnvVars = envVars.filter(e => e.category === "database" || e.category === "auth" || e.required);
  if (apiEnvVars.length > 0) {
    lines.push("## Environment");
    lines.push("");
    for (const env of apiEnvVars.slice(0, 10)) {
      lines.push(`- \`${env.name}\`${env.required ? " (required)" : ""}`);
    }
    lines.push("");
  }

  return { path: ".cursor/rules/api.mdc", content: lines.join("\n") };
}

function generateDatabaseMdc(scan: ScanResult): MdcFile {
  const { database } = scan;
  const lines: string[] = [];

  lines.push("---");
  lines.push("description: Database schema and conventions");
  lines.push("globs: prisma/**,drizzle/**,src/db/**,src/lib/db*");
  lines.push("---");
  lines.push("");

  lines.push("# Database Rules");
  lines.push("");

  if (database!.provider === "prisma") {
    lines.push("- Use Prisma Client for all database operations.");
    lines.push("- Run `npx prisma db push` after schema changes.");
    lines.push("- Use `include` for relations, avoid N+1 queries.");
  } else if (database!.provider === "drizzle") {
    lines.push("- Use Drizzle ORM for all database operations.");
    lines.push("- Run `npx drizzle-kit push` after schema changes.");
  }
  lines.push("");

  // Models
  lines.push("## Models");
  lines.push("");
  for (const model of database!.models) {
    lines.push(`### ${model.name}`);
    lines.push("");
    lines.push(`Fields: ${model.fields.join(", ")}`);
    if (model.relations.length > 0) {
      lines.push(`Relations: ${model.relations.join(", ")}`);
    }
    lines.push("");
  }

  return { path: ".cursor/rules/database.mdc", content: lines.join("\n") };
}
