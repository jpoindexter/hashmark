import type { ScanResult } from "../types.js";

/**
 * Intermediate Representation (IR) of the codebase context.
 * This structure is optimized for consumption by generators.
 * It transforms the raw ScanResult into a logical, hierarchical tree.
 */
export interface ContextIR {
  metadata: {
    projectName: string;
    framework: string;
    language: string;
    stats: {
      files: number;
      lines: number;
      tokens: number;
    };
  };
  sections: IRSection[];
}

export interface IRSection {
  id: string;
  title: string;
  description?: string;
  content: IRContent;
}

export type IRContent = 
  | { type: "list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "tree"; data: any }
  | { type: "text"; text: string }
  | { type: "group"; groups: Record<string, IRSection[]> };

/**
 * Transforms raw ScanResult into the Intermediate Representation.
 * This is the "logic" layer that generators previously had to implement themselves.
 */
export function transformToIR(result: ScanResult): ContextIR {
  const { components, framework, stats, apiRoutes, latentHooks, aiReadiness } = result;

  const sections: IRSection[] = [];

  // 1. AI Readiness
  if (aiReadiness) {
    sections.push({
      id: "readiness",
      title: "AI READINESS",
      content: {
        type: "table",
        headers: ["Metric", "Score"],
        rows: Object.entries(aiReadiness.breakdown).map(([k, v]) => [k.toUpperCase(), `${v}/20`])
      }
    });
  }

  // 2. Automation Hooks
  if (latentHooks.length > 0) {
    sections.push({
      id: "hooks",
      title: "AUTOMATION HOOKS",
      content: {
        type: "list",
        items: latentHooks.map(h => `${h.event}: ${h.command}`)
      }
    });
  }

  // 3. Components
  sections.push({
    id: "components",
    title: "COMPONENTS",
    content: {
      type: "table",
      headers: ["Name", "Path"],
      rows: components.slice(0, 100).map(c => [c.name, c.path])
    }
  });

  return {
    metadata: {
      projectName: "Project",
      framework: framework.name,
      language: framework.language,
      stats: {
        files: stats.totalFiles,
        lines: stats.totalLines,
        tokens: 0, // Calculated later
      }
    },
    sections
  };
}
