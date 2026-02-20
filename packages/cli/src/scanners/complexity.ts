/**
 * Complexity Analyzer
 */

import { execSync } from "child_process";
import { escapeShellPath } from "../utils/shell.js";
import { analyzeFileAST } from "./ast-complexity.js";
import type { AIRecommendations, FileComplexity, AreaComplexity, ComplexityLevel } from "../types.js";
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
