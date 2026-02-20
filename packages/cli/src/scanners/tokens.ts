/**
 * Design Token Scanner Plugin
 */

import type { Tokens } from "../types.js";
import type { ScannerPlugin, ScannerContext } from "../engine/types.js";

export class TokensScanner implements ScannerPlugin<Tokens> {
  name = "tokens";
  filePatterns = ["**/*.css", "**/tailwind.config.{ts,js,mjs,cjs}"];
  
  private tokens: Tokens = {
    colors: {},
    spacing: {},
    radius: {},
    fonts: [],
  };

  async onFile(path: string, content: string) {
    if (path.endsWith(".css")) {
      extractCssVariables(content, this.tokens);
    } else if (path.includes("tailwind.config")) {
      extractTailwindTokens(content, this.tokens);
    }
  }

  getResult() {
    return this.tokens;
  }
}

function extractCssVariables(content: string, tokens: Tokens): void {
  const patterns = [/:root\s*\{([^}]+)\}/g, /@theme\s*\{([^}]+)\}/g, /\[data-theme[^\]]*\]\s*\{([^}]+)\}/g];
  for (const p of patterns) {
    const matches = content.matchAll(p);
    for (const m of matches) parseVars(m[1], tokens);
  }
}

function parseVars(block: string, tokens: Tokens) {
  const matches = block.matchAll(/--([a-zA-Z0-9-]*):\s*([^;]+);/g);
  for (const m of matches) {
    const [name, val] = [m[1], m[2].trim()];
    if (name.startsWith("color-")) continue;
    if (name.includes("radius")) tokens.radius[name] = val;
    else if (name.includes("font") && !tokens.fonts.includes(name)) tokens.fonts.push(name);
    else if (isColorToken(name) && !tokens.colors[name]) tokens.colors[name] = val;
  }
}

function isColorToken(name: string) {
  return ["background", "foreground", "primary", "secondary", "accent", "muted", "border", "destructive"].some(k => name.includes(k));
}

function extractTailwindTokens(content: string, tokens: Tokens) {
  const colors = content.match(/colors:\s*\{([^}]+)\}/);
  if (colors) {
    for (const m of colors[1].matchAll(/(\w+):/g)) {
      if (!tokens.colors[m[1]]) tokens.colors[m[1]] = "tailwind";
    }
  }
}

/** Legacy support */
export async function scanTokens(dir: string): Promise<Tokens> {
  const { ScannerRegistry } = await import("../engine/registry.js");
  const { CodebaseVisitor } = await import("../engine/visitor.js");
  const registry = new ScannerRegistry().register(new TokensScanner());
  const visitor = new CodebaseVisitor(registry);
  const result = await visitor.visit(dir);
  return result.pluginResults.tokens;
}
