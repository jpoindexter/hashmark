/**
 * hashmark sync
 *
 * Builds a `.hashmark/index.json` relationship graph from the codebase.
 * Combines the import scanner's bidirectional graph with export extraction
 * to create a complete file relationship index for runtime context injection.
 *
 * @module sync
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve, extname, relative, isAbsolute } from "path";
import pc from "picocolors";
import { scanImports } from "./scanners/imports.js";
import { extractAllExports } from "./utils/extract-exports.js";

/** Relationship data for a single file */
export interface FileRelationship {
  /** Files this file depends on (import targets) */
  imports: string[];
  /** Files that depend on this file (reverse imports) */
  importedBy: string[];
  /** Exported symbol names (functions, classes, types, consts) */
  exports: string[];
  /** Detected language */
  language: string;
  /** Line count */
  size: number;
}

/** The full relationship index written to .hashmark/index.json */
export interface RelationshipIndex {
  /** Schema version */
  version: 1;
  /** ISO timestamp of generation */
  generatedAt: string;
  /** Absolute path of project root at generation time */
  projectRoot: string;
  /** Total files indexed */
  fileCount: number;
  /** File relationship map keyed by relative path */
  files: Record<string, FileRelationship>;
}

/** Extension to language mapping */
const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".php": "php",
  ".cs": "csharp",
  ".cpp": "cpp",
  ".c": "c",
  ".vue": "vue",
  ".svelte": "svelte",
};

/**
 * Builds the relationship index for a codebase.
 *
 * @param dir - Project root directory
 * @returns The complete relationship index
 */
export async function buildRelationshipIndex(dir: string): Promise<RelationshipIndex> {
  const absDir = resolve(dir);

  // Use existing import scanner for the bidirectional graph
  const importGraph = await scanImports(absDir);

  const files: Record<string, FileRelationship> = {};

  for (const [filePath, info] of importGraph.files) {
    // Read file to extract exports and count lines
    const fullPath = join(absDir, filePath);
    let content = "";
    let lineCount = 0;

    try {
      content = readFileSync(fullPath, "utf-8");
      lineCount = content.split("\n").length;
    } catch {
      // File may have been deleted since scan — skip
      continue;
    }

    const exports = extractAllExports(content);
    const ext = extname(filePath).toLowerCase();
    const language = LANGUAGE_MAP[ext] || "unknown";

    // Normalize import paths to relative (the import scanner may produce absolute paths)
    const normalizeImportPath = (p: string): string => {
      if (isAbsolute(p)) {
        return relative(absDir, p).replace(/\\/g, "/");
      }
      return p;
    };

    files[filePath] = {
      imports: info.imports.map(normalizeImportPath),
      importedBy: info.importedBy.map(normalizeImportPath),
      exports,
      language,
      size: lineCount,
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
 *
 * @param dir - Project root directory
 * @returns The generated index
 */
export async function sync(dir: string): Promise<RelationshipIndex> {
  const absDir = resolve(dir);
  const hashmarkDir = join(absDir, ".hashmark");
  const indexPath = join(hashmarkDir, "index.json");

  console.log(pc.cyan("\n  # hashmark sync\n"));

  const start = Date.now();
  const index = await buildRelationshipIndex(absDir);

  // Ensure .hashmark directory exists
  if (!existsSync(hashmarkDir)) {
    mkdirSync(hashmarkDir, { recursive: true });
  }

  writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf-8");

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
