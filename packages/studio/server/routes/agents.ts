/**
 * /api/agents — read .claude/agents/ directory
 */

import { Hono } from "hono";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "fs";
import { join, relative } from "path";

export interface AgentFile {
  id: string;
  name: string;
  description: string;
  department: string;
  path: string;
  content: string;
}

function parseAgentMd(content: string, filePath: string): Omit<AgentFile, "id" | "path"> {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  let name = "";
  let description = "";

  if (frontmatterMatch) {
    const fm = frontmatterMatch[1];
    const nameMatch = fm.match(/^name:\s*(.+)$/m);
    const descMatch = fm.match(/^description:\s*(.+)$/m);
    name = nameMatch?.[1]?.trim() ?? "";
    description = descMatch?.[1]?.trim() ?? "";
  }

  // Infer department from path: .claude/agents/{dept}/{file}.md
  const parts = filePath.split("/");
  const department = parts.length >= 2 ? parts[parts.length - 2] : "general";

  return { name, description, department, content };
}

function readAgentsDir(projectDir: string): AgentFile[] {
  const agentsDir = join(projectDir, ".claude", "agents");
  if (!existsSync(agentsDir)) return [];

  const agents: AgentFile[] = [];

  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir, { withFileTypes: true } as Parameters<typeof readdirSync>[1] as never) as unknown as string[];
    } catch { return; }

    for (const entry of entries as unknown as import("fs").Dirent[]) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name));
      } else if (entry.name.endsWith(".md") && entry.name !== "INDEX.md") {
        const fullPath = join(dir, entry.name);
        const relativePath = relative(agentsDir, fullPath);
        try {
          const content = readFileSync(fullPath, "utf-8");
          const parsed = parseAgentMd(content, relativePath);
          agents.push({
            id: relativePath.replace(/\.md$/, "").replace(/\//g, "-"),
            path: relativePath,
            ...parsed,
          });
        } catch {}
      }
    }
  }

  walk(agentsDir);
  return agents;
}

export function agentsRoutes(projectDir: string) {
  const app = new Hono();

  // GET /api/agents — list all agents
  app.get("/", (c) => {
    const agents = readAgentsDir(projectDir);
    return c.json({ agents });
  });

  // GET /api/agents/:id — get single agent
  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const agents = readAgentsDir(projectDir);
    const agent = agents.find((a) => a.id === id);
    if (!agent) return c.json({ error: "Not found" }, 404);
    return c.json({ agent });
  });

  // PUT /api/agents/:id — update agent content
  app.put("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ content: string }>();
    const agentsDir = join(projectDir, ".claude", "agents");
    // Convert id back to path: engineering-frontend-developer → engineering/frontend-developer.md
    const segments = id.split("-");
    // Find the matching file
    const agents = readAgentsDir(projectDir);
    const agent = agents.find((a) => a.id === id);
    if (!agent) return c.json({ error: "Not found" }, 404);
    const fullPath = join(agentsDir, agent.path);
    writeFileSync(fullPath, body.content, "utf-8");
    return c.json({ ok: true });
  });

  return app;
}
