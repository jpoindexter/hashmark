/**
 * Custom Hooks Scanner Plugin
 */

import type { Hook } from "../types.js";
import type { ScannerPlugin } from "../engine/types.js";

export class HooksScanner implements ScannerPlugin<Hook[]> {
  name = "hooks";
  filePatterns = ["**/{hooks,composables}/**/*.{ts,tsx}"];
  private hooks: Hook[] = [];

  async onFile(path: string, content: string) {
    if (path.includes("node_modules") || path.includes(".test.") || path.includes(".spec.")) return;
    
    const hookNames = extractHookNames(content);
    const isClientOnly = content.includes("'use client'") || content.includes('"use client"');

    for (const name of hookNames) {
      this.hooks.push({
        name,
        path,
        importPath: toImportPath(path),
        isClientOnly,
      });
    }
  }

  getResult() {
    return this.hooks.sort((a, b) => a.name.localeCompare(b.name));
  }
}

function extractHookNames(content: string): string[] {
  const hooks: string[] = [];
  const funcMatches = content.matchAll(/export\s+function\s+(use[A-Z][a-zA-Z0-9]*)/g);
  for (const match of funcMatches) hooks.push(match[1]);

  const constMatches = content.matchAll(/export\s+const\s+(use[A-Z][a-zA-Z0-9]*)/g);
  for (const match of constMatches) hooks.push(match[1]);

  return [...new Set(hooks)];
}

function toImportPath(file: string): string {
  const withoutExt = file.replace(/\.(tsx?|jsx?)$/, "");
  const srcIndex = withoutExt.lastIndexOf("src/");
  return "@/" + (srcIndex !== -1 ? withoutExt.slice(srcIndex + 4) : withoutExt);
}

/** Legacy support */
export async function scanHooks(dir: string): Promise<Hook[]> {
  const { ScannerRegistry } = await import("../engine/registry.js");
  const { CodebaseVisitor } = await import("../engine/visitor.js");
  const registry = new ScannerRegistry().register(new HooksScanner());
  const visitor = new CodebaseVisitor(registry);
  const result = await visitor.visit(dir);
  return result.pluginResults.hooks;
}
