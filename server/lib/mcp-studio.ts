/**
 * Generates MCP config for Studio's tool server.
 * Creates a temp JSON file that Claude CLI consumes via --mcp-config.
 * The config spawns a Node.js bridge process that proxies tool calls
 * to Studio's HTTP endpoints.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";
import { createHash } from "crypto";
import { generateBridgeScript } from "./mcp-bridge.js";

interface McpServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

/**
 * Build a merged MCP config: user's existing servers + Studio's bridge server.
 * Returns the path to a temp JSON file ready for --mcp-config.
 */
export function createStudioMcpConfig(
  projectDir: string,
  port: number
): string {
  const bridgeScript = generateBridgeScript(port, projectDir);
  const configDir = join(tmpdir(), "hashmark-studio-mcp");
  mkdirSync(configDir, { recursive: true });

  // Write the bridge script to a temp file so `node` can execute it
  const scriptPath = join(configDir, `bridge-${port}.js`);
  writeFileSync(scriptPath, bridgeScript, "utf-8");

  // Collect user MCP servers from project and global configs
  const userServers = collectUserMcpServers(projectDir);

  const config: McpConfig = {
    mcpServers: {
      ...userServers,
      "hashmark-studio": {
        command: "node",
        args: [scriptPath],
      },
    },
  };

  const content = JSON.stringify(config, null, 2);
  const hash = createHash("md5").update(content).digest("hex").slice(0, 12);
  const configPath = join(configDir, `mcp-config-${hash}.json`);

  // Only write if content changed (avoids unnecessary FS churn)
  if (!existsSync(configPath)) {
    writeFileSync(configPath, content, "utf-8");
  }

  return configPath;
}

/**
 * Reads user MCP servers from .mcp.json and global claude config.
 * Project-level servers override global ones with the same name.
 */
function collectUserMcpServers(
  projectDir: string
): Record<string, McpServerEntry> {
  const merged: Record<string, McpServerEntry> = {};

  const candidates = [
    join(homedir(), ".claude", "claude_desktop_config.json"),
    join(projectDir, ".mcp.json"),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as { mcpServers?: Record<string, McpServerEntry> };
      if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
        for (const [name, entry] of Object.entries(parsed.mcpServers)) {
          merged[name] = entry;
        }
      }
    } catch {
      // Malformed JSON -- skip
    }
  }

  return merged;
}
