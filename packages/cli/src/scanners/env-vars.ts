/**
 * Environment Variable Scanner Plugin
 */

import type { EnvVar } from "../types.js";
import type { ScannerPlugin, ScannerContext } from "../engine/types.js";

export class EnvVarsScanner implements ScannerPlugin<EnvVar[]> {
  name = "envVars";
  filePatterns = ["**/.env*", "**/env.ts", "**/env.js", "**/env/*.ts"];
  
  private envVars: EnvVar[] = [];
  private seenVars = new Set<string>();

  async onFile(path: string, content: string) {
    if (path.includes(".env") && (path.endsWith(".example") || path.endsWith(".sample") || path.endsWith(".local"))) {
      parseEnvExample(content, this.envVars, this.seenVars);
    } else if (path.includes("env.") || path.includes("/env/")) {
      parseZodValidation(content, this.envVars, this.seenVars);
    }
  }

  getResult() {
    return this.envVars.sort((a, b) => a.name.localeCompare(b.name));
  }
}

function parseEnvExample(content: string, envVars: EnvVar[], seenVars: Set<string>): void {
  const lines = content.split("\n");
  let currentCategory: string | undefined;

  for (const line of lines) {
    const categoryMatch = line.match(/^#\s*[-=]+\s*(.+?)\s*[-=]*$/i) || line.match(/^#\s*\[(.+?)\]/) || line.match(/^#\s*(.+):?\s*$/);
    if (categoryMatch && !line.includes("=")) {
      const cat = categoryMatch[1].trim();
      if (cat.length > 2 && cat.length < 50) currentCategory = cat;
      continue;
    }

    const varMatch = line.match(/^([A-Z][A-Z0-9_]+)\s*=\s*(.*)$/);
    if (varMatch && !seenVars.has(varMatch[1])) {
      const name = varMatch[1];
      const value = varMatch[2];
      seenVars.add(name);
      envVars.push({
        name,
        required: !value || value === '""' || value === "''",
        hasDefault: !!value && value !== '""' && value !== "''",
        category: currentCategory,
      });
    }
  }
}

function parseZodValidation(content: string, envVars: EnvVar[], seenVars: Set<string>): void {
  const patterns = [
    /([A-Z][A-Z0-9_]+)\s*:\s*z\.string\(\)(?:\.min\([^)]+\))?(?:\.optional\(\))/g,
    /([A-Z][A-Z0-9_]+)\s*:\s*z\.string\(\)(?:\.min\([^)]+\))?(?!\.optional)/g,
    /env\.([A-Z][A-Z0-9_]+)/g,
    /process\.env\.([A-Z][A-Z0-9_]+)/g,
  ];

  for (const pattern of patterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const name = match[1];
      if (!seenVars.has(name)) {
        seenVars.add(name);
        const isOptional = content.includes(`${name}: z.string().optional()`);
        envVars.push({ name, required: !isOptional, hasDefault: false });
      }
    }
  }
}

/** Legacy support */
export async function scanEnvVars(dir: string): Promise<EnvVar[]> {
  const { ScannerRegistry } = await import("../engine/registry.js");
  const { CodebaseVisitor } = await import("../engine/visitor.js");
  const registry = new ScannerRegistry().register(new EnvVarsScanner());
  const visitor = new CodebaseVisitor(registry);
  const result = await visitor.visit(dir);
  return result.pluginResults.envVars;
}
