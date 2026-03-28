/**
 * Sandbox route -- virtual bash environment for agent command preview.
 * Uses just-bash to run commands in an isolated in-memory filesystem
 * without affecting the real system.
 *
 * Use cases:
 * - Agent dry-run: preview what commands would do before applying
 * - Safe command testing: try scripts without risk
 * - Agent training: let agents practice in a sandboxed environment
 *
 * NOTE: just-bash.Bash.exec() is NOT child_process.exec().
 * It runs commands in a pure TypeScript virtual shell -- no real processes spawned.
 */

import { Hono } from "hono";
import { Bash } from "just-bash";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import type { WorkspaceCtx } from "./workspaces.js";

export function sandboxRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  // Active sandbox instances keyed by session ID
  const sandboxes = new Map<string, Bash>();

  function getOrCreate(sessionId: string, seedFromProject: boolean = false): Bash {
    let bash = sandboxes.get(sessionId);
    if (bash) return bash;

    const files: Record<string, string> = {};

    if (seedFromProject && ctx.projectDir && ctx.projectDir !== "__unset__") {
      try {
        seedFiles(ctx.projectDir, ctx.projectDir, files, 0);
      } catch {
        // Start with empty filesystem if seeding fails
      }
    }

    bash = new Bash({
      files,
      cwd: "/project",
      env: {
        HOME: "/home/user",
        USER: "agent",
        PROJECT_DIR: "/project",
        PATH: "/usr/local/bin:/usr/bin:/bin",
      },
    });

    sandboxes.set(sessionId, bash);
    return bash;
  }

  // Seed virtual filesystem with real project files (text only, max 100 files, max 50KB each)
  function seedFiles(baseDir: string, currentDir: string, files: Record<string, string>, depth: number) {
    if (depth > 4 || Object.keys(files).length > 100) return;

    const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".cache"]);
    const TEXT_EXTS = new Set([
      ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt", ".css",
      ".html", ".yaml", ".yml", ".toml", ".sh", ".py", ".go",
      ".rs", ".sql", ".graphql", ".prisma",
    ]);

    try {
      const entries = readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (Object.keys(files).length >= 100) break;
        if (SKIP.has(entry.name)) continue;
        if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;

        const fullPath = join(currentDir, entry.name);
        const virtualPath = "/project/" + relative(baseDir, fullPath);

        if (entry.isDirectory()) {
          seedFiles(baseDir, fullPath, files, depth + 1);
        } else if (entry.isFile()) {
          const ext = entry.name.includes(".") ? "." + entry.name.split(".").pop() : "";
          if (!TEXT_EXTS.has(ext)) continue;
          try {
            const stat = statSync(fullPath);
            if (stat.size > 50_000) continue;
            files[virtualPath] = readFileSync(fullPath, "utf-8");
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  // POST /api/sandbox/exec -- run a command in the virtual shell
  app.post("/exec", async (c) => {
    const body = await c.req.json<{ sessionId?: string; command: string; seed?: boolean }>();
    const sessionId = body.sessionId || "default";
    const bash = getOrCreate(sessionId, body.seed ?? false);

    try {
      const result = await bash.exec(body.command);
      return c.json({ stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode });
    } catch (err) {
      return c.json({
        stdout: "",
        stderr: err instanceof Error ? err.message : "Sandbox failed",
        exitCode: 1,
      }, 500);
    }
  });

  // POST /api/sandbox/reset -- destroy a sandbox
  app.post("/reset", async (c) => {
    const body = await c.req.json<{ sessionId?: string }>();
    sandboxes.delete(body.sessionId || "default");
    return c.json({ ok: true });
  });

  // GET /api/sandbox/files -- list files in the virtual filesystem
  app.get("/files", async (c) => {
    const sessionId = c.req.query("sessionId") || "default";
    const bash = getOrCreate(sessionId, false);
    try {
      const result = await bash.exec("find /project -type f 2>/dev/null | head -100");
      return c.json({ files: result.stdout.trim().split("\n").filter(Boolean) });
    } catch {
      return c.json({ files: [] });
    }
  });

  // POST /api/sandbox/preview -- run a script and report what changed
  app.post("/preview", async (c) => {
    const body = await c.req.json<{ sessionId?: string; script: string; seed?: boolean }>();
    const sid = body.sessionId || "preview-" + Date.now();
    const bash = getOrCreate(sid, body.seed ?? true);

    const beforeResult = await bash.exec("find /project -type f | sort | xargs md5sum 2>/dev/null || true");

    try {
      const result = await bash.exec(body.script);
      const afterResult = await bash.exec("find /project -type f | sort | xargs md5sum 2>/dev/null || true");

      const beforeLines = new Set(beforeResult.stdout.trim().split("\n"));
      const afterLines = afterResult.stdout.trim().split("\n");
      const changed: string[] = [];
      const added: string[] = [];

      for (const line of afterLines) {
        if (!line.trim()) continue;
        if (!beforeLines.has(line)) {
          const path = line.split(/\s+/).pop() || "";
          if (beforeResult.stdout.includes(path)) changed.push(path);
          else added.push(path);
        }
      }

      sandboxes.delete(sid);
      return c.json({
        stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode,
        filesChanged: changed, filesAdded: added,
      });
    } catch (err) {
      sandboxes.delete(sid);
      return c.json({
        stdout: "", stderr: err instanceof Error ? err.message : "Preview failed",
        exitCode: 1, filesChanged: [], filesAdded: [],
      }, 500);
    }
  });

  return app;
}
