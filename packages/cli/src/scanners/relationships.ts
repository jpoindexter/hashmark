/**
 * Relationship Mapper Scanner Plugin
 * 
 * Maps semantic relationships between different entities in the codebase:
 * - Which Components use which Hooks
 * - Which API Routes call which Database Models
 * - Which Utils are used by which Files
 */

import type { ScannerPlugin, ScannerContext } from "../engine/types.js";

export interface RelationshipMap {
  componentToHooks: Record<string, string[]>;
  apiToModels: Record<string, string[]>;
}

export class RelationshipScanner implements ScannerPlugin<RelationshipMap> {
  name = "relationships";
  filePatterns = ["**/*.tsx", "**/*.ts", "**/*.js"];
  
  private componentToHooks: Record<string, string[]> = {};
  private apiToModels: Record<string, string[]> = {};

  async onFile(path: string, content: string, context: ScannerContext) {
    // 1. Map Components to Hooks (React projects)
    if (path.endsWith(".tsx")) {
      const componentName = this.extractName(path);
      const hooks = this.extractUsedHooks(content);
      if (hooks.length > 0) {
        this.componentToHooks[componentName] = hooks;
      }
    }

    // 2. Map API Routes to Models (Prisma/Drizzle)
    if (path.includes("/api/") && (path.endsWith(".ts") || path.endsWith(".js"))) {
      const models = this.extractUsedModels(content);
      if (models.length > 0) {
        this.apiToModels[path] = models;
      }
    }
  }

  private extractName(path: string): string {
    const parts = path.split("/");
    return parts[parts.length - 1].split(".")[0];
  }

  private extractUsedHooks(content: string): string[] {
    // Look for useXxx() calls
    const matches = content.matchAll(/\b(use[A-Z][a-zA-Z0-9]*)\s*\(/g);
    return [...new Set([...matches].map(m => m[1]))];
  }

  private extractUsedModels(content: string): string[] {
    // Look for db.model.xxx() calls (Prisma style)
    const matches = content.matchAll(/\bdb\.([a-z][a-zA-Z0-9]*)\./g);
    return [...new Set([...matches].map(m => m[1]))];
  }

  getResult() {
    return {
      componentToHooks: this.componentToHooks,
      apiToModels: this.apiToModels,
    };
  }
}
