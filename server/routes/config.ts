/**
 * /api/config — scan defaults + studio config
 */

import { Hono } from "hono";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export interface ScanConfig {
  formats: string[];
  maxTokens: number;
  watchDebounceMs: number;
  autoRescan: boolean;
}

const DEFAULT_CONFIG: ScanConfig = {
  formats: ["CLAUDE.md", "AGENTS.md", ".cursorrules"],
  maxTokens: 100000,
  watchDebounceMs: 2000,
  autoRescan: false,
};

function loadConfig(dataDir: string): ScanConfig {
  const filePath = join(dataDir, "scan-config.json");
  if (!existsSync(filePath)) return { ...DEFAULT_CONFIG };
  try {
    const raw = readFileSync(filePath, "utf-8");
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<ScanConfig>) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(dataDir: string, config: ScanConfig): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "scan-config.json"), JSON.stringify(config, null, 2), "utf-8");
}

export function configRoutes(projectDir: string) {
  const app = new Hono();
  const dataDir = join(projectDir, ".hashmark");

  // GET /api/config
  app.get("/", (c) => {
    return c.json(loadConfig(dataDir));
  });

  // PUT /api/config
  app.put("/", async (c) => {
    const body = await c.req.json<Partial<ScanConfig>>();
    const current = loadConfig(dataDir);
    const updated: ScanConfig = {
      formats:          Array.isArray(body.formats) ? body.formats : current.formats,
      maxTokens:        typeof body.maxTokens === "number" ? body.maxTokens : current.maxTokens,
      watchDebounceMs:  typeof body.watchDebounceMs === "number" ? body.watchDebounceMs : current.watchDebounceMs,
      autoRescan:       typeof body.autoRescan === "boolean" ? body.autoRescan : current.autoRescan,
    };
    saveConfig(dataDir, updated);
    return c.json(updated);
  });

  return app;
}
