/**
 * hashmark sync
 *
 * Builds a `.hashmark/index.json` relationship graph from the codebase.
 * Combines the import scanner's bidirectional graph with rich export
 * extraction (signatures + usage mapping) for runtime context injection.
 *
 * @module sync
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve, extname, relative, isAbsolute } from "path";
import pc from "picocolors";
import { scanImports } from "./scanners/imports.js";
import { extractExportedSymbols, extractNamedImportsFrom, type ExportedSymbol } from "./utils/extract-exports.js";

/** Rich relationship data for a single file */
export interface FileRelationship {
  /** Files this file depends on (import targets) */
  imports: string[];
  /** Files that depend on this file (reverse imports) */
  importedBy: string[];
  /** Exported symbols with optional signatures */
  exports: ExportedSymbol[];
  /**
   * For each importer, which exports they pull from this file.
   * e.g. { "src/app/layout.tsx": ["auth"], "src/app/login/page.tsx": ["signIn"] }
   */
  importUsage: Record<string, string[]>;
  /** Detected language */
  language: string;
  /** Line count */
  size: number;
}

/** The full relationship index written to .hashmark/index.json */
export interface RelationshipIndex {
  version: 1;
  generatedAt: string;
  projectRoot: string;
  fileCount: number;
  files: Record<string, FileRelationship>;
}

const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript",
  ".js": "javascript",  ".jsx": "javascript",
  ".mjs": "javascript", ".cjs": "javascript",
  ".py": "python", ".go": "go", ".rs": "rust",
  ".rb": "ruby", ".java": "java", ".kt": "kotlin",
  ".swift": "swift", ".php": "php", ".cs": "csharp",
  ".cpp": "cpp", ".c": "c", ".vue": "vue", ".svelte": "svelte",
};

/**
 * Builds the relationship index for a codebase.
 */
export async function buildRelationshipIndex(dir: string): Promise<RelationshipIndex> {
  const absDir = resolve(dir);
  const importGraph = await scanImports(absDir);

  // First pass: read all files, extract exports and content
  const fileContents = new Map<string, string>();
  const fileExports = new Map<string, ExportedSymbol[]>();

  for (const [filePath] of importGraph.files) {
    const fullPath = join(absDir, filePath);
    try {
      const content = readFileSync(fullPath, "utf-8");
      fileContents.set(filePath, content);
      fileExports.set(filePath, extractExportedSymbols(content));
    } catch {
      // File deleted since scan — skip
    }
  }

  const normalizeImportPath = (p: string): string =>
    isAbsolute(p) ? relative(absDir, p).replace(/\\/g, "/") : p;

  // Second pass: build importUsage map for each file
  // For each file, find which of its exports are used by its importers
  const files: Record<string, FileRelationship> = {};

  for (const [filePath, info] of importGraph.files) {
    const content = fileContents.get(filePath);
    if (!content) continue;

    const exports = fileExports.get(filePath) ?? [];
    const ext = extname(filePath).toLowerCase();
    const language = LANGUAGE_MAP[ext] || "unknown";
    // Count newlines directly — avoids off-by-one from trailing newline
    const size = (content.match(/\n/g)?.length ?? 0) + (content.endsWith("\n") ? 0 : 1);
    const normalizedImports = info.imports.map(normalizeImportPath);
    const normalizedImportedBy = info.importedBy.map(normalizeImportPath);

    // Build importUsage: for each importer, what exports do they take from this file?
    const importUsage: Record<string, string[]> = {};
    for (const importerPath of normalizedImportedBy) {
      const importerContent = fileContents.get(importerPath);
      if (!importerContent) continue;
      const used = extractNamedImportsFrom(importerContent, filePath);
      if (used.length > 0) {
        importUsage[importerPath] = used;
      }
    }

    files[filePath] = {
      imports: normalizedImports,
      importedBy: normalizedImportedBy,
      exports,
      importUsage,
      language,
      size,
    };
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    projectRoot: absDir,
    fileCount: Object.keys(files).length,
    files,
  };
}

/**
 * Builds and writes the relationship index to `.hashmark/index.json`.
 */
export async function sync(dir: string): Promise<RelationshipIndex> {
  const absDir = resolve(dir);
  const hashmarkDir = join(absDir, ".hashmark");

  console.log(pc.cyan("\n  # hashmark sync\n"));

  const start = Date.now();
  const index = await buildRelationshipIndex(absDir);

  if (!existsSync(hashmarkDir)) {
    mkdirSync(hashmarkDir, { recursive: true });
  }

  writeFileSync(join(hashmarkDir, "index.json"), JSON.stringify(index, null, 2), "utf-8");

  const hubFiles = Object.entries(index.files)
    .map(([path, rel]) => ({ path, count: rel.importedBy.length }))
    .filter(h => h.count > 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const totalExports = Object.values(index.files).reduce((sum, f) => sum + f.exports.length, 0);

  console.log(pc.green(`    ✓ Indexed ${index.fileCount} files`));
  console.log(pc.dim(`      ${totalExports} exports tracked`));
  if (hubFiles.length > 0) {
    console.log(pc.dim(`      Hub files: ${hubFiles.map(h => `${h.path} (${h.count})`).join(", ")}`));
  }
  console.log(pc.dim(`\n  Written to .hashmark/index.json`));
  console.log(pc.dim(`  Completed in ${Date.now() - start}ms\n`));

  return index;
}
