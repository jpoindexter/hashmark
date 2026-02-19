import fg from "fast-glob";
import { readFileSync, statSync, existsSync } from "fs";
import { join } from "path";
import { ScannerRegistry } from "./registry.js";
import { detectFramework } from "../scanners/framework.js";
import { scanUtilities } from "../scanners/utilities.js";
import type { ScannerContext } from "./types.js";
import pc from "picocolors";

const MAX_FILE_SIZE = 256 * 1024; // 256KB limit

export class CodebaseVisitor {
  private registry: ScannerRegistry;

  constructor(registry: ScannerRegistry) {
    this.registry = registry;
  }

  async visit(dir: string, excludePatterns: string[] = [], options: any = {}) {
    console.log(pc.dim("  Starting single-pass traversal..."));
    
    const framework = await detectFramework(dir);
    const utilities = await scanUtilities(dir);

    const context: ScannerContext = {
      cwd: dir,
      framework,
      utilities,
      excludePatterns,
      options,
    };

    await this.registry.setupAll(context);

    const files = await fg(
      [
        "**/*.{ts,tsx,js,jsx,json,md,py,go,rs,prisma,graphql,yml,yaml}",
        "!**/node_modules/**",
        "!**/.next/**",
        "!**/dist/**",
        "!**/build/**",
        "!**/.git/**",
        "!**/pnpm-lock.yaml",
        "!**/package-lock.json",
        "!**/*.zip",
        "!**/*.tar.gz",
        ...excludePatterns.map((p) => `!${p}`),
      ],
      { cwd: dir, absolute: false, followSymbolicLinks: false }
    );

    console.log(pc.dim(`  Traversing ${files.length} candidate files...`));

    for (const file of files) {
      try {
        const fullPath = join(dir, file);
        if (!existsSync(fullPath)) continue;
        
        const stats = statSync(fullPath);
        if (stats.size > MAX_FILE_SIZE) continue;

        const content = readFileSync(fullPath, "utf-8");
        await this.registry.dispatchFile(file, content, context);
      } catch {
        // Skip
      }
    }

    await this.registry.finalizeAll(context);

    return {
      framework,
      utilities,
      pluginResults: this.registry.getResults(),
    };
  }
}
