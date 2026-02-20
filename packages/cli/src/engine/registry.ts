import type { ScannerPlugin, ScannerContext } from "./types.js";
import pc from "picocolors";
import pm from "picomatch";

export class ScannerRegistry {
  private plugins: ScannerPlugin[] = [];
  private matchers: Map<string, (path: string) => boolean> = new Map();

  register(plugin: ScannerPlugin) {
    this.plugins.push(plugin);
    return this;
  }

  getPlugins() {
    return this.plugins;
  }

  async setupAll(context: ScannerContext) {
    for (const plugin of this.plugins) {
      if (plugin.setup) await plugin.setup(context);
    }
  }

  async dispatchFile(path: string, content: string, context: ScannerContext) {
    for (const p of this.plugins) {
      if (!p.onFile) continue;
      
      const isInterested = p.filePatterns.some((pattern) => {
        let isMatch = this.matchers.get(pattern);
        if (!isMatch) {
          isMatch = pm(pattern);
          this.matchers.set(pattern, isMatch);
        }
        return isMatch(path);
      });

      if (isInterested) {
        await p.onFile(path, content, context);
      }
    }
  }

  async finalizeAll(context: ScannerContext) {
    const results = this.getResults();
    for (const plugin of this.plugins) {
      if (plugin.finalize) await plugin.finalize(context, results);
    }
  }

  getResults(): Record<string, any> {
    const results: Record<string, any> = {};
    for (const p of this.plugins) {
      results[p.name] = p.getResult();
    }
    return results;
  }
}
