/**
 * Test Coverage Scanner
 */

import fg from "fast-glob";
import { readFileSync } from "fs";
import { basename } from "path";
import type { Component, TestCoverage } from "../types.js";
import type { ScannerPlugin, ScannerContext } from "../engine/types.js";

export class TestScanner implements ScannerPlugin<TestCoverage> {
  name = "testCoverage";
  filePatterns = [
    "**/*.test.{ts,tsx,js,jsx}",
    "**/*.spec.{ts,tsx,js,jsx}",
    "**/__tests__/**/*.{ts,tsx,js,jsx}",
    "**/tests/**/*.{ts,tsx,js,jsx}",
    "**/test/**/*.{ts,tsx,js,jsx}",
    "**/package.json"
  ];

  private results: TestCoverage = {
    testFramework: "none",
    testFiles: [],
    testedComponents: [],
    untestedComponents: [],
    coverage: 0,
  };

  private testFileContents: { path: string; content: string }[] = [];

  async onFile(path: string, content: string) {
    if (path.endsWith("package.json")) {
      try {
        const pkg = JSON.parse(content);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.vitest || deps["@vitest/ui"]) this.results.testFramework = "vitest";
        else if (deps.jest || deps["@types/jest"]) this.results.testFramework = "jest";
        else if (deps["@playwright/test"]) this.results.testFramework = "playwright";
        else if (deps["@testing-library/react"]) this.results.testFramework = "testing-library";
      } catch {}
    } else {
      this.results.testFiles.push(path);
      this.testFileContents.push({ path, content });
    }
  }

  async finalize(context: ScannerContext, allResults?: Record<string, any>) {
    const components: Component[] = allResults?.components || [];
    const testedComponentNames = new Set<string>();

    for (const { path: testFile, content } of this.testFileContents) {
      const fileName = basename(testFile)
        .replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, "")
        .replace(/\.(ts|tsx|js|jsx)$/, "");

      for (const comp of components) {
        // Name matching
        if (comp.name.toLowerCase() === fileName.toLowerCase()) {
          testedComponentNames.add(comp.name);
        }
        // Export matching
        if (comp.exports.some(e => e.toLowerCase() === fileName.toLowerCase())) {
          testedComponentNames.add(comp.name);
        }
        // Import matching
        const importPattern = new RegExp(`import.*\\b${comp.name}\\b.*from`, "i");
        if (importPattern.test(content)) {
          testedComponentNames.add(comp.name);
        }
      }
    }

    this.results.testedComponents = Array.from(testedComponentNames).sort();
    this.results.untestedComponents = components
      .map(c => c.name)
      .filter(name => !testedComponentNames.has(name))
      .sort();

    this.results.coverage = components.length > 0
      ? Math.round((this.results.testedComponents.length / components.length) * 100)
      : 0;
  }

  getResult() {
    return this.results;
  }
}

/** Legacy support */
export async function scanTestCoverage(dir: string, components: Component[]): Promise<TestCoverage> {
  const scanner = new TestScanner();
  const fg = (await import("fast-glob")).default;
  const fs = await import("fs");
  const path = await import("path");

  const files = await fg(scanner.filePatterns, { cwd: dir, absolute: false });
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      await scanner.onFile(file, content);
    }
  }

  await scanner.finalize({ cwd: dir } as any, { components });
  return scanner.getResult();
}
