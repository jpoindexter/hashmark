/**
 * Extract Exports
 *
 * Regex-based extraction of all exported symbols from a source file.
 * Handles functions, classes, constants, types, interfaces, enums,
 * default exports, and named re-exports.
 *
 * @module utils/extract-exports
 */

/** Represents a single exported symbol */
export interface ExportedSymbol {
  /** The symbol name */
  name: string;
  /** The kind of export */
  kind: "function" | "class" | "const" | "let" | "var" | "type" | "interface" | "enum" | "default" | "re-export";
}

/**
 * Extracts all exported symbol names from file content.
 *
 * @param content - Source file content
 * @returns Array of exported symbol names (deduplicated)
 */
export function extractAllExports(content: string): string[] {
  const symbols = extractExportedSymbols(content);
  return [...new Set(symbols.map(s => s.name))];
}

/**
 * Extracts all exported symbols with their kinds from file content.
 *
 * @param content - Source file content
 * @returns Array of ExportedSymbol objects
 */
export function extractExportedSymbols(content: string): ExportedSymbol[] {
  const symbols: ExportedSymbol[] = [];
  const seen = new Set<string>();

  const add = (name: string, kind: ExportedSymbol["kind"]) => {
    if (name && !seen.has(name)) {
      seen.add(name);
      symbols.push({ name, kind });
    }
  };

  // Remove comments to avoid false positives
  const cleaned = removeComments(content);

  // export function foo() / export async function foo()
  for (const m of cleaned.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
    add(m[1], "function");
  }

  // export function* foo() (generators)
  for (const m of cleaned.matchAll(/export\s+(?:async\s+)?function\*\s+(\w+)/g)) {
    add(m[1], "function");
  }

  // export class Foo
  for (const m of cleaned.matchAll(/export\s+(?:abstract\s+)?class\s+(\w+)/g)) {
    add(m[1], "class");
  }

  // export const/let/var foo
  for (const m of cleaned.matchAll(/export\s+(const|let|var)\s+(\w+)/g)) {
    add(m[2], m[1] as ExportedSymbol["kind"]);
  }

  // export type Foo
  for (const m of cleaned.matchAll(/export\s+type\s+(\w+)\s*[=<{]/g)) {
    add(m[1], "type");
  }

  // export interface Foo
  for (const m of cleaned.matchAll(/export\s+interface\s+(\w+)/g)) {
    add(m[1], "interface");
  }

  // export enum Foo
  for (const m of cleaned.matchAll(/export\s+enum\s+(\w+)/g)) {
    add(m[1], "enum");
  }

  // export default function Foo / export default class Foo
  for (const m of cleaned.matchAll(/export\s+default\s+(?:async\s+)?function\s+(\w+)/g)) {
    add(m[1], "default");
  }
  for (const m of cleaned.matchAll(/export\s+default\s+(?:abstract\s+)?class\s+(\w+)/g)) {
    add(m[1], "default");
  }

  // export { foo, bar, baz as qux }
  for (const m of cleaned.matchAll(/export\s*\{([^}]+)\}/g)) {
    const inner = m[1];
    // Skip re-exports with "from" clause — those come from other files
    const afterBrace = cleaned.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 30);
    if (/^\s*from\s+['"]/.test(afterBrace)) continue;

    for (const name of inner.split(",")) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      // Handle "foo as bar" — take the exported name (bar)
      const parts = trimmed.split(/\s+as\s+/);
      const exportedName = (parts[1] || parts[0]).trim();
      if (exportedName && /^\w+$/.test(exportedName) && exportedName !== "default") {
        add(exportedName, "re-export");
      }
    }
  }

  // Python: def foo (top-level, no indentation)
  for (const m of cleaned.matchAll(/^def\s+(\w+)\s*\(/gm)) {
    // Only match if at start of line (no indentation) — top-level functions
    const lineStart = cleaned.lastIndexOf("\n", (m.index ?? 0)) + 1;
    if ((m.index ?? 0) === lineStart) {
      add(m[1], "function");
    }
  }

  // Python: class Foo (top-level)
  for (const m of cleaned.matchAll(/^class\s+(\w+)/gm)) {
    const lineStart = cleaned.lastIndexOf("\n", (m.index ?? 0)) + 1;
    if ((m.index ?? 0) === lineStart) {
      add(m[1], "class");
    }
  }

  // Go: func Foo (exported = PascalCase)
  for (const m of cleaned.matchAll(/^func\s+(\([^)]*\)\s+)?([A-Z]\w*)/gm)) {
    add(m[2], "function");
  }

  // Rust: pub fn foo / pub struct Foo / pub enum Foo / pub trait Foo
  for (const m of cleaned.matchAll(/pub\s+(?:async\s+)?fn\s+(\w+)/g)) {
    add(m[1], "function");
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

/** Strips single-line and multi-line comments from source code */
function removeComments(content: string): string {
  // Remove single-line comments
  let result = content.replace(/\/\/.*$/gm, "");
  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove template literals (they can contain fake exports in generators)
  result = result.replace(/`(?:[^`\\]|\\.)*`/g, '""');
  return result;
}
