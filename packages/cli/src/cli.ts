#!/usr/bin/env node

/**
 * hashmark CLI
 *
 * Main entry point for the hashmark command-line tool.
 * Scans codebases and generates AGENTS.md files with comprehensive
 * context for AI coding assistants.
 */

import { cac } from "cac";
import pc from "picocolors";
import { ScannerEngine } from "./engine/index.js";
import { scanBarrels } from "./scanners/barrels.js";
import { scanDependencies } from "./scanners/dependencies.js";
import { scanGitLog, getGitDiff, formatGitLog, formatGitDiff } from "./scanners/git.js";
import { scanFileTree } from "./scanners/file-tree.js";
import { scanImports } from "./scanners/imports.js";
import { scanTypes } from "./scanners/types.js";
import { generateAntiPatterns, formatAntiPatterns } from "./scanners/anti-patterns.js";
import { scanTestCoverage } from "./scanners/tests.js";
import { scanSecurity, formatSecurityAudit } from "./scanners/security.js";
import { detectMonorepo, formatMonorepoOverview } from "./scanners/monorepo.js";
import { scanGraphQL } from "./scanners/graphql.js";
import { scanLatentHooks } from "./scanners/latent-hooks.js";
import { analyzeComplexity } from "./scanners/complexity.js";
import { generateAgentsMd } from "./generator.js";
import { generateAgentsIndex } from "./json-generator.js";
import { generateAllFormats, generateFormat, FORMAT_REGISTRY, type FormatId } from "./formats/index.js";
import { validateGitUrl, escapeShellPath } from "./utils/shell.js";
import { estimateTokens, formatTokens, getContextUsage } from "./utils/tokens.js";
import { detectSecrets } from "./utils/secrets.js";
import { parseSize, splitContent, getSplitFilenames } from "./utils/split.js";
import { reportFindings } from "./utils/reporter.js";
import { loadConfig } from "./config.js";
import { sync } from "./sync.js";
import { startWatch } from "./watch.js";
import { installHooks, uninstallHooks } from "./hooks/install.js";
import { writeFileSync, existsSync, rmSync, mkdirSync, readFileSync } from "fs";
import { join, relative, dirname } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { homedir } from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let packageVersion = "2.0.0";
try {
  const packageJson = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));
  packageVersion = packageJson.version;
} catch {}

const cli = cac("hashmark");

cli
  .command("[dir]", "Generate context files from your codebase")
  .option("-o, --output <file>", "Output file path", { default: "AGENTS.md" })
  .option("--dry-run", "Preview without writing file")
  .option("--force", "Overwrite existing files")
  .option("--compact", "Generate compact output")
  .option("--json", "Generate JSON index")
  .option("--security", "Include security audit")
  .option("--monorepo", "Enable monorepo mode")
  .option("--include-git-log", "Include recent git commits")
  .option("--format <formats>", "Output formats (all, cursorrules, etc.)")
  .action(async (dir: string | undefined, options: any) => {
    let targetDir = dir || process.cwd();
    const scanStart = Date.now();

    console.log(pc.cyan("\n  # hashmark\n"));

    try {
      // 1. Core Engine Execution (Single Pass)
      const engine = new ScannerEngine();
      const excludePatterns = loadConfig(targetDir).exclude || [];
      const scanResult = await engine.run(targetDir, excludePatterns, options);

      // 2. Parallel Secondary Scanners (Items not yet in single-pass)
      const [
        barrels,
        dependencies,
        fileTree,
        importGraph,
        typeExports,
        graphqlSchemas,
        latentHooks,
        securityAudit,
      ] = await Promise.all([
        scanBarrels(targetDir),
        scanDependencies(targetDir),
        scanFileTree(targetDir),
        scanImports(targetDir),
        scanTypes(targetDir),
        scanGraphQL(targetDir),
        scanLatentHooks(targetDir, scanResult.framework, scanResult.utilities),
        options.security ? scanSecurity(targetDir) : Promise.resolve(null),
      ]);

      // 3. Consolidate Results
      Object.assign(scanResult, {
        barrels, dependencies, fileTree, importGraph, typeExports,
        graphqlSchemas, latentHooks, securityAudit,
        antiPatterns: generateAntiPatterns(scanResult.framework, scanResult.utilities, scanResult.tokens, scanResult.components, scanResult.utilities.hasMode)
      });

      // 4. Report & Generate
      reportFindings(scanResult);

      const formatToUse = options.format || "all";
      const files = formatToUse === "all"
        ? generateAllFormats(scanResult, { generatorOptions: options })
        : [generateFormat(formatToUse as FormatId, scanResult, { generatorOptions: options })];

      for (const file of files) {
        if (!options.dryRun) {
          const filePath = join(targetDir, file.path);
          if (!existsSync(dirname(filePath))) mkdirSync(dirname(filePath), { recursive: true });
          writeFileSync(filePath, file.content, "utf-8");
          console.log(pc.green(`    ✓ ${file.path} — ${file.tool}`));
        }
      }

      console.log(pc.dim(`\n  Completed in ${Date.now() - scanStart}ms\n`));

    } catch (error) {
      console.error(pc.red(`\n  ✗ Scan failed: ${error instanceof Error ? error.message : error}\n`));
      process.exit(1);
    }
  });

// --- sync command ---
cli
  .command("sync [dir]", "Build .hashmark/index.json relationship graph")
  .option("--watch", "Keep watching for changes")
  .action(async (dir: string | undefined, options: { watch?: boolean }) => {
    const targetDir = dir || process.cwd();
    try {
      await sync(targetDir);
      if (options.watch) {
        await startWatch(targetDir);
      }
    } catch (error) {
      console.error(pc.red(`\n  ✗ Sync failed: ${error instanceof Error ? error.message : error}\n`));
      process.exit(1);
    }
  });

// --- watch command ---
cli
  .command("watch [dir]", "Watch for changes and keep relationship index fresh")
  .action(async (dir: string | undefined) => {
    const targetDir = dir || process.cwd();
    try {
      // Run initial sync, then watch
      await sync(targetDir);
      await startWatch(targetDir);
    } catch (error) {
      console.error(pc.red(`\n  ✗ Watch failed: ${error instanceof Error ? error.message : error}\n`));
      process.exit(1);
    }
  });

// --- hook command ---
cli
  .command("hook <action>", "Manage Claude Code hooks (install/uninstall)")
  .option("--pre-commit", "Also install pre-commit hook")
  .action(async (action: string, options: { preCommit?: boolean }) => {
    const targetDir = process.cwd();
    try {
      if (action === "install") {
        await installHooks(targetDir, { preCommit: options.preCommit });
      } else if (action === "uninstall") {
        await uninstallHooks(targetDir);
      } else {
        console.error(pc.red(`\n  ✗ Unknown action: ${action}. Use 'install' or 'uninstall'\n`));
        process.exit(1);
      }
    } catch (error) {
      console.error(pc.red(`\n  ✗ Hook ${action} failed: ${error instanceof Error ? error.message : error}\n`));
      process.exit(1);
    }
  });

cli.help();
cli.version(packageVersion);
cli.parse();
