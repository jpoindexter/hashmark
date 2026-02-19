/**
 * AI-Readiness Score Scanner
 * 
 * Grades a repository on its compatibility with AI tools (Copilot, Cursor, Claude).
 * Criteria:
 * - Documentation (README, etc.)
 * - Type Safety (TypeScript usage)
 * - Component Decomposition (Modular vs Monolithic)
 * - Test Coverage
 * - Context Existence (.cursorrules, etc.)
 */

import type { ScanResult } from "../types.js";

export interface AiReadinessScore {
  total: number; // 0-100
  breakdown: {
    documentation: number; // 0-20
    typeSafety: number; // 0-20
    modularization: number; // 0-20
    testing: number; // 0-20
    context: number; // 0-20
  };
  recommendations: string[];
}

export function calculateAiReadiness(result: ScanResult): AiReadinessScore {
  const { 
    framework, 
    stats, 
    components, 
    existingContext, 
    testCoverage,
    apiRoutes,
    hooks,
    database
  } = result;

  const breakdown = {
    documentation: 0,
    typeSafety: 0,
    modularization: 0,
    testing: 0,
    context: 0,
  };

  const recommendations: string[] = [];

  // 1. Documentation (20 pts)
  // Check for README and other docs
  if (stats.filesByType.md && stats.filesByType.md > 0) breakdown.documentation += 10;
  if (stats.filesByType.md && stats.filesByType.md > 5) breakdown.documentation += 10;
  if (breakdown.documentation < 10) recommendations.push("Add a README.md to help AI understand your project goals.");

  // 2. Type Safety (20 pts)
  if (framework.language === "TypeScript") {
    breakdown.typeSafety += 15;
    // Plus points for few any's? (Future AST check)
    breakdown.typeSafety += 5; 
  } else if (framework.language === "JavaScript") {
    recommendations.push("Migrate to TypeScript to provide better type context for AI auto-completion.");
  }

  // 3. Modularization (20 pts)
  // Ratio of components to files
  const componentRatio = components.length / (stats.totalFiles || 1);
  if (componentRatio > 0.1) breakdown.modularization += 10;
  if (hooks.length > 5) breakdown.modularization += 10;
  if (breakdown.modularization < 10) recommendations.push("Extract logic into reusable hooks to simplify component context.");

  // 4. Testing (20 pts)
  if (testCoverage && testCoverage.coverage > 0) {
    breakdown.testing += 10;
    if (testCoverage.coverage > 50) breakdown.testing += 10;
  }
  if (breakdown.testing < 10) recommendations.push("Add tests to help AI verify its generated code through your test suite.");

  // 5. Context (20 pts)
  if (existingContext.allRules.length > 0) breakdown.context += 10;
  if (existingContext.hasCursorRules || existingContext.hasClaudeMd) breakdown.context += 10;
  if (breakdown.context < 10) recommendations.push("Create a .cursorrules or CLAUDE.md file to define project-specific coding standards.");

  const total = breakdown.documentation + breakdown.typeSafety + breakdown.modularization + breakdown.testing + breakdown.context;

  return {
    total,
    breakdown,
    recommendations,
  };
}
