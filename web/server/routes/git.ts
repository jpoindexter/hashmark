import { Hono } from "hono";
import { resolve, relative, join } from "path";
import { execSync } from "child_process";

function runGit(args: string[], cwd: string): string {
  return execSync(`git ${args.join(" ")}`, { cwd, timeout: 10000, encoding: "utf-8" });
}

function isGitRepo(cwd: string): boolean {
  try {
    runGit(["rev-parse", "--is-inside-work-tree"], cwd);
    return true;
  } catch {
    return false;
  }
}

function sanitizeFilePath(file: string, projectDir: string): string | null {
  if (!file) return null;
  // Reject traversal attempts
  if (file.includes("..")) return null;
  const abs = file.startsWith("/") ? file : join(projectDir, file);
  const resolved = resolve(abs);
  if (!resolved.startsWith(projectDir)) return null;
  return resolved;
}

export function registerGitRoutes(app: Hono, ctx: { dataDir: string; projectDir: string }) {
  const { projectDir: PROJECT_DIR } = ctx;

  // GET /api/git/status
  app.get("/api/git/status", (c) => {
    if (!isGitRepo(PROJECT_DIR)) return c.json({ error: "not a git repo" });

    try {
      const porcelain = runGit(["status", "--porcelain"], PROJECT_DIR);
      const files: { path: string; status: "M" | "A" | "D" | "R" | "??" }[] = [];

      for (const line of porcelain.split("\n").filter(Boolean)) {
        const xy = line.slice(0, 2);
        const filePart = line.slice(3);
        // Rename: "R old -> new" — take the new path
        const path = xy.startsWith("R") ? (filePart.split(" -> ")[1] ?? filePart) : filePart;
        let status: "M" | "A" | "D" | "R" | "??" = "M";
        if (xy === "??") status = "??";
        else if (xy[0] === "R" || xy[1] === "R") status = "R";
        else if (xy[0] === "A" || xy[1] === "A") status = "A";
        else if (xy[0] === "D" || xy[1] === "D") status = "D";
        else status = "M";
        files.push({ path: path.trim(), status });
      }

      // Branch
      let branch = "HEAD";
      try {
        branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], PROJECT_DIR).trim();
      } catch {}

      // Ahead/behind
      let ahead = 0;
      let behind = 0;
      try {
        const ab = runGit(["rev-list", "--left-right", "--count", `${branch}@{upstream}...${branch}`], PROJECT_DIR).trim();
        const [b, a] = ab.split("\t").map(Number);
        behind = b ?? 0;
        ahead = a ?? 0;
      } catch {}

      return c.json({ files, branch, ahead, behind });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  });

  // GET /api/git/log?limit=20
  app.get("/api/git/log", (c) => {
    if (!isGitRepo(PROJECT_DIR)) return c.json({ error: "not a git repo" });

    const limit = Math.min(Math.max(1, Number(c.req.query("limit") ?? 20)), 100);

    try {
      // Use a safe separator that won't appear in normal commit messages
      const SEP = "\x1f";
      const raw = runGit(
        ["log", `--max-count=${limit}`, `--format=%H${SEP}%s${SEP}%an${SEP}%aI`],
        PROJECT_DIR
      );

      const commits = raw
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(SEP);
          return {
            hash: (parts[0] ?? "").slice(0, 8),
            message: parts[1] ?? "",
            author: parts[2] ?? "",
            date: parts[3] ?? "",
          };
        });

      return c.json({ commits });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  });

  // GET /api/git/blame?file=path
  app.get("/api/git/blame", (c) => {
    if (!isGitRepo(PROJECT_DIR)) return c.json({ error: "not a git repo" });

    const fileParam = c.req.query("file") ?? "";
    const absFile = sanitizeFilePath(fileParam, PROJECT_DIR);
    if (!absFile) return c.json({ error: "invalid file path" }, 400);

    const relFile = relative(PROJECT_DIR, absFile);

    try {
      const raw = runGit(["blame", "--porcelain", relFile], PROJECT_DIR);

      type BlameLine = {
        lineNum: number;
        content: string;
        hash: string;
        author: string;
        date: string;
        summary: string;
      };

      const lines: BlameLine[] = [];
      const commitCache = new Map<string, { author: string; date: string; summary: string }>();

      let currentHash = "";
      let currentAuthor = "";
      let currentDate = "";
      let currentSummary = "";
      let lineNum = 0;

      for (const line of raw.split("\n")) {
        // Commit header: 40-char hash followed by line numbers
        if (/^[0-9a-f]{40} /.test(line)) {
          currentHash = line.slice(0, 40);
          const cached = commitCache.get(currentHash);
          if (cached) {
            currentAuthor = cached.author;
            currentDate = cached.date;
            currentSummary = cached.summary;
          } else {
            currentAuthor = "";
            currentDate = "";
            currentSummary = "";
          }
          const parts = line.split(" ");
          lineNum = Number(parts[2] ?? parts[1] ?? 0);
          continue;
        }
        if (line.startsWith("author ")) { currentAuthor = line.slice(7); continue; }
        if (line.startsWith("author-time ")) {
          currentDate = new Date(Number(line.slice(12)) * 1000).toISOString();
          continue;
        }
        if (line.startsWith("summary ")) { currentSummary = line.slice(8); continue; }
        if (line.startsWith("\t")) {
          commitCache.set(currentHash, { author: currentAuthor, date: currentDate, summary: currentSummary });
          lines.push({
            lineNum,
            content: line.slice(1),
            hash: currentHash.slice(0, 8),
            author: currentAuthor,
            date: currentDate,
            summary: currentSummary,
          });
        }
      }

      return c.json({ lines });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  });

  // GET /api/git/diff?file=path
  app.get("/api/git/diff", (c) => {
    if (!isGitRepo(PROJECT_DIR)) return c.json({ error: "not a git repo" });

    const fileParam = c.req.query("file") ?? "";
    const absFile = sanitizeFilePath(fileParam, PROJECT_DIR);
    if (!absFile) return c.json({ error: "invalid file path" }, 400);

    const relFile = relative(PROJECT_DIR, absFile);

    try {
      // staged + unstaged combined
      let diff = "";
      try {
        diff += runGit(["diff", "HEAD", "--", relFile], PROJECT_DIR);
      } catch {
        // fallback: untracked/new file — show all content as added
        try {
          diff += runGit(["diff", "--cached", "--", relFile], PROJECT_DIR);
        } catch {}
      }
      return c.json({ diff });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  });
}
