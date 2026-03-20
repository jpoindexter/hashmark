/**
 * /api/files — File browser + Git status
 */

import { Hono } from "hono";
import { readdir, stat, readFile, writeFile, mkdir, rename, rm } from "fs/promises";
import { join, relative, extname, resolve, dirname } from "path";
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
    if (!fullPath.startsWith(projectDir + "/") && fullPath !== projectDir) return c.json({ error: "forbidden" }, 403);
    try {
      const content = await readFile(fullPath, "utf-8");
      return c.json({ content, path: relPath });
    } catch { return c.json({ error: "not found" }, 404); }
  });

  app.get("/diff", async (c) => {
    const relPath = c.req.query("path");
    if (!relPath) return c.json({ error: "path required" }, 400);
    const fullPath = join(projectDir, relPath);
    if (!fullPath.startsWith(projectDir + "/") && fullPath !== projectDir) return c.json({ error: "forbidden" }, 403);
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
          if (!safePath(p)) continue;
          await execAsync("git", ["add", "--", p], { cwd: projectDir });
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
          if (!safePath(p)) continue;
          await execAsync("git", ["restore", "--staged", "--", p], { cwd: projectDir });
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
        if (!safePath(p)) continue;
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

  // ---- File CRUD ----

  /** Resolve and validate a relative path is within projectDir */
  function safePath(relPath: string): string | null {
    const full = resolve(projectDir, relPath);
    if (!full.startsWith(projectDir + "/") && full !== projectDir) return null;
    return full;
  }

  // POST /api/files/create — create a file or directory
  app.post("/create", async (c) => {
    const body = await c.req.json().catch(() => ({})) as { path?: string; type?: "file" | "dir"; content?: string };
    const relPath = body.path;
    if (!relPath || typeof relPath !== "string") return c.json({ error: "path required" }, 400);
    const fullPath = safePath(relPath);
    if (!fullPath) return c.json({ error: "forbidden" }, 403);
    const isDir = body.type === "dir";
    try {
      if (isDir) {
        await mkdir(fullPath, { recursive: true });
      } else {
        // Ensure parent directory exists
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, body.content ?? "", "utf-8");
      }
      return c.json({ ok: true, path: relPath }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // PUT /api/files/rename — rename a file or directory
  app.put("/rename", async (c) => {
    const body = await c.req.json().catch(() => ({})) as { oldPath?: string; newPath?: string };
    if (!body.oldPath || !body.newPath) return c.json({ error: "oldPath and newPath required" }, 400);
    const fullOld = safePath(body.oldPath);
    const fullNew = safePath(body.newPath);
    if (!fullOld || !fullNew) return c.json({ error: "forbidden" }, 403);
    try {
      // Ensure destination parent exists
      await mkdir(dirname(fullNew), { recursive: true });
      await rename(fullOld, fullNew);
      return c.json({ ok: true, oldPath: body.oldPath, newPath: body.newPath });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // DELETE /api/files/delete — delete a file or directory
  app.delete("/delete", async (c) => {
    const relPath = c.req.query("path");
    if (!relPath) return c.json({ error: "path required" }, 400);
    const fullPath = safePath(relPath);
    if (!fullPath) return c.json({ error: "forbidden" }, 403);
    // Extra guard: never delete project root
    if (fullPath === projectDir) return c.json({ error: "cannot delete project root" }, 403);
    try {
      await rm(fullPath, { recursive: true });
      return c.json({ ok: true, path: relPath });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // ---- Content search ----

  // GET /api/files/search?q=<query>&glob=<glob>
  // Uses ripgrep if available, falls back to recursive file search
  app.get("/search", async (c) => {
    const q: string = c.req.query("q") ?? "";
    if (!q) return c.json({ results: [], matchCount: 0 });

    const globPattern = c.req.query("glob") || undefined;
    const maxResults = 200;

    // Try ripgrep first
    try {
      const args = [
        "--json",
        "--max-count", "50",           // max matches per file
        "--max-filesize", "1M",
        "-n",                          // line numbers
      ];
      if (globPattern) {
        args.push("--glob", globPattern);
      }
      args.push("--", q, ".");

      const { stdout } = await execAsync("rg", args, {
        cwd: projectDir,
        maxBuffer: 8 * 1024 * 1024,
      });

      interface RgMatch {
        path: string;
        line: number;
        text: string;
      }

      const matches: RgMatch[] = [];
      for (const line of stdout.split("\n")) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.type === "match" && obj.data) {
            matches.push({
              path: obj.data.path?.text ?? "",
              line: obj.data.line_number ?? 0,
              text: (obj.data.lines?.text ?? "").replace(/\n$/, ""),
            });
          }
        } catch { /* skip malformed lines */ }
      }

      // Group by file
      const grouped: Record<string, Array<{ line: number; text: string }>> = {};
      for (const m of matches) {
        const rel = m.path.startsWith("./") ? m.path.slice(2) : m.path;
        if (!grouped[rel]) grouped[rel] = [];
        grouped[rel].push({ line: m.line, text: m.text });
      }

      const results = Object.entries(grouped).slice(0, maxResults).map(([file, lines]) => ({
        file,
        matches: lines,
      }));

      const matchCount = matches.length;
      return c.json({ results, matchCount });

    } catch {
      // ripgrep not available -- fallback to manual search
    }

    // Fallback: recursive file search
    const SEARCH_EXTS = new Set([
      "ts", "tsx", "js", "jsx", "mjs", "cjs",
      "py", "go", "rs", "rb", "java", "c", "cpp", "h", "cs",
      "swift", "kt", "sh", "bash", "sql", "json", "yaml", "yml",
      "toml", "md", "txt", "css", "scss", "html", "xml", "vue", "svelte",
    ]);

    interface SearchResult {
      file: string;
      matches: Array<{ line: number; text: string }>;
    }

    const results: SearchResult[] = [];
    let matchCount = 0;

    async function searchDir(dir: string, depth: number): Promise<void> {
      if (depth > 5 || results.length >= maxResults) return;
      let entries: string[];
      try { entries = await readdir(dir); } catch { return; }

      for (const name of entries) {
        if (results.length >= maxResults) break;
        if (name.startsWith(".")) continue;
        if (IGNORED.has(name)) continue;

        const fullPath = join(dir, name);
        let s;
        try { s = await stat(fullPath); } catch { continue; }

        if (s.isDirectory()) {
          await searchDir(fullPath, depth + 1);
        } else if (s.isFile() && s.size < 1_000_000) {
          const ext = extname(name).slice(1).toLowerCase();
          if (!SEARCH_EXTS.has(ext)) continue;
          if (globPattern) {
            // Simple glob match: *.ext
            const globExt = globPattern.replace("*.", "");
            if (ext !== globExt) continue;
          }
          try {
            const content = await readFile(fullPath, "utf-8");
            const lines = content.split("\n");
            const fileMatches: Array<{ line: number; text: string }> = [];
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(q)) {
                fileMatches.push({ line: i + 1, text: lines[i] });
                matchCount++;
              }
            }
            if (fileMatches.length > 0) {
              results.push({ file: relative(projectDir, fullPath), matches: fileMatches });
            }
          } catch { /* skip unreadable files */ }
        }
      }
    }

    await searchDir(projectDir, 0);
    return c.json({ results, matchCount });
  });

  // GET /api/files/impact?branch=<branch>&base=<base>
  // Returns changed files + downstream files that import them
  app.get("/impact", (c) => {
    const branch = c.req.query("branch");
    if (!branch) return c.json({ error: "branch query param required" }, 400);
    const base = c.req.query("base") ?? "HEAD";
    // Reject values starting with - to prevent flag injection in git commands
    if (branch.startsWith("-") || base.startsWith("-")) return c.json({ error: "invalid ref name" }, 400);
    const report = analyzeImpact(projectDir, branch, base);
    return c.json(report);
  });

  // GET /api/files/symbols?path=<filepath>
  // Extracts function/class/const/interface/type names via regex
  app.get("/symbols", async (c) => {
    const relPath = c.req.query("path");
    if (!relPath) return c.json({ error: "path required" }, 400);
    const fullPath = join(projectDir, relPath);
    if (!fullPath.startsWith(projectDir + "/") && fullPath !== projectDir) return c.json({ error: "forbidden" }, 403);

    try {
      const content = await readFile(fullPath, "utf-8");
      const lines = content.split("\n");

      interface Symbol {
        name: string;
        kind: "function" | "class" | "const" | "interface" | "type" | "method" | "variable";
        line: number;
      }

      const symbols: Symbol[] = [];

      const patterns: Array<{ re: RegExp; kind: Symbol["kind"] }> = [
        // function declarations: function foo(, async function foo(, export function foo(
        { re: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/, kind: "function" },
        // arrow/const functions: const foo = (, export const foo = (
        { re: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/, kind: "function" },
        // arrow/const assigned to arrow: const foo = async? (...) =>
        { re: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>/, kind: "function" },
        // class declarations
        { re: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/, kind: "class" },
        // interface declarations
        { re: /^(?:export\s+)?interface\s+(\w+)/, kind: "interface" },
        // type declarations
        { re: /^(?:export\s+)?type\s+(\w+)\s*[=<]/, kind: "type" },
        // const/let/var non-function
        { re: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[=:]/, kind: "const" },
        // class methods
        { re: /^\s+(?:(?:public|private|protected|static|async|readonly)\s+)*(\w+)\s*\(/, kind: "method" },
        // Python: def foo(, class Foo:
        { re: /^(?:async\s+)?def\s+(\w+)\s*\(/, kind: "function" },
        { re: /^class\s+(\w+)\s*[:(]/, kind: "class" },
        // Go: func Foo(, func (r Receiver) Foo(
        { re: /^func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(/, kind: "function" },
        // Rust: fn foo(, pub fn foo(, struct Foo, trait Foo
        { re: /^(?:pub\s+)?fn\s+(\w+)/, kind: "function" },
        { re: /^(?:pub\s+)?struct\s+(\w+)/, kind: "class" },
        { re: /^(?:pub\s+)?trait\s+(\w+)/, kind: "interface" },
      ];

      const skipNames = new Set([
        "if", "else", "for", "while", "switch", "case", "return",
        "break", "continue", "try", "catch", "throw", "new",
        "get", "set", "of", "in", "do", "it", "to",
      ]);

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trimStart();
        if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("#")) continue;

        for (const { re, kind } of patterns) {
          const m = trimmed.match(re);
          if (m && m[1] && m[1].length > 1 && !skipNames.has(m[1])) {
            // Avoid duplicate const entries for functions already captured
            if (kind === "const") {
              const already = symbols.some(s => s.name === m[1] && s.line === i + 1);
              if (already) break;
            }
            symbols.push({ name: m[1], kind, line: i + 1 });
            break;
          }
        }
      }

      return c.json({ symbols });
    } catch {
      return c.json({ symbols: [] });
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
    // Validate hash is a hex string (short or full SHA)
    if (!/^[0-9a-fA-F]{4,40}$/.test(hash)) return c.json({ error: "invalid hash" }, 400);
    // Validate file path stays within project
    if (!safePath(file)) return c.json({ error: "forbidden" }, 403);
    try {
      const { stdout } = await execAsync(
        "git",
        ["show", "--format=", hash, "--", file],
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
    const name = body.name?.trim();
    if (!name) return c.json({ error: "Branch name required" }, 400);
    if (name.startsWith("-")) return c.json({ error: "Invalid branch name" }, 400);
    try {
      await execAsync("git", ["checkout", "-b", "--", name], { cwd: projectDir });
      return c.json({ ok: true, branch: name });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.post("/git/checkout", async (c) => {
    const body = await c.req.json<{ branch: string }>().catch(() => ({ branch: "" }));
    const branch = body.branch?.trim();
    if (!branch) return c.json({ error: "branch required" }, 400);
    if (branch.startsWith("-")) return c.json({ error: "Invalid branch name" }, 400);
    try {
      await execAsync("git", ["checkout", "--", branch], { cwd: projectDir });
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  // Check if `gh` CLI is installed and authenticated
  app.get("/git/gh-available", async (c) => {
    try {
      await execAsync("which", ["gh"]);
      // Also verify auth -- gh auth status exits 0 when logged in
      await execAsync("gh", ["auth", "status"], { cwd: projectDir });
      return c.json({ available: true });
    } catch {
      return c.json({ available: false });
    }
  });

  // Create a pull request via `gh pr create`
  app.post("/git/create-pr", async (c) => {
    const body = await c.req.json<{ title: string; body?: string; base?: string }>()
      .catch(() => ({ title: "", body: undefined, base: undefined }));
    if (!body.title?.trim()) return c.json({ error: "Title is required" }, 400);
    try {
      const args = ["pr", "create", "--title", body.title.trim()];
      if (body.body?.trim()) {
        args.push("--body", body.body.trim());
      } else {
        args.push("--body", "");
      }
      if (body.base?.trim()) {
        args.push("--base", body.base.trim());
      }
      const { stdout } = await execAsync("gh", args, { cwd: projectDir, timeout: 30000 });
      const url = stdout.trim();
      return c.json({ ok: true, url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stderrMatch = msg.match(/stderr:\s*([\s\S]*)/);
      return c.json({ error: stderrMatch ? stderrMatch[1].trim() : msg }, 500);
    }
  });

  // Outgoing (unpushed) commits
  app.get("/git/outgoing", async (c) => {
    try {
      const { stdout: branchRaw } = await execAsync(
        "git", ["rev-parse", "--abbrev-ref", "HEAD"],
        { cwd: projectDir }
      );
      const branch = branchRaw.trim();

      // Check if upstream exists
      try {
        await execAsync("git", ["rev-parse", "--abbrev-ref", `${branch}@{u}`], { cwd: projectDir });
      } catch {
        return c.json({ commits: [], count: 0 });
      }

      const { stdout } = await execAsync(
        "git",
        ["log", `origin/${branch}..HEAD`, "--format=%h|%s|%ai", "--", "."],
        { cwd: projectDir, maxBuffer: 2 * 1024 * 1024 }
      );

      const commits = stdout.trim().split("\n").filter(Boolean).map((line) => {
        const [hash, message, date] = line.split("|");
        return { hash, message, date };
      });

      return c.json({ commits, count: commits.length });
    } catch {
      return c.json({ commits: [], count: 0 });
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
