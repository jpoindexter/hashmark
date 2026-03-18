/**
 * Agent Company Generator
 *
 * Takes a ScanResult + selected departments and generates
 * .claude/agents/{dept}/{role}.md files + INDEX.md
 */

import type { ScanResult } from "../types.js";
import { ALL_TEMPLATES, getTemplatesByDepartment, type AgentContext, type Department, type RoleTemplate } from "./role-templates.js";

export interface AgentFile {
  path: string;
  content: string;
  role: string;
  department: string;
}

export interface GenerateAgentsOptions {
  departments?: Department[];
  projectName?: string;
}

/**
 * Build the AgentContext from a ScanResult.
 * This is the bridge between scanner output and template interpolation.
 */
function buildContext(scan: ScanResult, projectName: string): AgentContext {
  const { framework, components, apiRoutes, database, stats, commands, envVars, existingContext } = scan;

  // Components grouped by directory for display
  const grouped: Record<string, string[]> = {};
  for (const comp of components) {
    const parts = comp.path.split("/");
    parts.pop();
    const dir = parts.pop() || "root";
    if (!grouped[dir]) grouped[dir] = [];
    grouped[dir].push(comp.name);
  }
  const componentsList = Object.entries(grouped)
    .map(([dir, names]) => `- **${dir}**: ${names.join(", ")}`)
    .join("\n") || "- No components detected";

  // API routes formatted
  const apiRoutesList = apiRoutes.slice(0, 20)
    .map(r => `- \`${r.methods.join(", ")}\` \`${r.path}\`${r.isProtected ? " (auth)" : ""}`)
    .join("\n") || "- No API routes detected";

  // DB models
  const dbModelsList = database?.models.slice(0, 15)
    .map(m => {
      const fields = m.fields.slice(0, 5).join(", ");
      const more = m.fields.length > 5 ? ` +${m.fields.length - 5}` : "";
      return `- **${m.name}**: ${fields}${more}`;
    })
    .join("\n") || "- No database detected";

  // High-impact files
  const highImpactFiles = scan.importGraph?.hubFiles.slice(0, 6)
    .map(h => `- \`${h.file}\` (${h.importedByCount} dependents)`)
    .join("\n") || "- No import graph data";

  // Critical rules from claude-md generator logic
  const rules: string[] = [];
  if (components.length > 0) rules.push(`- **ALWAYS** check existing ${components.length} components before creating new ones`);
  if (framework.name === "Next.js") {
    rules.push("- **Prefer** Server Components — only add `'use client'` when needed");
    rules.push("- **ALWAYS** use `next/image` for images and `next/link` for navigation");
  }
  if (framework.language === "TypeScript") rules.push("- **NEVER** use `any` — use proper types or `unknown`");
  if (framework.styling === "Tailwind CSS") rules.push("- **NEVER** use arbitrary values (`w-[137px]`) — use Tailwind scale values");
  const criticalRules = rules.join("\n") || "- Follow project conventions";

  // Detect capabilities from env vars and integrations
  const envNames = envVars.map(e => e.name);
  const depNames = scan.dependencies?.map((d: { component: string }) => d.component) ?? [];
  const hasStripe = envNames.some(n => n.includes("STRIPE")) || depNames.some((d: string) => d.includes("stripe"));
  const hasAI = depNames.some((d: string) => d.includes("anthropic") || d.includes("openai") || d.includes("ai-sdk"));
  const hasAuth = envNames.some(n => n.includes("AUTH") || n.includes("NEXTAUTH") || n.includes("CLERK")) ||
    apiRoutes.some(r => r.isProtected) || false;

  return {
    projectName,
    framework: framework.name !== "Unknown" ? `${framework.name}${framework.version ? ` ${framework.version}` : ""}` : "Unknown",
    language: framework.language || "TypeScript",
    styling: framework.styling,
    router: framework.router,
    componentsCount: components.length,
    componentsList,
    apiRoutes: apiRoutesList,
    dbModels: dbModelsList,
    dbProvider: database?.provider,
    highImpactFiles,
    criticalRules,
    hasAuth,
    hasStripe,
    hasAI,
    hasTests: (scan.testCoverage?.testFramework || "none") !== "none",
    hasCI: false, // TODO: detect from .github/workflows
    testFramework: scan.testCoverage?.testFramework,
    devCommand: commands.dev ? "npm run dev" : "",
    buildCommand: commands.build ? "npm run build" : "",
    lintCommand: commands.lint ? "npm run lint" : "",
    typecheckCommand: commands.typecheck ? "npm run typecheck" : "npx tsc --noEmit",
  };
}

/**
 * Select which templates are relevant for this codebase.
 * Some roles are always included; others require detected capabilities.
 */
function selectTemplates(templates: RoleTemplate[], ctx: AgentContext): RoleTemplate[] {
  return templates.filter(t => {
    // Engineering: conditional on what the scan found
    if (t.id === "database-architect") return !!ctx.dbProvider;
    if (t.id === "ai-engineer") return ctx.hasAI;
    if (t.id === "test-results-analyzer") return ctx.hasTests;
    if (t.id === "devops-automator") return ctx.hasCI || true; // always useful
    if (t.id === "sre") return true;
    // All others: always include
    return true;
  });
}

/**
 * Generate the INDEX.md company overview file.
 */
function generateIndex(files: AgentFile[], ctx: AgentContext): string {
  const byDept: Record<string, AgentFile[]> = {};
  for (const f of files) {
    if (!byDept[f.department]) byDept[f.department] = [];
    byDept[f.department].push(f);
  }

  const lines: string[] = [
    `# ${ctx.projectName} — Agent Company`,
    "",
    `> Generated by [hashmark](https://hashmark.md) · ${ctx.framework} · ${ctx.language}`,
    "",
    "## How to Use",
    "",
    "Claude Code picks the right agent based on your request.",
    "To invoke manually: *\"use the database-architect agent to...\"*",
    "",
  ];

  for (const [dept, agents] of Object.entries(byDept)) {
    lines.push(`## ${dept.charAt(0).toUpperCase() + dept.slice(1)}`);
    lines.push("");
    for (const agent of agents) {
      lines.push(`- **${agent.role}** — \`.claude/agents/${agent.path}\``);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`*${files.length} agents · scan your codebase again to refresh context*`);

  return lines.join("\n");
}

/**
 * Main entry point: generate all agent files from a scan result.
 */
export function generateAgentCompany(
  scan: ScanResult,
  options: GenerateAgentsOptions = {}
): { agents: AgentFile[]; index: string } {
  const projectName = options.projectName || scan.framework?.name || "Project";

  const ctx = buildContext(scan, projectName);

  const departments = options.departments || ["engineering", "product", "design", "marketing", "sales", "operations", "pr"];

  const agents: AgentFile[] = [];

  for (const dept of departments) {
    const templates = getTemplatesByDepartment(dept as Department);
    const selected = selectTemplates(templates, ctx);

    for (const template of selected) {
      agents.push({
        path: template.file,
        content: template.generate(ctx),
        role: template.id,
        department: dept,
      });
    }
  }

  const index = generateIndex(agents, ctx);

  return { agents, index };
}
