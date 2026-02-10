#!/usr/bin/env node

/**
 * Import Validation
 *
 * Detects:
 * 1. Deep import paths (> 3 levels of ../)
 * 2. Duplicate imports (same path imported twice)
 */

const fs = require("fs");
const { execSync } = require("child_process");

const MAX_IMPORT_DEPTH = 3;

function getStagedFiles() {
  try {
    const output = execSync("git diff --cached --name-only --diff-filter=ACM", {
      encoding: "utf-8",
    });
    return output
      .trim()
      .split("\n")
      .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f))
      .filter((f) => !f.includes("node_modules"))
      .filter((f) => !f.startsWith("scripts/"))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractImports(content) {
  const imports = [];
  const regex = /import\s+(?:\{[^}]*\}|[\w*]+)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    imports.push({
      path: match[1],
      line: content.substring(0, match.index).split("\n").length,
    });
  }
  return imports;
}

function validateImports() {
  const files = getStagedFiles();
  if (files.length === 0) return;

  const errors = [];
  const warnings = [];

  for (const file of files) {
    if (!fs.existsSync(file)) continue;

    try {
      const content = fs.readFileSync(file, "utf-8");
      const imports = extractImports(content);

      // Check deep imports
      for (const imp of imports) {
        if (imp.path.startsWith("../")) {
          const depth = (imp.path.match(/\.\.\//g) || []).length;
          if (depth > MAX_IMPORT_DEPTH) {
            warnings.push({
              file,
              line: imp.line,
              message: `Import path too deep (${depth} levels): ${imp.path}`,
              suggestion: "Use path alias @/* instead",
            });
          }
        }
      }

      // Check duplicate imports
      const seen = new Map();
      for (const imp of imports) {
        if (seen.has(imp.path)) {
          errors.push({
            file,
            line: imp.line,
            message: `Duplicate import of "${imp.path}" (first at line ${seen.get(imp.path)})`,
          });
        } else {
          seen.set(imp.path, imp.line);
        }
      }
    } catch {
      // Skip unreadable
    }
  }

  if (errors.length > 0 || warnings.length > 0) {
    console.error("\n[ERROR] Import issues detected\n");

    errors.forEach(({ file, line, message }) => {
      console.error(`  ${file}:${line}  ${message}`);
    });

    warnings.forEach(({ file, line, message, suggestion }) => {
      console.error(`  ${file}:${line}  ${message}`);
      if (suggestion) console.error(`    > ${suggestion}`);
    });

    console.error("");
    process.exit(1);
  }
}

validateImports();
