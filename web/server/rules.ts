import { existsSync, readFileSync } from "fs";
import { join } from "path";

const RULE_FILENAMES = [
  "CLAUDE.md",
  "AGENTS.md",
  ".cursorrules",
  ".rules",
  ".clinerules",
];

export function loadProjectRules(projectDir: string): string {
  const parts: string[] = [];
  for (const filename of RULE_FILENAMES) {
    const filePath = join(projectDir, filename);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf-8").trim();
        if (content) {
          parts.push(`## ${filename}\n${content}`);
        }
      } catch {}
    }
  }
  return parts.join("\n\n");
}
