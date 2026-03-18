/**
 * Complexity Analyzer
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { escapeShellPath } from "../utils/shell.js";
import { analyzeFileAST } from "./ast-complexity.js";
import type { AIRecommendations, FileComplexity, AreaComplexity, ComplexityLevel, PersistedComplexity, ComplexityDelta } from "../types.js";
import type { ScannerPlugin, ScannerContext } from "../engine/types.js";

export class ComplexityScanner implements ScannerPlugin<AIRecommendations> {
  name = "complexity";
  filePatterns = ["**/*.{ts,tsx,js,jsx}"];

  private fileComplexities: FileComplexity[] = [];

  async onFile(path: string, content: string, context: ScannerContext) {
    const lines = content.split("\n").length;
    const reasons: string[] = [];
    let score = 0;

    // 1. Size
    if (lines > 500) { score += 20; reasons.push("large file (>500 lines)"); }
    else if (lines > 300) { score += 12; reasons.push("moderately large (>300 lines)"); }
    else if (lines > 150) { score += 6; }

    // 2. AST
    const astResult = analyzeFileAST(content, path);
    const cognitiveComplexity = astResult?.fileCognitive ?? 0;
    if (cognitiveComplexity > 50) { score += 30; reasons.push("high cognitive complexity"); }
    else if (cognitiveComplexity > 25) { score += 20; reasons.push("moderate cognitive complexity"); }
    else if (cognitiveComplexity > 10) { score += 10; }

    // 3. Coupling
    const importCount = (content.match(/^import\s+/gm) || []).length;
    if (importCount > 30) { score += 15; reasons.push("high coupling (many imports)"); }
    else if (importCount > 15) { score += 10; reasons.push("moderate coupling"); }

    // 4. Async
    const asyncCount = (content.match(/async|await|Promise/g) || []).length;
    if (asyncCount > 20) { score += 10; reasons.push("heavy async logic"); }

    let level: ComplexityLevel = "low";
    if (score > 50) level = "high";
    else if (score > 30) level = "medium";

    this.fileComplexities.push({
      path,
      lines,
      score: Math.min(score, 100),
      level,
      reasons,
      maintainabilityIndex: astResult?.avgMaintainability,
    });
  }

  finalize(context: ScannerContext) {
    // Optional: Add git churn for top 10 most complex files
    const topFiles = this.fileComplexities.sort((a, b) => b.score - a.score).slice(0, 10);
    for (const f of topFiles) {
      const churn = calculateGitChurn(f.path, context.cwd);
      if (churn > 50) { f.score += 15; f.reasons.push("frequently modified (hot spot)"); }
      else if (churn > 20) { f.score += 10; f.reasons.push("moderate change frequency"); }
    }
  }

  getResult(): AIRecommendations {
    const areas = categorizeByArea(this.fileComplexities);
    const complexFiles = this.fileComplexities.sort((a, b) => b.score - a.score).slice(0, 10);
    const avgComplexity = this.fileComplexities.length > 0
      ? this.fileComplexities.reduce((sum, f) => sum + f.score, 0) / this.fileComplexities.length
      : 0;

    return {
      simpleModel: avgComplexity > 25 ? "standard" : "minimal",
      complexModel: avgComplexity > 45 ? "maximum" : "standard",
      extendedThinkingRecommended: avgComplexity > 35 || (complexFiles[0]?.score || 0) > 55,
      areas,
      complexFiles,
    };
  }
}

function calculateGitChurn(relativePath: string, dir: string): number {
  try {
    const safePath = escapeShellPath(relativePath);
    const result = execSync(`git log --oneline --follow -- ${safePath} | wc -l`, {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return parseInt(result.trim(), 10) || 0;
  } catch { return 0; }
}

function categorizeByArea(files: FileComplexity[]): AreaComplexity[] {
  const areas = new Map<string, FileComplexity[]>();
  for (const file of files) {
    let areaName = "Source Files";
    if (file.path.includes("/api/")) areaName = "API Routes";
    else if (file.path.includes("/hooks/") || file.path.includes("use")) areaName = "Hooks";
    else if (file.path.includes("/components/") || file.path.includes("/ui/")) areaName = "Components";
    
    if (!areas.has(areaName)) areas.set(areaName, []);
    areas.get(areaName)!.push(file);
  }

  return Array.from(areas.entries()).map(([name, areaFiles]) => {
    const avgScore = areaFiles.reduce((sum, f) => sum + f.score, 0) / areaFiles.length;
    return {
      name,
      level: avgScore > 45 ? "high" : avgScore > 30 ? "medium" : "low" as ComplexityLevel,
      fileCount: areaFiles.length,
      avgScore: Math.round(avgScore),
      characteristics: [],
    };
  }).sort((a, b) => b.avgScore - a.avgScore);
}

const COMPLEXITY_CACHE_PATH = ".hashmark/last-complexity.json";

/** Load the previous scan's complexity snapshot from disk. Returns null if none exists. */
export function loadPreviousComplexity(projectDir: string): PersistedComplexity | null {
  try {
    const cachePath = join(projectDir, COMPLEXITY_CACHE_PATH);
    if (!existsSync(cachePath)) return null;
    return JSON.parse(readFileSync(cachePath, "utf-8")) as PersistedComplexity;
  } catch { return null; }
}

/** Persist current complexity metrics to .hashmark/last-complexity.json */
export function saveComplexitySnapshot(projectDir: string, recommendations: AIRecommendations): void {
  try {
    const dir = join(projectDir, ".hashmark");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const files = recommendations.complexFiles.map(f => {
      const funcs = f.functions ?? [];
      const avgCyclomatic = funcs.length > 0
        ? funcs.reduce((s, fn) => s + fn.cyclomatic, 0) / funcs.length
        : 0;
      const avgCognitive = funcs.length > 0
        ? funcs.reduce((s, fn) => s + fn.cognitive, 0) / funcs.length
        : 0;
      return {
        path: f.path,
        avgCyclomatic: Math.round(avgCyclomatic * 10) / 10,
        avgCognitive: Math.round(avgCognitive * 10) / 10,
        avgMaintainability: Math.round((f.maintainabilityIndex ?? 0) * 10) / 10,
      };
    });

    const allFuncs = recommendations.complexFiles.flatMap(f => f.functions ?? []);
    const avgCyclomatic = allFuncs.length > 0
      ? allFuncs.reduce((s, fn) => s + fn.cyclomatic, 0) / allFuncs.length
      : 0;
    const avgCognitive = allFuncs.length > 0
      ? allFuncs.reduce((s, fn) => s + fn.cognitive, 0) / allFuncs.length
      : 0;
    const avgMaintainability = recommendations.complexFiles.length > 0
      ? recommendations.complexFiles.reduce((s, f) => s + (f.maintainabilityIndex ?? 0), 0) / recommendations.complexFiles.length
      : 0;

    const snapshot: PersistedComplexity = {
      generatedAt: new Date().toISOString(),
      files,
      avgCyclomatic: Math.round(avgCyclomatic * 10) / 10,
      avgCognitive: Math.round(avgCognitive * 10) / 10,
      avgMaintainability: Math.round(avgMaintainability * 10) / 10,
    };

    writeFileSync(join(projectDir, COMPLEXITY_CACHE_PATH), JSON.stringify(snapshot, null, 2), "utf-8");
  } catch { /* non-fatal */ }
}

/** Compute delta between current scan and previous snapshot. */
export function computeComplexityDelta(
  current: AIRecommendations,
  previous: PersistedComplexity
): ComplexityDelta {
  const curFuncs = current.complexFiles.flatMap(f => f.functions ?? []);
  const curAvgCyclomatic = curFuncs.length > 0
    ? curFuncs.reduce((s, fn) => s + fn.cyclomatic, 0) / curFuncs.length
    : 0;
  const curAvgCognitive = curFuncs.length > 0
    ? curFuncs.reduce((s, fn) => s + fn.cognitive, 0) / curFuncs.length
    : 0;
  const curAvgMI = current.complexFiles.length > 0
    ? current.complexFiles.reduce((s, f) => s + (f.maintainabilityIndex ?? 0), 0) / current.complexFiles.length
    : 0;

  const avgCyclomaticDelta = Math.round((curAvgCyclomatic - previous.avgCyclomatic) * 10) / 10;
  const avgCognitiveDelta = Math.round((curAvgCognitive - previous.avgCognitive) * 10) / 10;
  const maintainabilityDelta = Math.round((curAvgMI - previous.avgMaintainability) * 10) / 10;

  // Top regressions: files where cyclomatic went up the most
  const prevByPath = new Map(previous.files.map(f => [f.path, f]));
  const regressions: Array<{ file: string; metric: string; delta: number }> = [];
  for (const cur of current.complexFiles) {
    const prev = prevByPath.get(cur.path);
    if (!prev) continue;
    const curFuncs = cur.functions ?? [];
    const curCC = curFuncs.length > 0
      ? curFuncs.reduce((s, fn) => s + fn.cyclomatic, 0) / curFuncs.length
      : 0;
    const delta = Math.round((curCC - prev.avgCyclomatic) * 10) / 10;
    if (delta > 0) regressions.push({ file: cur.path, metric: "cyclomatic", delta });
  }
  regressions.sort((a, b) => b.delta - a.delta);

  let trend: ComplexityDelta["trend"] = "stable";
  if (avgCyclomaticDelta > 1 || avgCognitiveDelta > 2) trend = "degrading";
  else if (avgCyclomaticDelta < -1 || maintainabilityDelta > 2) trend = "improving";

  return {
    avgCyclomaticDelta,
    avgCognitiveDelta,
    maintainabilityDelta,
    trend,
    topRegressions: regressions.slice(0, 5),
  };
}

/** Legacy support */
export async function analyzeComplexity(dir: string): Promise<AIRecommendations> {
  const scanner = new ComplexityScanner();
  const fg = (await import("fast-glob")).default;
  const fs = await import("fs");
  const path = await import("path");

  const files = await fg(scanner.filePatterns, { cwd: dir, absolute: false });
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      await scanner.onFile(file, content, { cwd: dir } as any);
    }
  }

  await scanner.finalize({ cwd: dir } as any);
  return scanner.getResult();
}
