/**
 * Extract Exports
 *
 * Regex-based extraction of all exported symbols from a source file,
 * including compact signatures for functions and types.
 *
 * @module utils/extract-exports
 */

/** Represents a single exported symbol with optional signature */
export interface ExportedSymbol {
  /** The symbol name */
  name: string;
  /** The kind of export */
  kind: "function" | "class" | "const" | "let" | "var" | "type" | "interface" | "enum" | "default" | "re-export";
  /**
   * Compact signature for display in context injection.
   * e.g. "(userId: string) => Promise<User>" for functions
   *      "{ id: string; name: string }" for types
   */
  signature?: string;
}

/**
 * Extracts all exported symbol names from file content.
 */
export function extractAllExports(content: string): string[] {
  return extractExportedSymbols(content).map(s => s.name);
}

/**
 * Extracts all exported symbols with kinds and compact signatures.
 */
export function extractExportedSymbols(content: string): ExportedSymbol[] {
  const symbols: ExportedSymbol[] = [];
  const seen = new Set<string>();

  const add = (name: string, kind: ExportedSymbol["kind"], signature?: string) => {
    if (name && !seen.has(name)) {
      seen.add(name);
      symbols.push({ name, kind, ...(signature ? { signature } : {}) });
    }
  };

  const cleaned = removeComments(content);

  // export [async] function foo(params): ReturnType
  for (const m of cleaned.matchAll(
    /export\s+(?:async\s+)?function\*?\s+(\w+)\s*(\([^)]*\))(?:\s*:\s*([^\n{;]+))?/g
  )) {
    const params = m[2].trim();
    const ret = m[3]?.trim();
    const sig = ret ? `${params} => ${ret}` : params;
    add(m[1], "function", sig.length > 80 ? params : sig);
  }

  // export class Foo [extends Bar]
  for (const m of cleaned.matchAll(/export\s+(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/g)) {
    add(m[1], "class", m[2] ? `extends ${m[2]}` : undefined);
  }

  // export const foo = (params): ReturnType => ...  (arrow function)
  for (const m of cleaned.matchAll(
    /export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)(?:\s*:\s*([^\n=>{]+))?\s*=>/g
  )) {
    const params = `(${m[2].trim()})`;
    const ret = m[3]?.trim();
    const sig = ret ? `${params} => ${ret}` : params;
    add(m[1], "const", sig.length > 80 ? params : sig);
  }

  // export const foo = value  (non-function)
  for (const m of cleaned.matchAll(/export\s+const\s+(\w+)\s*(?::\s*([^=\n]+))?\s*=/g)) {
    if (!seen.has(m[1])) {
      const typeAnnotation = m[2]?.trim();
      add(m[1], "const", typeAnnotation && typeAnnotation.length < 60 ? typeAnnotation : undefined);
    }
  }

  // export let/var
  for (const m of cleaned.matchAll(/export\s+(let|var)\s+(\w+)/g)) {
    add(m[2], m[1] as "let" | "var");
  }

  // export type Foo = ...
  for (const m of cleaned.matchAll(/export\s+type\s+(\w+)(?:<[^>]*>)?\s*=\s*([^\n;{]+)/g)) {
    const rhs = m[2].trim();
    add(m[1], "type", rhs.length < 60 ? rhs : undefined);
  }

  // export type Foo { (object shorthand — no =) }
  for (const m of cleaned.matchAll(/export\s+type\s+(\w+)(?:<[^>]*>)?\s*\{/g)) {
    add(m[1], "type");
  }

  // export interface Foo [extends Bar]
  for (const m of cleaned.matchAll(/export\s+interface\s+(\w+)(?:\s+extends\s+([\w,\s]+))?\s*\{/g)) {
    add(m[1], "interface", m[2]?.trim() ? `extends ${m[2].trim()}` : undefined);
  }

  // export enum Foo
  for (const m of cleaned.matchAll(/export\s+enum\s+(\w+)/g)) {
    add(m[1], "enum");
  }

  // export default function Foo / export default class Foo
  for (const m of cleaned.matchAll(
    /export\s+default\s+(?:async\s+)?function\s+(\w+)\s*(\([^)]*\))(?:\s*:\s*([^\n{;]+))?/g
  )) {
    const params = m[2].trim();
    const ret = m[3]?.trim();
    add(m[1], "default", ret ? `${params} => ${ret}` : params);
  }
  for (const m of cleaned.matchAll(/export\s+default\s+(?:abstract\s+)?class\s+(\w+)/g)) {
    add(m[1], "default");
  }

  // export { foo, bar as baz }  (named, no from clause)
  for (const m of cleaned.matchAll(/export\s*\{([^}]+)\}/g)) {
    const afterBrace = cleaned.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 30);
    if (/^\s*from\s+['"]/.test(afterBrace)) continue;
    for (const name of m[1].split(",")) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+as\s+/);
      const exportedName = (parts[1] || parts[0]).trim();
      if (exportedName && /^\w+$/.test(exportedName) && exportedName !== "default") {
        add(exportedName, "re-export");
      }
    }
  }

  // Python: top-level def foo(params)
  for (const m of cleaned.matchAll(/^def\s+(\w+)\s*(\([^)]*\))(?:\s*->\s*([^\n:]+))?/gm)) {
    if ((m.index ?? 0) === cleaned.lastIndexOf("\n", (m.index ?? 0)) + 1) {
      const sig = m[3]?.trim() ? `${m[2].trim()} -> ${m[3].trim()}` : m[2].trim();
      add(m[1], "function", sig.length < 80 ? sig : m[2].trim());
    }
  }

  // Python: top-level class Foo
  for (const m of cleaned.matchAll(/^class\s+(\w+)(?:\(([^)]*)\))?/gm)) {
    if ((m.index ?? 0) === cleaned.lastIndexOf("\n", (m.index ?? 0)) + 1) {
      add(m[1], "class", m[2]?.trim() ? `extends ${m[2].trim()}` : undefined);
    }
  }

  // Go: exported func Foo(params) ReturnType
  for (const m of cleaned.matchAll(/^func\s+(\([^)]*\)\s+)?([A-Z]\w*)\s*(\([^)]*\))(?:\s+([^\n{]+))?/gm)) {
    const sig = m[4]?.trim() ? `${m[3].trim()} ${m[4].trim()}` : m[3].trim();
    add(m[2], "function", sig.length < 80 ? sig : m[3].trim());
  }

  // Rust: pub [async] fn foo(params) -> ReturnType
  for (const m of cleaned.matchAll(/pub\s+(?:async\s+)?fn\s+(\w+)\s*(\([^)]*\))(?:\s*->\s*([^\n{]+))?/g)) {
    const sig = m[3]?.trim() ? `${m[2].trim()} -> ${m[3].trim()}` : m[2].trim();
    add(m[1], "function", sig.length < 80 ? sig : m[2].trim());
  }
  for (const m of cleaned.matchAll(/pub\s+struct\s+(\w+)/g)) {
    add(m[1], "class");
  }
  for (const m of cleaned.matchAll(/pub\s+enum\s+(\w+)/g)) {
    add(m[1], "enum");
  }
  for (const m of cleaned.matchAll(/pub\s+trait\s+(\w+)/g)) {
    add(m[1], "interface");
  }

  return symbols;
}

/**
 * Extract named imports from a file's import statements for a given source path.
 * Returns list of symbol names imported from that source.
 *
 * e.g. `import { auth, signIn } from "@/lib/auth"` → ["auth", "signIn"]
 */
export function extractNamedImportsFrom(content: string, sourcePath: string): string[] {
  const names: string[] = [];
  const cleaned = removeComments(content);

  // Match: import { a, b as c } from "..."
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  for (const m of cleaned.matchAll(importRegex)) {
    const specifier = m[2];
    // Loose match — check if the specifier resolves to sourcePath
    if (!specifierMatchesPath(specifier, sourcePath)) continue;
    for (const name of m[1].split(",")) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      // "foo as bar" → use local name "bar" (that's what the file actually uses)
      // but we want the imported name "foo" (the export from the source)
      const parts = trimmed.split(/\s+as\s+/);
      const importedName = parts[0].trim();
      if (importedName && /^\w+$/.test(importedName)) {
        names.push(importedName);
      }
    }
  }

  // Match: import DefaultExport from "..."
  const defaultRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  for (const m of cleaned.matchAll(defaultRegex)) {
    if (!specifierMatchesPath(m[2], sourcePath)) continue;
    names.push("default");
  }

  return [...new Set(names)];
}

/** Check if an import specifier likely resolves to the given relative path */
function specifierMatchesPath(specifier: string, filePath: string): boolean {
  // Strip extension from filePath for comparison
  const fileBase = filePath.replace(/\.[^.]+$/, "");
  const fileBaseName = fileBase.split("/").pop() ?? fileBase;

  // @/ alias → src/
  const normalized = specifier.replace(/^@\//, "src/").replace(/^~\//, "");

  // Strip extension from specifier
  const specBase = normalized.replace(/\.[^.]+$/, "");
  const specBaseName = specBase.split("/").pop() ?? specBase;

  // Check if tails match
  return fileBase.endsWith(specBase) || fileBase.endsWith(normalized) || fileBaseName === specBaseName;
}

/** Strips single-line and multi-line comments from source code */
function removeComments(content: string): string {
  let result = content.replace(/\/\/.*$/gm, "");
  result = result.replace(/\/\*[\s\S]*?\*\//g, "");
  result = result.replace(/`(?:[^`\\]|\\.)*`/g, '""');
  return result;
}
