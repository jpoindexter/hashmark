/**
 * hashmark stats
 *
 * Prints a rich project statistics dashboard from .hashmark/ cache files.
 * Data sources:
 *   .hashmark/last-scan.json       — scan metadata
 *   .hashmark/last-complexity.json — per-file complexity (optional)
 *   CLAUDE.md                      — context health / section coverage
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import pc from "picocolors";

// ── types ──────────────────────────────────────────────────────────────────

interface LastScan {
  generatedAt?: string;
  stats?: { totalFiles?: number; totalLines?: number };
  tokens?: number;
  aiRecommendations?: {
    complexFiles?: Array<{
      path: string;
      score?: number;
      functions?: Array<{ cyclomatic: number }>;
      maintainabilityIndex?: number;
    }>;
  };
  generatedFormats?: string[];
}

interface PersistedFileComplexity {
  path: string;
  avgCyclomatic: number;
  avgCognitive: number;
  avgMaintainability: number;
}

interface PersistedComplexity {
  generatedAt: string;
  files: PersistedFileComplexity[];
  avgCyclomatic: number;
  avgCognitive: number;
  avgMaintainability: number;
}

export interface StatsOptions {
  json?: boolean;
  projectDir?: string;
}

// ── helpers ────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function fmtDate(d: Date): string {
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

function pad(s: string | number, width: number, right = false): string {
  // strip ANSI codes before measuring length
  const raw = String(s).replace(/\x1b\[[0-9;]*m/g, "");
  const gap = Math.max(0, width - raw.length);
  const spaces = " ".repeat(gap);
  return right ? spaces + String(s) : String(s) + spaces;
}

function readJson<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function countSections(content: string): { total: number; filled: number } {
  const lines = content.split("\n");
  let total = 0;
  let filled = 0;
  let inSection = false;
  let sectionHasContent = false;

  for (const line of lines) {
    if (/^#{1,3} /.test(line)) {
      if (inSection) {
        total++;
        if (sectionHasContent) filled++;
      }
      inSection = true;
      sectionHasContent = false;
    } else if (inSection && line.trim().length > 0) {
      sectionHasContent = true;
    }
  }
  if (inSection) {
    total++;
    if (sectionHasContent) filled++;
  }
  return { total, filled };
}

function gitCommitsBehind(filePath: string, projectDir: string): number {
  try {
    const mtime = statSync(filePath).mtimeMs;
    const since = new Date(mtime).toISOString();
    // Use execFileSync with git directly — no shell, no user input in args
    const out = execFileSync(
      "git",
      ["log", "--oneline", `--after=${since}`, "HEAD"],
      { cwd: projectDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    return out.length === 0 ? 0 : out.split("\n").length;
  } catch {
    return 0;
  }
}

// ── known format paths → display names ────────────────────────────────────

const FORMAT_FILES: Record<string, string> = {
  "CLAUDE.md":                        "CLAUDE.md",
  "AGENTS.md":                        "AGENTS.md",
  ".cursorrules":                     ".cursorrules",
  ".cursor/rules/hashmark.mdc":       "cursor-mdc",
  ".github/copilot-instructions.md":  "copilot-md",
  ".windsurfrules":                   "windsurf-rules",
  "GEMINI.md":                        "GEMINI.md",
  ".clinerules":                      "cline-rules",
};

// ── main export ────────────────────────────────────────────────────────────

export async function runStats(opts: StatsOptions = {}): Promise<void> {
  const dir = opts.projectDir ?? process.cwd();
  const hashmarkDir = join(dir, ".hashmark");

  const scan = readJson<LastScan>(join(hashmarkDir, "last-scan.json"));
  const complexity = readJson<PersistedComplexity>(join(hashmarkDir, "last-complexity.json"));

  // ── JSON output ──────────────────────────────────────────────────────────
  if (opts.json) {
    const claudeMdPath = join(dir, "CLAUDE.md");
    const claudeExists = existsSync(claudeMdPath);
    let sections: { total: number; filled: number } | null = null;
    let commitsBehind = 0;
    if (claudeExists) {
      const content = readFileSync(claudeMdPath, "utf-8");
      sections = countSections(content);
      commitsBehind = gitCommitsBehind(claudeMdPath, dir);
    }
    const generatedFormats = Object.keys(FORMAT_FILES).filter((f) =>
      existsSync(join(dir, f))
    );
    process.stdout.write(
      JSON.stringify(
        {
          scan,
          complexity,
          contextHealth: claudeExists
            ? {
                commitsBehind,
                sections,
                coveragePct: sections
                  ? Math.round((sections.filled / Math.max(sections.total, 1)) * 100)
                  : null,
              }
            : null,
          generatedFormats,
        },
        null,
        2
      ) + "\n"
    );
    return;
  }

  // ── formatted output ─────────────────────────────────────────────────────

  const RULE = pc.dim("━".repeat(37));
  const LINE = pc.dim("─".repeat(37));

  console.log();
  console.log(RULE);
  console.log(pc.bold("  hashmark — project stats"));
  console.log(RULE);
  console.log();

  if (!scan) {
    console.log(
      pc.yellow("  No scan data found. Run") +
        pc.cyan(" hashmark ") +
        pc.yellow("to generate a scan first.")
    );
    console.log();
    return;
  }

  const scanDate = scan.generatedAt ? new Date(scan.generatedAt) : null;
  const files = scan.stats?.totalFiles ?? 0;
  const lines = scan.stats?.totalLines ?? 0;
  const tokens = typeof scan.tokens === "number" ? scan.tokens : null;

  console.log(
    `  ${pc.dim("Last scan:")}     ${
      scanDate
        ? pc.green(timeAgo(scanDate)) + pc.dim(` (${fmtDate(scanDate)})`)
        : pc.yellow("unknown")
    }`
  );
  console.log(`  ${pc.dim("Files:")}         ${pc.white(files.toLocaleString())}`);
  console.log(`  ${pc.dim("Lines:")}         ${pc.white(lines.toLocaleString())}`);
  if (tokens !== null) {
    console.log(`  ${pc.dim("Tokens:")}        ${pc.white(tokens.toLocaleString())}`);
  }

  // ── Complexity ───────────────────────────────────────────────────────────
  console.log();
  console.log(`  ${pc.bold("Complexity")}`);
  console.log(`  ${LINE}`);

  const complexFiles = scan.aiRecommendations?.complexFiles ?? [];

  if (complexFiles.length === 0 && !complexity) {
    console.log(pc.dim("  No complexity data. Re-run hashmark to generate."));
  } else {
    const allFiles: Array<{ path: string; cc: number; mi: number }> = [];

    if (complexity?.files?.length) {
      for (const f of complexity.files) {
        allFiles.push({ path: f.path, cc: f.avgCyclomatic, mi: f.avgMaintainability });
      }
    } else {
      for (const f of complexFiles) {
        const fnAvgCC =
          f.functions?.length
            ? f.functions.reduce((s, fn) => s + fn.cyclomatic, 0) / f.functions.length
            : 0;
        allFiles.push({ path: f.path, cc: fnAvgCC, mi: f.maintainabilityIndex ?? 0 });
      }
    }

    const high   = allFiles.filter((f) => f.cc > 20);
    const medium = allFiles.filter((f) => f.cc >= 10 && f.cc <= 20);
    const low    = allFiles.filter((f) => f.cc < 10);

    console.log(
      `  ${pc.red(pad("High (>20 CC):", 16))}  ${pad(high.length, 4, true)} files`
    );
    console.log(
      `  ${pc.yellow(pad("Medium (10-20):", 16))}  ${pad(medium.length, 4, true)} files`
    );
    console.log(
      `  ${pc.green(pad("Low (<10):", 16))}  ${pad(low.length, 4, true)} files`
    );

    const top5 = [...allFiles].sort((a, b) => b.cc - a.cc).slice(0, 5);

    if (top5.length > 0) {
      console.log();
      console.log(`  ${pc.dim("Top 5 complex files:")}`);
      top5.forEach((f, i) => {
        const rank = pc.dim(`  ${i + 1}.`);
        const maxPath = 40;
        const displayPath =
          f.path.length > maxPath ? "..." + f.path.slice(-(maxPath - 3)) : f.path;
        const ccStr = pc.yellow(`CC: ${f.cc.toFixed(1)}`);
        const miStr = pc.dim(`MI: ${f.mi.toFixed(0)}`);
        console.log(`${rank} ${pad(displayPath, maxPath)}  ${ccStr}, ${miStr}`);
      });
    }
  }

  // ── Context health ───────────────────────────────────────────────────────
  console.log();
  console.log(`  ${pc.bold("Context health")}`);
  console.log(`  ${LINE}`);

  const claudeMdPath = join(dir, "CLAUDE.md");
  if (!existsSync(claudeMdPath)) {
    console.log(pc.dim("  CLAUDE.md not found."));
  } else {
    const content = readFileSync(claudeMdPath, "utf-8");
    const { total, filled } = countSections(content);
    const coveragePct = total > 0 ? Math.round((filled / total) * 100) : 0;
    const commitsBehind = gitCommitsBehind(claudeMdPath, dir);

    const freshnessLabel =
      commitsBehind === 0
        ? pc.green("up to date")
        : pc.yellow(`${commitsBehind} commit${commitsBehind > 1 ? "s" : ""} behind HEAD`);

    // History overhead estimate: lines that look like history/changelog content
    const contentLines = content.split("\n");
    const historyLines = contentLines.filter((l) =>
      /change|history|recent commit|git log/i.test(l)
    ).length;
    const wasteEst =
      contentLines.length > 0
        ? Math.round((historyLines / contentLines.length) * 100)
        : 0;

    console.log(`  ${pc.dim("CLAUDE.md freshness:")}  ${freshnessLabel}`);
    console.log(
      `  ${pc.dim("Context coverage:")}     ${pc.white(`${coveragePct}%`)} ${pc.dim(
        `(${filled}/${total} sections with content)`
      )}`
    );
    if (wasteEst > 0) {
      console.log(
        `  ${pc.dim("Est. waste:")}           ${pc.dim(`~${wasteEst}% (history overhead)`)}`
      );
    }
  }

  // ── Generated formats ────────────────────────────────────────────────────
  console.log();
  console.log(`  ${pc.dim("Formats generated:")}`);

  const formatEntries = Object.entries(FORMAT_FILES);
  const cols: string[] = [];
  for (const [filePath, label] of formatEntries) {
    const exists = existsSync(join(dir, filePath));
    cols.push(exists ? pc.green(`✓ ${label}`) : pc.dim(`✗ ${label}`));
  }

  const ROW_SIZE = 3;
  for (let i = 0; i < cols.length; i += ROW_SIZE) {
    const row = cols
      .slice(i, i + ROW_SIZE)
      .map((c) => pad(c, 22))
      .join("  ");
    console.log(`  ${row}`);
  }

  console.log();
}
