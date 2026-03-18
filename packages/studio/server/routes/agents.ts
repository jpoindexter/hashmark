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

// ---------------------------------------------------------------------------
// Security scanner (#49 + #59)
// ---------------------------------------------------------------------------

export interface SecurityFinding {
  agentId: string;
  agentName: string;
  severity: "critical" | "high" | "medium";
  category: "secret" | "tracking" | "prompt-injection" | "exfiltration";
  message: string;
  line: number;
  snippet: string;
}

const SECURITY_PATTERNS: Array<{
  re: RegExp;
  severity: SecurityFinding["severity"];
  category: SecurityFinding["category"];
  message: string;
}> = [
  // Secrets
  { re: /sk-[A-Za-z0-9]{20,}/, severity: "critical", category: "secret", message: "OpenAI API key detected" },
  { re: /ghp_[A-Za-z0-9]{36}/, severity: "critical", category: "secret", message: "GitHub personal access token detected" },
  { re: /AKIA[0-9A-Z]{16}/, severity: "critical", category: "secret", message: "AWS access key detected" },
  { re: /Bearer\s+[A-Za-z0-9._\-]{20,}/, severity: "high", category: "secret", message: "Bearer token detected" },
  { re: /api[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9._\-]{10,}/i, severity: "high", category: "secret", message: "API key assignment detected" },
  { re: /password\s*[:=]\s*['"]?[^\s'"]{6,}/i, severity: "high", category: "secret", message: "Password detected" },
  // Tracking endpoints
  { re: /https?:\/\/[^\s]*(?:analytics|tracking|telemetry|beacon|pixel|collect|mixpanel|amplitude|segment\.io|heap\.io|fullstory|hotjar)[^\s]*/i, severity: "high", category: "tracking", message: "Tracking/analytics endpoint detected" },
  { re: /https?:\/\/[^\s]*(?:google-analytics|googletagmanager|doubleclick)[^\s]*/i, severity: "medium", category: "tracking", message: "Google tracking endpoint detected" },
  // Prompt injection
  { re: /ignore\s+(all\s+)?(?:previous|your|prior)\s+(?:instructions?|directives?|rules?|context)/i, severity: "critical", category: "prompt-injection", message: "Prompt injection: ignore-instructions pattern" },
  { re: /forget\s+(?:your|all|the)\s+(?:instructions?|context|training|rules?)/i, severity: "critical", category: "prompt-injection", message: "Prompt injection: forget-instructions pattern" },
  { re: /(?:you are now|pretend (?:to be|you are|you're)|act as (?:an? )?[a-z]+ with no restrictions)/i, severity: "critical", category: "prompt-injection", message: "Prompt injection: persona override pattern" },
  { re: /disregard\s+(?:your|all|any|the)\s+(?:instructions?|rules?|training|guidelines?)/i, severity: "critical", category: "prompt-injection", message: "Prompt injection: disregard-rules pattern" },
  { re: /\u200b|\u200c|\u200d|\ufeff/, severity: "high", category: "prompt-injection", message: "Hidden unicode character (zero-width) detected" },
  { re: /<\/?script[\s>]/, severity: "high", category: "prompt-injection", message: "Script tag detected in agent definition" },
  { re: /javascript\s*:[^\s]/, severity: "high", category: "prompt-injection", message: "JavaScript URL scheme detected" },
  // Data exfiltration
  { re: /(?:send|post|upload|exfiltrate)\s+(?:data|results?|output|response)\s+to\s+https?:\/\//i, severity: "critical", category: "exfiltration", message: "Potential data exfiltration instruction" },
  { re: /curl\s+-[a-zA-Z]*X\s+POST\s+https?:\/\/[^\s]+\s+-d/i, severity: "high", category: "exfiltration", message: "curl POST to external URL detected" },
];

export function scanAgentSecurity(agents: AgentFile[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const agent of agents) {
    const lines = agent.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of SECURITY_PATTERNS) {
        if (pattern.re.test(line)) {
          findings.push({
            agentId: agent.id,
            agentName: agent.name || agent.id,
            severity: pattern.severity,
            category: pattern.category,
            message: pattern.message,
            line: i + 1,
            snippet: line.trim().slice(0, 80),
          });
        }
      }
    }
  }

  return findings;
}

export function agentsRoutes(projectDir: string) {
  const app = new Hono();

  // GET /api/agents/security-scan — scan all agents for security issues
  app.get("/security-scan", (c) => {
    const agents = readAgentsDir(projectDir);
    const findings = scanAgentSecurity(agents);
    return c.json({ findings, scannedAt: Date.now(), agentCount: agents.length });
  });

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
