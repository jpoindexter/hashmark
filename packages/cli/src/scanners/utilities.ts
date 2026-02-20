/**
 * Utility Scanner Plugin
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Utilities } from "../types.js";
import type { ScannerPlugin, ScannerContext } from "../engine/types.js";

export class UtilitiesScanner implements ScannerPlugin<Utilities> {
  name = "utilities";
  filePatterns = ["**/package.json", "**/utils.ts", "**/utils.tsx", "**/design-system/**"];
  
  private utils: Utilities = {
    hasCn: false,
    hasMode: false,
    hasShadcn: false,
    radixPackages: [],
    hasCva: false,
    customUtils: [],
  };

  async onFile(path: string, content: string) {
    // 1. package.json analysis
    if (path.endsWith("package.json")) {
      try {
        const pkg = JSON.parse(content);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        for (const dep of Object.keys(deps)) {
          if (dep.startsWith("@radix-ui/react-")) {
            this.utils.radixPackages.push(dep.replace("@radix-ui/react-", ""));
          }
        }
        if (deps["class-variance-authority"]) this.utils.hasCva = true;
      } catch {}
    }

    // 2. cn() utility detection
    if (path.includes("utils.") && (content.includes("function cn(") || content.includes("const cn ="))) {
      this.utils.hasCn = true;
      this.utils.cnPath = path.startsWith("src/") ? "@/" + path.slice(4).replace(/\.tsx?$/, "") : "@/" + path.replace(/\.tsx?$/, "");
    }

    // 3. mode/design-system detection
    if (path.includes("design-system") && (content.includes("mode") || content.includes("Mode"))) {
      this.utils.hasMode = true;
      this.utils.modePath = "@/design-system";
    }
  }

  finalize() {
    if (this.utils.radixPackages.length > 5 && this.utils.hasCva && this.utils.hasCn) {
      this.utils.hasShadcn = true;
    }
  }

  getResult() {
    return this.utils;
  }
}

/** Legacy support - Independent of CodebaseVisitor to avoid recursion */
export async function scanUtilities(dir: string): Promise<Utilities> {
  const scanner = new UtilitiesScanner();
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

  scanner.finalize();
  return scanner.getResult();
}
