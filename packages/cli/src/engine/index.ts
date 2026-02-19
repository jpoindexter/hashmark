import { ScannerRegistry } from "./registry.js";
import { CodebaseVisitor } from "./visitor.js";
import { ComponentsScanner } from "../scanners/components.js";
import { HooksScanner } from "../scanners/hooks.js";
import { ApiRoutesScanner } from "../scanners/api-routes.js";
import { UtilitiesScanner } from "../scanners/utilities.js";
import { TokensScanner } from "../scanners/tokens.js";
import { RelationshipScanner } from "../scanners/relationships.js";
import { ExistingContextScanner } from "../scanners/existing-context.js";
import { EnvVarsScanner } from "../scanners/env-vars.js";
import { DatabaseScanner } from "../scanners/database.js";
import { StatsScanner } from "../scanners/stats.js";
import { TestScanner } from "../scanners/tests.js";
import { GitScanner } from "../scanners/git.js";
import { ComplexityScanner } from "../scanners/complexity.js";
import { calculateAiReadiness } from "../scanners/ai-readiness.js";
import type { ScanResult } from "../types.js";

/**
 * The high-level orchestrator for the Single-Pass Scanning Engine.
 * Combines registry, visitor, and results processing.
 */
export class ScannerEngine {
  async run(dir: string, exclude: string[] = [], options: any = {}): Promise<ScanResult> {
    const registry = new ScannerRegistry();
    
    // Register all single-pass plugins
    registry.register(new ComponentsScanner());
    registry.register(new HooksScanner());
    registry.register(new ApiRoutesScanner());
    registry.register(new UtilitiesScanner());
    registry.register(new TokensScanner());
    registry.register(new RelationshipScanner());
    registry.register(new ExistingContextScanner());
    registry.register(new EnvVarsScanner());
    registry.register(new DatabaseScanner());
    registry.register(new StatsScanner());
    registry.register(new TestScanner());
    registry.register(new GitScanner());
    registry.register(new ComplexityScanner());
    
    const visitor = new CodebaseVisitor(registry);
    
    // Run foundational scans + single-pass traversal
    const base = await visitor.visit(dir, exclude, options);
    
    // Process results into the main ScanResult format
    const results = registry.getResults();
    
    const scanResult: any = {
      framework: base.framework,
      utilities: results.utilities,
      tokens: results.tokens,
      components: results.components || [],
      hooks: results.hooks || [],
      apiRoutes: results.apiRoutes || [],
      relationships: results.relationships || { componentToHooks: {}, apiToModels: {} },
      existingContext: results.existingContext,
      envVars: results.envVars || [],
      database: results.database || null,
      stats: results.stats || { totalFiles: 0, totalLines: 0, totalSize: 0, largestFiles: [], filesByType: {} },
      testCoverage: results.testCoverage || { testFramework: "none", testFiles: [], testedComponents: [], untestedComponents: [], coverage: 0 },
      git: results.git || null,
      aiRecommendations: results.complexity || null,
      // Remaining legacy placeholders
      commands: { custom: {} },
      variants: [],
      patterns: { patterns: [], hasReactHookForm: false, hasZod: false, hasZustand: false, hasRedux: false, hasTanstackQuery: false, hasTrpc: false, hasSwr: false, hasRadixSlot: false, hasForwardRef: false, hasVitest: false, hasJest: false, hasPlaywright: false },
      barrels: [],
      dependencies: [],
      latentHooks: []
    };

    // Calculate post-traversal metrics
    scanResult.aiReadiness = calculateAiReadiness(scanResult);

    return scanResult as ScanResult;
  }
}
