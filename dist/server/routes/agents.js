// server/routes/agents.ts
import { Hono } from "hono";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "fs";
import { join, relative } from "path";
function parseAgentMd(content, filePath) {
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
  const parts = filePath.split("/");
  const department = parts.length >= 2 ? parts[parts.length - 2] : "general";
  return { name, description, department, content };
}
function readAgentsDir(projectDir) {
  const agentsDir = join(projectDir, ".claude", "agents");
  if (!existsSync(agentsDir)) return [];
  const agents = [];
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
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
            ...parsed
          });
        } catch {
        }
      }
    }
  }
  walk(agentsDir);
  return agents;
}
function agentsRoutes(projectDir) {
  const app = new Hono();
  app.get("/", (c) => {
    const agents = readAgentsDir(projectDir);
    return c.json({ agents });
  });
  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const agents = readAgentsDir(projectDir);
    const agent = agents.find((a) => a.id === id);
    if (!agent) return c.json({ error: "Not found" }, 404);
    return c.json({ agent });
  });
  app.put("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const agentsDir = join(projectDir, ".claude", "agents");
    const segments = id.split("-");
    const agents = readAgentsDir(projectDir);
    const agent = agents.find((a) => a.id === id);
    if (!agent) return c.json({ error: "Not found" }, 404);
    const fullPath = join(agentsDir, agent.path);
    writeFileSync(fullPath, body.content, "utf-8");
    return c.json({ ok: true });
  });
  return app;
}
export {
  agentsRoutes
};
