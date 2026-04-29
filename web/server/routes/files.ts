import { Hono } from "hono";
import { randomUUID } from "crypto";
import { join, resolve, relative, extname } from "path";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { getDb } from "../db.js";
import { loadProviders } from "../providers.js";

const execFileAsync = promisify(execFile);

const HIDDEN = new Set([".git", "node_modules", ".hashmark", "dist", ".next", "__pycache__", ".venv"]);

export function registerFileRoutes(app: Hono, ctx: { dataDir: string; projectDir: string }) {
  const { dataDir: DATA_DIR, projectDir: PROJECT_DIR } = ctx;

  // ── Files ─────────────────────────────────────────────────────────────────────

  app.get("/api/files", (c) => {
    const reqDir = c.req.query("dir") ?? PROJECT_DIR;
    const abs = resolve(reqDir);
    if (!abs.startsWith(PROJECT_DIR)) return c.json({ error: "outside project" }, 403);
    if (!existsSync(abs)) return c.json({ error: "not found" }, 404);

    if (c.req.query("flat") === "true") {
      const q = (c.req.query("q") ?? "").toLowerCase();
      const results: { name: string; path: string; isDir: boolean; ext: string; relative: string }[] = [];
      const walk = (dir: string, depth: number) => {
        if (depth > 6 || results.length >= 40) return;
        try {
          for (const name of readdirSync(dir)) {
            if (HIDDEN.has(name) || name.startsWith(".")) continue;
            const full = join(dir, name);
            let isDir = false;
            try { isDir = statSync(full).isDirectory(); } catch { continue; }
            if (isDir) { walk(full, depth + 1); }
            else if (!q || name.toLowerCase().includes(q)) {
              results.push({ name, path: full, isDir: false, ext: extname(name).slice(1), relative: relative(PROJECT_DIR, full) });
            }
          }
        } catch {}
      };
      walk(PROJECT_DIR, 0);
      return c.json({ entries: results });
    }

    try {
      const entries = readdirSync(abs).map(name => {
        const full = join(abs, name);
        let isDir = false;
        try { isDir = statSync(full).isDirectory(); } catch { return null; }
        return { name, path: full, isDir, ext: isDir ? "" : extname(name).slice(1) };
      }).filter(Boolean).filter(e => !HIDDEN.has(e!.name) && !e!.name.startsWith("."));

      entries.sort((a, b) => {
        if (a!.isDir !== b!.isDir) return a!.isDir ? -1 : 1;
        return a!.name.localeCompare(b!.name);
      });

      return c.json({ dir: abs, relative: relative(PROJECT_DIR, abs) || ".", entries });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  });

  app.get("/api/files/content", (c) => {
    const path = c.req.query("path") ?? "";
    const abs = resolve(path);
    if (!abs.startsWith(PROJECT_DIR)) return c.json({ error: "outside project" }, 403);
    if (!existsSync(abs)) return c.json({ error: "not found" }, 404);

    try {
      const stat = statSync(abs);
      if (stat.isDirectory()) return c.json({ error: "is a directory" }, 400);
      if (stat.size > 500_000) return c.json({ error: "file too large (>500KB)" }, 413);
      const content = readFileSync(abs, "utf-8");
      return c.json({ path: abs, relative: relative(PROJECT_DIR, abs), content });
    } catch {
      return c.json({ error: "cannot read file" }, 500);
    }
  });

  // ── Claude Code native session history ───────────────────────────────────────

  app.get("/api/claude-history", (c) => {
    const claudeProjectsDir = join(process.env.HOME ?? "", ".claude", "projects");
    const encoded = PROJECT_DIR.replace(/[/_]/g, "-");
    const sessionDir = join(claudeProjectsDir, encoded);

    if (!existsSync(sessionDir)) return c.json({ sessions: [] });

    let files: string[];
    try {
      files = readdirSync(sessionDir).filter(f => f.endsWith(".jsonl"));
    } catch { return c.json({ sessions: [] }); }

    const withMtime = files.map(f => {
      try { return { f, mtime: statSync(join(sessionDir, f)).mtimeMs }; } catch { return null; }
    }).filter(Boolean) as { f: string; mtime: number }[];
    withMtime.sort((a, b) => b.mtime - a.mtime);

    const sessions: { sessionId: string; title: string; msgCount: number; lastActivity: number; model: string }[] = [];

    for (const { f, mtime } of withMtime.slice(0, 80)) {
      const sessionId = f.replace(".jsonl", "");
      let lines: string[];
      try { lines = readFileSync(join(sessionDir, f), "utf-8").split("\n").filter(Boolean); } catch { continue; }

      let title = "";
      let msgCount = 0;
      let model = "";

      for (const line of lines) {
        try {
          const d = JSON.parse(line) as Record<string, unknown>;
          if (d.type === "user") {
            const content = (d.message as Record<string, unknown>)?.content;
            if (typeof content === "string" && content.length > 5 &&
                !content.includes("local-command") && !content.includes("<command-name>")) {
              if (!title) title = content.slice(0, 80).replace(/\n/g, " ");
              msgCount++;
            }
          } else if (d.type === "assistant") {
            msgCount++;
            if (!model) {
              const m = (d.message as Record<string, unknown>)?.model as string | undefined;
              if (m && m !== "<synthetic>") model = m;
            }
          }
        } catch {}
      }

      if (msgCount > 0) sessions.push({ sessionId, title: title || "Session", msgCount, lastActivity: mtime, model });
    }

    return c.json({ sessions });
  });

  app.post("/api/claude-history/:sessionId/resume", async (c) => {
    const { sessionId } = c.req.param();
    const db = getDb(DATA_DIR);
    const providers = loadProviders(DATA_DIR);
    const id = randomUUID();
    const now = Date.now();

    const existing = db.prepare("SELECT * FROM sessions WHERE claude_session_id = ?").get(sessionId);
    if (existing) return c.json(existing);

    db.prepare(
      "INSERT INTO sessions (id, title, model, provider, system_prompt, project_dir, status, claude_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, null, ?, 'idle', ?, ?, ?)"
    ).run(id, "Resumed session", providers.model, "claude", PROJECT_DIR, sessionId, now, now);

    return c.json(db.prepare("SELECT * FROM sessions WHERE id = ?").get(id), 201);
  });

  // ── Native folder picker (macOS) ──────────────────────────────────────────────

  app.get("/api/pick-folder", async (c) => {
    try {
      const { stdout } = await execFileAsync("osascript", [
        "-e", `POSIX path of (choose folder with prompt "Select project folder")`
      ]);
      const dir = stdout.trim().replace(/\/$/, "");
      if (!dir || !existsSync(dir)) return c.json({ error: "invalid folder" }, 400);
      return c.json({ dir });
    } catch {
      return c.json({ error: "cancelled" }, 400);
    }
  });

  // ── Workspace switch ──────────────────────────────────────────────────────────

  app.post("/api/switch", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const dir = String(body.projectDir ?? "").trim();
    if (!dir || !existsSync(dir)) return c.json({ error: "invalid directory" }, 400);
    const newDataDir = join(dir, ".hashmark");
    const { resetDb } = await import("../db.js");
    try {
      getDb(newDataDir);
    } catch (err) {
      return c.json({ error: `Cannot open project DB: ${err instanceof Error ? err.message : String(err)}` }, 500);
    }
    resetDb();
    process.env.HASHMARK_PROJECT_DIR = dir;
    getDb(newDataDir);
    return c.json({ ok: true, projectDir: dir });
  });
}
