/**
 * /api/agents — read .claude/agents/ directory
 */

import { Hono } from "hono";
import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync } from "fs";
import { join, relative } from "path";
import { getDb } from "../db.js";

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

// ─── Agent router ─────────────────────────────────────────────────────────────

// File extension to domain keywords for bonus scoring
const EXT_DOMAIN_KEYWORDS: Record<string, string[]> = {
  ts:   ["typescript", "ts", "type", "interface", "generic"],
  tsx:  ["react", "component", "tsx", "frontend", "ui", "jsx"],
  js:   ["javascript", "js", "node", "script"],
  jsx:  ["react", "component", "frontend", "ui", "jsx"],
  py:   ["python", "py", "script", "data", "ml", "machine learning"],
  go:   ["go", "golang", "backend", "server", "api"],
  rs:   ["rust", "rs", "performance", "systems"],
  css:  ["css", "style", "design", "frontend", "ui"],
  scss: ["css", "scss", "style", "design", "frontend"],
  sql:  ["sql", "database", "db", "query", "postgres", "mysql"],
  md:   ["docs", "documentation", "markdown", "readme"],
  json: ["config", "configuration", "json"],
  yaml: ["config", "configuration", "yaml", "yml", "devops", "ci", "cd"],
  yml:  ["config", "configuration", "yaml", "yml", "devops", "ci", "cd"],
  sh:   ["shell", "bash", "script", "devops", "cli"],
};

function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
}

function scoreAgent(agent: AgentFile, queryWords: string[], fileExt?: string): { score: number; matches: string[] } {
  const agentText = `${agent.name} ${agent.description} ${agent.content.slice(0, 500)}`;
  const agentKeywords = extractKeywords(agentText);

  const matches: string[] = [];
  for (const word of queryWords) {
    if (agentKeywords.has(word)) matches.push(word);
  }

  let score = queryWords.length > 0 ? matches.length / queryWords.length : 0;

  // Bonus for file extension domain match
  if (fileExt) {
    const domainWords = EXT_DOMAIN_KEYWORDS[fileExt.toLowerCase()] ?? [];
    const domainMatches = domainWords.filter(w => agentKeywords.has(w));
    if (domainMatches.length > 0) {
      score = Math.min(1, score + 0.15 * domainMatches.length);
    }
  }

  return { score, matches };
}

// ─── Effectiveness helpers ────────────────────────────────────────────────────

interface WorkerRow {
  agent_id: string;
  status: string;
  output: string;
  completed_at: number | null;
}

interface EffectivenessResult {
  agentId: string;
  totalRuns: number;
  successRate: number;
  recentTrend: "improving" | "stable" | "degrading" | "insufficient_data";
  recentSuccessRate: number;
  avgOutputLength: number;
  lastRun: number | null;
}

function computeEffectiveness(agentId: string, rows: WorkerRow[]): EffectivenessResult {
  const total = rows.length;
  if (total === 0) {
    return { agentId, totalRuns: 0, successRate: 0, recentTrend: "insufficient_data", recentSuccessRate: 0, avgOutputLength: 0, lastRun: null };
  }

  const successful = rows.filter(r => r.status === "done").length;
  const successRate = successful / total;

  // Recent trend: last 3 vs previous 3
  const recent = rows.slice(0, 3);
  const prior = rows.slice(3, 6);

  let recentTrend: EffectivenessResult["recentTrend"] = "insufficient_data";
  let recentSuccessRate = recent.filter(r => r.status === "done").length / recent.length;

  if (recent.length >= 3 && prior.length >= 3) {
    const recentRate = recent.filter(r => r.status === "done").length / recent.length;
    const priorRate = prior.filter(r => r.status === "done").length / prior.length;
    const delta = recentRate - priorRate;
    recentTrend = delta > 0.15 ? "improving" : delta < -0.15 ? "degrading" : "stable";
    recentSuccessRate = recentRate;
  }

  const doneRows = rows.filter(r => r.status === "done");
  const avgOutputLength = doneRows.length > 0
    ? Math.round(doneRows.reduce((sum, r) => sum + (r.output?.length ?? 0), 0) / doneRows.length)
    : 0;

  const lastRun = rows[0]?.completed_at ?? null;

  return { agentId, totalRuns: total, successRate, recentTrend, recentSuccessRate, avgOutputLength, lastRun };
}

export function agentsRoutes(projectDir: string) {
  const app = new Hono();
  const dataDir = `${projectDir}/.hashmark`;

  // GET /api/agents/route?q=<message>&file=<optional-path>
  app.get("/route", (c) => {
    const q = c.req.query("q") ?? "";
    const file = c.req.query("file") ?? "";
    const fileExt = file ? file.split(".").pop() : undefined;

    const agents = readAgentsDir(projectDir);
    if (agents.length === 0) return c.json({ suggestions: [] });

    const queryWords = Array.from(extractKeywords(q)).filter(w => w.length > 2);
    if (queryWords.length === 0) return c.json({ suggestions: [] });

    const scored = agents
      .map(agent => {
        const { score, matches } = scoreAgent(agent, queryWords, fileExt);
        return { agent, score, matches };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const suggestions = scored.map(({ agent, score, matches }) => ({
      id: agent.id,
      name: agent.name || agent.id,
      description: agent.description,
      score: Math.round(score * 100) / 100,
      reason: matches.length > 0 ? `matches: ${matches.slice(0, 4).join(", ")}` : "",
    }));

    return c.json({ suggestions });
  });

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

  // POST /api/agents — create a new agent file
  app.post("/", async (c) => {
    const body = await c.req.json<{ name: string; description: string; department: string; content: string }>();
    if (!body.name?.trim()) return c.json({ error: "name required" }, 400);

    const dept = body.department?.trim() || "general";
    const slug = body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const agentsDir = join(projectDir, ".claude", "agents", dept);

    // mkdir -p equivalent
    const { mkdirSync } = await import("fs");
    try { mkdirSync(agentsDir, { recursive: true }); } catch {}

    const filePath = join(agentsDir, `${slug}.md`);
    const content = body.content ?? `---\nname: ${body.name.trim()}\ndescription: ${body.description?.trim() ?? ""}\n---\n`;
    writeFileSync(filePath, content, "utf-8");

    const relativePath = `${dept}/${slug}.md`;
    const agent: AgentFile = {
      id: `${dept}-${slug}`,
      name: body.name.trim(),
      description: body.description?.trim() ?? "",
      department: dept,
      path: relativePath,
      content,
    };
    return c.json({ agent }, 201);
  });

  // GET /api/agents/effectiveness — all agents' stats
  app.get("/effectiveness", (c) => {
    try {
      const db = getDb(dataDir);
      const rows = db.prepare(
        "SELECT agent_id, status, output, completed_at FROM swarm_workers WHERE completed_at IS NOT NULL ORDER BY completed_at DESC"
      ).all() as WorkerRow[];

      const byAgent = new Map<string, WorkerRow[]>();
      for (const row of rows) {
        if (!byAgent.has(row.agent_id)) byAgent.set(row.agent_id, []);
        byAgent.get(row.agent_id)!.push(row);
      }

      const stats = Array.from(byAgent.entries()).map(([agentId, agentRows]) =>
        computeEffectiveness(agentId, agentRows)
      );
      return c.json({ stats });
    } catch {
      return c.json({ stats: [] });
    }
  });

  // GET /api/agents/:id/effectiveness — single agent stats
  app.get("/:id/effectiveness", (c) => {
    const id = c.req.param("id");
    try {
      const db = getDb(dataDir);
      const rows = db.prepare(
        "SELECT agent_id, status, output, completed_at FROM swarm_workers WHERE agent_id = ? AND completed_at IS NOT NULL ORDER BY completed_at DESC"
      ).all(id) as WorkerRow[];
      return c.json(computeEffectiveness(id, rows));
    } catch {
      return c.json(computeEffectiveness(id, []));
    }
  });

  // GET /api/agents/:id — get single agent
  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const agents = readAgentsDir(projectDir);
    const agent = agents.find((a) => a.id === id);
    if (!agent) return c.json({ error: "Not found" }, 404);
    return c.json({ agent });
  });

  // DELETE /api/agents/:id — remove agent file
  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const agentsDir = join(projectDir, ".claude", "agents");
    const agents = readAgentsDir(projectDir);
    const agent = agents.find((a) => a.id === id);
    if (!agent) return c.json({ error: "Not found" }, 404);
    const fullPath = join(agentsDir, agent.path);
    try {
      unlinkSync(fullPath);
    } catch {
      return c.json({ error: "Failed to delete agent file" }, 500);
    }
    return c.json({ ok: true });
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
