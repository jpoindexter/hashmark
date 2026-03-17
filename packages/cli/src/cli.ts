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
import { isSetupComplete, runSetup, readSetupConfig } from "./setup.js";
import { sync } from "./sync.js";
import { startWatch } from "./watch.js";
import { installHooks, uninstallHooks } from "./hooks/install.js";
import { login, readCredentials, clearCredentials, pushToCloud, type CloudSyncPayload } from "./auth.js";
import { writeFileSync, existsSync, rmSync, mkdirSync, readFileSync } from "fs";
import { join, relative, dirname, resolve } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { homedir } from "os";

let packageVersion = "2.0.0";
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const packageJson = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));
  packageVersion = packageJson.version;
} catch {}

const cli = cac("hashmark");

cli
  .command("[dir]", "Generate context files from your codebase")
  .option("-o, --output <path>", "Output directory for generated files (defaults to scan directory)")
  .option("-y, --yes", "Non-interactive mode: accept all defaults, skip prompts")
  .option("--dry-run", "Preview without writing file")
  .option("--force", "Overwrite existing files")
  .option("--compact", "Generate compact output")
  .option("--json", "Generate JSON index")
  .option("--security", "Include security audit")
  .option("--monorepo", "Enable monorepo mode")
  .option("--include-git-log", "Include recent git commits")
  .option("--format <formats>", "Output formats (all, cursorrules, etc.)")
  .option("--sync", "Push scan results to hashmark.md cloud dashboard (requires login)")
  .action(async (dir: string | undefined, options: any) => {
    let targetDir = dir || process.cwd();
    const scanStart = Date.now();
    const quiet = options.yes;

    if (!quiet) console.log(pc.cyan("\n  # hashmark\n"));

    try {
      // 1. Core Engine Execution (Single Pass)
      const engine = new ScannerEngine();
      const excludePatterns = loadConfig(targetDir).exclude || [];
      const scanResult = await engine.run(targetDir, excludePatterns, options);

      // 2. Interactive setup on first run (skip in --yes / quiet mode)
      if (!quiet && !isSetupComplete(targetDir)) {
        const setupConfig = await runSetup(
          targetDir,
          scanResult.framework,
          scanResult.testCoverage?.testFramework
        );
        // If setup returned (not cancelled), inject custom rules into scan result
        if (setupConfig?.customRules?.length) {
          scanResult.existingContext = scanResult.existingContext ?? {};
          const existing = (scanResult.existingContext as any).customRules ?? [];
          (scanResult.existingContext as any).customRules = [...existing, ...setupConfig.customRules];
        }
      }

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
      if (!quiet) reportFindings(scanResult);

      const outputDir = options.output ? resolve(options.output) : targetDir;

      const formatToUse = options.format || "all";
      const files = formatToUse === "all"
        ? generateAllFormats(scanResult, { generatorOptions: options })
        : formatToUse.split(",").map((f: string) =>
            generateFormat(f.trim() as FormatId, scanResult, { generatorOptions: options })
          );

      const written: string[] = [];
      for (const file of files) {
        if (!options.dryRun) {
          const filePath = join(outputDir, file.path);
          if (!existsSync(dirname(filePath))) mkdirSync(dirname(filePath), { recursive: true });
          writeFileSync(filePath, file.content, "utf-8");
          written.push(filePath);
          if (!quiet) console.log(pc.green(`    ✓ ${file.path} — ${file.tool}`));
        }
      }

      // Cloud sync (--sync flag)
      if (options.sync && !options.dryRun) {
        const syncPayload: CloudSyncPayload = {
          projectRoot: targetDir,
          generatedAt: new Date().toISOString(),
          files: files.map((f: { path: string; content: string; tool: string }) => ({ path: f.path, content: f.content, tool: f.tool })),
          meta: {
            framework: scanResult.framework?.name,
            language: scanResult.framework?.language,
            fileCount: scanResult.stats?.totalFiles,
            lineCount: scanResult.stats?.totalLines,
          },
        };
        if (!quiet) process.stdout.write("  Syncing to cloud...");
        const syncResult = await pushToCloud(syncPayload);
        if (syncResult.ok) {
          if (!quiet) {
            console.log(pc.green(" done"));
            if (syncResult.url) console.log(pc.dim(`    ${syncResult.url}`));
          }
        } else {
          if (!quiet) {
            console.log(pc.red(" failed"));
            console.log(pc.red(`    ${syncResult.error ?? "Unknown error"}`));
          } else {
            process.stderr.write(JSON.stringify({ ok: false, error: syncResult.error }) + "\n");
          }
        }
      }

      if (quiet) {
        // Machine-readable output for AI tool invocation
        process.stdout.write(JSON.stringify({ ok: true, files: written, duration: Date.now() - scanStart }) + "\n");
      } else {
        console.log(pc.dim(`\n  Completed in ${Date.now() - scanStart}ms\n`));
      }

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (quiet) {
        process.stderr.write(JSON.stringify({ ok: false, error: msg }) + "\n");
      } else {
        console.error(pc.red(`\n  ✗ Scan failed: ${msg}\n`));
      }
      process.exit(1);
    }
  });

// --- setup command ---
cli
  .command("setup [dir]", "Configure hashmark for your project interactively")
  .option("--reset", "Re-run setup even if already configured")
  .action(async (dir: string | undefined, options: { reset?: boolean }) => {
    const targetDir = dir || process.cwd();
    try {
      if (isSetupComplete(targetDir) && !options.reset) {
        const existing = readSetupConfig(targetDir);
        console.log(pc.cyan("\n  # hashmark setup\n"));
        console.log(pc.dim("  Already configured. Run with --reset to reconfigure.\n"));
        if (existing) {
          console.log(`  Team size  : ${existing.teamSize}`);
          console.log(`  AI tools   : ${existing.aiTools.join(", ") || "none"}`);
          console.log(`  Framework  : ${existing.confirmedStack.framework}`);
          if (existing.customRules.length) {
            console.log(`  Rules      : ${existing.customRules.length} custom rule(s)`);
          }
          console.log();
        }
        return;
      }

      const engine = new ScannerEngine();
      const excludePatterns = loadConfig(targetDir).exclude || [];
      const scanResult = await engine.run(targetDir, excludePatterns, { yes: true });
      await runSetup(targetDir, scanResult.framework, scanResult.testCoverage?.testFramework);
    } catch (error) {
      console.error(pc.red(`\n  ✗ Setup failed: ${error instanceof Error ? error.message : error}\n`));
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

// --- mcp command ---
cli
  .command("mcp", "Start the hashmark MCP server (stdio transport for Claude Code, Cursor, etc.)")
  .action(async () => {
    try {
      const { startMcpServer } = await import("./mcp-server.js");
      await startMcpServer();
    } catch (error) {
      console.error(pc.red(`\n  ✗ MCP server error: ${error instanceof Error ? error.message : error}\n`));
      process.exit(1);
    }
  });

// --- login command ---
cli
  .command("login", "Connect to hashmark.md cloud dashboard")
  .action(async () => {
    try {
      const creds = await login();
      console.log(pc.green(`\n  Logged in as ${creds.email}\n`));
      console.log(pc.dim(`  Run hashmark --sync to push scan results to your dashboard.\n`));
    } catch (error) {
      console.error(pc.red(`\n  ✗ Login failed: ${error instanceof Error ? error.message : error}\n`));
      process.exit(1);
    }
  });

// --- logout command ---
cli
  .command("logout", "Disconnect from hashmark.md cloud dashboard")
  .action(() => {
    const creds = readCredentials();
    if (!creds) {
      console.log(pc.dim("\n  Not logged in.\n"));
      return;
    }
    clearCredentials();
    console.log(pc.green("\n  Logged out successfully.\n"));
  });

// --- whoami command ---
cli
  .command("whoami", "Show current cloud authentication status")
  .action(() => {
    const creds = readCredentials();
    if (!creds) {
      console.log(pc.dim("\n  Not logged in. Run hashmark login to connect.\n"));
      return;
    }
    console.log(pc.cyan("\n  # hashmark whoami\n"));
    console.log(`  Email     : ${creds.email}`);
    console.log(`  Connected : ${new Date(creds.connectedAt).toLocaleString()}`);
    console.log();
  });

cli.help();
cli.version(packageVersion);
cli.parse();
