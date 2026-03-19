/**
 * /api/files — File browser + Git status
 */

import { Hono } from "hono";
import { readdir, stat, readFile } from "fs/promises";
import { join, relative, extname } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { analyzeImpact } from "../lib/dep-graph.js";

const execAsync = promisify(execFile);

const IGNORED = new Set([
  "node_modules", ".git", ".next", "dist", "build", ".cache",
  "__pycache__", ".pytest_cache", "coverage", ".turbo", ".vercel",
]);

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileNode[];
  ext?: string;
  size?: number;
  mtime?: number;
}

async function buildTree(dir: string, root: string, depth = 0): Promise<FileNode[]> {
  if (depth > 4) return [];
  let entries: string[];
  try { entries = await readdir(dir); } catch { return []; }

  const nodes: FileNode[] = [];
  for (const name of entries) {
    if (name.startsWith(".") && name !== ".claude") continue;
    if (IGNORED.has(name)) continue;
    const fullPath = join(dir, name);
    const relPath = relative(root, fullPath);
    let s;
    try { s = await stat(fullPath); } catch { continue; }
    if (s.isDirectory()) {
      nodes.push({ name, path: relPath, type: "dir", children: await buildTree(fullPath, root, depth + 1) });
    } else {
      nodes.push({
        name,
        path: relPath,
        type: "file",
        ext: extname(name).slice(1),
        size: s.size,
        mtime: s.mtimeMs,
      });
    }
  }
  nodes.sort((a, b) => (a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name)));
  return nodes;
}

export function filesRoutes(projectDir: string) {
  const app = new Hono();

  app.get("/tree", async (c) => {
    const tree = await buildTree(projectDir, projectDir);
    return c.json({ tree, root: projectDir });
  });

  // Flat gitignore-aware file list for @mention completion.
  // Uses `git ls-files --cached --others --exclude-standard` so .gitignore
  // patterns are respected automatically.
  app.get("/list", async (c) => {
    try {
      const { stdout } = await execAsync(
        "git",
        ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        { cwd: projectDir, maxBuffer: 4 * 1024 * 1024 }
      );
      const files = stdout
        .split("\0")
        .filter(Boolean)
        .map(p => {
          const parts = p.split("/");
          const name = parts[parts.length - 1];
          const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : undefined;
          return { name, path: p, ext };
        });
      return c.json({ files });
    } catch {
      // Fallback: not a git repo — return flat tree walk
      const tree = await buildTree(projectDir, projectDir);
      const flat: { name: string; path: string; ext?: string }[] = [];
      function flatten(nodes: FileNode[]) {
        for (const n of nodes) {
          if (n.type === "file") flat.push({ name: n.name, path: n.path, ext: n.ext });
          if (n.children) flatten(n.children);
        }
      }
      flatten(tree);
      return c.json({ files: flat });
    }
  });

  app.get("/read", async (c) => {
    const relPath = c.req.query("path");
    if (!relPath) return c.json({ error: "path required" }, 400);
    const fullPath = join(projectDir, relPath);
    if (!fullPath.startsWith(projectDir)) return c.json({ error: "forbidden" }, 403);
    try {
      const content = await readFile(fullPath, "utf-8");
      return c.json({ content, path: relPath });
    } catch { return c.json({ error: "not found" }, 404); }
  });

  app.get("/diff", async (c) => {
    const relPath = c.req.query("path");
    if (!relPath) return c.json({ error: "path required" }, 400);
    const fullPath = join(projectDir, relPath);
    if (!fullPath.startsWith(projectDir)) return c.json({ error: "forbidden" }, 403);
    const stagedParam = c.req.query("staged");
    const staged = stagedParam === "true" || stagedParam === "1";
    try {
      // staged=true  → git diff --cached (index vs HEAD)
      // staged=false → git diff (working tree vs index)
      const args = staged
        ? ["diff", "--cached", "--", relPath]
        : ["diff", "--", relPath];
      const { stdout } = await execAsync("git", args, { cwd: projectDir });
      if (!stdout) {
        try {
          const content = await readFile(fullPath, "utf-8");
          const lines = content.split("\n").map(l => `+${l}`).join("\n");
          const fakeDiff = `--- /dev/null\n+++ b/${relPath}\n@@ -0,0 +1,${content.split("\n").length} @@\n${lines}`;
          return c.json({ diff: fakeDiff, path: relPath });
        } catch {
          return c.json({ diff: "", path: relPath });
        }
      }
      return c.json({ diff: stdout, path: relPath });
    } catch {
      return c.json({ diff: "", path: relPath, error: "failed to get diff" });
    }
  });

  app.post("/stage", async (c) => {
    const body = await c.req.json<{ paths?: string[] }>().catch(() => ({ paths: undefined }));
    try {
      if (body.paths?.length) {
        for (const p of body.paths) {
          const fullPath = join(projectDir, p);
          if (!fullPath.startsWith(projectDir)) continue;
          await execAsync("git", ["add", p], { cwd: projectDir });
        }
      } else {
        await execAsync("git", ["add", "-A"], { cwd: projectDir });
      }
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  app.post("/unstage", async (c) => {
    const body = await c.req.json<{ paths?: string[] }>().catch(() => ({ paths: undefined }));
    try {
      if (body.paths?.length) {
        for (const p of body.paths) {
          const fullPath = join(projectDir, p);
          if (!fullPath.startsWith(projectDir)) continue;
          await execAsync("git", ["restore", "--staged", p], { cwd: projectDir });
        }
      } else {
        await execAsync("git", ["restore", "--staged", "."], { cwd: projectDir });
      }
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  app.post("/discard", async (c) => {
    const body = await c.req.json<{ paths: string[] }>().catch(() => ({ paths: [] as string[] }));
    if (!body.paths?.length) return c.json({ error: "paths required" }, 400);
    try {
      for (const p of body.paths) {
        const fullPath = join(projectDir, p);
        if (!fullPath.startsWith(projectDir)) continue;
        try {
          // Try checkout first (tracked files)
          await execAsync("git", ["checkout", "--", p], { cwd: projectDir });
        } catch {
          // Untracked file — clean it
          await execAsync("git", ["clean", "-f", p], { cwd: projectDir });
        }
      }
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  app.post("/commit", async (c) => {
    const body = await c.req.json<{ message: string }>();
    if (!body.message?.trim()) return c.json({ error: "message required" }, 400);
    try {
      await execAsync("git", ["commit", "-m", body.message], { cwd: projectDir });
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  app.post("/push", async (c) => {
    try {
      const { stdout } = await execAsync("git", ["push"], { cwd: projectDir });
      return c.json({ ok: true, output: stdout });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Push failed" }, 500);
    }
  });

  app.post("/pull", async (c) => {
    try {
      const { stdout } = await execAsync("git", ["pull"], { cwd: projectDir });
      return c.json({ ok: true, output: stdout });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Pull failed" }, 500);
    }
  });

  app.post("/fetch", async (c) => {
    try {
      const { stdout } = await execAsync("git", ["fetch", "--all"], { cwd: projectDir });
      return c.json({ ok: true, output: stdout });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Fetch failed" }, 500);
    }
  });

  // GET /api/files/impact?branch=<branch>&base=<base>
  // Returns changed files + downstream files that import them
  app.get("/impact", (c) => {
    const branch = c.req.query("branch");
    if (!branch) return c.json({ error: "branch query param required" }, 400);
    const base = c.req.query("base") ?? "HEAD";
    const report = analyzeImpact(projectDir, branch, base);
    return c.json(report);
  });

  app.get("/complexity", async (c) => {
    const cachePath = join(projectDir, ".hashmark", "complexity-cache.json");
    if (!existsSync(cachePath)) return c.json({ data: null });
    try {
      const raw = await readFile(cachePath, "utf-8");
      return c.json({ data: JSON.parse(raw) });
    } catch {
      return c.json({ data: null });
    }
  });

  // Rich commit log with numstat for the Git history page
  app.get("/git/log", async (c) => {
    try {
      // Parse format: hash|shortHash|subject|author|isoDate
      const { stdout: logRaw } = await execAsync(
        "git",
        ["log", "--format=%H|%h|%s|%an|%ai", "-50"],
        { cwd: projectDir, maxBuffer: 4 * 1024 * 1024 }
      );

      const commitLines = logRaw.trim().split("\n").filter(Boolean);

      // Get numstat separately — one pass per commit is expensive; use --numstat with log
      // Each block: commit line, blank, numstat lines, blank
      const { stdout: numstatRaw } = await execAsync(
        "git",
        ["log", "--format=COMMIT:%H", "--numstat", "-50"],
        { cwd: projectDir, maxBuffer: 8 * 1024 * 1024 }
      );

      // Build map: hash -> { filesChanged, insertions, deletions, files: string[] }
      const statsMap: Record<string, { filesChanged: number; insertions: number; deletions: number; files: string[] }> = {};
      let currentHash = "";
      for (const line of numstatRaw.split("\n")) {
        if (line.startsWith("COMMIT:")) {
          currentHash = line.slice(7).trim();
          statsMap[currentHash] = { filesChanged: 0, insertions: 0, deletions: 0, files: [] };
        } else if (currentHash && line.trim()) {
          const parts = line.split("\t");
          if (parts.length === 3) {
            const ins = parseInt(parts[0]) || 0;
            const del = parseInt(parts[1]) || 0;
            const file = parts[2].trim();
            statsMap[currentHash].insertions += ins;
            statsMap[currentHash].deletions += del;
            statsMap[currentHash].filesChanged += 1;
            statsMap[currentHash].files.push(file);
          }
        }
      }

      // Get branch names for commits
      const { stdout: branchRaw } = await execAsync(
        "git",
        ["branch", "-v", "--no-abbrev"],
        { cwd: projectDir }
      ).catch(() => ({ stdout: "" }));

      const branchMap: Record<string, string[]> = {};
      for (const line of branchRaw.split("\n").filter(Boolean)) {
        const isCurrent = line.startsWith("*");
        const parts = line.slice(2).trim().split(/\s+/);
        const bname = parts[0];
        const bhash = parts[1];
        if (bhash) {
          if (!branchMap[bhash]) branchMap[bhash] = [];
          branchMap[bhash].push(isCurrent ? `*${bname}` : bname);
        }
      }

      const commits = commitLines.map((line) => {
        const [hash, shortHash, subject, author, date] = line.split("|");
        const stats = statsMap[hash] ?? { filesChanged: 0, insertions: 0, deletions: 0, files: [] };
        return {
          hash,
          shortHash,
          subject,
          author,
          date,
          filesChanged: stats.filesChanged,
          insertions: stats.insertions,
          deletions: stats.deletions,
          files: stats.files,
          branches: branchMap[hash] ?? [],
        };
      });

      return c.json({ commits });
    } catch (err) {
      return c.json({ commits: [], error: String(err) });
    }
  });

  // Diff for a specific file at a specific commit
  app.get("/git/commit-diff", async (c) => {
    const hash = c.req.query("hash");
    const file = c.req.query("file");
    if (!hash || !file) return c.json({ error: "hash and file required" }, 400);
    try {
      const { stdout } = await execAsync(
        "git",
        ["show", "--format=", `${hash}`, "--", file],
        { cwd: projectDir, maxBuffer: 4 * 1024 * 1024 }
      );
      return c.json({ diff: stdout, file, hash });
    } catch (err) {
      return c.json({ diff: "", file, hash, error: String(err) });
    }
  });

  app.get("/git/branches", async (c) => {
    try {
      const [branchesOut, currentOut] = await Promise.all([
        execAsync("git", ["branch", "--format=%(refname:short)"], { cwd: projectDir }),
        execAsync("git", ["branch", "--show-current"], { cwd: projectDir }),
      ]);
      const branches = branchesOut.stdout.trim().split("\n").filter(Boolean);
      const current = currentOut.stdout.trim();
      return c.json({ branches, current });
    } catch (err) {
      return c.json({ branches: [], current: "", error: String(err) });
    }
  });

  app.post("/git/branch", async (c) => {
    const body = await c.req.json<{ name: string }>().catch(() => ({ name: "" }));
    if (!body.name?.trim()) return c.json({ error: "Branch name required" }, 400);
    try {
      await execAsync("git", ["checkout", "-b", body.name.trim()], { cwd: projectDir });
      return c.json({ ok: true, branch: body.name.trim() });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post("/git/checkout", async (c) => {
    const body = await c.req.json<{ branch: string }>().catch(() => ({ branch: "" }));
    if (!body.branch?.trim()) return c.json({ error: "branch required" }, 400);
    try {
      await execAsync("git", ["checkout", body.branch], { cwd: projectDir });
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  app.get("/git", async (c) => {
    try {
      const [statusOut, logOut, branchOut] = await Promise.all([
        execAsync("git", ["status", "--porcelain=v1"], { cwd: projectDir }),
        execAsync("git", ["log", "--oneline", "-10"], { cwd: projectDir }),
        execAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: projectDir }),
      ]);
      const branch = branchOut.stdout.trim();

      // Ahead/behind vs remote tracking branch
      let ahead = 0;
      let behind = 0;
      try {
        const { stdout: revCount } = await execAsync(
          "git", ["rev-list", "--left-right", "--count", `${branch}...@{u}`],
          { cwd: projectDir }
        );
        const parts = revCount.trim().split(/\s+/);
        ahead = parseInt(parts[0]) || 0;
        behind = parseInt(parts[1]) || 0;
      } catch { /* no upstream */ }

      // Parse porcelain v1: XY filename
      // X = staged status, Y = unstaged status
      const rawFiles = statusOut.stdout.trim().split("\n").filter(Boolean).map((line) => {
        const xy = line.slice(0, 2);
        const file = line.slice(3).trim();
        const x = xy[0]; // staged
        const y = xy[1]; // unstaged
        const isUntracked = x === "?" && y === "?";
        const isStaged = x !== " " && x !== "?";
        const isUnstaged = !isUntracked && y !== " ";
        return { status: xy, file, x, y, isStaged, isUnstaged, isUntracked };
      });

      const filesWithStats = await Promise.all(rawFiles.map(async (f) => {
        try {
          // For staged files use --cached, for others use HEAD comparison
          const args = f.isStaged
            ? ["diff", "--numstat", "--cached", "--", f.file]
            : ["diff", "--numstat", "HEAD", "--", f.file];
          const { stdout } = await execAsync("git", args, { cwd: projectDir });
          const parts = stdout.trim().split("\t");
          return { ...f, added: parseInt(parts[0]) || 0, removed: parseInt(parts[1]) || 0 };
        } catch {
          return { ...f, added: 0, removed: 0 };
        }
      }));

      const commits = logOut.stdout.trim().split("\n").filter(Boolean).map((line) => {
        const i = line.indexOf(" ");
        return { hash: line.slice(0, i), message: line.slice(i + 1) };
      });
      return c.json({ branch, ahead, behind, files: filesWithStats, commits });
    } catch {
      return c.json({ branch: "unknown", ahead: 0, behind: 0, files: [], commits: [], error: "not a git repo" });
    }
  });

  return app;
}
