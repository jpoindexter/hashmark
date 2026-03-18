import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import { existsSync, statSync, readFileSync } from "fs";
import { join } from "path";

const execFile = promisify(execFileCb);

export interface ValidationResult {
  check: string;
  status: "pass" | "warn" | "fail" | "skip";
  detail: string;
}

export interface ContextValidation {
  results: ValidationResult[];
  passCount: number;
  warnCount: number;
  failCount: number;
  runAt: number;
}

async function checkTypeScript(projectDir: string, results: ValidationResult[]): Promise<void> {
  if (!existsSync(join(projectDir, "tsconfig.json"))) {
    results.push({ check: "TypeScript", status: "skip", detail: "no tsconfig.json" });
    return;
  }
  try {
    await execFile("npx", ["tsc", "--noEmit"], {
      cwd: projectDir,
      timeout: 30_000,
      shell: false,
    });
    results.push({ check: "TypeScript", status: "pass", detail: "no type errors" });
  } catch (err: unknown) {
    const output = (err as any)?.stderr || (err as any)?.stdout || "";
    const errorLines = String(output)
      .split("\n")
      .filter((l: string) => l.trim().length > 0)
      .slice(0, 3)
      .join(" | ");
    results.push({
      check: "TypeScript",
      status: "fail",
      detail: errorLines || "tsc exited non-zero",
    });
  }
}

async function checkLint(projectDir: string, results: ValidationResult[]): Promise<void> {
  const configFiles = [
    ".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yaml", ".eslintrc.yml",
    "eslint.config.js", "eslint.config.cjs", "eslint.config.mjs", "eslint.config.ts",
  ];
  const hasConfig = configFiles.some(f => existsSync(join(projectDir, f)));
  if (!hasConfig) {
    results.push({ check: "ESLint", status: "skip", detail: "no eslint config found" });
    return;
  }
  try {
    await execFile("npx", ["eslint", ".", "--max-warnings", "0"], {
      cwd: projectDir,
      timeout: 30_000,
      shell: false,
    });
    results.push({ check: "ESLint", status: "pass", detail: "no lint errors" });
  } catch (err: unknown) {
    const output = String((err as any)?.stdout || (err as any)?.stderr || "");
    // eslint exits 1 for warnings+errors or errors only; distinguish by output content
    const warningMatch = output.match(/(\d+) warning/);
    const errorMatch = output.match(/(\d+) error/);
    const errorCount = errorMatch ? parseInt(errorMatch[1], 10) : 0;
    const warnCount = warningMatch ? parseInt(warningMatch[1], 10) : 0;
    if (errorCount > 0) {
      results.push({
        check: "ESLint",
        status: "fail",
        detail: `${errorCount} error${errorCount !== 1 ? "s" : ""}${warnCount > 0 ? `, ${warnCount} warning${warnCount !== 1 ? "s" : ""}` : ""}`,
      });
    } else if (warnCount > 0) {
      results.push({
        check: "ESLint",
        status: "warn",
        detail: `${warnCount} warning${warnCount !== 1 ? "s" : ""}`,
      });
    } else {
      results.push({ check: "ESLint", status: "fail", detail: "eslint exited non-zero" });
    }
  }
}

function checkBuildArtifact(projectDir: string, results: ValidationResult[]): void {
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) {
    results.push({ check: "Build artifact", status: "skip", detail: "no package.json" });
    return;
  }
  let pkg: Record<string, unknown> = {};
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    results.push({ check: "Build artifact", status: "skip", detail: "could not parse package.json" });
    return;
  }
  const scripts = (pkg.scripts ?? {}) as Record<string, string>;
  if (!scripts.build) {
    results.push({ check: "Build artifact", status: "skip", detail: "no build script" });
    return;
  }

  const artifactDirs = [".next", "dist", "out", "build"];
  const found = artifactDirs.find(d => existsSync(join(projectDir, d)));
  if (!found) {
    results.push({ check: "Build artifact", status: "warn", detail: "no build output found — run npm run build" });
    return;
  }

  try {
    const pkgMtime = statSync(pkgPath).mtimeMs;
    const artifactMtime = statSync(join(projectDir, found)).mtimeMs;
    if (pkgMtime > artifactMtime) {
      results.push({
        check: "Build artifact",
        status: "warn",
        detail: `${found}/ exists but package.json is newer — build may be stale`,
      });
    } else {
      results.push({ check: "Build artifact", status: "pass", detail: `${found}/ is current` });
    }
  } catch {
    results.push({ check: "Build artifact", status: "pass", detail: `${found}/ exists` });
  }
}

function checkDependencies(projectDir: string, results: ValidationResult[]): void {
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) {
    results.push({ check: "Dependencies", status: "skip", detail: "no package.json" });
    return;
  }
  const nodeModulesPath = join(projectDir, "node_modules");
  if (!existsSync(nodeModulesPath)) {
    results.push({ check: "Dependencies", status: "warn", detail: "node_modules not found — run npm install" });
    return;
  }
  try {
    const pkgMtime = statSync(pkgPath).mtimeMs;
    const nmMtime = statSync(nodeModulesPath).mtimeMs;
    if (pkgMtime > nmMtime) {
      results.push({
        check: "Dependencies",
        status: "warn",
        detail: "node_modules may be stale vs package.json — run npm install",
      });
    } else {
      results.push({ check: "Dependencies", status: "pass", detail: "node_modules current" });
    }
  } catch {
    results.push({ check: "Dependencies", status: "pass", detail: "node_modules exists" });
  }
}

async function checkTests(projectDir: string, results: ValidationResult[]): Promise<void> {
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) {
    results.push({ check: "Tests", status: "skip", detail: "no package.json" });
    return;
  }
  let pkg: Record<string, unknown> = {};
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    results.push({ check: "Tests", status: "skip", detail: "could not parse package.json" });
    return;
  }
  const scripts = (pkg.scripts ?? {}) as Record<string, string>;
  const testScript = scripts.test ?? "";
  if (!testScript || testScript.includes("no test specified") || testScript === "exit 0") {
    results.push({ check: "Tests", status: "skip", detail: "no test script" });
    return;
  }
  try {
    await execFile("npm", ["test", "--", "--passWithNoTests"], {
      cwd: projectDir,
      timeout: 60_000,
      shell: false,
    });
    results.push({ check: "Tests", status: "pass", detail: "all tests passed" });
  } catch (err: unknown) {
    const output = String((err as any)?.stdout || (err as any)?.stderr || "");
    const suiteMatch = output.match(/(\d+) test suite[s]? failed/);
    const detail = suiteMatch ? `${suiteMatch[1]} test suite${parseInt(suiteMatch[1], 10) !== 1 ? "s" : ""} failed` : "tests failed";
    results.push({ check: "Tests", status: "fail", detail });
  }
}

export async function validateContext(projectDir: string): Promise<ContextValidation> {
  const results: ValidationResult[] = [];

  await checkTypeScript(projectDir, results);
  await checkLint(projectDir, results);
  checkBuildArtifact(projectDir, results);
  checkDependencies(projectDir, results);
  await checkTests(projectDir, results);

  const passCount = results.filter(r => r.status === "pass").length;
  const warnCount = results.filter(r => r.status === "warn").length;
  const failCount = results.filter(r => r.status === "fail").length;

  return { results, passCount, warnCount, failCount, runAt: Date.now() };
}
