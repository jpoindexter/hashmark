/**
 * Database Schema Scanner Plugin
 */

import type { DatabaseSchema, DatabaseModel } from "../types.js";
import type { ScannerPlugin, ScannerContext } from "../engine/types.js";

export class DatabaseScanner implements ScannerPlugin<DatabaseSchema | null> {
  name = "database";
  filePatterns = ["**/*.prisma", "**/schema.ts", "**/schema.js"];
  
  private schema: DatabaseSchema | null = null;

  async onFile(path: string, content: string) {
    if (path.endsWith(".prisma")) {
      const models = extractPrismaModels(content);
      if (models.length > 0) {
        this.schema = { provider: "prisma", models: [...(this.schema?.models || []), ...models] };
      }
    } else if (content.includes("pgTable") || content.includes("mysqlTable") || content.includes("sqliteTable")) {
      const models = extractDrizzleTables(content);
      if (models.length > 0) {
        this.schema = { provider: "drizzle", models: [...(this.schema?.models || []), ...models] };
      }
    }
  }

  getResult() {
    return this.schema;
  }
}

function extractPrismaModels(content: string): DatabaseModel[] {
  const models: DatabaseModel[] = [];
  const modelMatches = content.matchAll(/model\s+(\w+)\s*\{([^}]+)\}/g);
  for (const match of modelMatches) {
    const [name, body] = [match[1], match[2]];
    const fields: string[] = [];
    const relations: string[] = [];
    for (const line of body.split("\n")) {
      const fieldMatch = line.trim().match(/^(\w+)\s+(\w+)/);
      if (fieldMatch && !line.trim().startsWith("@@")) {
        const [fName, fType] = [fieldMatch[1], fieldMatch[2]];
        if (["String", "Int", "Float", "Boolean", "DateTime", "Json"].includes(fType)) fields.push(fName);
        else relations.push(fName);
      }
    }
    models.push({ name, fields, relations });
  }
  return models;
}

function extractDrizzleTables(content: string): DatabaseModel[] {
  const models: DatabaseModel[] = [];
  const tableRegex = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:pg|mysql|sqlite)Table\s*\(\s*['"`](\w+)['"`]\s*,\s*\{([^}]+)\}/g;
  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    const [varName, tableName, tableBody] = [match[1], match[2], match[3]];
    const fields: string[] = [];
    const columnRegex = /(\w+)\s*:\s*(\w+)\s*\(/g;
    let colMatch;
    while ((colMatch = columnRegex.exec(tableBody)) !== null) fields.push(colMatch[1]);
    models.push({ name: tableName, fields, relations: [] });
  }
  return models;
}

/** Legacy support */
export async function scanDatabase(dir: string): Promise<DatabaseSchema | null> {
  const { ScannerRegistry } = await import("../engine/registry.js");
  const { CodebaseVisitor } = await import("../engine/visitor.js");
  const registry = new ScannerRegistry().register(new DatabaseScanner());
  const visitor = new CodebaseVisitor(registry);
  const result = await visitor.visit(dir);
  return result.pluginResults.database;
}
