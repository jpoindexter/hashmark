/**
 * /api/mcp — MCP server configuration discovery and testing
 */

import { Hono } from "hono";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { tmpdir, homedir } from "os";
import { spawn } from "child_process";

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

export function mcpRoutes(projectDir: string) {
  const app = new Hono();

  // GET /api/mcp/config — returns detected MCP sources and merged config
  app.get("/config", (c) => {
    const projectMcpPath = join(projectDir, ".mcp.json");
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
    const projectMcpPath = join(projectDir, ".mcp.json");
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
          cwd: projectDir,
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

  return app;
}
