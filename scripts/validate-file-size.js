#!/usr/bin/env node

/**
 * Validate File Size — Enforce 300-line limit
 *
 * Checks all staged files to ensure they don't exceed 300 lines.
 */

const { execSync } = require("child_process");
const fs = require("fs");

const MAX_LINES = 300;
const EXCLUSIONS = [
  /docs\/.*\.(md|mdx)$/,
  /CLAUDE\.md$/,
  /AGENTS\.md$/,
  /scripts\//,
  /prisma\/schema\.prisma$/,
  /prisma\/seed\.ts$/,
  /packages\//,
  /\.(json|lock|yaml)$/,
  /\.min\.(js|css)$/,
  /pnpm-lock\.yaml$/,
  /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i,
  /\.(pdf|zip|tar|gz)$/i,
  /config\//,
  /\.husky\//,
  /vitest\.config/,
  /the-monospace-web-main\//,
];

function getStagedFiles() {
  try {
    const output = execSync("git diff --cached --name-only --diff-filter=ACM", {
      encoding: "utf-8",
    });
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function isExcluded(filePath) {
  return EXCLUSIONS.some((pattern) => pattern.test(filePath));
}

function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}

function validateFileSizes() {
  const stagedFiles = getStagedFiles();
  const violations = [];

  for (const file of stagedFiles) {
    if (isExcluded(file)) continue;
    if (!fs.existsSync(file)) continue;

    const lineCount = countLines(file);

    if (lineCount > MAX_LINES) {
      violations.push({
        file,
        lines: lineCount,
        excess: lineCount - MAX_LINES,
      });
    }
  }

  if (violations.length > 0) {
    console.error("\n[ERROR] Files exceed 300-line limit\n");

    violations.forEach(({ file, lines, excess }) => {
      console.error(`  ${file}`);
      console.error(`    Lines: ${lines} (${excess} over limit)\n`);
    });

    console.error("Refactor large files into smaller, focused modules.");
    console.error("  - Extract reusable functions into utilities");
    console.error("  - Split components into smaller pieces");
    console.error("  - Move related code into separate files\n");

    process.exit(1);
  }
}

validateFileSizes();
