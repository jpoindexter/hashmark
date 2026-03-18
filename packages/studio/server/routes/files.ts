/**
 * /api/files — File browser + Git status
 */

import { Hono } from "hono";
import { readdir, stat, readFile } from "fs/promises";
import { join, relative, extname } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

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
      nodes.push({ name, path: relPath, type: "file", ext: extname(name).slice(1) });
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

  app.get("/git", async (c) => {
    try {
      const [statusOut, logOut, branchOut] = await Promise.all([
        execAsync("git", ["status", "--porcelain"], { cwd: projectDir }),
        execAsync("git", ["log", "--oneline", "-10"], { cwd: projectDir }),
        execAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: projectDir }),
      ]);
      const branch = branchOut.stdout.trim();
      const files = statusOut.stdout.trim().split("\n").filter(Boolean).map((line) => ({
        status: line.slice(0, 2).trim(),
        file: line.slice(3).trim(),
      }));
      const commits = logOut.stdout.trim().split("\n").filter(Boolean).map((line) => {
        const i = line.indexOf(" ");
        return { hash: line.slice(0, i), message: line.slice(i + 1) };
      });
      return c.json({ branch, files, commits });
    } catch {
      return c.json({ branch: "unknown", files: [], commits: [], error: "not a git repo" });
    }
  });

  return app;
}
