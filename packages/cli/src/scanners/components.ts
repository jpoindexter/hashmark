/**
 * Component Scanner Plugin
 *
 * Discovers React components in a codebase during the single-pass traversal.
 */

import { basename } from "path";
import type { Component, ComponentComplexity } from "../types.js";
import type { ScannerPlugin, ScannerContext } from "../engine/types.js";

/** Next.js special files that should not be treated as reusable components */
const SKIP_FILES = [
  "page.tsx", "page.jsx", "layout.tsx", "layout.jsx", "loading.tsx", "loading.jsx",
  "error.tsx", "error.jsx", "not-found.tsx", "not-found.jsx", "template.tsx",
  "template.jsx", "default.tsx", "default.jsx", "route.ts", "route.js",
  "middleware.ts", "middleware.js", "index.ts", "types.ts", "types.tsx",
  "utils.ts", "utils.tsx", "constants.ts", "constants.tsx", "config.ts", "config.tsx",
];

export class ComponentsScanner implements ScannerPlugin<Component[]> {
  name = "components";
  filePatterns = ["**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.svelte"];
  private components: Component[] = [];

  async onFile(path: string, content: string, context: ScannerContext) {
    const fileName = basename(path);
    if (SKIP_FILES.includes(fileName)) return;
    
    // Ignore test/story files
    if (/\.(test|spec|stories)\./.test(fileName)) return;

    const exports = extractExports(content);
    if (exports.length === 0) return;

    const name = getComponentName(path, exports);
    const importPath = toImportPath(path);
    const props = extractProps(content);
    const description = extractJSDoc(content, exports[0]);
    const complexity = extractComplexity(content, props.length);

    this.components.push({
      name,
      path,
      importPath,
      exports,
      ...(props.length > 0 && { props }),
      ...(description && { description }),
      complexity,
    });
  }

  getResult() {
    return this.components.sort((a, b) => a.path.localeCompare(b.path));
  }
}

/**
 * Extracts exported component names from file content
 */
export function extractExports(content: string): string[] {
  const exports: string[] = [];
  const funcMatches = content.matchAll(/export\s+function\s+([A-Z][a-zA-Z0-9]*)/g);
  for (const match of funcMatches) exports.push(match[1]);

  const constMatches = content.matchAll(/export\s+const\s+([A-Z][a-zA-Z0-9]*)/g);
  for (const match of constMatches) exports.push(match[1]);

  const defaultFuncMatches = content.matchAll(/export\s+default\s+function\s+([A-Z][a-zA-Z0-9]*)/g);
  for (const match of defaultFuncMatches) exports.push(match[1]);

  const namedExportMatches = content.matchAll(/export\s*\{\s*([^}]+)\s*\}/g);
  for (const match of namedExportMatches) {
    const names = match[1].split(",").map((n) => n.trim().split(" ")[0]);
    for (const name of names) {
      if (/^[A-Z]/.test(name)) exports.push(name);
    }
  }
  return [...new Set(exports)];
}

function getComponentName(file: string, exports: string[]): string {
  const fileName = basename(file, ".tsx").replace(".jsx", "");
  const pascalName = toPascalCase(fileName);
  return exports.includes(pascalName) ? pascalName : (exports[0] || pascalName);
}

function toPascalCase(str: string): string {
  return str.split(/[-_]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

function toImportPath(file: string): string {
  const withoutExt = file.replace(/\.(tsx|jsx|vue|svelte)$/, "");
  const srcIndex = withoutExt.lastIndexOf("src/");
  return "@/" + (srcIndex !== -1 ? withoutExt.slice(srcIndex + 4) : withoutExt);
}

function extractProps(content: string): string[] {
  const props: string[] = [];
  const interfaceMatch = content.match(/interface\s+\w*Props\s*(?:extends[^{]+)?\{([^}]+)\}/s);
  if (interfaceMatch) {
    const propMatches = interfaceMatch[1].matchAll(/^\s*(\w+)\??:/gm);
    for (const match of propMatches) props.push(match[1]);
  }
  const typeMatch = content.match(/type\s+\w*Props\s*=\s*\{([^}]+)\}/s);
  if (typeMatch && props.length === 0) {
    const propMatches = typeMatch[1].matchAll(/^\s*(\w+)\??:/gm);
    for (const match of propMatches) props.push(match[1]);
  }
  return [...new Set(props.filter(p => !["ref", "key", "children"].includes(p)))];
}

function extractComplexity(content: string, propCount: number): ComponentComplexity {
  const importCount = [...content.matchAll(/^import\s+/gm)].length;
  const lineCount = content.split("\n").filter(l => l.trim()).length;
  return {
    propCount, importCount, lineCount,
    hasState: /\buse(?:State|Reducer)\s*\(/.test(content),
    hasEffects: /\buseEffect\s*\(/.test(content),
    hasContext: /\buseContext\s*\(/.test(content),
  };
}

function extractJSDoc(content: string, componentName: string): string | undefined {
  const patterns = [
    new RegExp(`\\/\\*\\*([\\s\\S]*?)\\*\\/\\s*export\\s+(?:function|const)\\s+${componentName}`, "m"),
    new RegExp(`\\/\\*\\*([\\s\\S]*?)\\*\\/\\s*export\\s+default\\s+function\\s+${componentName}`, "m"),
    /^\/\*\*([\s\S]*?)\*\//m,
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      const descMatch = match[1].match(/^\s*\*?\s*([^@*\n][^\n]*)/m);
      if (descMatch) {
        const desc = descMatch[1].trim();
        if (desc && !desc.startsWith("use ") && desc.length > 5) return desc;
      }
    }
  }
  return undefined;
}

/** Legacy support */
export async function scanComponents(dir: string, excludePatterns: string[] = []): Promise<Component[]> {
  // Use CodebaseVisitor for legacy call
  const { ScannerRegistry } = await import("../engine/registry.js");
  const { CodebaseVisitor } = await import("../engine/visitor.js");
  const registry = new ScannerRegistry().register(new ComponentsScanner());
  const visitor = new CodebaseVisitor(registry);
  const result = await visitor.visit(dir, excludePatterns);
  return result.pluginResults.components;
}
