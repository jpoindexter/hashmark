/**
 * /api/mcp — MCP server configuration discovery, testing, and tool endpoints.
 * Tool endpoints (/tools/*) are consumed by the MCP bridge process to serve
 * GetWorkspaceDiff, GetTerminalOutput, and GetFileContent to the Claude agent.
 */

import { Hono } from "hono";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import { tmpdir, homedir } from "os";
import { spawn, execFile as execFileCb } from "child_process";
import { promisify } from "util";

import type { WorkspaceCtx } from "./workspaces.js";

const execFile = promisify(execFileCb);

interface McpServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>;
}

interface McpSource {
  path: string;
  exists: boolean;
  serverCount: number;
  label: string;
}

function readMcpFile(filePath: string): McpConfig | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as McpConfig;
    if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function mcpRoutes(ctx: WorkspaceCtx) {
  const app = new Hono();

  // GET /api/mcp/config — returns detected MCP sources and merged config
  app.get("/config", (c) => {
    const projectMcpPath = join(ctx.projectDir, ".mcp.json");
    const globalMcpPath = join(homedir(), ".claude", "claude_desktop_config.json");

    const projectConfig = readMcpFile(projectMcpPath);
    const globalConfig = readMcpFile(globalMcpPath);

    const sources: McpSource[] = [
      {
        path: projectMcpPath,
        exists: projectConfig !== null,
        serverCount: projectConfig?.mcpServers ? Object.keys(projectConfig.mcpServers).length : 0,
        label: "Project (.mcp.json)",
      },
      {
        path: globalMcpPath,
        exists: globalConfig !== null,
        serverCount: globalConfig?.mcpServers ? Object.keys(globalConfig.mcpServers).length : 0,
        label: "Global (claude_desktop_config.json)",
      },
    ];

    // Merge: project overrides global
    const merged: Record<string, { command: string; source: string }> = {};

    if (globalConfig?.mcpServers) {
      for (const [name, entry] of Object.entries(globalConfig.mcpServers)) {
        merged[name] = { command: entry.command, source: "global" };
      }
    }
    if (projectConfig?.mcpServers) {
      for (const [name, entry] of Object.entries(projectConfig.mcpServers)) {
        merged[name] = { command: entry.command, source: "project" };
      }
    }

    return c.json({ sources, servers: merged });
  });

  // POST /api/mcp/test — test connectivity to a specific MCP server
  app.post("/test", async (c) => {
    const body = await c.req.json<{ serverName: string }>();
    const { serverName } = body;

    if (!serverName) {
      return c.json({ ok: false, error: "serverName required" }, 400);
    }

    // Build a temp config with just the requested server
    const projectMcpPath = join(ctx.projectDir, ".mcp.json");
    const globalMcpPath = join(homedir(), ".claude", "claude_desktop_config.json");

    const projectConfig = readMcpFile(projectMcpPath);
    const globalConfig = readMcpFile(globalMcpPath);

    const serverEntry =
      projectConfig?.mcpServers?.[serverName] ??
      globalConfig?.mcpServers?.[serverName];

    if (!serverEntry) {
      return c.json({ ok: false, error: `Server "${serverName}" not found in any config` }, 404);
    }

    const testConfig = { mcpServers: { [serverName]: serverEntry } };
    const content = JSON.stringify(testConfig);
    const hash = createHash("md5").update(content).digest("hex");
    const tmpPath = join(tmpdir(), `studio-mcp-test-${hash}.json`);
    writeFileSync(tmpPath, content, "utf-8");

    return new Promise<Response>((resolve) => {
      const timeout = setTimeout(() => {
        proc.kill("SIGTERM");
        resolve(c.json({ ok: false, error: "Timeout after 10s" }));
      }, 10000);

      const proc = spawn(
        "claude",
        ["--mcp-config", tmpPath, "--print", "List available tools"],
        {
          cwd: ctx.projectDir,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env },
        }
      );

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on("close", (code: number | null) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve(c.json({ ok: true, output: stdout.slice(0, 2000) }));
        } else {
          resolve(c.json({ ok: false, error: stderr.slice(0, 1000) || `Exit code ${code}` }));
        }
      });

      proc.on("error", (err: Error) => {
        clearTimeout(timeout);
        resolve(c.json({ ok: false, error: err.message }));
      });
    });
  });

  // ── Tool endpoints (consumed by the MCP bridge and the Studio UI) ──

  // GET /api/mcp/tools/diff — workspace diff via git
  app.get("/tools/diff", async (c) => {
    const file = c.req.query("file");
    const stat = c.req.query("stat") === "true";
    const opts = { cwd: ctx.projectDir, maxBuffer: 4 * 1024 * 1024 };

    try {
      // Find merge base to show full branch diff (same approach as Conductor)
      let mergeBase = "";
      try {
        const { stdout: mb } = await execFile(
          "git", ["merge-base", "HEAD", "HEAD@{upstream}"], opts
        );
        mergeBase = mb.trim();
      } catch {
        // No upstream -- fall back to diffing against HEAD (uncommitted only)
        mergeBase = "HEAD";
      }

      const args = stat ? ["diff", "--stat"] : ["diff"];

      if (file) {
        args.push(mergeBase, "--", file);
      } else {
        args.push(mergeBase);
      }

      const { stdout: tracked } = await execFile("git", args, opts);

      // Also include untracked files as "new file" diffs
      let untracked = "";
      if (!file && !stat) {
        try {
          const { stdout: untrackedFiles } = await execFile(
            "git", ["ls-files", "--others", "--exclude-standard"], opts
          );
          const newFiles = untrackedFiles.trim().split("\n").filter(Boolean);
          for (const f of newFiles.slice(0, 20)) {
            try {
              const { stdout: content } = await execFile(
                "git", ["diff", "--no-index", "--", "/dev/null", f],
                { ...opts, env: { ...process.env } }
              );
              untracked += content;
            } catch (e: unknown) {
              // git diff --no-index exits 1 when files differ (expected)
              if (e && typeof e === "object" && "stdout" in e) {
                untracked += (e as { stdout: string }).stdout;
              }
            }
          }
        } catch { /* no untracked files */ }
      }

      const diff = (tracked + untracked).trim();
      return c.json({ diff: diff || "No changes detected" });
    } catch (err) {
      return c.json({ diff: "", error: String(err) }, 500);
    }
  });

  // GET /api/mcp/tools/terminal — recent terminal output
  app.get("/tools/terminal", async (c) => {
    const maxLines = parseInt(c.req.query("maxLines") ?? "100", 10);

    // Read from the run command output log if it exists
    const logPath = join(ctx.projectDir, ".hashmark", "terminal-output.log");
    try {
      if (existsSync(logPath)) {
        const raw = readFileSync(logPath, "utf-8");
        const lines = raw.split("\n");
        const tail = lines.slice(-maxLines).join("\n");
        return c.json({ output: tail, source: "log", lines: lines.length });
      }
    } catch { /* fall through */ }

    // Fallback: show recent git log as a proxy for "what happened"
    try {
      const { stdout } = await execFile(
        "git", ["log", "--oneline", "-20"],
        { cwd: ctx.projectDir }
      );
      return c.json({
        output: `No terminal output log found. Recent git activity:\n${stdout}`,
        source: "git-fallback",
      });
    } catch {
      return c.json({
        output: "No terminal output available. Terminal log not found at .hashmark/terminal-output.log",
        source: "none",
      });
    }
  });

  // GET /api/mcp/tools/file — read file content
  app.get("/tools/file", async (c) => {
    const relPath = c.req.query("path");
    if (!relPath) return c.json({ error: "path query parameter is required" }, 400);

    const fullPath = join(ctx.projectDir, relPath);

    // Prevent path traversal
    if (!fullPath.startsWith(ctx.projectDir + "/") && fullPath !== ctx.projectDir) {
      return c.json({ error: "path traversal blocked" }, 403);
    }

    try {
      const content = await readFile(fullPath, "utf-8");
      return c.json({ content, path: relPath });
    } catch {
      return c.json({ error: `File not found: ${relPath}` }, 404);
    }
  });

  return app;
}
