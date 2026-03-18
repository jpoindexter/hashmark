/**
 * /api/files — File browser + Git status
 */

import { Hono } from "hono";
import { readdir, stat, readFile } from "fs/promises";
import { join, relative, extname } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";

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
      await execAsync("git", ["push"], { cwd: projectDir });
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
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
