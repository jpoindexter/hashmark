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
import { analyzeComplexity, loadPreviousComplexity, saveComplexitySnapshot, computeComplexityDelta } from "./scanners/complexity.js";
import { validateContext } from "./scanners/context-validator.js";
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
import { loadExistingContext, mergeContexts } from "./lib/context-merge.js";
import { loadFreshnessStore, saveFreshnessStore, computeFreshness, updateFreshnessStore } from "./lib/freshness.js";
import { loadMtimeCache, saveMtimeCache, filterChangedFiles } from "./lib/file-cache.js";
import { trimToBudget } from "./lib/token-budget.js";
import { generateClaudeMd } from "./formats/claude-md.js";
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
  .option("--merge", "Merge with existing CLAUDE.md/AGENTS.md if found", { default: true })
  .option("--no-merge", "Skip merging with existing context files")
  .option("--sync", "Push scan results to hashmark.md cloud dashboard (requires login)")
  .option("--rescan-only-changed", "Only re-scan files changed since last scan")
  .option("--max-tokens <n>", "Trim CLAUDE.md to fit within this token budget (drops low-priority sections first)")
  .action(async (dir: string | undefined, options: any) => {
    let targetDir = dir || process.cwd();
    const scanStart = Date.now();
    const quiet = options.yes;

    if (!quiet) console.log(pc.cyan("\n  # hashmark\n"));

    try {
      // 1. Core Engine Execution (Single Pass)
      const engine = new ScannerEngine();
      const excludePatterns = loadConfig(targetDir).exclude || [];

      // Incremental mode: collect all files, filter to changed ones only
      let incrementalMeta: { unchangedCount: number; changedCount: number } | null = null;
      const engineOptions = { ...options };

      if (options.rescanOnlyChanged) {
        const cache = loadMtimeCache(targetDir);
        // Collect the same file set the visitor would use (fast-glob, relative)
        const fg = (await import("fast-glob")).default;
        const allFiles = await fg(
          [
            "**/*.{ts,tsx,js,jsx,json,md,py,go,rs,prisma,graphql,yml,yaml}",
            "!**/node_modules/**",
            "!**/.next/**",
            "!**/dist/**",
            "!**/build/**",
            "!**/.git/**",
            "!**/pnpm-lock.yaml",
            "!**/package-lock.json",
            "!**/*.zip",
            "!**/*.tar.gz",
            ...excludePatterns.map((p: string) => `!${p}`),
          ],
          { cwd: targetDir, absolute: false, followSymbolicLinks: false }
        );
        const { changedFiles, unchangedCount } = filterChangedFiles(allFiles, targetDir, cache);
        engineOptions.changedFilesOnly = changedFiles;
        incrementalMeta = { changedCount: changedFiles.length, unchangedCount };
        if (!quiet) {
          console.log(pc.dim(`  Incremental mode: ${changedFiles.length} changed, ${unchangedCount} unchanged`));
        }
      }

      const scanResult = await engine.run(targetDir, excludePatterns, engineOptions);

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

      // 4. Complexity delta vs last scan
      if (scanResult.aiRecommendations) {
        const prevComplexity = loadPreviousComplexity(targetDir);
        if (prevComplexity) {
          scanResult.complexityDelta = computeComplexityDelta(scanResult.aiRecommendations, prevComplexity);
        }
        saveComplexitySnapshot(targetDir, scanResult.aiRecommendations);
      }

      // 5. Context validation (TypeScript, lint, build, deps, tests)
      try {
        scanResult.contextValidation = await validateContext(targetDir);
      } catch {
        // non-fatal — validation failure should never abort the scan
      }

      // 6. Rule compliance — aggregate custom rules into a compliance report
      try {
        const configRules: string[] = loadConfig(targetDir).rules ?? [];
        const setupRules: string[] = (scanResult.existingContext as any)?.customRules ?? [];
        const allRules = [...new Set([...configRules, ...setupRules])];

        if (allRules.length > 0) {
          const antiWarnings: string[] = scanResult.antiPatterns?.warnings ?? [];

          const violations = allRules.map(ruleText => {
            // Infer severity from rule phrasing
            const severity: "error" | "warning" | "info" =
              /^never\b|\bforbid|\bprohibited|\bmust not\b/i.test(ruleText)
                ? "error"
                : /^always\b|\bmust\b/i.test(ruleText)
                ? "warning"
                : "info";

            // Check if any anti-pattern warning overlaps with keywords from this rule
            const ruleKeywords = ruleText
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, " ")
              .split(/\s+/)
              .filter(w => w.length > 4);

            const matchedWarnings = antiWarnings.filter(w =>
              ruleKeywords.some(kw => w.toLowerCase().includes(kw))
            );

            return {
              ruleName: ruleText.length > 80 ? ruleText.slice(0, 77) + "..." : ruleText,
              severity,
              matchedFiles: [] as string[],
              count: matchedWarnings.length,
            };
          });

          const failed = violations.filter(v => v.count > 0).length;
          scanResult.ruleCompliance = {
            totalRules: allRules.length,
            failed,
            passed: allRules.length - failed,
            violations,
          };
        }
      } catch {
        // non-fatal
      }

      // 7. Freshness tracking — compute section staleness vs last scan
      try {
        const freshnessStore = loadFreshnessStore(targetDir);
        // Generate raw CLAUDE.md (no freshness) to extract section content for hashing
        const rawClaudeMd = generateClaudeMd(scanResult);
        const sectionMap: Record<string, string> = {};
        const parts = rawClaudeMd.split(/\n(?=## )/);
        for (const part of parts) {
          const headerMatch = part.match(/^## ([^\n]+)/);
          if (headerMatch) sectionMap[headerMatch[1].trim()] = part;
        }
        const freshness = computeFreshness(sectionMap, freshnessStore);
        scanResult.sectionFreshness = freshness;
        scanResult.freshnessStoreCount = freshnessStore.scanCount + 1;
        if (!options.dryRun) {
          const updatedStore = updateFreshnessStore(sectionMap, freshnessStore);
          saveFreshnessStore(targetDir, updatedStore);
        }
      } catch {
        // non-fatal
      }

      // 8. Report & Generate
      if (!quiet) reportFindings(scanResult);

      const outputDir = options.output ? resolve(options.output) : targetDir;

      const formatToUse = options.format || "all";
      const files = formatToUse === "all"
        ? generateAllFormats(scanResult, { generatorOptions: options })
        : formatToUse.split(",").map((f: string) =>
            generateFormat(f.trim() as FormatId, scanResult, { generatorOptions: options })
          );

      // Context merge — inject human-authored sections into generated outputs
      const existingCtx = options.merge !== false ? loadExistingContext(targetDir) : null;
      if (existingCtx) {
        for (const file of files) {
          if (/CLAUDE\.md|AGENTS\.md/i.test(file.path)) {
            file.content = mergeContexts(file.content, existingCtx);
          }
        }
        scanResult.mergedContextSource = existingCtx.source;
        if (!quiet) console.log(pc.dim(`  ↳ merged ${existingCtx.sections.size} sections from ${existingCtx.source}`));
      }

      // Token budget trim — applied after merge, before write
      if (options.maxTokens) {
        const budget = parseInt(String(options.maxTokens), 10);
        if (!isNaN(budget) && budget > 0) {
          for (const file of files) {
            if (/CLAUDE\.md/i.test(file.path)) {
              const result = trimToBudget(file.content, budget);
              if (result.dropped.length > 0) {
                file.content = result.trimmed;
                const origK = (result.originalTokens / 1000).toFixed(1);
                const finalK = (result.finalTokens / 1000).toFixed(1);
                if (!quiet) {
                  console.log(pc.yellow(`  Trimmed to budget: dropped [${result.dropped.join(", ")}] — ${origK}k → ${finalK}k tokens`));
                }
              }
            }
          }
        }
      }

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

      // Save a lightweight snapshot for `hashmark export`
      if (!options.dryRun) {
        try {
          const snapshotDir = join(targetDir, ".hashmark");
          mkdirSync(snapshotDir, { recursive: true });
          const snapshot = {
            framework: scanResult.framework,
            commands: scanResult.commands,
            components: scanResult.components.map(c => ({ name: c.name, path: c.path })),
            hooks: scanResult.hooks,
            apiRoutes: scanResult.apiRoutes,
            envVars: scanResult.envVars,
            database: scanResult.database,
            stats: scanResult.stats,
            tokens: scanResult.tokens,
            utilities: scanResult.utilities,
            patterns: scanResult.patterns,
            existingContext: scanResult.existingContext,
            variants: scanResult.variants,
            latentHooks: scanResult.latentHooks,
            hubFiles: scanResult.importGraph?.hubFiles?.slice(0, 20) ?? [],
            aiRecommendations: scanResult.aiRecommendations
              ? {
                  complexFiles: scanResult.aiRecommendations.complexFiles?.slice(0, 10) ?? [],
                  areas: scanResult.aiRecommendations.areas,
                  simpleModel: scanResult.aiRecommendations.simpleModel,
                  complexModel: scanResult.aiRecommendations.complexModel,
                  extendedThinkingRecommended: scanResult.aiRecommendations.extendedThinkingRecommended,
                }
              : undefined,
            complexityDelta: scanResult.complexityDelta ?? undefined,
            generatedAt: new Date().toISOString(),
          };
          writeFileSync(join(snapshotDir, "last-scan.json"), JSON.stringify(snapshot, null, 2), "utf-8");
        } catch {
          // non-fatal — snapshot failure should never abort the scan
        }
      }

      // Save mtime cache for incremental rescans
      if (!options.dryRun) {
        try {
          const fg2 = (await import("fast-glob")).default;
          const allFilesForCache = await fg2(
            [
              "**/*.{ts,tsx,js,jsx,json,md,py,go,rs,prisma,graphql,yml,yaml}",
              "!**/node_modules/**",
              "!**/.next/**",
              "!**/dist/**",
              "!**/build/**",
              "!**/.git/**",
              "!**/pnpm-lock.yaml",
              "!**/package-lock.json",
              "!**/*.zip",
              "!**/*.tar.gz",
              ...(loadConfig(targetDir).exclude || []).map((p: string) => `!${p}`),
            ],
            { cwd: targetDir, absolute: false, followSymbolicLinks: false }
          );
          saveMtimeCache(targetDir, allFilesForCache);
        } catch {
          // non-fatal
        }
      }

      if (incrementalMeta && !quiet) {
        console.log(pc.dim(`  Re-scanned ${incrementalMeta.changedCount} changed files, reused ${incrementalMeta.unchangedCount} from cache`));
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

// --- export command ---
cli
  .command("export [dir]", "Export generated context in a specific format")
  .option("--format <format>", "Output format: openai-system-prompt | json | token-budget", { default: "openai-system-prompt" })
  .option("--budget-tokens <n>", "Token budget for token-budget format", { default: "50000" })
  .option("--output <file>", "Write to file instead of stdout")
  .action(async (dir: string | undefined, opts: { format: string; budgetTokens: string; output?: string }) => {
    const targetDir = dir || process.cwd();
    const snapshotPath = join(targetDir, ".hashmark", "last-scan.json");

    if (!existsSync(snapshotPath)) {
      console.error(pc.red("\n  No scan found. Run `hashmark scan` first.\n"));
      process.exit(1);
    }

    let snapshot: any;
    try {
      snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8"));
    } catch (e) {
      console.error(pc.red(`\n  Failed to read snapshot: ${e instanceof Error ? e.message : e}\n`));
      process.exit(1);
    }

    // Reconstruct minimal ScanResult from snapshot
    // Maps are not JSON-serializable so we provide empty stubs where needed
    const scan = {
      ...snapshot,
      barrels: snapshot.barrels ?? [],
      dependencies: snapshot.dependencies ?? [],
      importGraph: snapshot.hubFiles?.length
        ? {
            files: new Map(),
            hubFiles: snapshot.hubFiles,
            circularDeps: [],
            externalDeps: new Map(),
            unusedFiles: [],
          }
        : undefined,
    };

    try {
      const { exportContext } = await import("./formats/export.js");
      const result = exportContext(scan, {
        format: opts.format as any,
        budgetTokens: parseInt(opts.budgetTokens, 10),
      });

      if (opts.output) {
        const outPath = resolve(opts.output);
        if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, result, "utf-8");
        console.error(pc.green(`  Wrote ${outPath}`));
      } else {
        process.stdout.write(result + "\n");
      }
    } catch (e) {
      console.error(pc.red(`\n  Export failed: ${e instanceof Error ? e.message : e}\n`));
      process.exit(1);
    }
  });

// --- import command ---
cli
  .command("import <file>", "Import a competitor context file and convert to hashmark MWP format")
  .option("--format <format>", "Input format: opencode | cursor-rules | copilot | auto", { default: "auto" })
  .option("--output <file>", "Output file (default: CLAUDE.md in current dir)")
  .action(async (file: string, opts: { format: string; output?: string }) => {
    try {
      const content = readFileSync(file, "utf-8");
      const { detectFormat, parseContext, convertToMwp } = await import("./formats/import.js");
      const format = opts.format === "auto"
        ? detectFormat(content, file)
        : (opts.format as import("./formats/import.js").ImportFormat);
      const parsed = parseContext(content, format);
      const mwp = convertToMwp(parsed);
      const outFile = opts.output ?? "CLAUDE.md";
      writeFileSync(outFile, mwp);
      const mappedLayers = Object.keys(parsed.sections).filter(k => k !== "other" && parsed.sections[k as keyof typeof parsed.sections] !== undefined);
      console.log(pc.green(`  Imported ${file} (${format}) -> ${outFile}`));
      console.log(pc.dim(`  Sections mapped: ${mappedLayers.join(", ")}`));
      if (Object.keys(parsed.sections.other).length > 0) {
        console.log(pc.dim(`  Unmapped sections (appended to Knowledge): ${Object.keys(parsed.sections.other).join(", ")}`));
      }
    } catch (error) {
      console.error(pc.red(`\n  Import failed: ${error instanceof Error ? error.message : error}\n`));
      process.exit(1);
    }
  });

// --- watch command ---
cli
  .command("watch [dir]", "Watch for file changes and auto-regenerate CLAUDE.md")
  .option("--debounce <ms>", "Debounce delay in milliseconds", { default: 1500 })
  .option("--verbose", "Log which files triggered the rescan")
  .option("--formats <list>", "Comma-separated output formats to regenerate")
  .action(async (dir: string | undefined, opts: { debounce: number; verbose?: boolean; formats?: string }) => {
    const targetDir = dir || process.cwd();
    const { watchProject } = await import("./commands/watch.js");
    const { estimateTokens } = await import("./utils/tokens.js");

    console.log(pc.cyan("\n  # hashmark watch\n"));
    console.log(pc.dim(`  Watching ${targetDir}`));
    console.log(pc.dim(`  Debounce: ${opts.debounce}ms — Press Ctrl+C to stop\n`));

    // Run an initial scan so the output files exist before watch loop starts
    try {
      process.stdout.write(pc.dim("  Running initial scan..."));
      const engine = new ScannerEngine();
      const excludePatterns = loadConfig(targetDir).exclude || [];
      const scanResult = await engine.run(targetDir, excludePatterns, { yes: true });
      const [barrels, dependencies, fileTree, importGraph, typeExports, graphqlSchemas, latentHooks] =
        await Promise.all([
          scanBarrels(targetDir),
          scanDependencies(targetDir),
          scanFileTree(targetDir),
          scanImports(targetDir),
          scanTypes(targetDir),
          scanGraphQL(targetDir),
          scanLatentHooks(targetDir, scanResult.framework, scanResult.utilities),
        ]);
      Object.assign(scanResult, {
        barrels, dependencies, fileTree, importGraph, typeExports, graphqlSchemas, latentHooks,
        antiPatterns: generateAntiPatterns(scanResult.framework, scanResult.utilities, scanResult.tokens, scanResult.components, scanResult.utilities.hasMode),
      });

      const formatToUse = opts.formats || "all";
      const files = formatToUse === "all"
        ? generateAllFormats(scanResult, {})
        : formatToUse.split(",").map((f: string) =>
            generateFormat(f.trim() as FormatId, scanResult, {})
          );

      for (const file of files) {
        const filePath = join(targetDir, file.path);
        if (!existsSync(dirname(filePath))) mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, file.content, "utf-8");
      }
      const claudeFile = files.find(f => /CLAUDE\.md/i.test(f.path));
      const tokens = claudeFile ? estimateTokens(claudeFile.content) : 0;
      console.log(pc.green(` done`) + pc.dim(` (${(tokens / 1000).toFixed(1)}k tokens, ${scanResult.stats?.totalFiles ?? 0} files)\n`));
    } catch (err) {
      console.error(pc.red(`\n  Initial scan failed: ${err instanceof Error ? err.message : err}\n`));
      process.exit(1);
    }

    const stopWatch = watchProject(
      targetDir,
      {
        debounceMs: Number(opts.debounce) || 1500,
        ignore: [],
        verbose: opts.verbose ?? false,
        formats: opts.formats ? opts.formats.split(",").map(f => f.trim()) : [],
      },
      async (scanOpts) => {
        const engine = new ScannerEngine();
        const excludePatterns = loadConfig(targetDir).exclude || [];
        const engineOptions: Record<string, unknown> = { yes: true };
        if (scanOpts.rescanOnlyChanged) {
          const cache = loadMtimeCache(targetDir);
          const fg = (await import("fast-glob")).default;
          const allFiles = await fg(
            ["**/*.{ts,tsx,js,jsx,json,md,py,go,rs,prisma,graphql,yml,yaml}", "!**/node_modules/**", "!**/.next/**", "!**/dist/**", "!**/build/**", "!**/.git/**"],
            { cwd: targetDir, absolute: false, followSymbolicLinks: false }
          );
          const { changedFiles } = filterChangedFiles(allFiles, targetDir, cache);
          engineOptions.changedFilesOnly = changedFiles;
        }
        const scanResult = await engine.run(targetDir, excludePatterns, engineOptions);
        const [barrels, dependencies, fileTree, importGraph, typeExports, graphqlSchemas, latentHooks] =
          await Promise.all([
            scanBarrels(targetDir),
            scanDependencies(targetDir),
            scanFileTree(targetDir),
            scanImports(targetDir),
            scanTypes(targetDir),
            scanGraphQL(targetDir),
            scanLatentHooks(targetDir, scanResult.framework, scanResult.utilities),
          ]);
        Object.assign(scanResult, {
          barrels, dependencies, fileTree, importGraph, typeExports, graphqlSchemas, latentHooks,
          antiPatterns: generateAntiPatterns(scanResult.framework, scanResult.utilities, scanResult.tokens, scanResult.components, scanResult.utilities.hasMode),
        });

        const formatToUse = scanOpts.format || "all";
        const files = formatToUse === "all"
          ? generateAllFormats(scanResult, {})
          : formatToUse.split(",").map((f: string) =>
              generateFormat(f.trim() as FormatId, scanResult, {})
            );

        for (const file of files) {
          const filePath = join(targetDir, file.path);
          if (!existsSync(dirname(filePath))) mkdirSync(dirname(filePath), { recursive: true });
          writeFileSync(filePath, file.content, "utf-8");
        }

        if (!scanOpts.rescanOnlyChanged) {
          try {
            const fg2 = (await import("fast-glob")).default;
            const allFilesForCache = await fg2(
              ["**/*.{ts,tsx,js,jsx,json,md,py,go,rs,prisma,graphql,yml,yaml}", "!**/node_modules/**", "!**/.next/**", "!**/dist/**", "!**/build/**", "!**/.git/**"],
              { cwd: targetDir, absolute: false, followSymbolicLinks: false }
            );
            saveMtimeCache(targetDir, allFilesForCache);
          } catch {}
        }

        const claudeFile = files.find(f => /CLAUDE\.md/i.test(f.path));
        const tokenCount = claudeFile ? estimateTokens(claudeFile.content) : undefined;
        return { tokenCount, fileCount: scanResult.stats?.totalFiles };
      }
    );

    await new Promise<void>((resolve) => {
      const shutdown = (signal: string) => {
        console.log(pc.dim(`\n[watch] stopped (${signal})\n`));
        stopWatch();
        resolve();
      };
      process.on("SIGINT", () => shutdown("SIGINT"));
      process.on("SIGTERM", () => shutdown("SIGTERM"));
    });
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

// --- agents command ---
cli
  .command("agents [dir]", "Generate a full .claude/agents/ company from your codebase")
  .option("-o, --output <path>", "Output directory (defaults to scan directory)")
  .option("-y, --yes", "Non-interactive: generate all departments, skip wizard")
  .option("--dry-run", "Preview agent list without writing files")
  .option("--dept <departments>", "Comma-separated departments (engineering,product,design,marketing,sales,operations,pr)")
  .option("--type <preset>", "Company type preset (saas, agency, ai-product, design-studio, social-media-agency, sales-org, ecommerce, custom)")
  .option("--json-stream", "Output NDJSON agent events to stdout (for studio integration)")
  .action(async (dir: string | undefined, options: any) => {
    const targetDir = dir || process.cwd();
    const quiet = options.yes;

    if (!quiet) console.log(pc.cyan("\n  # hashmark agents\n"));

    try {
      // Scan the codebase first
      const engine = new ScannerEngine();
      const excludePatterns = loadConfig(targetDir).exclude || [];

      if (!quiet) process.stdout.write("  Scanning codebase...");
      const scanResult = await engine.run(targetDir, excludePatterns, { yes: true });

      // Run secondary scanners for richer agent context (import graph, deps, latent hooks)
      const [importGraph, dependencies, latentHooks] = await Promise.all([
        scanImports(targetDir),
        scanDependencies(targetDir),
        scanLatentHooks(targetDir, scanResult.framework, scanResult.utilities),
      ]);
      Object.assign(scanResult, { importGraph, dependencies, latentHooks });

      if (!quiet) console.log(pc.green(" done"));

      // Detect project name from package.json
      let detectedName = "Project";
      try {
        const pkgPath = join(targetDir, "package.json");
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
          detectedName = pkg.name || detectedName;
        }
      } catch {}

      const { COMPANY_PRESETS } = await import("./agents/company-types.js");

      const { detectProviderFromEnv } = await import("./agents/ai-generator.js");

      let projectName = detectedName;
      let roles: any[] = [];
      let providerConfig: any = detectProviderFromEnv();

      if (!quiet) {
        const { runAgentsWizard } = await import("./agents/wizard.js");
        const result = await runAgentsWizard(detectedName);
        if (!result) process.exit(0);
        projectName = result.projectName;
        roles = result.roles;
        providerConfig = result.providerConfig;
      } else {
        // Non-interactive: default to saas preset or --type flag
        const presetId = options.type || "saas";
        const preset = COMPANY_PRESETS.find((p: any) => p.id === presetId) || COMPANY_PRESETS[0];
        roles = preset.roles;
      }

      const outputDir = options.output ? resolve(options.output) : targetDir;

      if (options.dryRun) {
        console.log(pc.dim("\n  Preview (dry run):\n"));
        for (const role of roles) {
          console.log(pc.dim(`    .claude/agents/${role.department}/${role.id}.md`));
        }
        console.log(pc.dim(`    .claude/agents/INDEX.md`));
        const depts = [...new Set(roles.map((r: any) => r.department))];
        console.log(pc.dim(`\n  ${roles.length} agents across ${depts.length} departments\n`));
        process.exit(0);
      }

      if (!providerConfig) {
        console.error(pc.red("\n  ✗ No AI provider found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_API_KEY — or run without --yes to pick interactively.\n"));
        process.exit(1);
      }

      // Generate agents with AI
      const { generateAgentsWithAI, generateIndexWithAI, buildScanSummary } = await import("./agents/ai-generator.js");
      const scanSummary = buildScanSummary(scanResult, projectName);

      const jsonStream = options.jsonStream;
      if (jsonStream) process.stdout.write(JSON.stringify({ type: "start", total: roles.length }) + "\n");

      let done = 0;
      const agents = await generateAgentsWithAI(
        scanResult, roles, projectName, providerConfig,
        (roleTitle, _done, total) => {
          done = _done;
          if (jsonStream) {
            // Find the just-completed agent and stream it
            // Progress event — the full agent is emitted when written below
          } else if (!quiet) {
            process.stdout.write(`\r  Generating agents... ${done}/${total} — ${roleTitle}              `);
          }
        }
      );
      if (!quiet && !jsonStream) console.log(pc.green(`\r  Generated ${agents.length} agents                                        `));

      // Write agent files
      for (const agent of agents) {
        const filePath = join(outputDir, ".claude", "agents", agent.path);
        if (!existsSync(dirname(filePath))) mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, agent.content, "utf-8");
        if (jsonStream) {
          process.stdout.write(JSON.stringify({ type: "agent", path: agent.path, content: agent.content, role: agent.role }) + "\n");
        } else if (!quiet) {
          console.log(pc.green(`    ✓ .claude/agents/${agent.path}`));
        }
      }

      // Generate and write INDEX.md
      const index = await generateIndexWithAI(agents, projectName, scanSummary, providerConfig);
      const indexPath = join(outputDir, ".claude", "agents", "INDEX.md");
      writeFileSync(indexPath, index, "utf-8");
      if (jsonStream) {
        process.stdout.write(JSON.stringify({ type: "done", count: agents.length }) + "\n");
      } else if (!quiet) {
        console.log(pc.green(`    ✓ .claude/agents/INDEX.md`));
      }

      if (!quiet) {
        const depts = [...new Set(agents.map(a => a.role.department))];
        console.log(pc.dim(`\n  ${agents.length} agents across ${depts.length} departments`));
        console.log(pc.dim(`  Claude Code will automatically use these agents based on your requests.\n`));
      } else {
        const written = agents.map(a => join(outputDir, ".claude", "agents", a.path));
        process.stdout.write(JSON.stringify({ ok: true, files: written, count: agents.length }) + "\n");
      }

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (options.yes) {
        process.stderr.write(JSON.stringify({ ok: false, error: msg }) + "\n");
      } else {
        console.error(pc.red(`\n  ✗ Failed: ${msg}\n`));
      }
      process.exit(1);
    }
  });

// --- mcp command ---
cli
  .command("mcp", "Start the hashmark MCP server (stdio transport for Claude Code, Cursor, etc.)")
  .option("--project-dir <path>", "Project root directory (defaults to cwd)")
  .action(async (options: { projectDir?: string }) => {
    if (options.projectDir) {
      process.env.HASHMARK_PROJECT_DIR = resolve(options.projectDir);
    }
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

// --- compact command ---
cli
  .command("compact <file>", "Compress a session export by stripping tool noise and summarizing early context")
  .option("--output <file>", "Write compacted JSON to file instead of stdout")
  .option("--format <format>", "Output format: json (default) or text (print summary only)", { default: "json" })
  .option("--threshold <n>", "Tool output truncation threshold in chars", { default: "500" })
  .action(async (file: string, opts: { output?: string; format: string; threshold: string }) => {
    try {
      const { compactMessages } = await import("./commands/compact.js");
      const raw = readFileSync(file, "utf-8");
      let messages: unknown;
      try {
        messages = JSON.parse(raw);
      } catch {
        console.error(pc.red(`\n  compact: invalid JSON in ${file}\n`));
        process.exit(1);
      }
      if (!Array.isArray(messages)) {
        console.error(pc.red("\n  compact: input must be a JSON array of {role, content} messages\n"));
        process.exit(1);
      }

      const result = compactMessages(messages as any, {
        output: opts.output,
        format: opts.format as "json" | "text",
        threshold: parseInt(opts.threshold, 10),
      });

      const out = opts.format === "text"
        ? (result.summary || "(no early context to summarize)")
        : JSON.stringify(result.messages, null, 2);

      if (opts.output) {
        const outPath = resolve(opts.output);
        if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, out, "utf-8");
        console.error(pc.green(`  Wrote ${outPath}`));
      } else {
        process.stdout.write(out + "\n");
      }

      console.error(
        pc.dim(
          `  ${result.originalTokens.toLocaleString()} tokens → ${result.compactedTokens.toLocaleString()} tokens  (${result.reductionPct}% reduction)`
        )
      );
    } catch (error) {
      console.error(pc.red(`\n  compact failed: ${error instanceof Error ? error.message : error}\n`));
      process.exit(1);
    }
  });

// --- stats command ---
cli
  .command("stats", "Print a project statistics dashboard from .hashmark/ cache")
  .option("--json", "Output raw JSON instead of formatted table")
  .option("--project-dir <path>", "Path to the project (defaults to cwd)")
  .action(async (opts: { json?: boolean; projectDir?: string }) => {
    try {
      const { runStats } = await import("./commands/stats.js");
      await runStats({ json: opts.json, projectDir: opts.projectDir });
    } catch (error) {
      console.error(pc.red(`\n  stats failed: ${error instanceof Error ? error.message : error}\n`));
      process.exit(1);
    }
  });

// --- doctor command ---
cli
  .command("doctor", "Run a 9-point health check on the project")
  .action(async () => {
    try {
      const { runDoctor } = await import("./commands/doctor.js");
      await runDoctor(process.cwd());
    } catch (error) {
      console.error(pc.red(`\n  doctor failed: ${error instanceof Error ? error.message : error}\n`));
      process.exit(1);
    }
  });

// --- studio command ---
cli
  .command("studio", "Open the visual agent studio in your browser")
  .option("--port <port>", "Port to run the studio on", { default: 3200 })
  .option("--no-open", "Don't auto-open the browser")
  .action(async (options: { port: number; open: boolean }) => {
    const { spawn } = await import("child_process");
    const { join: pathJoin, dirname: pathDirname } = await import("path");
    const { existsSync: fsExists } = await import("fs");

    const __dir = pathDirname(fileURLToPath(import.meta.url));

    // Look for studio bin in sibling packages/studio or in node_modules
    const studioBin = [
      pathJoin(__dir, "../../studio/dist/bin.js"),
      pathJoin(__dir, "../../../studio/dist/bin.js"),
      pathJoin(__dir, "../../node_modules/hashmark-studio/dist/bin.js"),
    ].find((p) => fsExists(p));

    if (!studioBin) {
      console.error(pc.red("\n  Error: hashmark studio is not built yet."));
      console.error(pc.dim("  Run: cd packages/studio && npm install && npm run build\n"));
      process.exit(1);
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      STUDIO_PORT: String(options.port),
      HASHMARK_PROJECT_DIR: process.cwd(),
    };

    if (!options.open) env.HASHMARK_NO_OPEN = "1";

    const proc = spawn(process.execPath, [studioBin], {
      env,
      stdio: "inherit",
    });

    proc.on("error", (err) => {
      console.error(pc.red(`\n  Studio error: ${err.message}\n`));
      process.exit(1);
    });

    process.on("SIGINT", () => {
      proc.kill("SIGINT");
      process.exit(0);
    });
  });

cli.help();
cli.version(packageVersion);
cli.parse();
