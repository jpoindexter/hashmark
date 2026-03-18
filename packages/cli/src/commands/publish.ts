/**
 * hashmark publish
 *
 * Bundles context files (CLAUDE.md, AGENTS.md, .cursorrules, etc.) into a
 * shareable JSON envelope and writes it to .hashmark/published/latest.json
 * and hashmark-context.json in the project root.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, basename } from "path";
import { execFileSync } from "child_process";
import pc from "picocolors";
import { estimateTokens } from "../utils/tokens.js";

// ── types ───────────────────────────────────────────────────────────────────

export interface PublishOptions {
  copy?: boolean;
  output?: string;
  includeAll?: boolean;
}

interface BundleFile {
  filename: string;
  content: string;
  tokenCount: number;
}

interface PublishMeta {
  fileCount: number | null;
  lineCount: number | null;
}

interface PublishBundle {
  version: "1.0";
  project: string;
  publishedAt: string;
  files: BundleFile[];
  meta: PublishMeta;
}

// ── file targets ─────────────────────────────────────────────────────────────

const MAIN_CONTEXT_FILES = [
  "CLAUDE.md",
  "AGENTS.md",
  ".cursorrules",
];

const ALL_FORMAT_FILES = [
  "CLAUDE.md",
  "AGENTS.md",
  ".cursorrules",
  ".cursor/rules/hashmark.mdc",
  ".github/copilot-instructions.md",
  ".windsurfrules",
  "GEMINI.md",
  ".clinerules",
];

// ── helpers ──────────────────────────────────────────────────────────────────

function projectName(dir: string): string {
  try {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      const parsed = JSON.parse(readFileSync(pkg, "utf-8")) as { name?: string };
      if (parsed.name) return parsed.name;
    }
  } catch {
    // fall through
  }
  return basename(dir);
}

function readLastScan(dir: string): PublishMeta {
  try {
    const scanPath = join(dir, ".hashmark", "last-scan.json");
    if (!existsSync(scanPath)) return { fileCount: null, lineCount: null };
    const data = JSON.parse(readFileSync(scanPath, "utf-8")) as {
      stats?: { totalFiles?: number; totalLines?: number };
    };
    return {
      fileCount: data.stats?.totalFiles ?? null,
      lineCount: data.stats?.totalLines ?? null,
    };
  } catch {
    return { fileCount: null, lineCount: null };
  }
}

function copyToClipboard(text: string): boolean {
  try {
    const platform = process.platform;
    if (platform === "darwin") {
      execFileSync("pbcopy", [], { input: text, stdio: ["pipe", "ignore", "ignore"] });
      return true;
    }
    if (platform === "linux") {
      execFileSync("xclip", ["-selection", "clipboard"], {
        input: text,
        stdio: ["pipe", "ignore", "ignore"],
      });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
}

function formatTokenCount(n: number): string {
  if (n < 1000) return `${n}`;
  return `${(n / 1000).toFixed(1)}k`;
}

// ── main export ──────────────────────────────────────────────────────────────

export async function runPublish(projectDir: string, opts: PublishOptions = {}): Promise<void> {
  const targets = opts.includeAll ? ALL_FORMAT_FILES : MAIN_CONTEXT_FILES;

  // collect files that exist
  const bundleFiles: BundleFile[] = [];
  for (const rel of targets) {
    const abs = join(projectDir, rel);
    if (!existsSync(abs)) continue;
    const content = readFileSync(abs, "utf-8");
    bundleFiles.push({
      filename: basename(rel),
      content,
      tokenCount: estimateTokens(content),
    });
  }

  if (bundleFiles.length === 0) {
    console.error(
      pc.red("No context files found.") +
        pc.dim(" Generate one with: ") +
        pc.cyan("hashmark")
    );
    process.exit(1);
  }

  const meta = readLastScan(projectDir);

  const bundle: PublishBundle = {
    version: "1.0",
    project: projectName(projectDir),
    publishedAt: new Date().toISOString(),
    files: bundleFiles,
    meta,
  };

  const bundleJson = JSON.stringify(bundle, null, 2);
  const bundleBytes = Buffer.byteLength(bundleJson, "utf-8");

  // write .hashmark/published/latest.json
  const publishedDir = join(projectDir, ".hashmark", "published");
  mkdirSync(publishedDir, { recursive: true });
  writeFileSync(join(publishedDir, "latest.json"), bundleJson, "utf-8");

  // write root hashmark-context.json (or custom output path)
  const outputPath = opts.output ?? join(projectDir, "hashmark-context.json");
  writeFileSync(outputPath, bundleJson, "utf-8");

  // optional clipboard copy
  let copied = false;
  if (opts.copy) {
    const claudeFile = bundleFiles.find((f) => f.filename === "CLAUDE.md");
    const toCopy = claudeFile?.content ?? bundleFiles[0].content;
    copied = copyToClipboard(toCopy);
  }

  // ── output ─────────────────────────────────────────────────────────────────

  const RULE = pc.dim("━".repeat(42));

  console.log();
  console.log(RULE);
  console.log(pc.bold("  Published hashmark context bundle"));
  console.log(RULE);
  console.log();

  const fileList = bundleFiles
    .map((f) => `${pc.white(f.filename)} ${pc.dim(`(${formatTokenCount(f.tokenCount)} tokens)`)}`)
    .join(pc.dim(", "));
  console.log(`  ${pc.dim("Files included:")}  ${fileList}`);
  console.log(`  ${pc.dim("Bundle size:")}     ${pc.white(formatBytes(bundleBytes))}`);
  console.log(`  ${pc.dim("Written to:")}      ${pc.cyan(outputPath)}`);

  if (copied) {
    console.log(`  ${pc.dim("Clipboard:")}       ${pc.green("CLAUDE.md copied")}`);
  } else if (opts.copy) {
    console.log(`  ${pc.dim("Clipboard:")}       ${pc.yellow("copy failed — pbcopy/xclip not available")}`);
  }

  console.log();
  console.log(pc.dim("  Share this file with teammates or import into other tools:"));
  console.log(`    ${pc.cyan("hashmark import hashmark-context.json")}`);
  console.log();
}
