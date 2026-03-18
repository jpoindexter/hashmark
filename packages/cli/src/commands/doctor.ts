import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { execFileSync, spawnSync } from "child_process";

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const G = "\x1b[32m";   // green
const Y = "\x1b[33m";   // yellow
const R = "\x1b[31m";   // red
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const pass  = (msg: string) => `  ${G}✓${RESET} ${msg}`;
const warn  = (msg: string) => `  ${Y}⚠${RESET} ${msg}`;
const fail  = (msg: string) => `  ${R}✗${RESET} ${msg}`;

type CheckStatus = "pass" | "warn" | "fail";

interface CheckResult {
  status: CheckStatus;
  label: string;
}

// ── individual checks ─────────────────────────────────────────────────────────

function checkGit(dir: string): CheckResult {
  try {
    execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd: dir,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
    });
    return { status: "pass", label: "git repository" };
  } catch {
    return { status: "fail", label: "git repository (not a git repo)" };
  }
}

function checkNode(): CheckResult {
  const raw = process.version; // e.g. "v22.4.0"
  const major = parseInt(raw.replace(/^v/, "").split(".")[0] ?? "0", 10);
  const label = `node ${raw.replace(/^v/, "")}`;
  if (major >= 18) return { status: "pass", label };
  return { status: "warn", label: `${label} (18+ recommended)` };
}

function checkClaudeMd(dir: string): CheckResult {
  const candidates = [
    { path: join(dir, "CLAUDE.md"),          display: "CLAUDE.md" },
    { path: join(dir, ".claude", "CLAUDE.md"), display: ".claude/CLAUDE.md" },
    { path: join(dir, "AGENTS.md"),          display: "AGENTS.md" },
  ];
  for (const c of candidates) {
    if (existsSync(c.path)) {
      return { status: "pass", label: `CLAUDE.md found (${c.display})` };
    }
  }
  return { status: "fail", label: "CLAUDE.md not found (run hashmark to generate)" };
}

function checkClaudeMdFreshness(dir: string): CheckResult {
  const candidates = [
    join(dir, "CLAUDE.md"),
    join(dir, ".claude", "CLAUDE.md"),
    join(dir, "AGENTS.md"),
  ];
  const filePath = candidates.find((p) => existsSync(p));
  if (!filePath) {
    return { status: "warn", label: "CLAUDE.md freshness (file not found)" };
  }

  try {
    const mtime = statSync(filePath).mtimeMs;
    const since = new Date(mtime).toISOString();

    const commitsOut = execFileSync(
      "git",
      ["log", "--oneline", `--after=${since}`, "HEAD"],
      { cwd: dir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    const commitsBehind = commitsOut.length === 0 ? 0 : commitsOut.split("\n").length;

    const ageMs = Date.now() - mtime;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    const fileName = relative(dir, filePath);

    if (commitsBehind > 5) {
      return { status: "warn", label: `CLAUDE.md stale (${commitsBehind} commits behind HEAD)` };
    }
    if (ageDays > 7) {
      return { status: "warn", label: `CLAUDE.md stale (${Math.floor(ageDays)}d old, run hashmark to refresh)` };
    }
    if (commitsBehind > 0) {
      return { status: "warn", label: `CLAUDE.md stale (${commitsBehind} commit${commitsBehind > 1 ? "s" : ""} behind HEAD)` };
    }
    return { status: "pass", label: `CLAUDE.md fresh (${fileName})` };
  } catch {
    return { status: "warn", label: "CLAUDE.md freshness (could not check git log)" };
  }
}

function checkHashmarkConfig(dir: string): CheckResult {
  const hashmarkDir = join(dir, ".hashmark");
  if (!existsSync(hashmarkDir)) {
    return { status: "warn", label: "hashmark config (.hashmark/ not found — run hashmark)" };
  }
  const lastScan = join(hashmarkDir, "last-scan.json");
  if (!existsSync(lastScan)) {
    return { status: "warn", label: "hashmark config (.hashmark/ exists, no last-scan.json)" };
  }
  return { status: "pass", label: "hashmark config (.hashmark/)" };
}

function checkTypeScript(dir: string): CheckResult {
  const tsconfig = join(dir, "tsconfig.json");
  if (!existsSync(tsconfig)) {
    return { status: "warn", label: "TypeScript (no tsconfig.json)" };
  }

  // Try tsc --noEmit with a short timeout
  const result = spawnSync("npx", ["--no-install", "tsc", "--noEmit"], {
    cwd: dir,
    encoding: "utf-8",
    timeout: 30_000,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.signal === "SIGTERM" || result.error?.message?.includes("ETIMEDOUT")) {
    return { status: "warn", label: "TypeScript (tsc timed out)" };
  }

  if (result.status === 0) {
    return { status: "pass", label: "TypeScript (0 errors)" };
  }

  // Count error lines from stderr/stdout
  const output = (result.stdout ?? "") + (result.stderr ?? "");
  const errorLines = output.split("\n").filter((l) => /error TS\d+/.test(l));
  const count = errorLines.length || "?";
  return { status: "fail", label: `TypeScript (${count} error${count === 1 ? "" : "s"})` };
}

function checkEslint(dir: string): CheckResult {
  const candidates = [
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.mjs",
    ".eslintrc.json",
    ".eslintrc.yaml",
    ".eslintrc.yml",
    "eslint.config.js",
    "eslint.config.cjs",
    "eslint.config.mjs",
    "eslint.config.ts",
  ];
  const found = candidates.find((c) => existsSync(join(dir, c)));
  if (found) {
    return { status: "pass", label: `ESLint config (${found})` };
  }
  return { status: "warn", label: "ESLint config (no config file found)" };
}

function checkTests(dir: string): CheckResult {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) {
    return { status: "warn", label: "Tests (no package.json)" };
  }

  let pkg: { scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { scripts?: Record<string, string> };
  } catch {
    return { status: "warn", label: "Tests (could not parse package.json)" };
  }

  if (!pkg.scripts?.["test"]) {
    return { status: "warn", label: "Tests (no test script in package.json)" };
  }

  const result = spawnSync("npm", ["test", "--", "--passWithNoTests"], {
    cwd: dir,
    encoding: "utf-8",
    timeout: 10_000,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.signal === "SIGTERM" || result.error?.message?.includes("ETIMEDOUT")) {
    return { status: "warn", label: "Tests (timed out after 10s)" };
  }

  if (result.status === 0) {
    return { status: "pass", label: "Tests" };
  }
  return { status: "fail", label: `Tests (exit ${result.status ?? "??"})` };
}

// ── secrets scan ─────────────────────────────────────────────────────────────

const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "OpenAI key",   re: /sk-[A-Za-z0-9]{20,}/g },
  { name: "GitHub token", re: /ghp_[A-Za-z0-9]{36,}/g },
  { name: "AWS key",      re: /AKIA[0-9A-Z]{16}/g },
];

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".nuxt",
  "__pycache__", "target", ".hashmark", ".vercel",
]);

const SCAN_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".env", ".json", ".yaml", ".yml", ".toml",
]);

function collectFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }).map((e) => e.name);
  } catch {
    return out;
  }

  // Respect .gitignore for .env files at minimum — skip the obvious
  for (const name of entries) {
    if (name.startsWith(".") && name !== ".env") continue;
    const full = join(dir, name);

    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }

    if (isDir) {
      if (SKIP_DIRS.has(name)) continue;
      collectFiles(full, out);
    } else {
      const ext = name.includes(".") ? `.${name.split(".").pop()}` : "";
      if (SCAN_EXTS.has(ext) || name === ".env") {
        out.push(full);
      }
    }
  }
  return out;
}

interface SecretHit {
  file: string;
  type: string;
}

function checkSecrets(dir: string): CheckResult {
  const files = collectFiles(dir);
  const hits: SecretHit[] = [];

  for (const filePath of files) {
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    for (const { name, re } of SECRET_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(content)) {
        hits.push({ file: relative(dir, filePath), type: name });
        break; // one hit per file is enough for the warning
      }
    }
  }

  if (hits.length === 0) {
    return { status: "pass", label: "No secrets detected" };
  }

  const summary = hits
    .slice(0, 3)
    .map((h) => `${h.type} in ${h.file}`)
    .join(", ");
  const extra = hits.length > 3 ? ` (+${hits.length - 3} more)` : "";
  return { status: "warn", label: `Secrets detected: ${summary}${extra}` };
}

// ── main export ───────────────────────────────────────────────────────────────

export async function runDoctor(projectDir: string): Promise<void> {
  const dir = projectDir;

  process.stdout.write(`\n${BOLD}hashmark doctor${RESET}${DIM} — project health check${RESET}\n\n`);

  const checks: CheckResult[] = [
    checkGit(dir),
    checkNode(),
    checkClaudeMd(dir),
    checkClaudeMdFreshness(dir),
    checkHashmarkConfig(dir),
    checkTypeScript(dir),
    checkEslint(dir),
    checkTests(dir),
    await Promise.resolve(checkSecrets(dir)),
  ];

  for (const c of checks) {
    if (c.status === "pass") {
      console.log(pass(c.label));
    } else if (c.status === "warn") {
      console.log(warn(c.label));
    } else {
      console.log(fail(c.label));
    }
  }

  const needsAttention = checks.filter((c) => c.status !== "pass").length;
  const total = checks.length;

  console.log();
  if (needsAttention === 0) {
    console.log(`  ${G}${total}/${total} checks passed${RESET}`);
  } else {
    console.log(`  ${Y}${needsAttention}/${total} checks need attention${RESET}`);
    console.log(`  ${DIM}Run \`hashmark scan\` to refresh context${RESET}`);
  }
  console.log();
}
