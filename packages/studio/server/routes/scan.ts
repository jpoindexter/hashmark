/**
 * /api/scan — run hashmark scan on the project
 */

import { Hono } from "hono";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { getScanContextMeta } from "../context.js";

interface ScanSnapshot {
  scannedAt: number;
  totalFiles: number;
  totalLines: number;
  componentCount: number;
  apiRouteCount: number;
  aiReadiness: number | null;
  hubFileCount: number;
}

function snapshotFromResult(result: Record<string, unknown>): ScanSnapshot {
  const stats = result.stats as { totalFiles?: number; totalLines?: number } | undefined;
  const aiReadiness = result.aiReadiness as { total?: number } | undefined;
  const importGraph = result.importGraph as { hubFiles?: unknown[] } | undefined;
  return {
    scannedAt: Date.now(),
    totalFiles: stats?.totalFiles ?? 0,
    totalLines: stats?.totalLines ?? 0,
    componentCount: Array.isArray(result.components) ? (result.components as unknown[]).length : 0,
    apiRouteCount: Array.isArray(result.apiRoutes) ? (result.apiRoutes as unknown[]).length : 0,
    aiReadiness: aiReadiness?.total ?? null,
    hubFileCount: importGraph?.hubFiles ? (importGraph.hubFiles as unknown[]).length : 0,
  };
}

function computeDelta(prev: ScanSnapshot, curr: ScanSnapshot): Record<string, { prev: number; curr: number; delta: number; pct: number }> {
  const fields: Array<[string, keyof ScanSnapshot]> = [
    ["Lines", "totalLines"],
    ["Files", "totalFiles"],
    ["Components", "componentCount"],
    ["API Routes", "apiRouteCount"],
    ["Hub Files", "hubFileCount"],
  ];
  const out: Record<string, { prev: number; curr: number; delta: number; pct: number }> = {};
  for (const [label, key] of fields) {
    const p = prev[key] as number;
    const c = curr[key] as number;
    if (p === 0 && c === 0) continue;
    out[label] = {
      prev: p,
      curr: c,
      delta: c - p,
      pct: p > 0 ? Math.round(((c - p) / p) * 100) : 0,
    };
  }
  if (prev.aiReadiness !== null && curr.aiReadiness !== null) {
    const p = prev.aiReadiness;
    const c = curr.aiReadiness;
    out["AI Readiness"] = { prev: p, curr: c, delta: c - p, pct: Math.round(((c - p) / (p || 1)) * 100) };
  }
  return out;
}

export function scanRoutes(projectDir: string) {
  const app = new Hono();
  const dataDir = join(projectDir, ".hashmark");
  const snapshotPath = join(dataDir, "last-scan-snapshot.json");

  // GET /api/scan/context — check if scan context is available for chat injection
  app.get("/context", (c) => {
    const meta = getScanContextMeta(projectDir);
    return c.json(meta);
  });

  // POST /api/scan — run scan, stream progress via SSE
  app.post("/", async (c) => {
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");

    // Load previous snapshot for delta computation
    let prevSnapshot: ScanSnapshot | null = null;
    try {
      if (existsSync(snapshotPath)) {
        prevSnapshot = JSON.parse(readFileSync(snapshotPath, "utf-8")) as ScanSnapshot;
      }
    } catch { /* ignore corrupt snapshot */ }

    const send = (data: object) => `data: ${JSON.stringify(data)}\n\n`;

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(send({ type: "start", message: "Starting scan..." }));

        // Find the hashmark CLI binary
        const cliPath = join(projectDir, "node_modules", ".bin", "hashmark");
        const bin = existsSync(cliPath) ? cliPath : "hashmark";

        const proc = spawn(bin, ["--json", "--output", "/dev/stdout"], {
          cwd: projectDir,
          env: process.env,
        });

        let stdout = "";
        proc.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });

        proc.stderr.on("data", (chunk: Buffer) => {
          const line = chunk.toString().trim();
          if (line) {
            controller.enqueue(send({ type: "progress", message: line }));
          }
        });

        proc.on("close", (code: number) => {
          if (code === 0) {
            try {
              const result = JSON.parse(stdout) as Record<string, unknown>;
              const currSnapshot = snapshotFromResult(result);

              // Persist snapshot for next run
              try {
                mkdirSync(dataDir, { recursive: true });
                writeFileSync(snapshotPath, JSON.stringify(currSnapshot), "utf-8");
              } catch { /* non-fatal */ }

              const delta = prevSnapshot ? computeDelta(prevSnapshot, currSnapshot) : null;
              controller.enqueue(send({ type: "complete", result, delta }));
            } catch {
              controller.enqueue(send({ type: "complete", result: null, delta: null }));
            }
          } else {
            controller.enqueue(send({ type: "error", message: `Scan exited with code ${code}` }));
          }
          controller.close();
        });

        proc.on("error", (err: Error) => {
          controller.enqueue(send({ type: "error", message: err.message }));
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  });

  return app;
}
