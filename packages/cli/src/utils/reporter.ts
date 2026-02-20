/**
 * CLI Progress & Results Reporter
 *
 * Handles terminal output for scan findings and progress.
 * Streamlines cli.ts by moving UI concerns here.
 */

import pc from "picocolors";
import type { ScanResult } from "../types.js";
import { formatBytes } from "../scanners/stats.js";

/**
 * Prints a summary of scan findings to the terminal
 */
export function reportFindings(result: ScanResult) {
  const { components, variants, tokens, hooks, latentHooks, apiRoutes, graphqlSchemas, envVars, framework, utilities, patterns, existingContext, database, stats, barrels, importGraph, typeExports, testCoverage, securityAudit } = result;

  console.log(pc.green(`  ✓ Found ${components.length} components`));
  
  if (variants.length > 0) {
    console.log(pc.green(`  ✓ Found ${variants.length} components with CVA variants`));
  }
  
  console.log(pc.green(`  ✓ Found ${Object.keys(tokens.colors).length} color tokens`));
  console.log(pc.green(`  ✓ Found ${hooks.length} custom hooks`));
  
  if (latentHooks.length > 0) {
    console.log(pc.green(`  ✓ Found ${latentHooks.length} AI automation hooks`));
  }
  
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
  
  if (existingContext.allRules.length > 0) {
    console.log(pc.green(`  ✓ Extracted ${existingContext.allRules.length} rules from existing context files`));
  }
  
  if (database) {
    console.log(pc.green(`  ✓ Found ${database.provider} schema (${database.models.length} models)`));
  }
  
  console.log(pc.green(`  ✓ Scanned ${stats.totalFiles} files (${formatBytes(stats.totalSize)}, ${stats.totalLines.toLocaleString()} lines)`));
  
  if (barrels.length > 0) {
    console.log(pc.green(`  ✓ Found ${barrels.length} barrel exports`));
  }
  
  if (importGraph?.hubFiles && importGraph.hubFiles.length > 0) {
    console.log(pc.green(`  ✓ Found ${importGraph.hubFiles.length} hub files (most imported)`));
  }
  
  if (importGraph?.circularDeps && importGraph.circularDeps.length > 0) {
    console.log(pc.yellow(`  ⚠ Found ${importGraph.circularDeps.length} circular dependencies`));
  }
  
  if (importGraph?.unusedFiles && importGraph.unusedFiles.length > 0) {
    console.log(pc.yellow(`  ⚠ Found ${importGraph.unusedFiles.length} potentially unused components`));
  }
  
  if (typeExports?.propsTypes.length && typeExports.propsTypes.length > 0) {
    console.log(pc.green(`  ✓ Found ${typeExports.propsTypes.length} Props types`));
  }
  
  if (testCoverage?.testFiles.length && testCoverage.testFiles.length > 0) {
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
}
