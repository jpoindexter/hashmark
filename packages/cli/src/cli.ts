#!/usr/bin/env node

/**
 * hashmark CLI
 *
 * Main entry point for the hashmark command-line tool.
 * Scans codebases and generates AGENTS.md files with comprehensive
 * context for AI coding assistants.
 *
 * @example
 * ```bash
 * # Basic usage
 * npx hashmark
 *
 * # With options
 * npx hashmark --compact --copy
 * ```
 */

import { cac } from "cac";
import pc from "picocolors";
import { scanComponents } from "./scanners/components.js";
import { scanTokens } from "./scanners/tokens.js";
import { detectFramework } from "./scanners/framework.js";
import { scanHooks } from "./scanners/hooks.js";
import { scanUtilities } from "./scanners/utilities.js";
import { scanCommands } from "./scanners/commands.js";
import { scanExistingContext } from "./scanners/existing-context.js";
import { scanVariants } from "./scanners/variants.js";
import { scanApiRoutes } from "./scanners/api-routes.js";
import { scanEnvVars } from "./scanners/env-vars.js";
import { scanPatterns } from "./scanners/patterns.js";
import { scanDatabase } from "./scanners/database.js";
import { scanStats, formatBytes } from "./scanners/stats.js";
import { analyzeComplexity } from "./scanners/complexity.js";
import { scanBarrels } from "./scanners/barrels.js";
import { scanDependencies } from "./scanners/dependencies.js";
import { scanGitLog, formatGitLog, getGitDiff, formatGitDiff } from "./scanners/git.js";
import { scanFileTree, formatFileTree } from "./scanners/file-tree.js";
import { scanImports, formatImportGraph } from "./scanners/imports.js";
import { scanTypes, formatTypes } from "./scanners/types.js";
import { generateAntiPatterns, formatAntiPatterns } from "./scanners/anti-patterns.js";
import { scanTestCoverage } from "./scanners/tests.js";
import { scanSecurity, formatSecurityAudit } from "./scanners/security.js";
import { detectMonorepo, formatMonorepoOverview } from "./scanners/monorepo.js";
import { scanGraphQL } from "./scanners/graphql.js";
import { generateAgentsMd } from "./generator.js";
import { generateAgentsIndex } from "./json-generator.js";
import { generateAllFormats, generateFormat, FORMAT_REGISTRY, type FormatId } from "./formats/index.js";
import { validateGitUrl, escapeShellPath } from "./utils/shell.js";
import { estimateTokens, formatTokens, getContextUsage } from "./utils/tokens.js";
import { detectSecrets } from "./utils/secrets.js";
import { parseSize, splitContent, getSplitFilenames } from "./utils/split.js";
import { loadConfig } from "./config.js";
import { writeFileSync, existsSync, rmSync, mkdirSync, watch } from "fs";
import { join, relative } from "path";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join as pathJoin } from "path";
import { homedir } from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to read package.json from multiple possible locations
let packageVersion = "2.0.0"; // fallback
try {
  // When running from dist in development or from installed package
  const packageJson = JSON.parse(readFileSync(pathJoin(__dirname, "../package.json"), "utf-8"));
  packageVersion = packageJson.version;
} catch {
  try {
    // When dist is at root level in published package
    const packageJson = JSON.parse(readFileSync(pathJoin(__dirname, "package.json"), "utf-8"));
    packageVersion = packageJson.version;
  } catch {
    // Use fallback version
  }
}

const LAST_RUN_DIR = join(homedir(), ".hashmark");
const LAST_RUN_PATH = join(LAST_RUN_DIR, "last-run.json");

function writeLastRun(data: Record<string, unknown>) {
  try {
    if (!existsSync(LAST_RUN_DIR)) mkdirSync(LAST_RUN_DIR, { recursive: true });
    writeFileSync(LAST_RUN_PATH, JSON.stringify({ version: packageVersion, timestamp: new Date().toISOString(), ...data }, null, 2));
  } catch {}
}

function readLastRun(): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(LAST_RUN_PATH, "utf-8"));
  } catch {
    return null;
  }
}

const cli = cac("hashmark");

cli
  .command("[dir]", "Generate AGENTS.md from your codebase")
  .option("-o, --output <file>", "Output file path", { default: "AGENTS.md" })
  .option("--dry-run", "Preview without writing file")
  .option("--force", "Overwrite existing AGENTS.md even if it has custom content")
  .option("--compact", "Generate compact output (fewer details, smaller token count)")
  .option("--json", "Also generate AGENTS.index.json for programmatic access")
  .option("--check-secrets", "Scan for potential secrets and warn before output")
  .option("--include-git-log", "Include recent git commits in output")
  .option("--xml", "Output in XML format (industry standard)")
  .option("--remote <url>", "Clone and analyze a remote GitHub repository")
  .option("--compress", "Extract signatures only (reduce tokens by ~40%)")
  .option("--minimal", "Ultra-compact output (~3K tokens) - TL;DR + rules + component names")
  .option("--tree", "Include file tree in output (off by default)")
  .option("--copy", "Copy output to clipboard")
  .option("--include-diffs", "Include uncommitted git changes")
  .option("--split-output <size>", "Split output into chunks (e.g., 100kb, 500kb)")
  .option("--security", "Include security audit (npm audit) in output")
  .option("--monorepo", "Generate AGENTS.md for each package in monorepo")
  .option("--mcp", "Start as MCP server (for AI tool integration)")
  .option("--watch", "Watch for file changes and regenerate automatically")
  .option("--format <formats>", "Output format(s): all, claude-md, cursorrules, cursor-mdc, copilot-md, windsurf-rules, gemini-md, cline-rules")
  .action(async (dir: string | undefined, options: { output: string; dryRun?: boolean; force?: boolean; compact?: boolean; json?: boolean; checkSecrets?: boolean; includeGitLog?: boolean; xml?: boolean; remote?: string; compress?: boolean; minimal?: boolean; tree?: boolean; copy?: boolean; includeDiffs?: boolean; splitOutput?: string; security?: boolean; monorepo?: boolean; mcp?: boolean; watch?: boolean; format?: string }) => {
    // Handle MCP server mode
    if (options.mcp) {
      const { startMcpServer } = await import("./mcp-server.js");
      await startMcpServer();
      return;
    }

    let targetDir = dir || process.cwd();
    let isRemote = false;
    let tempDir = "";

    // Handle remote repository
    if (options.remote) {
      isRemote = true;
      tempDir = join(process.cwd(), ".hashmark-temp");
      console.log(pc.cyan("\n  # hashmark\n"));
      console.log(pc.dim(`  Cloning ${options.remote}...\n`));

      try {
        // Validate and sanitize git URL to prevent command injection
        const safeUrl = validateGitUrl(options.remote);
        const safeTempDir = escapeShellPath(tempDir);

        // Clean up any existing temp directory
        if (existsSync(tempDir)) {
          rmSync(tempDir, { recursive: true });
        }
        // Clone the repository
        execSync(`git clone --depth 1 ${safeUrl} ${safeTempDir}`, { stdio: "pipe" });
        targetDir = tempDir;
        console.log(pc.green(`  ✓ Cloned repository\n`));
      } catch (error) {
        console.error(pc.red(`  ✗ Failed to clone repository: ${error instanceof Error ? error.message : error}\n`));
        process.exit(1);
      }
    }

    // Load config file if present
    const config = loadConfig(targetDir);
    const outputFile = options.output !== "AGENTS.md" ? options.output : config.output || "AGENTS.md";

    if (!isRemote) {
      console.log(pc.cyan("\n  # hashmark\n"));
    }

    // Handle monorepo mode
    if (options.monorepo) {
      const monorepoInfo = await detectMonorepo(targetDir);
      if (monorepoInfo.isMonorepo && monorepoInfo.packages.length > 0) {
        console.log(pc.dim(`  Detected ${monorepoInfo.type} monorepo with ${monorepoInfo.packages.length} packages\n`));

        // Generate AGENTS.md for each package
        for (const pkg of monorepoInfo.packages) {
          console.log(pc.dim(`  Scanning ${pkg.name}...`));

          if (options.dryRun) {
            console.log(pc.yellow(`    Would generate: ${pkg.relativePath}/AGENTS.md`));
          } else {
            // Recursively call the main logic for each package
            const pkgConfig = loadConfig(pkg.path);
            const pkgExcludePatterns = pkgConfig.exclude || [];

            const [pkgComponents, pkgTokens, pkgFramework, pkgHooks, pkgUtilities, pkgCommands, pkgExistingContext, pkgVariants, pkgApiRoutes, pkgEnvVars, pkgPatterns, pkgDatabase, pkgStats, pkgBarrels, pkgDependencies, pkgFileTree, pkgImportGraph, pkgTypeExports, pkgGraphQLSchemas] = await Promise.all([
              scanComponents(pkg.path, pkgExcludePatterns),
              scanTokens(pkg.path),
              detectFramework(pkg.path),
              scanHooks(pkg.path),
              scanUtilities(pkg.path),
              scanCommands(pkg.path),
              scanExistingContext(pkg.path),
              scanVariants(pkg.path),
              scanApiRoutes(pkg.path),
              scanEnvVars(pkg.path),
              scanPatterns(pkg.path),
              scanDatabase(pkg.path),
              scanStats(pkg.path),
              scanBarrels(pkg.path),
              scanDependencies(pkg.path),
              scanFileTree(pkg.path),
              scanImports(pkg.path),
              scanTypes(pkg.path),
              scanGraphQL(pkg.path),
            ]);

            const pkgAntiPatterns = generateAntiPatterns(pkgFramework, pkgUtilities, pkgTokens, pkgComponents, pkgUtilities.hasMode);
            const pkgTestCoverage = await scanTestCoverage(pkg.path, pkgComponents);

            const pkgContent = generateAgentsMd(
              { components: pkgComponents, tokens: pkgTokens, framework: pkgFramework, hooks: pkgHooks, utilities: pkgUtilities, commands: pkgCommands, existingContext: pkgExistingContext, variants: pkgVariants, apiRoutes: pkgApiRoutes, envVars: pkgEnvVars, patterns: pkgPatterns, database: pkgDatabase, stats: pkgStats, barrels: pkgBarrels, dependencies: pkgDependencies, fileTree: pkgFileTree, importGraph: pkgImportGraph, typeExports: pkgTypeExports, antiPatterns: pkgAntiPatterns, testCoverage: pkgTestCoverage, graphqlSchemas: pkgGraphQLSchemas },
              { compact: options.compact, compress: options.compress, minimal: options.minimal }
            );

            const pkgOutputPath = join(pkg.path, "AGENTS.md");
            writeFileSync(pkgOutputPath, pkgContent, "utf-8");
            const pkgTokenCount = estimateTokens(pkgContent);
            console.log(pc.green(`    ✓ ${pkg.relativePath}/AGENTS.md (~${formatTokens(pkgTokenCount)} tokens)`));
          }
        }

        // Generate root AGENTS.md with monorepo overview
        if (!options.dryRun) {
          const rootLines = [
            "# AGENTS.md",
            "",
            "> Auto-generated by [hashmark](https://hashmark.md)",
            "",
            formatMonorepoOverview(monorepoInfo),
          ];
          const rootContent = rootLines.join("\n");
          const rootOutputPath = join(targetDir, "AGENTS.md");
          writeFileSync(rootOutputPath, rootContent, "utf-8");
          console.log(pc.green(`\n  ✓ Generated root AGENTS.md`));
        } else {
          console.log(pc.yellow(`\n  Would generate: AGENTS.md (root overview)`));
        }

        console.log("");
        return;
      } else {
        console.log(pc.yellow(`  Not a monorepo, proceeding with standard scan...\n`));
      }
    }

    console.log(pc.dim(`  Scanning ${isRemote ? options.remote : targetDir}...\n`));

    const scanStart = Date.now();
    const activeFlags = Object.entries(options)
      .filter(([k, v]) => v === true && k !== "force")
      .map(([k]) => `--${k.replace(/([A-Z])/g, "-$1").toLowerCase()}`)
      .join(" ");

    try {
      // Run types scanner first to enable schema resolution in API routes
      const excludePatterns = config.exclude || [];
      const typeExports = await scanTypes(targetDir);

      // Run remaining scanners in parallel
      const [components, tokens, framework, hooks, utilities, commands, existingContext, variants, apiRoutes, envVars, patterns, database, stats, barrels, dependencies, fileTree, importGraph, graphqlSchemas] = await Promise.all([
        scanComponents(targetDir, excludePatterns),
        scanTokens(targetDir),
        detectFramework(targetDir),
        scanHooks(targetDir),
        scanUtilities(targetDir),
        scanCommands(targetDir),
        scanExistingContext(targetDir),
        scanVariants(targetDir),
        scanApiRoutes(targetDir, typeExports.types),
        scanEnvVars(targetDir),
        scanPatterns(targetDir),
        scanDatabase(targetDir),
        scanStats(targetDir),
        scanBarrels(targetDir),
        scanDependencies(targetDir),
        scanFileTree(targetDir),
        scanImports(targetDir),
        scanGraphQL(targetDir),
      ]);

      // Generate anti-patterns based on detected features
      const antiPatterns = generateAntiPatterns(framework, utilities, tokens, components, utilities.hasMode);

      // Scan test coverage (needs components list)
      const testCoverage = await scanTestCoverage(targetDir, components);

      // Scan security (optional, only when --security flag)
      const securityAudit = options.security ? await scanSecurity(targetDir) : null;

      // Analyze complexity and generate AI recommendations
      const aiRecommendations = await analyzeComplexity(targetDir);

      // Report findings
      console.log(pc.green(`  ✓ Found ${components.length} components`));
      if (variants.length > 0) {
        console.log(pc.green(`  ✓ Found ${variants.length} components with CVA variants`));
      }
      console.log(pc.green(`  ✓ Found ${Object.keys(tokens.colors).length} color tokens`));
      console.log(pc.green(`  ✓ Found ${hooks.length} custom hooks`));
      if (apiRoutes.length > 0) {
        console.log(pc.green(`  ✓ Found ${apiRoutes.length} API routes`));
      }
      if (graphqlSchemas && graphqlSchemas.size > 0) {
        console.log(pc.green(`  ✓ Found ${graphqlSchemas.size} GraphQL schemas`));
      }
      if (envVars.length > 0) {
        console.log(pc.green(`  ✓ Found ${envVars.length} environment variables`));
      }
      console.log(pc.green(`  ✓ Detected ${framework.name}${framework.router ? ` (${framework.router})` : ""}`));

      if (utilities.hasShadcn) {
        console.log(pc.green(`  ✓ Detected shadcn/ui (${utilities.radixPackages.length} Radix packages)`));
      }
      if (utilities.hasCn) {
        console.log(pc.green(`  ✓ Found cn() utility`));
      }
      if (utilities.hasMode) {
        console.log(pc.green(`  ✓ Found mode/design-system`));
      }
      if (patterns.patterns.length > 0) {
        console.log(pc.green(`  ✓ Detected ${patterns.patterns.length} code patterns`));
      }
      if (existingContext.hasClaudeMd) {
        console.log(pc.green(`  ✓ Found existing ${existingContext.claudeMdPath}`));
      }
      if (existingContext.hasAiFolder) {
        console.log(pc.green(`  ✓ Found .ai/ folder (${existingContext.aiFiles.length} files)`));
      }
      if (database) {
        console.log(pc.green(`  ✓ Found ${database.provider} schema (${database.models.length} models)`));
      }
      console.log(pc.green(`  ✓ Scanned ${stats.totalFiles} files (${formatBytes(stats.totalSize)}, ${stats.totalLines.toLocaleString()} lines)`));
      if (barrels.length > 0) {
        console.log(pc.green(`  ✓ Found ${barrels.length} barrel exports`));
      }
      if (importGraph.hubFiles.length > 0) {
        console.log(pc.green(`  ✓ Found ${importGraph.hubFiles.length} hub files (most imported)`));
      }
      if (importGraph.circularDeps.length > 0) {
        console.log(pc.yellow(`  ⚠ Found ${importGraph.circularDeps.length} circular dependencies`));
      }
      if (importGraph.unusedFiles.length > 0) {
        console.log(pc.yellow(`  ⚠ Found ${importGraph.unusedFiles.length} potentially unused components`));
      }
      if (typeExports.propsTypes.length > 0) {
        console.log(pc.green(`  ✓ Found ${typeExports.propsTypes.length} Props types`));
      }
      if (testCoverage.testFiles.length > 0) {
        console.log(pc.green(`  ✓ Found ${testCoverage.testFiles.length} test files (${testCoverage.coverage}% component coverage)`));
      }
      if (securityAudit) {
        const v = securityAudit.vulnerabilities;
        if (v.total > 0) {
          const parts: string[] = [];
          if (v.critical > 0) parts.push(`${v.critical} critical`);
          if (v.high > 0) parts.push(`${v.high} high`);
          if (v.moderate > 0) parts.push(`${v.moderate} moderate`);
          if (v.low > 0) parts.push(`${v.low} low`);
          console.log(pc.yellow(`  ⚠ Security: ${parts.join(", ")} vulnerabilities`));
        } else if (!securityAudit.auditError) {
          console.log(pc.green(`  ✓ Security: No vulnerabilities found`));
        }
      }

      // Scan git log if requested
      let gitInfo = null;
      if (options.includeGitLog) {
        gitInfo = scanGitLog(targetDir);
        if (gitInfo) {
          console.log(pc.green(`  ✓ Found ${gitInfo.commits.length} recent commits`));
        }
      }

      // Check for existing non-generated AGENTS.md
      if (existingContext.hasAgentsMd && !options.force) {
        console.log(pc.yellow(`\n  ⚠ Found existing ${existingContext.agentsMdPath} with custom content`));
        console.log(pc.yellow(`    Use --force to overwrite\n`));
        return;
      }

      // Build scan result object
      const scanResult = { components, tokens, framework, hooks, utilities, commands, existingContext, variants, apiRoutes, envVars, patterns, database, stats, barrels, dependencies, fileTree, importGraph, typeExports, antiPatterns, testCoverage, securityAudit: securityAudit || undefined, aiRecommendations, graphqlSchemas };

      // Multi-format generation (--format flag)
      if (options.format) {
        const writeDir = isRemote ? process.cwd() : targetDir;
        const formatOpts = { generatorOptions: { compact: options.compact, compress: options.compress, minimal: options.minimal, includeTree: options.tree, xml: options.xml } };

        if (options.format === "all") {
          // Generate ALL formats
          const files = generateAllFormats(scanResult, formatOpts);
          console.log(pc.green(`\n  ✓ Generated ${files.length} format files:`));

          if (!options.dryRun) {
            for (const file of files) {
              const filePath = join(writeDir, file.path);
              // Create directory if needed (e.g., .cursor/rules/ or .github/)
              const fileDir = dirname(filePath);
              if (!existsSync(fileDir)) mkdirSync(fileDir, { recursive: true });
              writeFileSync(filePath, file.content, "utf-8");
              const tokens = estimateTokens(file.content);
              console.log(pc.green(`    ✓ ${file.path} (~${formatTokens(tokens)} tokens) — ${file.tool}`));
            }
          } else {
            for (const file of files) {
              console.log(pc.yellow(`    Would generate: ${file.path} — ${file.tool}`));
            }
          }
          console.log("");

          // Generate JSON index alongside format files when --json is passed
          if (options.json && !options.dryRun) {
            const agentsMdFile = files.find(f => f.path === "AGENTS.md");
            const jsonContent = generateAgentsIndex(scanResult, agentsMdFile?.content ?? "");
            writeFileSync(join(writeDir, "AGENTS.index.json"), jsonContent, "utf-8");
            console.log(pc.green(`  ✓ Generated AGENTS.index.json\n`));
          }

          writeLastRun({
            status: "success",
            durationMs: Date.now() - scanStart,
            flags: activeFlags || "(none)",
            format: "all",
            formats: files.length,
            components: components.length,
            filesScanned: stats.totalFiles,
          });

          // Clean up temp directory if remote
          if (isRemote && tempDir && existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true });
          }
          return;
        } else {
          // Generate specific format(s)
          const requestedFormats = options.format.split(",").map(f => f.trim()) as FormatId[];
          const validFormats = requestedFormats.filter(f => f in FORMAT_REGISTRY);

          if (validFormats.length === 0) {
            console.log(pc.red(`\n  ✗ Unknown format: ${options.format}`));
            console.log(pc.dim(`    Available: all, ${Object.keys(FORMAT_REGISTRY).join(", ")}\n`));
            process.exit(1);
          }

          console.log(pc.green(`\n  ✓ Generated ${validFormats.length} format file(s):`));

          if (!options.dryRun) {
            for (const fmt of validFormats) {
              const file = generateFormat(fmt, scanResult, formatOpts);
              const filePath = join(writeDir, file.path);
              const fileDir = dirname(filePath);
              if (!existsSync(fileDir)) mkdirSync(fileDir, { recursive: true });
              writeFileSync(filePath, file.content, "utf-8");
              const tokens = estimateTokens(file.content);
              console.log(pc.green(`    ✓ ${file.path} (~${formatTokens(tokens)} tokens) — ${file.tool}`));
            }
          } else {
            for (const fmt of validFormats) {
              const meta = FORMAT_REGISTRY[fmt];
              console.log(pc.yellow(`    Would generate: ${meta.path} — ${meta.tool}`));
            }
          }
          console.log("");

          writeLastRun({
            status: "success",
            durationMs: Date.now() - scanStart,
            flags: activeFlags || "(none)",
            format: options.format,
            components: components.length,
            filesScanned: stats.totalFiles,
          });

          // Clean up temp directory if remote
          if (isRemote && tempDir && existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true });
          }
          return;
        }
      }

      // Default: Generate AGENTS.md content (original behavior)
      let content = generateAgentsMd(
        scanResult,
        { compact: options.compact, compress: options.compress, minimal: options.minimal, includeTree: options.tree, xml: options.xml }
      );

      // Append git log if included
      if (gitInfo) {
        content += "\n" + formatGitLog(gitInfo);
      }

      // Append git diff if included
      if (options.includeDiffs) {
        const diff = getGitDiff(targetDir);
        if (diff) {
          content += "\n" + formatGitDiff(diff);
          console.log(pc.green(`  ✓ Included uncommitted changes (${(diff.length / 1024).toFixed(1)}KB)`));
        }
      }

      // Append security audit if included
      if (securityAudit && !options.minimal && !options.xml) {
        content += "\n" + formatSecurityAudit(securityAudit);
      }

      // Check for secrets if requested
      if (options.checkSecrets) {
        const secrets = detectSecrets(content);
        if (secrets.length > 0) {
          console.log(pc.yellow(`\n  ⚠ Found ${secrets.length} potential secrets:`));
          for (const s of secrets.slice(0, 5)) {
            console.log(pc.yellow(`    - ${s.type}: ${s.preview} (line ${s.line})`));
          }
          if (secrets.length > 5) {
            console.log(pc.yellow(`    ... and ${secrets.length - 5} more`));
          }
          console.log(pc.yellow(`\n  Review before sharing publicly.\n`));
        } else {
          console.log(pc.green(`  ✓ No secrets detected`));
        }
      }

      // Calculate token estimate
      const tokenCount = estimateTokens(content);
      const contextUsage = getContextUsage(tokenCount);

      // Determine output file extension based on format
      let finalContent = content;
      let finalOutputFile = options.xml ? outputFile.replace(".md", ".xml") : outputFile;

      if (options.dryRun) {
        console.log(pc.yellow("\n  Dry run - would generate:\n"));
        if (options.splitOutput) {
          try {
            const maxBytes = parseSize(options.splitOutput);
            const { chunks } = splitContent(finalContent, maxBytes);
            const filenames = getSplitFilenames(finalOutputFile, chunks.length);
            for (const filename of filenames) {
              console.log(pc.dim("  " + filename));
            }
          } catch (err) {
            console.log(pc.dim("  " + finalOutputFile));
            console.log(pc.yellow(`  ⚠ Split error: ${err instanceof Error ? err.message : 'unknown'}`));
          }
        } else {
          console.log(pc.dim("  " + finalOutputFile));
        }
        if (options.json && !options.xml) {
          console.log(pc.dim("  " + outputFile.replace(".md", ".index.json")));
        }
        console.log(pc.dim(`  ${finalContent.length.toLocaleString()} chars · ~${formatTokens(tokenCount)} tokens (${contextUsage}% of 128K context)\n`));
      } else {
        // Write to original directory if remote, otherwise target directory
        const writeDir = isRemote ? process.cwd() : targetDir;

        // Handle --split-output
        if (options.splitOutput) {
          try {
            const maxBytes = parseSize(options.splitOutput);
            const { chunks, totalSize } = splitContent(finalContent, maxBytes);
            const filenames = getSplitFilenames(finalOutputFile, chunks.length);

            console.log(pc.green(`\n  ✓ Split output into ${chunks.length} files:`));
            for (let i = 0; i < chunks.length; i++) {
              const outputPath = join(writeDir, filenames[i]);
              writeFileSync(outputPath, chunks[i], "utf-8");
              const chunkTokens = estimateTokens(chunks[i]);
              console.log(pc.green(`    ✓ ${filenames[i]} (~${formatTokens(chunkTokens)} tokens)`));
            }
          } catch (err) {
            console.log(pc.red(`\n  ✗ Split error: ${err instanceof Error ? err.message : 'unknown'}`));
            // Fall back to single file
            const outputPath = join(writeDir, finalOutputFile);
            writeFileSync(outputPath, finalContent, "utf-8");
            console.log(pc.green(`  ✓ Generated ${finalOutputFile} (single file fallback)`));
          }
        } else {
          const outputPath = join(writeDir, finalOutputFile);
          writeFileSync(outputPath, finalContent, "utf-8");
          console.log(pc.green(`\n  ✓ Generated ${finalOutputFile}`));
        }

        // Generate JSON index if requested (not with --xml)
        if (options.json && !options.xml) {
          const jsonContent = generateAgentsIndex(
            { components, tokens, framework, hooks, utilities, commands, existingContext, variants, apiRoutes, envVars, patterns, database, stats, barrels, dependencies, fileTree, importGraph, typeExports, antiPatterns, testCoverage, graphqlSchemas },
            content
          );
          const jsonPath = join(writeDir, outputFile.replace(".md", ".index.json"));
          writeFileSync(jsonPath, jsonContent, "utf-8");
          console.log(pc.green(`  ✓ Generated ${outputFile.replace(".md", ".index.json")}`));
        }

        console.log(pc.dim(`    ~${formatTokens(tokenCount)} tokens (${contextUsage}% of 128K context)`));
        console.log(pc.dim(`    Help improve hashmark → github.com/jpoindexter/hashmark/issues\n`));

        writeLastRun({
          status: "success",
          durationMs: Date.now() - scanStart,
          flags: activeFlags || "(none)",
          remote: isRemote,
          dryRun: !!options.dryRun,
          format: options.xml ? "xml" : "md",
          tokens: tokenCount,
          components: components.length,
          filesScanned: stats.totalFiles,
        });

        // Warn if AGENTS.md is tracked in git
        try {
          const outputPath = join(writeDir, finalOutputFile);
          const relativePath = relative(writeDir, outputPath);
          execSync(`git ls-files --error-unmatch "${relativePath}"`, { cwd: writeDir, stdio: "pipe" });

          // If we get here, the file is tracked
          console.log(pc.yellow(`  ⚠ WARNING: ${finalOutputFile} is tracked in git!`));
          console.log(pc.yellow(`    Add to .gitignore to prevent accidentally committing secrets:\n`));
          console.log(pc.dim(`    echo "AGENTS.md" >> .gitignore\n`));
        } catch {
          // File not tracked or not a git repo - this is good!
        }

        // Copy to clipboard if requested
        if (options.copy) {
          try {
            const { default: clipboard } = await import('clipboardy');
            await clipboard.write(finalContent);
            console.log(pc.green(`  ✓ Copied to clipboard`));
          } catch (err) {
            console.log(pc.yellow(`  ⚠ Could not copy to clipboard: ${err instanceof Error ? err.message : 'unknown error'}`));
          }
        }
      }

      // Clean up temp directory if remote
      if (isRemote && tempDir && existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true });
      }

      // Watch mode
      if (options.watch && !isRemote && !options.dryRun) {
        console.log(pc.cyan("  👀 Watching for changes... (Ctrl+C to stop)\n"));

        const srcDir = join(targetDir, "src");
        const componentsDir = join(targetDir, "components");
        const libDir = join(targetDir, "lib");

        let debounceTimer: NodeJS.Timeout | null = null;
        const watchDirs = [srcDir, componentsDir, libDir].filter(d => existsSync(d));

        const regenerate = async () => {
          console.log(pc.dim(`  Regenerating...`));
          // Re-run the action without watch to regenerate
          try {
            execSync(`node ${process.argv[1]} "${targetDir}" -o "${outputFile}" ${options.compact ? "--compact" : ""} ${options.compress ? "--compress" : ""} ${options.minimal ? "--minimal" : ""} ${options.tree ? "--tree" : ""} --force`, {
              stdio: "inherit",
            });
          } catch {
            // Errors are printed by the child process
          }
        };

        for (const watchDir of watchDirs) {
          watch(watchDir, { recursive: true }, (eventType, filename) => {
            if (!filename) return;
            // Ignore non-source files
            if (!/\.(ts|tsx|js|jsx|css|json)$/.test(filename)) return;
            // Ignore test files
            if (/\.(test|spec|stories)\./.test(filename)) return;

            // Debounce regeneration
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(regenerate, 500);
          });
        }

        // Keep process alive
        process.stdin.resume();
      }
    } catch (error) {
      // Clean up temp directory on error
      if (isRemote && tempDir && existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true });
      }
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(pc.red(`\n  Error: ${errMsg}`));
      console.error(pc.dim(`  Report this issue → github.com/jpoindexter/hashmark/issues\n`));

      writeLastRun({
        status: "error",
        durationMs: Date.now() - scanStart,
        flags: activeFlags || "(none)",
        remote: isRemote,
        error: errMsg.slice(0, 200),
      });

      process.exit(1);
    }
  });

cli.command("feedback", "Open GitHub Issues with auto-collected diagnostics")
  .action(async () => {
    const cwd = process.cwd();

    console.log(pc.cyan(`\n  hashmark v${packageVersion} | Feedback\n`));
    console.log(pc.dim("  Collecting diagnostics...\n"));
    console.log(pc.dim("  Privacy: No file paths, branch names, repo URLs, or code"));
    console.log(pc.dim("  content is collected. Only tool versions and aggregate stats.\n"));

    // --- Environment (always safe) ---
    let packageManager = "unknown";
    if (existsSync(join(cwd, "pnpm-lock.yaml"))) packageManager = "pnpm";
    else if (existsSync(join(cwd, "yarn.lock"))) packageManager = "yarn";
    else if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) packageManager = "bun";
    else if (existsSync(join(cwd, "package-lock.json"))) packageManager = "npm";

    let npmVersion = "";
    try { npmVersion = execSync("npm --version", { stdio: "pipe", encoding: "utf-8" }).trim(); } catch {}

    let gitVersion = "";
    try { gitVersion = execSync("git --version", { stdio: "pipe", encoding: "utf-8" }).replace("git version ", "").trim(); } catch {}

    const isGitRepo = existsSync(join(cwd, ".git"));

    // --- Project shape (aggregate only — no names, paths, or content) ---
    let framework = "";
    let language = "";
    let styling = "";
    let router = "";
    let totalFiles = 0;
    let totalLines = 0;
    let totalSize = "";
    let fileTypes = "";
    let isMonorepo = false;
    let monorepoType = "";
    let monorepoPackageCount = 0;
    let dbProvider = "";
    let dbModelCount = 0;
    let hasConfig = false;
    let hasExistingAgentsMd = false;

    const hasProject = existsSync(join(cwd, "package.json"));

    if (hasProject) {
      try {
        const [fw, stats] = await Promise.all([
          detectFramework(cwd),
          scanStats(cwd),
        ]);
        framework = fw.name + (fw.version ? ` v${fw.version}` : "");
        language = fw.language;
        if (fw.styling) styling = fw.styling;
        if (fw.router) router = fw.router;
        totalFiles = stats.totalFiles;
        totalLines = stats.totalLines;
        totalSize = formatBytes(stats.totalSize);
        // Extension breakdown (safe — just counts like ".ts: 45")
        const extEntries = Object.entries(stats.filesByType).sort((a, b) => b[1] - a[1]).slice(0, 8);
        fileTypes = extEntries.map(([ext, count]) => `${ext}: ${count}`).join(", ");
      } catch {}

      try {
        const mono = await detectMonorepo(cwd);
        isMonorepo = mono.isMonorepo;
        if (mono.isMonorepo) {
          monorepoType = mono.type;
          monorepoPackageCount = mono.packages.length;
        }
      } catch {}

      try {
        const db = await scanDatabase(cwd);
        if (db) {
          dbProvider = db.provider;
          dbModelCount = db.models.length;
        }
      } catch {}

      try {
        const config = loadConfig(cwd);
        hasConfig = !!(config.output || config.include || config.exclude || config.componentPaths);
      } catch {}

      hasExistingAgentsMd = existsSync(join(cwd, "AGENTS.md"));
    }

    // --- Last run data ---
    const lastRun = readLastRun();

    // --- Console output ---
    const d = (label: string, value: string) => console.log(pc.dim(`    ${label.padEnd(14)} ${value}`));

    console.log(pc.dim("  Environment:"));
    d("hashmark", `v${packageVersion}`);
    d("Node", process.version);
    d("OS", `${process.platform} (${process.arch})`);
    d("Pkg Manager", packageManager);
    if (npmVersion) d("npm", `v${npmVersion}`);
    if (gitVersion) d("Git", `v${gitVersion}`);
    d("Git Repo", isGitRepo ? "yes" : "no");

    if (hasProject) {
      console.log("");
      console.log(pc.dim("  Project shape (no private data):"));
      d("Framework", framework);
      d("Language", language);
      if (router) d("Router", router);
      if (styling) d("Styling", styling);
      d("Files", totalFiles.toLocaleString());
      d("Lines", totalLines.toLocaleString());
      d("Size", totalSize);
      if (fileTypes) d("File Types", fileTypes);
      if (isMonorepo) d("Monorepo", `${monorepoType} (${monorepoPackageCount} packages)`);
      if (dbProvider) d("Database", `${dbProvider} (${dbModelCount} models)`);
      d("Custom Config", hasConfig ? "yes" : "no");
      d("AGENTS.md", hasExistingAgentsMd ? "exists" : "no");
    }

    if (lastRun) {
      console.log("");
      console.log(pc.dim("  Last scan:"));
      d("Status", lastRun.status === "error" ? pc.red(String(lastRun.status)) : pc.green(String(lastRun.status)));
      d("When", String(lastRun.timestamp));
      d("Duration", `${lastRun.durationMs}ms`);
      if (lastRun.flags && lastRun.flags !== "(none)") d("Flags", String(lastRun.flags));
      if (lastRun.remote) d("Remote", "yes");
      if (lastRun.dryRun) d("Dry Run", "yes");
      if (lastRun.format) d("Format", String(lastRun.format));
      if (lastRun.tokens) d("Tokens", Number(lastRun.tokens).toLocaleString());
      if (lastRun.components) d("Components", String(lastRun.components));
      if (lastRun.filesScanned) d("Files", String(lastRun.filesScanned));
      if (lastRun.error) {
        console.log(pc.red(`    Error: ${lastRun.error}`));
      }
    }
    console.log("");

    // --- Build markdown issue body ---
    const bodyLines: string[] = [];
    bodyLines.push("## Description");
    bodyLines.push("");
    bodyLines.push("[Describe your issue here]");
    bodyLines.push("");
    bodyLines.push("## Environment");
    bodyLines.push("");
    bodyLines.push(`| | |`);
    bodyLines.push(`|---|---|`);
    bodyLines.push(`| hashmark | v${packageVersion} |`);
    bodyLines.push(`| Node | ${process.version} |`);
    bodyLines.push(`| OS | ${process.platform} (${process.arch}) |`);
    bodyLines.push(`| Package Manager | ${packageManager} |`);
    if (npmVersion) bodyLines.push(`| npm | v${npmVersion} |`);
    if (gitVersion) bodyLines.push(`| Git | v${gitVersion} |`);
    bodyLines.push(`| Git Repo | ${isGitRepo ? "yes" : "no"} |`);
    bodyLines.push("");

    if (hasProject) {
      bodyLines.push("<details>");
      bodyLines.push("<summary>Project Shape (no private data)</summary>");
      bodyLines.push("");
      bodyLines.push(`| | |`);
      bodyLines.push(`|---|---|`);
      bodyLines.push(`| Framework | ${framework} |`);
      bodyLines.push(`| Language | ${language} |`);
      if (router) bodyLines.push(`| Router | ${router} |`);
      if (styling) bodyLines.push(`| Styling | ${styling} |`);
      bodyLines.push(`| Files | ${totalFiles.toLocaleString()} |`);
      bodyLines.push(`| Lines | ${totalLines.toLocaleString()} |`);
      bodyLines.push(`| Size | ${totalSize} |`);
      if (fileTypes) bodyLines.push(`| File Types | ${fileTypes} |`);
      if (isMonorepo) bodyLines.push(`| Monorepo | ${monorepoType} (${monorepoPackageCount} packages) |`);
      if (dbProvider) bodyLines.push(`| Database | ${dbProvider} (${dbModelCount} models) |`);
      bodyLines.push(`| Custom Config | ${hasConfig ? "yes" : "no"} |`);
      bodyLines.push(`| AGENTS.md | ${hasExistingAgentsMd ? "exists" : "no"} |`);
      bodyLines.push("");
      bodyLines.push("</details>");
    }

    if (lastRun) {
      bodyLines.push("");
      bodyLines.push("<details>");
      bodyLines.push("<summary>Last Scan</summary>");
      bodyLines.push("");
      bodyLines.push(`| | |`);
      bodyLines.push(`|---|---|`);
      bodyLines.push(`| Status | ${lastRun.status} |`);
      bodyLines.push(`| When | ${lastRun.timestamp} |`);
      bodyLines.push(`| Duration | ${lastRun.durationMs}ms |`);
      bodyLines.push(`| Version | v${lastRun.version} |`);
      if (lastRun.flags && lastRun.flags !== "(none)") bodyLines.push(`| Flags | \`${lastRun.flags}\` |`);
      if (lastRun.remote) bodyLines.push(`| Remote | yes |`);
      if (lastRun.dryRun) bodyLines.push(`| Dry Run | yes |`);
      if (lastRun.format) bodyLines.push(`| Format | ${lastRun.format} |`);
      if (lastRun.tokens) bodyLines.push(`| Tokens | ${Number(lastRun.tokens).toLocaleString()} |`);
      if (lastRun.components) bodyLines.push(`| Components | ${lastRun.components} |`);
      if (lastRun.filesScanned) bodyLines.push(`| Files Scanned | ${lastRun.filesScanned} |`);
      if (lastRun.error) bodyLines.push(`| Error | ${lastRun.error} |`);
      bodyLines.push("");
      bodyLines.push("</details>");
    }

    const issueBody = bodyLines.join("\n");

    // --- Copy diagnostics to clipboard ---
    try {
      const { default: clipboard } = await import("clipboardy");
      await clipboard.write(issueBody);
      console.log(pc.green("  ✓ Diagnostics copied to clipboard (paste into any form)\n"));
    } catch {
      console.log(pc.yellow("  ⚠ Could not copy to clipboard\n"));
    }

    // --- Show feedback options ---
    console.log("  How would you like to give feedback?\n");
    console.log(`    ${pc.cyan("1")}  Report a bug         ${pc.dim("(pre-filled issue with diagnostics)")}`);
    console.log(`    ${pc.cyan("2")}  Request a feature`);
    console.log(`    ${pc.cyan("3")}  Ask a question        ${pc.dim("(GitHub Discussions)")}`);
    console.log(`    ${pc.cyan("4")}  Share an idea          ${pc.dim("(GitHub Discussions)")}`);
    console.log(`    ${pc.cyan("5")}  Show and tell          ${pc.dim("(share how you use hashmark)")}`);
    console.log("");

    const urls: Record<string, string> = {
      "1": (() => {
        const baseUrl = "https://github.com/jpoindexter/hashmark/issues/new?template=bug_report.yml&assignees=jpoindexter&labels=bug,feedback";
        const withBody = `${baseUrl}&body=${encodeURIComponent(issueBody)}`;
        return withBody.length <= 7000 ? withBody : baseUrl;
      })(),
      "2": "https://github.com/jpoindexter/hashmark/issues/new?template=feature_request.yml&assignees=jpoindexter&labels=enhancement",
      "3": "https://github.com/jpoindexter/hashmark/discussions/categories/q-a",
      "4": "https://github.com/jpoindexter/hashmark/discussions/categories/ideas",
      "5": "https://github.com/jpoindexter/hashmark/discussions/categories/show-and-tell",
    };

    const { createInterface } = await import("readline");
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    const answer = await new Promise<string>((resolve) => {
      rl.question(pc.dim("  Enter choice (1-5): "), (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    });

    const url = urls[answer];
    if (!url) {
      console.log(pc.yellow("\n  Invalid choice. Visit https://hashmark.md\n"));
      return;
    }

    console.log(pc.green(`\n  ✓ Opening in browser...`));
    console.log(pc.dim(`  ${url.split("?")[0]}\n`));

    try {
      if (process.platform === "darwin") {
        execSync(`open "${url}"`, { stdio: "ignore" });
      } else if (process.platform === "win32") {
        execSync(`start "" "${url}"`, { stdio: "ignore" });
      } else {
        execSync(`xdg-open "${url}"`, { stdio: "ignore" });
      }
    } catch {
      console.log(pc.yellow("  Could not open browser. Visit the URL above manually.\n"));
    }
  });

cli.help();
cli.version(packageVersion);
cli.parse();
