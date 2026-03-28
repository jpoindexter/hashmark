import "./chunk-MCKGQKYU.js";

// server/index.ts
import { Hono as Hono19 } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors";
import { readFileSync as readFileSync20, existsSync as existsSync21 } from "fs";
import { join as join27, basename as basename2 } from "path";
import { randomUUID as randomUUID8 } from "crypto";

// server/routes/agents.ts
import { Hono } from "hono";
import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync } from "fs";
import { join as join2, relative } from "path";

// server/db.ts
import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync } from "fs";
var _db = null;
function resetDb() {
  if (_db) {
    try {
      _db.close();
    } catch {
    }
    _db = null;
  }
}
function getDb(dataDir) {
  if (_db) return _db;
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, "studio.db");
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  migrate(_db);
  return _db;
}
function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Session',
      agent_id TEXT,
      agent_name TEXT,
      model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
      status TEXT NOT NULL DEFAULT 'idle',
      total_input_tokens INTEGER NOT NULL DEFAULT 0,
      total_output_tokens INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON session_messages(session_id, created_at);
  `);
  const sessionCols = db.pragma("table_info(sessions)").map((r) => r.name);
  if (!sessionCols.includes("archived")) {
    db.exec("ALTER TABLE sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");
  }
  if (!sessionCols.includes("claude_session_id")) {
    db.exec("ALTER TABLE sessions ADD COLUMN claude_session_id TEXT");
  }
  const msgCols = db.pragma("table_info(session_messages)").map((r) => r.name);
  if (!msgCols.includes("sent_at")) {
    db.exec("ALTER TABLE session_messages ADD COLUMN sent_at INTEGER");
    db.exec("UPDATE session_messages SET sent_at = created_at WHERE sent_at IS NULL AND role = 'user'");
  }
  db.exec(`

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'medium',
      agent_id TEXT,
      agent_name TEXT,
      assignee TEXT,
      run_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      issue_id TEXT REFERENCES issues(id) ON DELETE SET NULL,
      session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      agent_name TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS swarm_runs (
      id TEXT PRIMARY KEY,
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      worker_count INTEGER NOT NULL DEFAULT 0,
      merged_count INTEGER NOT NULL DEFAULT 0,
      conflict_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS swarm_workers (
      run_id TEXT NOT NULL REFERENCES swarm_runs(id) ON DELETE CASCADE,
      worker_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      output TEXT NOT NULL DEFAULT '',
      error TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      PRIMARY KEY (run_id, worker_id)
    );

    CREATE TABLE IF NOT EXISTS governance_policies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      scope TEXT NOT NULL DEFAULT 'all',
      rules TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      agent_id TEXT,
      action_type TEXT NOT NULL,
      target TEXT,
      outcome TEXT NOT NULL DEFAULT 'allowed',
      policy_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      last_opened INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// server/routes/agents.ts
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
  const agentsDir = join2(projectDir, ".claude", "agents");
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
        walk(join2(dir, entry.name));
      } else if (entry.name.endsWith(".md") && entry.name !== "INDEX.md") {
        const fullPath = join2(dir, entry.name);
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
var SECURITY_PATTERNS = [
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
  { re: /curl\s+-[a-zA-Z]*X\s+POST\s+https?:\/\/[^\s]+\s+-d/i, severity: "high", category: "exfiltration", message: "curl POST to external URL detected" }
];
function scanAgentSecurity(agents) {
  const findings = [];
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
            snippet: line.trim().slice(0, 80)
          });
        }
      }
    }
  }
  return findings;
}
var EXT_DOMAIN_KEYWORDS = {
  ts: ["typescript", "ts", "type", "interface", "generic"],
  tsx: ["react", "component", "tsx", "frontend", "ui", "jsx"],
  js: ["javascript", "js", "node", "script"],
  jsx: ["react", "component", "frontend", "ui", "jsx"],
  py: ["python", "py", "script", "data", "ml", "machine learning"],
  go: ["go", "golang", "backend", "server", "api"],
  rs: ["rust", "rs", "performance", "systems"],
  css: ["css", "style", "design", "frontend", "ui"],
  scss: ["css", "scss", "style", "design", "frontend"],
  sql: ["sql", "database", "db", "query", "postgres", "mysql"],
  md: ["docs", "documentation", "markdown", "readme"],
  json: ["config", "configuration", "json"],
  yaml: ["config", "configuration", "yaml", "yml", "devops", "ci", "cd"],
  yml: ["config", "configuration", "yaml", "yml", "devops", "ci", "cd"],
  sh: ["shell", "bash", "script", "devops", "cli"]
};
function extractKeywords(text) {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s_-]/g, " ").split(/\s+/).filter((w) => w.length > 2)
  );
}
function scoreAgent(agent, queryWords, fileExt) {
  const agentText = `${agent.name} ${agent.description} ${agent.content.slice(0, 500)}`;
  const agentKeywords = extractKeywords(agentText);
  const matches = [];
  for (const word of queryWords) {
    if (agentKeywords.has(word)) matches.push(word);
  }
  let score = queryWords.length > 0 ? matches.length / queryWords.length : 0;
  if (fileExt) {
    const domainWords = EXT_DOMAIN_KEYWORDS[fileExt.toLowerCase()] ?? [];
    const domainMatches = domainWords.filter((w) => agentKeywords.has(w));
    if (domainMatches.length > 0) {
      score = Math.min(1, score + 0.15 * domainMatches.length);
    }
  }
  return { score, matches };
}
function computeEffectiveness(agentId, rows) {
  const total = rows.length;
  if (total === 0) {
    return { agentId, totalRuns: 0, successRate: 0, recentTrend: "insufficient_data", recentSuccessRate: 0, avgOutputLength: 0, lastRun: null };
  }
  const successful = rows.filter((r) => r.status === "done").length;
  const successRate = successful / total;
  const recent = rows.slice(0, 3);
  const prior = rows.slice(3, 6);
  let recentTrend = "insufficient_data";
  let recentSuccessRate = recent.filter((r) => r.status === "done").length / recent.length;
  if (recent.length >= 3 && prior.length >= 3) {
    const recentRate = recent.filter((r) => r.status === "done").length / recent.length;
    const priorRate = prior.filter((r) => r.status === "done").length / prior.length;
    const delta = recentRate - priorRate;
    recentTrend = delta > 0.15 ? "improving" : delta < -0.15 ? "degrading" : "stable";
    recentSuccessRate = recentRate;
  }
  const doneRows = rows.filter((r) => r.status === "done");
  const avgOutputLength = doneRows.length > 0 ? Math.round(doneRows.reduce((sum, r) => sum + (r.output?.length ?? 0), 0) / doneRows.length) : 0;
  const lastRun = rows[0]?.completed_at ?? null;
  return { agentId, totalRuns: total, successRate, recentTrend, recentSuccessRate, avgOutputLength, lastRun };
}
function agentsRoutes(projectDir) {
  const app = new Hono();
  const dataDir = `${projectDir}/.hashmark`;
  app.get("/route", (c) => {
    const q = c.req.query("q") ?? "";
    const file = c.req.query("file") ?? "";
    const fileExt = file ? file.split(".").pop() : void 0;
    const agents = readAgentsDir(projectDir);
    if (agents.length === 0) return c.json({ suggestions: [] });
    const queryWords = Array.from(extractKeywords(q)).filter((w) => w.length > 2);
    if (queryWords.length === 0) return c.json({ suggestions: [] });
    const scored = agents.map((agent) => {
      const { score, matches } = scoreAgent(agent, queryWords, fileExt);
      return { agent, score, matches };
    }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    const suggestions = scored.map(({ agent, score, matches }) => ({
      id: agent.id,
      name: agent.name || agent.id,
      description: agent.description,
      score: Math.round(score * 100) / 100,
      reason: matches.length > 0 ? `matches: ${matches.slice(0, 4).join(", ")}` : ""
    }));
    return c.json({ suggestions });
  });
  app.get("/security-scan", (c) => {
    const agents = readAgentsDir(projectDir);
    const findings = scanAgentSecurity(agents);
    return c.json({ findings, scannedAt: Date.now(), agentCount: agents.length });
  });
  app.get("/", (c) => {
    const agents = readAgentsDir(projectDir);
    return c.json({ agents });
  });
  app.post("/", async (c) => {
    const body = await c.req.json();
    if (!body.name?.trim()) return c.json({ error: "name required" }, 400);
    const dept = body.department?.trim() || "general";
    const slug = body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const agentsDir = join2(projectDir, ".claude", "agents", dept);
    const { mkdirSync: mkdirSync10 } = await import("fs");
    try {
      mkdirSync10(agentsDir, { recursive: true });
    } catch {
    }
    const filePath = join2(agentsDir, `${slug}.md`);
    const content = body.content ?? `---
name: ${body.name.trim()}
description: ${body.description?.trim() ?? ""}
---
`;
    writeFileSync(filePath, content, "utf-8");
    const relativePath = `${dept}/${slug}.md`;
    const agent = {
      id: `${dept}-${slug}`,
      name: body.name.trim(),
      description: body.description?.trim() ?? "",
      department: dept,
      path: relativePath,
      content
    };
    return c.json({ agent }, 201);
  });
  app.get("/effectiveness", (c) => {
    try {
      const db = getDb(dataDir);
      const rows = db.prepare(
        "SELECT agent_id, status, output, completed_at FROM swarm_workers WHERE completed_at IS NOT NULL ORDER BY completed_at DESC"
      ).all();
      const byAgent = /* @__PURE__ */ new Map();
      for (const row of rows) {
        if (!byAgent.has(row.agent_id)) byAgent.set(row.agent_id, []);
        byAgent.get(row.agent_id).push(row);
      }
      const stats = Array.from(byAgent.entries()).map(
        ([agentId, agentRows]) => computeEffectiveness(agentId, agentRows)
      );
      return c.json({ stats });
    } catch {
      return c.json({ stats: [] });
    }
  });
  app.get("/:id/effectiveness", (c) => {
    const id = c.req.param("id");
    try {
      const db = getDb(dataDir);
      const rows = db.prepare(
        "SELECT agent_id, status, output, completed_at FROM swarm_workers WHERE agent_id = ? AND completed_at IS NOT NULL ORDER BY completed_at DESC"
      ).all(id);
      return c.json(computeEffectiveness(id, rows));
    } catch {
      return c.json(computeEffectiveness(id, []));
    }
  });
  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const agents = readAgentsDir(projectDir);
    const agent = agents.find((a) => a.id === id);
    if (!agent) return c.json({ error: "Not found" }, 404);
    return c.json({ agent });
  });
  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const agentsDir = join2(projectDir, ".claude", "agents");
    const agents = readAgentsDir(projectDir);
    const agent = agents.find((a) => a.id === id);
    if (!agent) return c.json({ error: "Not found" }, 404);
    const fullPath = join2(agentsDir, agent.path);
    try {
      unlinkSync(fullPath);
    } catch {
      return c.json({ error: "Failed to delete agent file" }, 500);
    }
    return c.json({ ok: true });
  });
  app.put("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const agentsDir = join2(projectDir, ".claude", "agents");
    const segments = id.split("-");
    const agents = readAgentsDir(projectDir);
    const agent = agents.find((a) => a.id === id);
    if (!agent) return c.json({ error: "Not found" }, 404);
    const fullPath = join2(agentsDir, agent.path);
    writeFileSync(fullPath, body.content, "utf-8");
    return c.json({ ok: true });
  });
  return app;
}

// server/routes/generate.ts
import { Hono as Hono2 } from "hono";
import { spawn } from "child_process";
import { mkdirSync as mkdirSync2, writeFileSync as writeFileSync2, existsSync as existsSync2 } from "fs";
import { join as join3, resolve, dirname } from "path";
function generateRoutes(projectDir) {
  const app = new Hono2();
  app.post("/", async (c) => {
    const body = await c.req.json();
    const stream = new ReadableStream({
      start(controller) {
        const send = (data) => {
          const chunk = `data: ${JSON.stringify(data)}

`;
          controller.enqueue(new TextEncoder().encode(chunk));
        };
        send({ type: "start", message: "Starting agent generation..." });
        if (body.companyType?.startsWith("-") || body.projectName?.startsWith("-")) {
          send({ type: "error", message: "Invalid input" });
          controller.close();
          return;
        }
        const args = [
          "agents",
          "--yes",
          "--json-stream",
          "--type",
          body.companyType
        ];
        if (body.projectName) {
          args.push("--name", body.projectName);
        }
        const localBin = join3(projectDir, "node_modules", ".bin", "hashmark");
        const monoBin = join3(projectDir, "packages", "cli", "dist", "cli.js");
        const isMonorepo = !existsSync2(localBin) && existsSync2(monoBin);
        const resolvedBin = existsSync2(localBin) ? localBin : isMonorepo ? "node" : "hashmark";
        if (resolvedBin === "node") {
          const agentsIdx = args.indexOf("agents");
          args.splice(0, 0, monoBin);
          args.splice(agentsIdx + 2, 0, projectDir);
        }
        const env = { ...process.env };
        if (body.apiKey) {
          const keyMap = {
            anthropic: "ANTHROPIC_API_KEY",
            openai: "OPENAI_API_KEY",
            gemini: "GOOGLE_AI_API_KEY",
            xai: "XAI_API_KEY",
            mistral: "MISTRAL_API_KEY",
            groq: "GROQ_API_KEY"
          };
          const envVar = keyMap[body.provider];
          if (envVar) env[envVar] = body.apiKey;
          if (body.baseURL) env.OPENAI_BASE_URL = body.baseURL;
        }
        const spawnCwd = isMonorepo ? join3(projectDir, "packages", "cli") : projectDir;
        const proc = spawn(resolvedBin, args, { cwd: spawnCwd, env });
        let buffer = "";
        proc.stdout.on("data", (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed);
              send(event);
            } catch {
              if (trimmed.startsWith("{")) continue;
              send({ type: "progress", message: trimmed });
            }
          }
        });
        proc.stderr.on("data", (chunk) => {
          const line = chunk.toString().trim();
          if (line) send({ type: "progress", message: line });
        });
        proc.on("close", (code) => {
          send({ type: "done", success: code === 0 });
          controller.close();
        });
        proc.on("error", (err) => {
          send({ type: "error", message: err.message });
          controller.close();
        });
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  });
  app.post("/save", async (c) => {
    const body = await c.req.json();
    const agentsDir = join3(projectDir, ".claude", "agents");
    let written = 0;
    for (const agent of body.agents) {
      if (!agent.path || typeof agent.path !== "string") continue;
      const fullPath = resolve(agentsDir, agent.path);
      if (!fullPath.startsWith(agentsDir + "/") && fullPath !== agentsDir) continue;
      mkdirSync2(dirname(fullPath), { recursive: true });
      writeFileSync2(fullPath, agent.content, "utf-8");
      written++;
    }
    return c.json({ ok: true, count: written });
  });
  return app;
}

// server/routes/scan.ts
import { Hono as Hono3 } from "hono";
import { spawn as spawn2, spawnSync } from "child_process";
import { join as join5 } from "path";
import { existsSync as existsSync4, readFileSync as readFileSync3, writeFileSync as writeFileSync3, mkdirSync as mkdirSync3 } from "fs";

// server/context.ts
import { existsSync as existsSync3, readFileSync as readFileSync2, statSync } from "fs";
import { join as join4 } from "path";
var MAX_CHARS = 5e4;
function loadScanContext(projectDir) {
  const claudeMdPath = join4(projectDir, "CLAUDE.md");
  if (existsSync3(claudeMdPath)) {
    try {
      const raw = readFileSync2(claudeMdPath, "utf-8").trim();
      if (!raw) return null;
      const content = raw.length > MAX_CHARS ? raw.slice(0, MAX_CHARS) + "\n\n... [truncated \u2014 context exceeds 50,000 chars]" : raw;
      return `## Project Context

${content}`;
    } catch {
    }
  }
  const indexPath = join4(projectDir, ".hashmark", "index.json");
  if (existsSync3(indexPath)) {
    try {
      const raw = readFileSync2(indexPath, "utf-8").trim();
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const fileCount = parsed.fileCount ?? Object.keys(parsed.files ?? {}).length;
      const generatedAt = parsed.generatedAt ? new Date(parsed.generatedAt).toLocaleString() : "unknown";
      const summary = `Scan index \u2014 ${fileCount} files, generated ${generatedAt}`;
      const jsonStr = JSON.stringify(parsed, null, 2);
      const content = jsonStr.length > MAX_CHARS ? jsonStr.slice(0, MAX_CHARS) + "\n\n... [truncated]" : jsonStr;
      return `## Project Context

${summary}

\`\`\`json
${content}
\`\`\``;
    } catch {
      return null;
    }
  }
  return null;
}
function getScanContextMeta(projectDir) {
  const claudeMdPath = join4(projectDir, "CLAUDE.md");
  if (existsSync3(claudeMdPath)) {
    try {
      const raw = readFileSync2(claudeMdPath, "utf-8").trim();
      if (raw) {
        const stat3 = statSync(claudeMdPath);
        const content = `## Project Context

${raw}`;
        return {
          available: true,
          source: "CLAUDE.md",
          charCount: Math.min(raw.length, MAX_CHARS),
          preview: raw.slice(0, 200) + (raw.length > 200 ? "..." : ""),
          modifiedAt: stat3.mtime.toISOString()
        };
      }
    } catch {
    }
  }
  const indexPath = join4(projectDir, ".hashmark", "index.json");
  if (existsSync3(indexPath)) {
    try {
      const raw = readFileSync2(indexPath, "utf-8").trim();
      if (raw) {
        const stat3 = statSync(indexPath);
        return {
          available: true,
          source: "index.json",
          charCount: Math.min(raw.length, MAX_CHARS),
          preview: raw.slice(0, 200) + (raw.length > 200 ? "..." : ""),
          modifiedAt: stat3.mtime.toISOString()
        };
      }
    } catch {
    }
  }
  return { available: false, source: null, charCount: 0, preview: null, modifiedAt: null };
}

// server/routes/scan.ts
function snapshotFromResult(result) {
  const stats = result.stats;
  const aiReadiness = result.aiReadiness;
  const importGraph = result.importGraph;
  return {
    scannedAt: Date.now(),
    totalFiles: stats?.totalFiles ?? 0,
    totalLines: stats?.totalLines ?? 0,
    componentCount: Array.isArray(result.components) ? result.components.length : 0,
    apiRouteCount: Array.isArray(result.apiRoutes) ? result.apiRoutes.length : 0,
    aiReadiness: aiReadiness?.total ?? null,
    hubFileCount: importGraph?.hubFiles ? importGraph.hubFiles.length : 0
  };
}
function computeDelta(prev, curr) {
  const fields = [
    ["Lines", "totalLines"],
    ["Files", "totalFiles"],
    ["Components", "componentCount"],
    ["API Routes", "apiRouteCount"],
    ["Hub Files", "hubFileCount"]
  ];
  const out = {};
  for (const [label, key] of fields) {
    const p = prev[key];
    const c = curr[key];
    if (p === 0 && c === 0) continue;
    out[label] = {
      prev: p,
      curr: c,
      delta: c - p,
      pct: p > 0 ? Math.round((c - p) / p * 100) : 0
    };
  }
  if (prev.aiReadiness !== null && curr.aiReadiness !== null) {
    const p = prev.aiReadiness;
    const c = curr.aiReadiness;
    out["AI Readiness"] = { prev: p, curr: c, delta: c - p, pct: Math.round((c - p) / (p || 1) * 100) };
  }
  return out;
}
function scanRoutes(projectDir) {
  const app = new Hono3();
  const dataDir = join5(projectDir, ".hashmark");
  const snapshotPath = join5(dataDir, "last-scan-snapshot.json");
  app.get("/history", (c) => {
    if (!existsSync4(snapshotPath)) return c.json({ snapshots: [] });
    try {
      const snap = JSON.parse(readFileSync3(snapshotPath, "utf-8"));
      return c.json({ snapshots: [snap] });
    } catch {
      return c.json({ snapshots: [] });
    }
  });
  app.get("/context", (c) => {
    const meta = getScanContextMeta(projectDir);
    return c.json(meta);
  });
  app.get("/staleness", (c) => {
    const claudeMdPath = join5(projectDir, "CLAUDE.md");
    if (!existsSync4(claudeMdPath)) {
      return c.json({ exists: false, generatedAt: null, commitsSince: null, daysStale: null });
    }
    let generatedAt = null;
    try {
      const content = readFileSync3(claudeMdPath, "utf-8");
      const match = content.match(/Generated:\s*(\d{4}-\d{2}-\d{2})/);
      if (match) generatedAt = match[1];
    } catch {
    }
    if (!generatedAt) {
      return c.json({ exists: true, generatedAt: null, commitsSince: null, daysStale: null });
    }
    let commitsSince = null;
    try {
      const result = spawnSync(
        "git",
        ["log", `--after=${generatedAt}T00:00:00`, "--oneline"],
        { cwd: projectDir, timeout: 5e3, encoding: "utf-8" }
      );
      if (result.status === 0 && result.stdout) {
        commitsSince = result.stdout.split("\n").filter((l) => l.trim().length > 0).length;
      }
    } catch {
    }
    const genDate = new Date(generatedAt);
    const daysStale = !isNaN(genDate.getTime()) ? Math.floor((Date.now() - genDate.getTime()) / (1e3 * 60 * 60 * 24)) : null;
    return c.json({ exists: true, generatedAt, commitsSince, daysStale });
  });
  app.post("/", async (c) => {
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    let prevSnapshot = null;
    try {
      if (existsSync4(snapshotPath)) {
        prevSnapshot = JSON.parse(readFileSync3(snapshotPath, "utf-8"));
      }
    } catch {
    }
    const send = (data) => `data: ${JSON.stringify(data)}

`;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(send({ type: "start", message: "Starting scan..." }));
        const localBin = join5(projectDir, "node_modules", ".bin", "hashmark");
        const monoBin = join5(projectDir, "packages", "cli", "dist", "cli.js");
        const isMonorepo = !existsSync4(localBin) && existsSync4(monoBin);
        const bin = existsSync4(localBin) ? localBin : isMonorepo ? "node" : "hashmark";
        const args = bin === "node" ? [monoBin, projectDir, "--json", "--output", "/dev/stdout"] : ["--json", "--output", "/dev/stdout"];
        const spawnCwd = isMonorepo ? join5(projectDir, "packages", "cli") : projectDir;
        const proc = spawn2(bin, args, {
          cwd: spawnCwd,
          env: process.env
        });
        let stdout = "";
        proc.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
        });
        proc.stderr.on("data", (chunk) => {
          const line = chunk.toString().trim();
          if (line) {
            controller.enqueue(send({ type: "progress", message: line }));
          }
        });
        proc.on("close", (code) => {
          if (code === 0) {
            try {
              const result = JSON.parse(stdout);
              const currSnapshot = snapshotFromResult(result);
              try {
                mkdirSync3(dataDir, { recursive: true });
                writeFileSync3(snapshotPath, JSON.stringify(currSnapshot), "utf-8");
              } catch {
              }
              const delta = prevSnapshot ? computeDelta(prevSnapshot, currSnapshot) : null;
              controller.enqueue(send({ type: "complete", result, delta }));
            } catch {
              controller.enqueue(send({ type: "complete", result: null, delta: null }));
            }
          } else {
            controller.enqueue(send({ type: "error", message: `Scan exited with code ${code}` }));
          }
          controller.close();
        });
        proc.on("error", (err) => {
          controller.enqueue(send({ type: "error", message: err.message }));
          controller.close();
        });
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  });
  return app;
}

// server/routes/tasks.ts
import { Hono as Hono4 } from "hono";

// server/runner.ts
import { spawn as spawn3 } from "child_process";
import { randomUUID } from "crypto";
import { existsSync as existsSync5, readFileSync as readFileSync4 } from "fs";
import { join as join6 } from "path";
var TaskStore = class {
  tasks = /* @__PURE__ */ new Map();
  processes = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Map();
  create(agentId, agentName, agentDept, prompt) {
    const task = {
      id: randomUUID(),
      agentId,
      agentName,
      agentDept,
      prompt,
      status: "pending",
      output: "",
      createdAt: Date.now()
    };
    this.tasks.set(task.id, task);
    return task;
  }
  get(id) {
    return this.tasks.get(id);
  }
  list() {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }
  update(id, patch) {
    const task = this.tasks.get(id);
    if (!task) return;
    Object.assign(task, patch);
  }
  append(id, text) {
    const task = this.tasks.get(id);
    if (!task) return;
    task.output += text;
    this.emit(id, text);
  }
  subscribe(id, fn) {
    if (!this.listeners.has(id)) this.listeners.set(id, /* @__PURE__ */ new Set());
    this.listeners.get(id).add(fn);
    return () => this.listeners.get(id)?.delete(fn);
  }
  emit(id, chunk) {
    this.listeners.get(id)?.forEach((fn) => fn(chunk));
  }
  setProcess(id, proc) {
    this.processes.set(id, proc);
  }
  killProcess(id) {
    const proc = this.processes.get(id);
    if (proc && !proc.killed) {
      proc.kill("SIGTERM");
      return true;
    }
    return false;
  }
};
var taskStore = new TaskStore();
function buildPrompt(agentContent, userPrompt, agentName) {
  const body = agentContent.replace(/^---[\s\S]*?---\n?/, "").trim();
  return `${body}

---

Task: ${userPrompt}`;
}
function runTask(projectDir, taskId, agentContent, agentName) {
  const task = taskStore.get(taskId);
  if (!task) return;
  const fullPrompt = agentContent ? buildPrompt(agentContent, task.prompt, agentName) : task.prompt;
  taskStore.update(taskId, { status: "running", startedAt: Date.now() });
  taskStore.append(taskId, `> Running task with agent: ${agentName}
> ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}

`);
  const candidates = [
    join6(projectDir, "node_modules", ".bin", "claude"),
    "/Applications/Conductor.app/Contents/Resources/bin/claude",
    "/usr/local/bin/claude",
    "claude"
  ];
  const claudeBin = candidates.find((p) => {
    try {
      return !p.includes("node_modules") ? existsSync5(p) : existsSync5(p);
    } catch {
      return false;
    }
  }) ?? "claude";
  const proc = spawn3(claudeBin, ["--print", fullPrompt], {
    cwd: projectDir,
    env: {
      ...process.env,
      CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1"
    }
  });
  taskStore.setProcess(taskId, proc);
  proc.stdout.on("data", (chunk) => {
    taskStore.append(taskId, chunk.toString());
  });
  proc.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    taskStore.append(taskId, text);
  });
  proc.on("close", (code) => {
    const killed = code === null || code === 130 || code === 143;
    taskStore.update(taskId, {
      status: killed ? "killed" : code === 0 ? "done" : "failed",
      endedAt: Date.now(),
      exitCode: code ?? -1
    });
    taskStore.append(taskId, `

> Exit code: ${code ?? "killed"}`);
  });
  proc.on("error", (err) => {
    taskStore.append(taskId, `
> Error: ${err.message}
> Make sure 'claude' CLI is installed and authenticated.
`);
    taskStore.update(taskId, { status: "failed", endedAt: Date.now() });
  });
}
function loadAgentContent(projectDir, agentPath) {
  try {
    const fullPath = join6(projectDir, ".claude", "agents", agentPath);
    if (existsSync5(fullPath)) return readFileSync4(fullPath, "utf-8");
  } catch {
  }
  return null;
}

// server/routes/tasks.ts
function tasksRoutes(projectDir) {
  const app = new Hono4();
  app.get("/", (c) => {
    return c.json({ tasks: taskStore.list() });
  });
  app.get("/:id", (c) => {
    const task = taskStore.get(c.req.param("id"));
    if (!task) return c.json({ error: "Not found" }, 404);
    return c.json({ task });
  });
  app.post("/", async (c) => {
    const body = await c.req.json();
    const task = taskStore.create(
      body.agentId,
      body.agentName,
      body.agentDept,
      body.prompt
    );
    if (body.autoRun !== false) {
      const content = body.agentPath ? loadAgentContent(projectDir, body.agentPath) : null;
      setImmediate(() => runTask(projectDir, task.id, content, body.agentName));
    }
    return c.json({ task }, 201);
  });
  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const killed = taskStore.killProcess(id);
    if (!killed) {
      const task = taskStore.get(id);
      if (!task) return c.json({ error: "Not found" }, 404);
    }
    return c.json({ ok: true });
  });
  app.get("/:id/stream", (c) => {
    const id = c.req.param("id");
    const task = taskStore.get(id);
    if (!task) return c.json({ error: "Not found" }, 404);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const send = (data) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}

`));
          } catch {
          }
        };
        if (task.output) {
          send({ type: "output", text: task.output });
        }
        if (task.status !== "running" && task.status !== "pending") {
          send({ type: "status", status: task.status, exitCode: task.exitCode });
          controller.close();
          return;
        }
        const unsub = taskStore.subscribe(id, (chunk) => {
          send({ type: "output", text: chunk });
          const current = taskStore.get(id);
          if (current && current.status !== "running" && current.status !== "pending") {
            send({ type: "status", status: current.status, exitCode: current.exitCode });
            controller.close();
            unsub();
          }
        });
        const heartbeat = setInterval(() => {
          const current = taskStore.get(id);
          if (!current || current.status !== "running" && current.status !== "pending") {
            clearInterval(heartbeat);
            return;
          }
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            clearInterval(heartbeat);
          }
        }, 15e3);
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  });
  return app;
}

// server/routes/sessions.ts
import { Hono as Hono5 } from "hono";
import { randomUUID as randomUUID2 } from "crypto";
import { spawn as spawn5 } from "child_process";
import { existsSync as existsSync11, readFileSync as readFileSync9 } from "fs";
import { join as join12, extname } from "path";

// server/lib/loop-detector.ts
function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
function similarity(a, b) {
  const trigrams = (s) => {
    const set = /* @__PURE__ */ new Set();
    for (let i = 0; i <= s.length - 3; i++) set.add(s.slice(i, i + 3));
    return set;
  };
  const ta = trigrams(normalize(a));
  const tb = trigrams(normalize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return inter / (ta.size + tb.size - inter);
}
var ACKNOWLEDGE_PATTERNS = [
  /^(i understand|i see|understood|got it|sure|certainly|of course|absolutely|i'll help|let me help|happy to help|great question)/i,
  /^(to help you|in order to help|i can help|i would be happy|i'll take a look|let me take a look)/i
];
var CLARIFY_PATTERNS = [
  /could you (please |clarify|tell me|provide|share|confirm|specify|explain)/i,
  /what (do you mean|exactly|specifically|is the|are you)/i,
  /can you (clarify|elaborate|explain|tell me|provide|share|confirm)/i,
  /(i need (more|additional) (information|context|details)|please (clarify|provide|specify))/i
];
var TOOL_COMMAND_RE = /(?:npm|npx|yarn|pnpm|git|curl|grep|find|cat|ls|cd|python|pip|node|tsc|eslint|prisma|jest|vitest)\s+[\w\-./]+/gi;
function detectRepetitiveResponse(msgs) {
  const assistants = [];
  msgs.forEach((m, i) => {
    if (m.role === "assistant") assistants.push({ idx: i, content: m.content });
  });
  if (assistants.length < 2) return null;
  const pairs = [];
  for (let i = 1; i < assistants.length; i++) {
    const sim = similarity(assistants[i - 1].content, assistants[i].content);
    if (sim > 0.75) {
      pairs.push(assistants[i - 1].idx, assistants[i].idx);
    }
  }
  if (pairs.length === 0) return null;
  const unique = [...new Set(pairs)];
  return {
    pattern: "repetitive-response",
    severity: "critical",
    label: "Repetitive Response",
    description: `Agent produced near-identical responses in consecutive turns (\u226575% similarity).`,
    evidenceIndices: unique,
    snippet: msgs[unique[0]]?.content.slice(0, 80)
  };
}
function detectAcknowledgmentStall(msgs) {
  const run = [];
  let streak = 0;
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role !== "assistant") {
      streak = 0;
      continue;
    }
    const content = msgs[i].content.trim().slice(0, 200);
    const isAck = ACKNOWLEDGE_PATTERNS.some((p) => p.test(content));
    const short = msgs[i].content.trim().length < 300;
    if (isAck && short) {
      streak++;
      run.push(i);
    } else {
      streak = 0;
    }
    if (streak >= 3) {
      return {
        pattern: "acknowledgment-stall",
        severity: "warning",
        label: "Acknowledgment Stall",
        description: `Agent produced ${streak} short acknowledgment responses without substantive progress.`,
        evidenceIndices: run.slice(-streak),
        snippet: msgs[i].content.slice(0, 80)
      };
    }
  }
  return null;
}
function detectCircularReference(msgs) {
  const identRe = /(?:[\w/-]+\.(?:ts|tsx|js|py|go|rs|md)|(?:function|class|interface|type|const|let|var)\s+(\w+))/g;
  const windows = [];
  const allEntities = /* @__PURE__ */ new Map();
  for (let i = 0; i < msgs.length; i++) {
    const matches = [...msgs[i].content.matchAll(identRe)].map((m) => m[0]);
    for (const entity of matches) {
      const norm = normalize(entity);
      const arr = allEntities.get(norm) ?? [];
      arr.push(i);
      allEntities.set(norm, arr);
    }
  }
  for (const [entity, indices] of allEntities) {
    if (indices.length < 4) continue;
    const recent = indices.filter((i) => i >= msgs.length - 8);
    if (recent.length >= 4) {
      windows.push({ entity, indices: recent });
    }
  }
  if (windows.length === 0) return null;
  const top = windows.sort((a, b) => b.indices.length - a.indices.length)[0];
  return {
    pattern: "circular-reference",
    severity: "warning",
    label: "Circular Reference",
    description: `"${top.entity}" referenced in ${top.indices.length} of the last 8 messages without apparent resolution.`,
    evidenceIndices: [...new Set(top.indices)],
    snippet: `"${top.entity}" appears ${top.indices.length}\xD7`
  };
}
function detectErrorEcho(msgs) {
  const errorRe = /(?:error:|failed:|exception:|cannot|could not|unable to|not found|undefined|null reference|type error|syntax error)[^\n.!?]*/gi;
  const allErrors = [];
  for (let i = 0; i < msgs.length; i++) {
    const matches = [...msgs[i].content.matchAll(errorRe)].map((m) => normalize(m[0]));
    for (const m of matches) allErrors.push({ msg: m, idx: i });
  }
  const seen = /* @__PURE__ */ new Map();
  for (const { msg, idx } of allErrors) {
    let placed = false;
    for (const [key, idxs] of seen) {
      if (similarity(key, msg) > 0.6) {
        idxs.push(idx);
        placed = true;
        break;
      }
    }
    if (!placed) seen.set(msg, [idx]);
  }
  for (const [errorText, indices] of seen) {
    const unique = [...new Set(indices)];
    if (unique.length >= 3) {
      return {
        pattern: "error-echo",
        severity: "critical",
        label: "Error Echo",
        description: `Same error phrase appeared in ${unique.length} separate turns \u2014 the agent may not be resolving it.`,
        evidenceIndices: unique,
        snippet: errorText.slice(0, 80)
      };
    }
  }
  return null;
}
function detectClarificationPingPong(msgs) {
  const clarifyMsgs = [];
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role !== "assistant") continue;
    if (CLARIFY_PATTERNS.some((p) => p.test(msgs[i].content))) {
      clarifyMsgs.push(i);
    }
  }
  if (clarifyMsgs.length < 2) return null;
  const pingPongs = [];
  for (let i = 1; i < clarifyMsgs.length; i++) {
    const prevIdx = clarifyMsgs[i - 1];
    const currIdx = clarifyMsgs[i];
    const hasUserBetween = msgs.slice(prevIdx + 1, currIdx).some((m) => m.role === "user");
    if (hasUserBetween) {
      const sim = similarity(msgs[prevIdx].content, msgs[currIdx].content);
      if (sim > 0.4) {
        pingPongs.push(prevIdx, currIdx);
      }
    }
  }
  if (pingPongs.length === 0) return null;
  const unique = [...new Set(pingPongs)];
  return {
    pattern: "clarification-pingpong",
    severity: "warning",
    label: "Clarification Ping-Pong",
    description: `Agent re-asked similar clarifying questions after the user already responded.`,
    evidenceIndices: unique,
    snippet: msgs[unique[0]]?.content.slice(0, 80)
  };
}
function detectToolObsession(msgs) {
  const window = msgs.slice(-10);
  const commandCounts = /* @__PURE__ */ new Map();
  for (let i = 0; i < window.length; i++) {
    const actualIdx = msgs.length - 10 + i;
    const commands = [...window[i].content.matchAll(TOOL_COMMAND_RE)].map((m) => m[0].toLowerCase());
    for (const cmd of commands) {
      const base = cmd.split(/\s+/)[0];
      const entry = commandCounts.get(base) ?? { count: 0, indices: [] };
      entry.count++;
      entry.indices.push(actualIdx);
      commandCounts.set(base, entry);
    }
  }
  for (const [cmd, { count, indices }] of commandCounts) {
    if (count >= 5) {
      return {
        pattern: "tool-obsession",
        severity: "warning",
        label: "Tool Obsession",
        description: `"${cmd}" mentioned ${count}\xD7 in the last 10 messages without apparent resolution.`,
        evidenceIndices: [...new Set(indices)],
        snippet: `${cmd} \xD7${count}`
      };
    }
  }
  return null;
}
function detectContextCollapse(msgs) {
  if (msgs.length < 4) return null;
  const userFacts = [];
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role === "user") userFacts.push({ content: normalize(msgs[i].content), idx: i });
  }
  const uncertaintyRe = /(?:i don't have|i'm not sure|i don't know|unclear|i cannot find|i need to know|what is|please tell me)\s+(?:the|your|what|how|which|where|when)/gi;
  const collapseIndices = [];
  for (let i = 2; i < msgs.length; i++) {
    if (msgs[i].role !== "assistant") continue;
    const uncMatches = [...msgs[i].content.matchAll(uncertaintyRe)].map((m) => normalize(m[0]));
    if (uncMatches.length === 0) continue;
    for (const unc of uncMatches) {
      for (const { content: userContent, idx: userIdx } of userFacts) {
        if (userIdx >= i) continue;
        const sim = similarity(unc, userContent.slice(0, 200));
        if (sim > 0.3) {
          collapseIndices.push(userIdx, i);
          break;
        }
      }
    }
  }
  if (collapseIndices.length === 0) return null;
  const unique = [...new Set(collapseIndices)];
  return {
    pattern: "context-collapse",
    severity: "critical",
    label: "Context Collapse",
    description: `Agent appears to have lost track of information the user already provided.`,
    evidenceIndices: unique,
    snippet: msgs[unique[unique.length - 1]]?.content.slice(0, 80)
  };
}
function analyzeSessionLoop(messages) {
  if (messages.length < 3) {
    return { findings: [], status: "clean", messageCount: messages.length, analyzedAt: Date.now() };
  }
  const detectors = [
    detectRepetitiveResponse,
    detectAcknowledgmentStall,
    detectCircularReference,
    detectErrorEcho,
    detectClarificationPingPong,
    detectToolObsession,
    detectContextCollapse
  ];
  const findings = [];
  for (const detect of detectors) {
    const result = detect(messages);
    if (result) findings.push(result);
  }
  const hasCritical = findings.some((f) => f.severity === "critical");
  const status = hasCritical ? "loop" : findings.length > 0 ? "watch" : "clean";
  return { findings, status, messageCount: messages.length, analyzedAt: Date.now() };
}

// server/lib/providers.ts
import { existsSync as existsSync6, readFileSync as readFileSync5, writeFileSync as writeFileSync4, mkdirSync as mkdirSync4 } from "fs";
import { join as join7 } from "path";
import { execSync } from "child_process";
var CLI_TOOLS = [
  { id: "claude", name: "Claude Code", bin: "claude", versionFlag: "--version" },
  { id: "codex", name: "OpenAI Codex", bin: "codex", versionFlag: "--version" },
  { id: "gemini", name: "Google Gemini CLI", bin: "gemini", versionFlag: "--version" },
  { id: "aider", name: "Aider", bin: "aider", versionFlag: "--version" },
  { id: "copilot", name: "GitHub Copilot", bin: "github-copilot-cli", versionFlag: "--version" },
  { id: "amp", name: "Amp", bin: "amp", versionFlag: "--version" },
  { id: "goose", name: "Goose", bin: "goose", versionFlag: "--version" }
];
var EXTRA_BIN_DIRS = [
  "/usr/local/bin",
  "/opt/homebrew/bin",
  "/Applications/Conductor.app/Contents/Resources/bin"
];
function tryExec(cmd) {
  try {
    return execSync(cmd, { stdio: "pipe", timeout: 2e3 }).toString().trim();
  } catch {
    return null;
  }
}
function resolveBinPath(bin, projectDir) {
  const whichResult = tryExec(`which ${bin}`);
  if (whichResult) return whichResult;
  if (projectDir) {
    const localBin = join7(projectDir, "node_modules", ".bin", bin);
    if (existsSync6(localBin)) return localBin;
  }
  for (const dir of EXTRA_BIN_DIRS) {
    const fullPath = join7(dir, bin);
    if (existsSync6(fullPath)) return fullPath;
  }
  return null;
}
function extractVersion(raw) {
  const lines = raw.split("\n");
  const first = lines[0].trim();
  const versionMatch = first.match(/(\d+\.\d+[\w.+-]*)/);
  return versionMatch ? versionMatch[1] : first.slice(0, 40);
}
function detectCLIs(projectDir) {
  return CLI_TOOLS.map((tool) => {
    const binPath = resolveBinPath(tool.bin, projectDir);
    if (!binPath) {
      return { id: tool.id, name: tool.name, installed: false };
    }
    const versionRaw = tryExec(`"${binPath}" ${tool.versionFlag}`);
    const version = versionRaw ? extractVersion(versionRaw) : void 0;
    return { id: tool.id, name: tool.name, installed: true, version, path: binPath };
  });
}
function detectInstalledCLIs() {
  const detected = /* @__PURE__ */ new Set();
  for (const result of detectCLIs()) {
    if (result.installed) detected.add(result.id);
  }
  if (process.env.OPENAI_API_KEY) detected.add("codex");
  if (process.env.ANTHROPIC_API_KEY) detected.add("claude");
  return detected;
}
var DEFAULT_STORE = {
  active: "claude",
  model: "claude-opus-4-5-20251001",
  providers: [
    { id: "claude", name: "Claude", enabled: true },
    { id: "openai", name: "OpenAI", enabled: false },
    { id: "gemini", name: "Gemini", enabled: false },
    { id: "mistral", name: "Mistral", enabled: false },
    { id: "grok", name: "Grok", enabled: false },
    { id: "ollama", name: "Ollama", baseUrl: "http://localhost:11434", enabled: false },
    { id: "codex", name: "Codex (OpenAI)", enabled: false }
  ]
};
function loadProviders(dataDir) {
  const filePath = join7(dataDir, "providers.json");
  if (!existsSync6(filePath)) {
    const store = structuredClone(DEFAULT_STORE);
    const detected = detectInstalledCLIs();
    store.providers = store.providers.map(
      (p) => detected.has(p.id) ? { ...p, enabled: true } : p
    );
    return store;
  }
  try {
    const raw = readFileSync5(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const providerIds = new Set((parsed.providers ?? []).map((p) => p.id));
    const merged = {
      active: parsed.active ?? DEFAULT_STORE.active,
      model: parsed.model ?? DEFAULT_STORE.model,
      providers: [
        ...parsed.providers ?? [],
        ...DEFAULT_STORE.providers.filter((p) => !providerIds.has(p.id))
      ]
    };
    return merged;
  } catch {
    return structuredClone(DEFAULT_STORE);
  }
}
function saveProviders(dataDir, store) {
  if (!existsSync6(dataDir)) mkdirSync4(dataDir, { recursive: true });
  const filePath = join7(dataDir, "providers.json");
  writeFileSync4(filePath, JSON.stringify(store, null, 2), "utf-8");
}

// server/lib/ai-stream.ts
import { spawn as spawn4 } from "child_process";
import { existsSync as existsSync7 } from "fs";
import { join as join8 } from "path";
async function streamAIResponse(opts) {
  try {
    switch (opts.provider) {
      case "claude":
        return await streamClaude(opts);
      case "openai":
        return await streamOpenAI(opts);
      case "gemini":
        return await streamGemini(opts);
      case "mistral":
        return await streamOpenAICompat(opts, "https://api.mistral.ai/v1/chat/completions");
      case "grok":
        return await streamOpenAICompat(opts, "https://api.x.ai/v1/chat/completions");
      case "ollama":
        return await streamOllama(opts);
      case "codex":
        return await streamCodex(opts);
      default:
        throw new Error(`Unknown provider: ${opts.provider}`);
    }
  } catch (err) {
    opts.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
async function* readSSELines(body) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) yield line;
    }
    if (buf) yield buf;
  } finally {
    reader.releaseLock();
  }
}
async function* readJSONLines(body) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          yield JSON.parse(trimmed);
        } catch {
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
async function streamClaude(opts) {
  if (!opts.apiKey) throw new Error("Claude provider requires an API key");
  const userMessages = opts.messages.filter((m) => m.role !== "system");
  const body = {
    model: opts.model,
    max_tokens: 8192,
    stream: true,
    messages: userMessages
  };
  if (opts.systemPrompt) body.system = opts.systemPrompt;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }
  for await (const line of readSSELines(res.body)) {
    if (!line.startsWith("data: ")) continue;
    const raw = line.slice(6).trim();
    if (raw === "[DONE]" || !raw) continue;
    try {
      const evt = JSON.parse(raw);
      if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) {
        opts.onChunk(evt.delta.text);
      }
    } catch {
    }
  }
  opts.onDone();
}
async function streamOpenAICompat(opts, url) {
  if (!opts.apiKey) throw new Error(`${opts.provider} provider requires an API key`);
  const messages = opts.systemPrompt ? [{ role: "system", content: opts.systemPrompt }, ...opts.messages] : opts.messages;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${opts.apiKey}`
    },
    body: JSON.stringify({ model: opts.model, stream: true, messages })
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${opts.provider} API error ${res.status}: ${text}`);
  }
  for await (const line of readSSELines(res.body)) {
    if (!line.startsWith("data: ")) continue;
    const raw = line.slice(6).trim();
    if (raw === "[DONE]" || !raw) continue;
    try {
      const evt = JSON.parse(raw);
      const text = evt.choices?.[0]?.delta?.content;
      if (text) opts.onChunk(text);
    } catch {
    }
  }
  opts.onDone();
}
async function streamOpenAI(opts) {
  return streamOpenAICompat(opts, "https://api.openai.com/v1/chat/completions");
}
async function streamGemini(opts) {
  if (!opts.apiKey) throw new Error("Gemini provider requires an API key");
  const contents = opts.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
  const body = { contents };
  if (opts.systemPrompt) {
    body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:streamGenerateContent?key=${opts.apiKey}&alt=sse`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }
  for await (const line of readSSELines(res.body)) {
    if (!line.startsWith("data: ")) continue;
    const raw = line.slice(6).trim();
    if (!raw) continue;
    try {
      const evt = JSON.parse(raw);
      const text = evt.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) opts.onChunk(text);
    } catch {
    }
  }
  opts.onDone();
}
async function streamCodex(opts) {
  const candidates = [
    join8(process.cwd(), "node_modules", ".bin", "codex"),
    "/usr/local/bin/codex",
    "codex"
  ];
  const codexBin = candidates.find((p) => {
    try {
      return existsSync7(p);
    } catch {
      return false;
    }
  }) ?? "codex";
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  const prompt = lastUser?.content ?? "";
  return new Promise((resolve4, reject) => {
    const args = ["--approval-mode", "full-auto", "-q", prompt];
    if (opts.model) args.unshift("--model", opts.model);
    const proc = spawn4(codexBin, args, {
      env: { ...process.env, OPENAI_API_KEY: opts.apiKey ?? process.env.OPENAI_API_KEY ?? "" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    proc.stdout.on("data", (chunk) => opts.onChunk(chunk.toString()));
    proc.stderr.on("data", () => {
    });
    proc.on("close", (code) => {
      if (code === 0 || code === null) {
        opts.onDone();
        resolve4();
      } else {
        const e = new Error(`codex exited with code ${code}`);
        opts.onError(e);
        reject(e);
      }
    });
    proc.on("error", (err) => {
      opts.onError(err);
      reject(err);
    });
  });
}
async function streamOllama(opts) {
  const base = opts.baseUrl ?? "http://localhost:11434";
  const messages = opts.systemPrompt ? [{ role: "system", content: opts.systemPrompt }, ...opts.messages] : opts.messages;
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: opts.model, stream: true, messages })
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }
  for await (const line of readJSONLines(res.body)) {
    const evt = line;
    if (evt.message?.content) opts.onChunk(evt.message.content);
    if (evt.done) break;
  }
  opts.onDone();
}

// server/lib/context-analytics.ts
import { existsSync as existsSync8, mkdirSync as mkdirSync5, readFileSync as readFileSync6, writeFileSync as writeFileSync5 } from "fs";
import { join as join9 } from "path";
function parseClaudeMdSections(content) {
  const headings = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^#{1,6}\s+(.+)$/);
    if (m) {
      const heading = m[1].trim();
      if (heading) headings.push(heading);
    }
  }
  return headings;
}
function scoreOutputChunk(chunk, sections) {
  const hits = /* @__PURE__ */ new Map();
  if (!chunk || sections.length === 0) return hits;
  const lowerChunk = chunk.toLowerCase();
  for (const heading of sections) {
    const key = heading.toLowerCase();
    if (key.length < 4) continue;
    let count = 0;
    let pos = 0;
    while ((pos = lowerChunk.indexOf(key, pos)) !== -1) {
      count++;
      pos += key.length;
    }
    if (count > 0) {
      hits.set(heading, count);
    }
  }
  return hits;
}
function analyticsPath(dataDir, sessionId) {
  return join9(dataDir, "analytics", `${sessionId}.json`);
}
function ensureDir(dataDir) {
  const dir = join9(dataDir, "analytics");
  if (!existsSync8(dir)) {
    mkdirSync5(dir, { recursive: true });
  }
}
async function loadSessionAnalytics(dataDir, sessionId) {
  const path = analyticsPath(dataDir, sessionId);
  if (!existsSync8(path)) {
    return { sessionId, sectionHits: [], updatedAt: Date.now() };
  }
  try {
    const raw = readFileSync6(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { sessionId, sectionHits: [], updatedAt: Date.now() };
  }
}
async function saveSessionAnalytics(dataDir, analytics) {
  ensureDir(dataDir);
  const path = analyticsPath(dataDir, analytics.sessionId);
  writeFileSync5(path, JSON.stringify(analytics, null, 2), "utf-8");
}
async function updateAnalytics(dataDir, sessionId, outputChunk, sections) {
  const newHits = scoreOutputChunk(outputChunk, sections);
  if (newHits.size === 0) return;
  const analytics = await loadSessionAnalytics(dataDir, sessionId);
  const now = Date.now();
  for (const [heading, count] of newHits) {
    const existing = analytics.sectionHits.find((h) => h.heading === heading);
    if (existing) {
      existing.hitCount += count;
      existing.lastHitAt = now;
    } else {
      analytics.sectionHits.push({ heading, hitCount: count, lastHitAt: now });
    }
  }
  analytics.updatedAt = now;
  await saveSessionAnalytics(dataDir, analytics);
}

// server/lib/checkpoint.ts
import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
var execFile = promisify(execFileCb);
function slugify(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "checkpoint";
}
async function createCheckpoint(projectDir, label) {
  const opts = { cwd: projectDir };
  const timestamp = Date.now();
  const slug = `${timestamp}-${slugify(label)}`;
  const refName = `refs/studio-checkpoints/${slug}`;
  try {
    const { stdout: treeHash } = await execFile("git", ["write-tree"], opts);
    let parentArgs = [];
    try {
      const { stdout: headHash } = await execFile("git", ["rev-parse", "HEAD"], opts);
      if (headHash.trim()) parentArgs = ["-p", headHash.trim()];
    } catch {
    }
    const { stdout: commitHash } = await execFile(
      "git",
      ["commit-tree", treeHash.trim(), ...parentArgs, "-m", `studio-checkpoint: ${label}`],
      opts
    );
    await execFile("git", ["update-ref", refName, commitHash.trim()], opts);
    return { id: slug, ref: refName, label, timestamp };
  } catch {
    return null;
  }
}

// server/lib/env.ts
import { existsSync as existsSync9, readFileSync as readFileSync7 } from "fs";
import { join as join10 } from "path";
function loadProjectEnvVars(projectDir) {
  const vars = {};
  for (const fname of [".env", ".env.local"]) {
    const filePath = join10(projectDir, fname);
    if (!existsSync9(filePath)) continue;
    try {
      const raw = readFileSync7(filePath, "utf-8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        if (!key) continue;
        let value = trimmed.slice(eq + 1).trim();
        if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        vars[key] = value;
      }
    } catch {
    }
  }
  return vars;
}

// server/lib/mcp-studio.ts
import { writeFileSync as writeFileSync6, mkdirSync as mkdirSync6, existsSync as existsSync10, readFileSync as readFileSync8 } from "fs";
import { join as join11 } from "path";
import { tmpdir, homedir } from "os";
import { createHash } from "crypto";

// server/lib/mcp-bridge.ts
function generateBridgeScript(port, projectDir) {
  return `
const http = require("http");
const readline = require("readline");

const PORT = ${port};
const PROJECT_DIR = ${JSON.stringify(projectDir)};

const rl = readline.createInterface({ input: process.stdin, terminal: false });

function respond(id, result) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, result });
  process.stdout.write("Content-Length: " + Buffer.byteLength(msg) + "\\r\\n\\r\\n" + msg);
}

function respondError(id, code, message) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
  process.stdout.write("Content-Length: " + Buffer.byteLength(msg) + "\\r\\n\\r\\n" + msg);
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.get("http://localhost:" + PORT + path, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve({ raw: body }); }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

const TOOLS = [
  {
    name: "GetWorkspaceDiff",
    description: "Get the current workspace diff -- all changes on current branch vs last commit, including uncommitted changes. Use this when the user refers to the workspace diff, PR diff, or all changes.",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "Optional: specific file path for a focused diff" },
        stat: { type: "boolean", description: "Return git diff --stat summary instead of full diff" }
      }
    }
  },
  {
    name: "GetTerminalOutput",
    description: "Read recent output from the running terminal. Use this to check dev server errors, build output, or test results.",
    inputSchema: {
      type: "object",
      properties: {
        maxLines: { type: "number", description: "Maximum lines to return (default 100)" }
      }
    }
  },
  {
    name: "GetFileContent",
    description: "Read the content of a file in the project. The path is relative to the project root.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to project root" }
      },
      required: ["path"]
    }
  }
];

async function handleToolCall(name, args) {
  if (name === "GetWorkspaceDiff") {
    const params = new URLSearchParams();
    if (args.file) params.set("file", args.file);
    if (args.stat) params.set("stat", "true");
    const qs = params.toString();
    const data = await httpGet("/api/mcp/tools/diff" + (qs ? "?" + qs : ""));
    return data.diff ?? data.error ?? "No diff available";
  }
  if (name === "GetTerminalOutput") {
    const maxLines = args.maxLines || 100;
    const data = await httpGet("/api/mcp/tools/terminal?maxLines=" + maxLines);
    return data.output ?? data.error ?? "No terminal output available";
  }
  if (name === "GetFileContent") {
    if (!args.path) return "Error: path parameter is required";
    const data = await httpGet("/api/mcp/tools/file?path=" + encodeURIComponent(args.path));
    return data.content ?? data.error ?? "File not found";
  }
  return "Unknown tool: " + name;
}

// MCP uses Content-Length framed messages on stdio
let contentBuffer = "";
let expectedLength = -1;

process.stdin.on("data", (chunk) => {
  contentBuffer += chunk.toString();
  while (true) {
    if (expectedLength === -1) {
      const headerEnd = contentBuffer.indexOf("\\r\\n\\r\\n");
      if (headerEnd === -1) break;
      const header = contentBuffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\\s*(\\d+)/i);
      if (!match) { contentBuffer = contentBuffer.slice(headerEnd + 4); continue; }
      expectedLength = parseInt(match[1], 10);
      contentBuffer = contentBuffer.slice(headerEnd + 4);
    }
    if (contentBuffer.length < expectedLength) break;
    const msgStr = contentBuffer.slice(0, expectedLength);
    contentBuffer = contentBuffer.slice(expectedLength);
    expectedLength = -1;
    try {
      const msg = JSON.parse(msgStr);
      handleMessage(msg);
    } catch {}
  }
});

function handleMessage(msg) {
  const method = msg.method;
  const id = msg.id;

  if (method === "initialize") {
    respond(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "hashmark-studio", version: "0.1.0" }
    });
    return;
  }

  if (method === "notifications/initialized") {
    // Client ack -- no response needed
    return;
  }

  if (method === "tools/list") {
    respond(id, { tools: TOOLS });
    return;
  }

  if (method === "tools/call") {
    const toolName = msg.params?.name;
    const toolArgs = msg.params?.arguments ?? {};
    handleToolCall(toolName, toolArgs)
      .then((result) => {
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        respond(id, { content: [{ type: "text", text }] });
      })
      .catch((err) => {
        respondError(id, -32000, err.message || String(err));
      });
    return;
  }

  if (id !== undefined) {
    respondError(id, -32601, "Method not found: " + method);
  }
}

// Keep process alive
process.stdin.resume();
`.trim();
}

// server/lib/mcp-studio.ts
function createStudioMcpConfig(projectDir, port) {
  const bridgeScript = generateBridgeScript(port, projectDir);
  const configDir = join11(tmpdir(), "hashmark-studio-mcp");
  mkdirSync6(configDir, { recursive: true });
  const scriptPath = join11(configDir, `bridge-${port}.js`);
  writeFileSync6(scriptPath, bridgeScript, "utf-8");
  const userServers = collectUserMcpServers(projectDir);
  const config = {
    mcpServers: {
      ...userServers,
      "hashmark-studio": {
        command: "node",
        args: [scriptPath]
      }
    }
  };
  const content = JSON.stringify(config, null, 2);
  const hash = createHash("md5").update(content).digest("hex").slice(0, 12);
  const configPath = join11(configDir, `mcp-config-${hash}.json`);
  if (!existsSync10(configPath)) {
    writeFileSync6(configPath, content, "utf-8");
  }
  return configPath;
}
function collectUserMcpServers(projectDir) {
  const merged = {};
  const candidates = [
    join11(homedir(), ".claude", "claude_desktop_config.json"),
    join11(projectDir, ".mcp.json")
  ];
  for (const filePath of candidates) {
    if (!existsSync10(filePath)) continue;
    try {
      const raw = readFileSync8(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
        for (const [name, entry] of Object.entries(parsed.mcpServers)) {
          merged[name] = entry;
        }
      }
    } catch {
    }
  }
  return merged;
}

// server/routes/sessions.ts
function expandMentions(message, projectDir) {
  const MAX_FILE_BYTES = 1e5;
  const mentionRe = /@([\w./\-]+)/g;
  const seen = /* @__PURE__ */ new Set();
  const blocks = [];
  let match;
  while ((match = mentionRe.exec(message)) !== null) {
    const relPath = match[1];
    if (seen.has(relPath)) continue;
    seen.add(relPath);
    const fullPath = join12(projectDir, relPath);
    if (!fullPath.startsWith(projectDir + "/") && fullPath !== projectDir) continue;
    if (!existsSync11(fullPath)) continue;
    try {
      const raw = readFileSync9(fullPath);
      if (raw.length > MAX_FILE_BYTES) {
        blocks.push(`

**@${relPath}** (file too large to inline, ${raw.length} bytes)`);
        continue;
      }
      const content = raw.toString("utf-8");
      const ext = extname(relPath).slice(1) || "text";
      blocks.push(`

**@${relPath}**
\`\`\`${ext}
${content}
\`\`\``);
    } catch {
    }
  }
  return blocks.length > 0 ? message + blocks.join("") : message;
}
var studioPort = 3200;
function setStudioPort(port) {
  studioPort = port;
}
function findBin(name, projectDir) {
  const candidates = [
    join12(projectDir, "node_modules", ".bin", name),
    `/Applications/Conductor.app/Contents/Resources/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
    name
    // fallback to PATH
  ];
  return candidates.find((p) => {
    try {
      return existsSync11(p);
    } catch {
      return false;
    }
  }) ?? name;
}
function findClaudeBin(projectDir) {
  return findBin("claude", projectDir);
}
function resolveProvider(model) {
  if (model.startsWith("o3") || model.startsWith("gpt-") || model === "codex") return "codex";
  if (model.startsWith("gemini")) return "gemini";
  return "claude";
}
function buildConversationPrompt(history, newMessage, systemPrompt) {
  const parts = [];
  if (systemPrompt) {
    parts.push(systemPrompt);
    parts.push("");
  }
  if (history.length > 0) {
    parts.push("Prior conversation:");
    for (const msg of history) {
      const role = msg.role === "user" ? "Human" : "Assistant";
      parts.push(`${role}: ${msg.content}`);
    }
    parts.push("");
  }
  parts.push(`Human: ${newMessage}`);
  return parts.join("\n");
}
var activeProcesses = /* @__PURE__ */ new Map();
var SESSION_IDLE_TIMEOUT = 30 * 60 * 1e3;
var MAX_ACTIVE_SESSIONS = 5;
var sessionLastActivity = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  for (const [sid, lastActive] of sessionLastActivity) {
    if (now - lastActive > SESSION_IDLE_TIMEOUT && activeProcesses.has(sid)) {
      const proc = activeProcesses.get(sid);
      try {
        proc?.kill();
      } catch {
      }
      activeProcesses.delete(sid);
      sessionLastActivity.delete(sid);
    }
  }
  if (activeProcesses.size > MAX_ACTIVE_SESSIONS) {
    const sorted = [...sessionLastActivity.entries()].sort((a, b) => a[1] - b[1]);
    while (activeProcesses.size > MAX_ACTIVE_SESSIONS && sorted.length > 0) {
      const [sid] = sorted.shift();
      try {
        activeProcesses.get(sid)?.kill();
      } catch {
      }
      activeProcesses.delete(sid);
      sessionLastActivity.delete(sid);
    }
  }
}, 6e4);
function killAllActiveSessions() {
  for (const proc of activeProcesses.values()) {
    try {
      proc.kill();
    } catch {
    }
  }
  activeProcesses.clear();
  sessionLastActivity.clear();
}
function sessionsRoutes(projectDir) {
  const dataDir = `${projectDir}/.hashmark`;
  const app = new Hono5();
  app.get("/config", (c) => {
    const claudeBin = findClaudeBin(projectDir);
    const claudeAvailable = existsSync11(claudeBin) || claudeBin === "claude";
    return c.json({ claudeAvailable, claudeBin });
  });
  app.get("/search", (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (q.length < 2) return c.json({ results: [] });
    const db = getDb(dataDir);
    const like = `%${q}%`;
    const rows = db.prepare(`
      SELECT s.id, s.title, s.model, s.updated_at, s.total_input_tokens, s.total_output_tokens,
        m.content as snippet, m.role as snippet_role
      FROM sessions s
      LEFT JOIN session_messages m ON m.id = (
        SELECT id FROM session_messages
        WHERE session_id = s.id AND content LIKE ?
        ORDER BY created_at ASC LIMIT 1
      )
      WHERE s.title LIKE ? OR m.content LIKE ?
      GROUP BY s.id
      ORDER BY s.updated_at DESC
      LIMIT 30
    `).all(like, like, like);
    const results = rows.map((r) => ({
      id: r.id,
      title: r.title,
      model: r.model,
      updatedAt: r.updated_at,
      snippet: r.snippet ? r.snippet.slice(0, 120) : null,
      snippetRole: r.snippet_role
    }));
    return c.json({ results });
  });
  app.get("/", (c) => {
    const db = getDb(dataDir);
    const archived = c.req.query("archived") === "true" ? 1 : 0;
    const sessions = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM session_messages WHERE session_id = s.id) as message_count
      FROM sessions s
      WHERE s.archived = ?
      ORDER BY s.updated_at DESC
    `).all(archived);
    return c.json({ sessions });
  });
  app.post("/", async (c) => {
    const body = await c.req.json();
    const db = getDb(dataDir);
    const id = randomUUID2();
    const now = Date.now();
    db.prepare(`
      INSERT INTO sessions (id, title, agent_id, agent_name, model, status, total_input_tokens, total_output_tokens, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'claude', 'idle', 0, 0, ?, ?)
    `).run(id, body.title ?? "New Session", body.agentId ?? null, body.agentName ?? null, now, now);
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
    return c.json({ session }, 201);
  });
  app.get("/:id", (c) => {
    const db = getDb(dataDir);
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(c.req.param("id"));
    if (!session) return c.json({ error: "Not found" }, 404);
    const messages = db.prepare(
      "SELECT * FROM session_messages WHERE session_id = ? ORDER BY created_at ASC"
    ).all(c.req.param("id"));
    return c.json({ session, messages });
  });
  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const active = activeProcesses.get(id);
    if (active) active.kill();
    activeProcesses.delete(id);
    sessionLastActivity.delete(id);
    const db = getDb(dataDir);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return c.json({ ok: true });
  });
  app.patch("/:id", async (c) => {
    const body = await c.req.json();
    const db = getDb(dataDir);
    const id = c.req.param("id");
    if (body.title !== void 0) {
      db.prepare("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?").run(body.title, Date.now(), id);
    }
    if (body.archived !== void 0) {
      db.prepare("UPDATE sessions SET archived = ?, updated_at = ? WHERE id = ?").run(body.archived ? 1 : 0, Date.now(), id);
    }
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
    return c.json({ session });
  });
  app.get("/:id/pending", (c) => {
    const db = getDb(dataDir);
    const row = db.prepare(
      "SELECT id, content FROM session_messages WHERE session_id = ? AND role = 'user' AND sent_at IS NULL ORDER BY created_at ASC LIMIT 1"
    ).get(c.req.param("id"));
    return c.json({ hasPending: !!row, message: row?.content ?? null });
  });
  app.post("/:id/interrupt", (c) => {
    const id = c.req.param("id");
    const active = activeProcesses.get(id);
    if (active) {
      active.kill();
      activeProcesses.delete(id);
      sessionLastActivity.delete(id);
      return c.json({ ok: true });
    }
    return c.json({ ok: false });
  });
  app.post("/:id/chat", async (c) => {
    const sessionId = c.req.param("id");
    const body = await c.req.json();
    const db = getDb(dataDir);
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    if (!session) return c.json({ error: "Not found" }, 404);
    sessionLastActivity.set(sessionId, Date.now());
    await createCheckpoint(projectDir, `pre-turn-${sessionId.slice(0, 8)}`).catch(() => null);
    const history = db.prepare(
      "SELECT role, content FROM session_messages WHERE session_id = ? AND (role = 'assistant' OR sent_at IS NOT NULL) ORDER BY created_at ASC"
    ).all(sessionId);
    const pendingMessages = db.prepare(
      "SELECT id, content FROM session_messages WHERE session_id = ? AND role = 'user' AND sent_at IS NULL ORDER BY created_at ASC"
    ).all(sessionId);
    let effectiveMessage = body.message;
    if (pendingMessages.length > 0) {
      const pendingTexts = pendingMessages.map((m) => m.content);
      pendingTexts.push(body.message);
      effectiveMessage = pendingTexts.join("\n\n---\n\n");
    }
    const userMsgId = randomUUID2();
    const inputEstimate = Math.ceil(body.message.length / 4);
    db.prepare(`
      INSERT INTO session_messages (id, session_id, role, content, input_tokens, created_at, sent_at)
      VALUES (?, ?, 'user', ?, ?, ?, NULL)
    `).run(userMsgId, sessionId, body.message, inputEstimate, Date.now());
    if (history.length === 0 && (session.title === "New Session" || session.title === "")) {
      const title = body.message.slice(0, 60).replace(/\n/g, " ");
      db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title, sessionId);
    }
    const claudeMdPath = join12(projectDir, "CLAUDE.md");
    let claudeSections = [];
    try {
      if (existsSync11(claudeMdPath)) {
        const raw = readFileSync9(claudeMdPath, "utf-8");
        claudeSections = parseClaudeMdSections(raw);
      }
    } catch {
    }
    const scanContext = loadScanContext(projectDir);
    const agentIdentity = session.agent_name ? `You are ${session.agent_name}, an AI assistant.` : null;
    const userSystemPrompt = body.systemPrompt ?? null;
    const effectiveSystemPrompt = [scanContext, agentIdentity, userSystemPrompt].filter(Boolean).join("\n\n---\n\n") || void 0;
    const expandedMessage = expandMentions(effectiveMessage, projectDir);
    const fullPrompt = buildConversationPrompt(history, expandedMessage, effectiveSystemPrompt);
    const providersStore = loadProviders(dataDir);
    const activeProvider = providersStore.providers.find((p) => p.id === providersStore.active);
    const useApiStream = providersStore.active !== "claude" || activeProvider?.apiKey && activeProvider.apiKey.length > 0;
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const send = (data) => {
          try {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}

`));
          } catch {
          }
        };
        let messageMarkedSent = false;
        const markMessagesSent = () => {
          if (messageMarkedSent) return;
          messageMarkedSent = true;
          const now = Date.now();
          db.prepare("UPDATE session_messages SET sent_at = ? WHERE id = ?").run(now, userMsgId);
          for (const pm of pendingMessages) {
            db.prepare("UPDATE session_messages SET sent_at = ? WHERE id = ?").run(now, pm.id);
          }
        };
        db.prepare("UPDATE sessions SET status = 'streaming', updated_at = ? WHERE id = ?").run(Date.now(), sessionId);
        if (useApiStream && activeProvider) {
          const apiMessages = history.map((m) => ({
            role: m.role,
            content: m.content
          }));
          apiMessages.push({ role: "user", content: expandedMessage });
          let fullText = "";
          let aborted = false;
          activeProcesses.set(sessionId, {
            kill: () => {
              aborted = true;
            }
          });
          streamAIResponse({
            provider: providersStore.active,
            model: providersStore.model,
            apiKey: activeProvider.apiKey,
            baseUrl: activeProvider.baseUrl,
            messages: apiMessages,
            systemPrompt: effectiveSystemPrompt,
            onChunk: (text) => {
              if (aborted) return;
              markMessagesSent();
              fullText += text;
              send({ type: "text", text });
              if (claudeSections.length > 0) {
                updateAnalytics(dataDir, sessionId, text, claudeSections).catch(() => {
                });
              }
            },
            onDone: () => {
              activeProcesses.delete(sessionId);
              sessionLastActivity.delete(sessionId);
              markMessagesSent();
              const savedText = fullText.trim() || "[no response]";
              const msgInputEstimate = Math.ceil(body.message.length / 4);
              const msgOutputEstimate = Math.ceil(savedText.length / 4);
              db.prepare(`
                INSERT INTO session_messages (id, session_id, role, content, input_tokens, output_tokens, created_at, sent_at)
                VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)
              `).run(randomUUID2(), sessionId, savedText, msgInputEstimate, msgOutputEstimate, Date.now(), Date.now());
              db.prepare(`
                UPDATE sessions
                SET status = 'idle',
                    total_input_tokens = total_input_tokens + ?,
                    total_output_tokens = total_output_tokens + ?,
                    updated_at = ?
                WHERE id = ?
              `).run(msgInputEstimate, msgOutputEstimate, Date.now(), sessionId);
              send({ type: "done", success: true });
              controller.close();
            },
            onError: (err) => {
              activeProcesses.delete(sessionId);
              sessionLastActivity.delete(sessionId);
              send({ type: "error", message: err.message });
              db.prepare(`
                INSERT INTO session_messages (id, session_id, role, content, created_at, sent_at)
                VALUES (?, ?, 'assistant', ?, ?, ?)
              `).run(randomUUID2(), sessionId, `Error: ${err.message}`, Date.now(), Date.now());
              db.prepare("UPDATE sessions SET status = 'idle', updated_at = ? WHERE id = ?").run(Date.now(), sessionId);
              controller.close();
            }
          }).catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            send({ type: "error", message: msg });
            controller.close();
          });
        } else {
          const provider = resolveProvider(body.model || "claude-sonnet-4-6");
          const cliBin = findBin(provider === "codex" ? "codex" : provider === "gemini" ? "gemini" : "claude", projectDir);
          let mcpConfigPath = null;
          try {
            mcpConfigPath = createStudioMcpConfig(projectDir, studioPort);
          } catch {
          }
          let cliArgs;
          const projectEnv = loadProjectEnvVars(projectDir);
          const cliEnv = {
            ...process.env,
            ...projectEnv
          };
          if (provider === "codex") {
            cliArgs = ["--quiet"];
            if (body.model) cliArgs.push("--model", body.model);
          } else if (provider === "gemini") {
            cliArgs = [];
            if (body.model) cliArgs.push("--model", body.model);
          } else {
            cliArgs = [
              "--output-format",
              "stream-json",
              "--verbose"
            ];
            if (session.claude_session_id) {
              cliArgs.push("--resume", session.claude_session_id);
            }
            if (body.thinking) cliArgs.push("--thinking");
            if (body.planMode) cliArgs.push("--permission-mode", "plan");
            if (mcpConfigPath) {
              cliArgs.unshift("--mcp-config", mcpConfigPath);
            }
            cliEnv.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = "1";
          }
          const proc = spawn5(cliBin, cliArgs, {
            cwd: projectDir,
            stdio: ["pipe", "pipe", "pipe"],
            env: cliEnv
          });
          activeProcesses.set(sessionId, { kill: () => proc.kill("SIGTERM") });
          proc.stdin.write(fullPrompt + "\n");
          proc.stdin.end();
          let fullText = "";
          let jsonBuffer = "";
          proc.stdout.on("data", (chunk) => {
            jsonBuffer += chunk.toString();
            const lines = jsonBuffer.split("\n");
            jsonBuffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const event = JSON.parse(line);
                if (event.type === "assistant" && event.message?.content) {
                  markMessagesSent();
                  for (const block of event.message.content) {
                    if (block.type === "text" && block.text) {
                      fullText += block.text;
                      send({ type: "text", text: block.text });
                      if (claudeSections.length > 0) {
                        updateAnalytics(dataDir, sessionId, block.text, claudeSections).catch(() => {
                        });
                      }
                    }
                    if (block.type === "thinking") {
                      send({ type: "thinking", content: block.text ?? "", id: block.id ?? randomUUID2() });
                    }
                    if (block.type === "tool_use") {
                      send({ type: "tool_use", tool: block.name, input: block.input });
                    }
                    if (block.type === "tool_result") {
                      send({ type: "tool_result", content: block.content });
                    }
                  }
                }
                if (event.type === "result") {
                  markMessagesSent();
                  if (event.session_id) {
                    db.prepare("UPDATE sessions SET claude_session_id = ? WHERE id = ?").run(event.session_id, sessionId);
                  }
                  const cost = event.total_cost_usd ?? 0;
                  const usage = event.usage ?? {};
                  send({ type: "done", cost, usage });
                }
              } catch {
                if (line.trim()) {
                  send({ type: "progress", message: line });
                }
              }
            }
          });
          proc.stderr.on("data", (chunk) => {
            const line = chunk.toString().trim();
            if (line && !line.startsWith("\u256D") && !line.startsWith("\u2502") && !line.startsWith("\u2570")) {
              send({ type: "progress", message: line });
            }
          });
          proc.on("close", (code) => {
            activeProcesses.delete(sessionId);
            sessionLastActivity.delete(sessionId);
            const killed = code === null || code === 130 || code === 143;
            const savedText = fullText.trim() || (killed ? "[interrupted]" : "[no response]");
            const msgInputEstimate = Math.ceil(body.message.length / 4);
            const msgOutputEstimate = Math.ceil(savedText.length / 4);
            db.prepare(`
              INSERT INTO session_messages (id, session_id, role, content, input_tokens, output_tokens, created_at, sent_at)
              VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)
            `).run(randomUUID2(), sessionId, savedText, msgInputEstimate, msgOutputEstimate, Date.now(), Date.now());
            db.prepare(`
              UPDATE sessions
              SET status = 'idle',
                  total_input_tokens = total_input_tokens + ?,
                  total_output_tokens = total_output_tokens + ?,
                  updated_at = ?
              WHERE id = ?
            `).run(msgInputEstimate, msgOutputEstimate, Date.now(), sessionId);
            if (code !== 0 && !killed) {
              send({ type: "done", success: false });
            } else if (killed) {
              send({ type: "done", success: false, interrupted: true });
            }
            controller.close();
          });
          proc.on("error", (err) => {
            activeProcesses.delete(sessionId);
            sessionLastActivity.delete(sessionId);
            send({ type: "error", message: err.message });
            db.prepare(`
              INSERT INTO session_messages (id, session_id, role, content, created_at, sent_at)
              VALUES (?, ?, 'assistant', ?, ?, ?)
            `).run(randomUUID2(), sessionId, `Error: ${err.message}`, Date.now(), Date.now());
            db.prepare("UPDATE sessions SET status = 'idle', updated_at = ? WHERE id = ?").run(Date.now(), sessionId);
            controller.close();
          });
        }
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  });
  app.get("/:id/analytics", async (c) => {
    const id = c.req.param("id");
    const db = getDb(dataDir);
    const session = db.prepare("SELECT id FROM sessions WHERE id = ?").get(id);
    if (!session) return c.json({ error: "Not found" }, 404);
    const analytics = await loadSessionAnalytics(dataDir, id);
    return c.json(analytics);
  });
  app.get("/:id/loop-analysis", (c) => {
    const db = getDb(dataDir);
    const session = db.prepare("SELECT id FROM sessions WHERE id = ?").get(c.req.param("id"));
    if (!session) return c.json({ error: "Not found" }, 404);
    const messages = db.prepare(
      "SELECT role, content FROM session_messages WHERE session_id = ? ORDER BY created_at ASC"
    ).all(c.req.param("id"));
    return c.json(analyzeSessionLoop(messages));
  });
  app.get("/:id/tokens", (c) => {
    const db = getDb(dataDir);
    const sessionId = c.req.param("id");
    const session = db.prepare(`
      SELECT total_input_tokens, total_output_tokens,
        (SELECT COUNT(*) FROM session_messages WHERE session_id = ?) as message_count,
        (SELECT COUNT(*) FROM session_messages WHERE session_id = ? AND role = 'user') as user_count,
        (SELECT COUNT(*) FROM session_messages WHERE session_id = ? AND role = 'assistant') as assistant_count,
        (SELECT COALESCE(SUM(input_tokens),0) FROM session_messages WHERE session_id = ? AND role = 'user') as user_input_tokens,
        (SELECT COALESCE(SUM(output_tokens),0) FROM session_messages WHERE session_id = ? AND role = 'assistant') as assistant_output_tokens
      FROM sessions WHERE id = ?
    `).get(
      sessionId,
      sessionId,
      sessionId,
      sessionId,
      sessionId,
      sessionId
    );
    if (!session) return c.json({ error: "Not found" }, 404);
    const total = session.total_input_tokens + session.total_output_tokens;
    const contextWindow = 2e5;
    const pct = Math.min(100, Math.round(total / contextWindow * 100));
    const wasteEstimatePct = Math.min(35, Math.round(session.message_count * 1.2));
    const messages = db.prepare(
      "SELECT content FROM session_messages WHERE session_id = ? ORDER BY created_at ASC"
    ).all(sessionId);
    const msgCount = messages.length;
    const earlyEnd = Math.floor(msgCount * 0.33);
    const midEnd = Math.floor(msgCount * 0.66);
    const stageBreakdown = { early: 0, middle: 0, recent: 0 };
    for (let i = 0; i < msgCount; i++) {
      const tokens = Math.ceil(messages[i].content.length / 4);
      if (i < earlyEnd) stageBreakdown.early += tokens;
      else if (i < midEnd) stageBreakdown.middle += tokens;
      else stageBreakdown.recent += tokens;
    }
    const avgMessageTokens = msgCount > 0 ? Math.round(total / msgCount) : 0;
    return c.json({
      inputTokens: session.total_input_tokens,
      outputTokens: session.total_output_tokens,
      userInputTokens: session.user_input_tokens,
      assistantOutputTokens: session.assistant_output_tokens,
      userCount: session.user_count,
      assistantCount: session.assistant_count,
      total,
      contextWindow,
      pct,
      messageCount: session.message_count,
      wasteEstimatePct,
      stageBreakdown,
      avgMessageTokens
    });
  });
  return app;
}

// server/routes/terminal.ts
import os from "os";
import { mkdtempSync, writeFileSync as writeFileSync7, rmSync } from "fs";
import { join as join13 } from "path";

// shared/ws-contracts.ts
function decodeTerminalMsg(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.type === "input" && typeof parsed.data === "string") {
      return { type: "input", data: parsed.data };
    }
    if (parsed.type === "resize" && typeof parsed.cols === "number" && typeof parsed.rows === "number") {
      return { type: "resize", cols: parsed.cols, rows: parsed.rows };
    }
    return null;
  } catch {
    return null;
  }
}

// server/routes/terminal.ts
var OSC633_PROMPT_START = "\x1B]633;A\x07";
var OSC633_PROMPT_END = "\x1B]633;B\x07";
var ZSH_INTEGRATION = `
# Studio shell integration (VSCode OSC 633 protocol)
__studio_preexec() {
  printf '\\033]633;C\\007'
  printf '\\033]633;E;%s\\007' "$1"
}
__studio_precmd() {
  local _exit=$?
  printf '\\033]633;D;%s\\007' "$_exit"
  printf '\\033]633;P;Cwd=%s\\007' "$PWD"
}
autoload -Uz add-zsh-hook
add-zsh-hook preexec __studio_preexec
add-zsh-hook precmd __studio_precmd
PS1=$'\\033]633;A\\007'$PS1$'\\033]633;B\\007'
`;
var BASH_INTEGRATION = `
# Studio shell integration (VSCode OSC 633 protocol)
__studio_preexec() {
  printf '\\033]633;C\\007'
  printf '\\033]633;E;%s\\007' "$BASH_COMMAND"
}
__studio_precmd() {
  local _exit=$?
  printf '\\033]633;D;%s\\007' "$_exit"
  printf '\\033]633;P;Cwd=%s\\007' "$PWD"
}
trap '__studio_preexec' DEBUG
PROMPT_COMMAND='__studio_precmd'\${PROMPT_COMMAND:+"; $PROMPT_COMMAND"}
PS1=$'\\033]633;A\\007'$PS1$'\\033]633;B\\007'
`;
function setupShellIntegration(shell) {
  const baseEnv = process.env;
  if (shell.endsWith("zsh")) {
    const origZdotdir = process.env.ZDOTDIR ?? process.env.HOME ?? os.homedir();
    const tmpDir = mkdtempSync(join13(os.tmpdir(), "studio-zsh-"));
    const zshrc = [
      "# source original rc if it exists",
      'if [[ -f "$STUDIO_ORIG_ZDOTDIR/.zshrc" ]]; then',
      '  source "$STUDIO_ORIG_ZDOTDIR/.zshrc"',
      "fi",
      ZSH_INTEGRATION
    ].join("\n");
    writeFileSync7(join13(tmpDir, ".zshrc"), zshrc, "utf-8");
    return {
      env: {
        ...baseEnv,
        ZDOTDIR: tmpDir,
        STUDIO_ORIG_ZDOTDIR: origZdotdir
      },
      cleanup: () => {
        try {
          rmSync(tmpDir, { recursive: true, force: true });
        } catch {
        }
      }
    };
  }
  if (shell.endsWith("bash")) {
    const origBashrc = process.env.HOME ? `${process.env.HOME}/.bashrc` : `${os.homedir()}/.bashrc`;
    const tmpDir = mkdtempSync(join13(os.tmpdir(), "studio-bash-"));
    const bashEnvFile = join13(tmpDir, "studio-init.bash");
    const bashrc = [
      "# source original rc \u2014 uses $STUDIO_ORIG_BASHRC env var",
      'if [[ -f "$STUDIO_ORIG_BASHRC" ]]; then',
      '  source "$STUDIO_ORIG_BASHRC"',
      "fi",
      BASH_INTEGRATION
    ].join("\n");
    writeFileSync7(bashEnvFile, bashrc, "utf-8");
    return {
      env: {
        ...baseEnv,
        BASH_ENV: bashEnvFile,
        STUDIO_ORIG_BASHRC: origBashrc
      },
      cleanup: () => {
        try {
          rmSync(tmpDir, { recursive: true, force: true });
        } catch {
        }
      }
    };
  }
  return {
    env: { ...baseEnv },
    cleanup: () => {
    }
  };
}
async function spawnPty(projectDir) {
  const shell = process.env.SHELL ?? (os.platform() === "win32" ? "cmd.exe" : "/bin/zsh");
  const { env, cleanup } = setupShellIntegration(shell);
  const pty = await import("./lib-234R4XPR.js");
  const proc = pty.spawn(shell, [], {
    name: "xterm-color",
    cols: 80,
    rows: 24,
    cwd: projectDir,
    env
  });
  return { proc, cleanup };
}
function attachTerminalWS(httpServer, projectDir) {
  void OSC633_PROMPT_START;
  void OSC633_PROMPT_END;
  import("ws").then(({ WebSocketServer }) => {
    const wss = new WebSocketServer({ noServer: true });
    httpServer.on("upgrade", (request, socket, head) => {
      const url = request.url ?? "";
      if (!url.startsWith("/api/terminal/ws")) return;
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });
    wss.on("connection", async (ws) => {
      let ptyProcess = null;
      try {
        ptyProcess = await spawnPty(projectDir);
      } catch (err) {
        ws.send(`\r
Failed to start terminal: ${err}\r
`);
        ws.close();
        return;
      }
      const { proc, cleanup } = ptyProcess;
      proc.onData((data) => {
        try {
          ws.send(data);
        } catch {
        }
      });
      proc.onExit(() => {
        cleanup();
        try {
          ws.close();
        } catch {
        }
      });
      ws.on("message", (raw) => {
        const msg = raw.toString();
        const parsed = decodeTerminalMsg(msg);
        if (parsed?.type === "resize") {
          proc.resize(parsed.cols, parsed.rows);
        } else if (parsed?.type === "input") {
          proc.write(parsed.data);
        } else {
          proc.write(msg);
        }
      });
      ws.on("close", () => {
        cleanup();
        proc.kill();
        ptyProcess = null;
      });
      ws.on("error", () => {
        cleanup();
        proc.kill();
        ptyProcess = null;
      });
    });
  });
}

// server/routes/files.ts
import { Hono as Hono6 } from "hono";
import { readdir, stat, readFile, writeFile, mkdir, rename, rm } from "fs/promises";
import { join as join15, relative as relative3, extname as extname3, resolve as resolve2, dirname as dirname2 } from "path";
import { execFile as execFile2 } from "child_process";
import { promisify as promisify2 } from "util";
import { existsSync as existsSync12 } from "fs";

// server/lib/dep-graph.ts
import { execFileSync } from "child_process";
import { readFileSync as readFileSync10, readdirSync as readdirSync2, statSync as statSync2 } from "fs";
import { join as join14, relative as relative2, extname as extname2 } from "path";
function getChangedFiles(cwd, branch, base = "HEAD") {
  try {
    const output = execFileSync(
      "git",
      ["diff", "--numstat", `${base}...${branch}`],
      { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    return output.trim().split("\n").filter(Boolean).map((line) => {
      const [add, del, path] = line.split("	");
      const additions = parseInt(add) || 0;
      const deletions = parseInt(del) || 0;
      let status = "M";
      if (additions > 0 && deletions === 0) status = "A";
      if (additions === 0 && deletions > 0) status = "D";
      return { path, status, additions, deletions };
    });
  } catch {
    return [];
  }
}
var HIGH_IMPACT_PATTERNS = [
  /package\.json$/,
  /tsconfig.*\.json$/,
  /\.env/,
  /prisma\/schema/,
  /schema\.(ts|js)$/,
  /middleware\.(ts|js)$/
];
function scoreSeverity(file, workerCount) {
  if (workerCount > 2) return "high";
  if (HIGH_IMPACT_PATTERNS.some((p) => p.test(file))) return "high";
  return "medium";
}
function detectConflicts(cwd, workers, baseBranch = "main") {
  const fileToWorkers = /* @__PURE__ */ new Map();
  for (const worker of workers) {
    const files = getChangedFiles(cwd, worker.branch, baseBranch);
    for (const file of files) {
      const existing = fileToWorkers.get(file.path) ?? [];
      existing.push(worker.id);
      fileToWorkers.set(file.path, existing);
    }
  }
  const conflicts = [];
  for (const [file, workerIds] of fileToWorkers) {
    if (workerIds.length > 1) {
      conflicts.push({
        file,
        workers: workerIds,
        severity: scoreSeverity(file, workerIds.length)
      });
    }
  }
  const order = { high: 0, medium: 1, low: 2 };
  conflicts.sort((a, b) => order[a.severity] - order[b.severity]);
  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
    summary: conflicts.length === 0 ? "No conflicts detected" : `${conflicts.length} file(s) modified by multiple workers`
  };
}
var SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs"
]);
var IGNORED_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".cache",
  "__pycache__",
  "coverage",
  ".turbo"
]);
function extractImports(content) {
  const imports = [];
  const esRe = /(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  for (const m of content.matchAll(esRe)) imports.push(m[1]);
  const sideRe = /import\s+['"]([^'"]+)['"]/g;
  for (const m of content.matchAll(sideRe)) imports.push(m[1]);
  const dynRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of content.matchAll(dynRe)) imports.push(m[1]);
  const reqRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of content.matchAll(reqRe)) imports.push(m[1]);
  return imports.filter((s) => s.startsWith(".") || s.startsWith("@/"));
}
function buildImportMap(projectDir) {
  const result = /* @__PURE__ */ new Map();
  let count = 0;
  const MAX_FILES = 5e3;
  function walk(dir) {
    if (count >= MAX_FILES) return;
    let entries;
    try {
      entries = readdirSync2(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (count >= MAX_FILES) break;
      if (IGNORED_DIRS.has(name) || name.startsWith(".")) continue;
      const fullPath = join14(dir, name);
      let s;
      try {
        s = statSync2(fullPath);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        walk(fullPath);
      } else if (SOURCE_EXTENSIONS.has(extname2(name))) {
        count++;
        const relPath = relative2(projectDir, fullPath);
        try {
          const content = readFileSync10(fullPath, "utf-8");
          const imports = extractImports(content);
          result.set(relPath, imports);
        } catch {
        }
      }
    }
  }
  walk(projectDir);
  return result;
}
function resolveImportToPath(specifier, importerRelDir) {
  if (specifier.startsWith("@/")) {
    return specifier.slice(2);
  }
  if (!specifier.startsWith(".")) return null;
  const parts = importerRelDir.split("/");
  const specParts = specifier.split("/");
  for (const seg of specParts) {
    if (seg === ".") continue;
    if (seg === "..") {
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join("/");
}
function findImpactedFiles(projectDir, changedFiles) {
  const importMap = buildImportMap(projectDir);
  const changedStems = /* @__PURE__ */ new Set();
  const changedPaths = /* @__PURE__ */ new Set();
  for (const f of changedFiles) {
    changedPaths.add(f.path);
    const ext = extname2(f.path);
    changedStems.add(ext ? f.path.slice(0, -ext.length) : f.path);
    if (f.path.endsWith("/index.ts") || f.path.endsWith("/index.tsx") || f.path.endsWith("/index.js") || f.path.endsWith("/index.jsx")) {
      changedStems.add(f.path.replace(/\/index\.(ts|tsx|js|jsx)$/, ""));
    }
  }
  const impacted = [];
  for (const [filePath, imports] of importMap) {
    if (changedPaths.has(filePath)) continue;
    const fileDir = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "";
    const dependsOn = [];
    for (const spec of imports) {
      const resolved = resolveImportToPath(spec, fileDir);
      if (!resolved) continue;
      if (changedStems.has(resolved)) {
        const match = changedFiles.find((f) => {
          const ext = extname2(f.path);
          const stem = ext ? f.path.slice(0, -ext.length) : f.path;
          return stem === resolved;
        });
        if (match) dependsOn.push(match.path);
      }
    }
    if (dependsOn.length > 0) {
      impacted.push({ file: filePath, dependsOn: [...new Set(dependsOn)] });
    }
  }
  impacted.sort((a, b) => b.dependsOn.length - a.dependsOn.length);
  return impacted;
}
function analyzeImpact(projectDir, branch, base = "HEAD") {
  const changedFiles = getChangedFiles(projectDir, branch, base);
  const impacted = findImpactedFiles(projectDir, changedFiles);
  const totalImpacted = impacted.length;
  const summary = changedFiles.length === 0 ? "No changes detected" : `${changedFiles.length} file(s) changed, ${totalImpacted} downstream file(s) may be affected`;
  return { changedFiles, impacted, summary };
}

// server/routes/files.ts
var execAsync = promisify2(execFile2);
var IGNORED = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".cache",
  "__pycache__",
  ".pytest_cache",
  "coverage",
  ".turbo",
  ".vercel"
]);
async function buildTree(dir, root, depth = 0) {
  if (depth > 4) return [];
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const nodes = [];
  for (const name of entries) {
    if (name.startsWith(".") && name !== ".claude") continue;
    if (IGNORED.has(name)) continue;
    const fullPath = join15(dir, name);
    const relPath = relative3(root, fullPath);
    let s;
    try {
      s = await stat(fullPath);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      nodes.push({ name, path: relPath, type: "dir", children: await buildTree(fullPath, root, depth + 1) });
    } else {
      nodes.push({
        name,
        path: relPath,
        type: "file",
        ext: extname3(name).slice(1),
        size: s.size,
        mtime: s.mtimeMs
      });
    }
  }
  nodes.sort((a, b) => a.type !== b.type ? a.type === "dir" ? -1 : 1 : a.name.localeCompare(b.name));
  return nodes;
}
function filesRoutes(projectDir) {
  const app = new Hono6();
  app.get("/tree", async (c) => {
    const tree = await buildTree(projectDir, projectDir);
    return c.json({ tree, root: projectDir });
  });
  app.get("/list", async (c) => {
    try {
      const { stdout } = await execAsync(
        "git",
        ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        { cwd: projectDir, maxBuffer: 4 * 1024 * 1024 }
      );
      const files = stdout.split("\0").filter(Boolean).map((p) => {
        const parts = p.split("/");
        const name = parts[parts.length - 1];
        const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : void 0;
        return { name, path: p, ext };
      });
      return c.json({ files });
    } catch {
      let flatten2 = function(nodes) {
        for (const n of nodes) {
          if (n.type === "file") flat.push({ name: n.name, path: n.path, ext: n.ext });
          if (n.children) flatten2(n.children);
        }
      };
      var flatten = flatten2;
      const tree = await buildTree(projectDir, projectDir);
      const flat = [];
      flatten2(tree);
      return c.json({ files: flat });
    }
  });
  app.get("/read", async (c) => {
    const relPath = c.req.query("path");
    if (!relPath) return c.json({ error: "path required" }, 400);
    const fullPath = join15(projectDir, relPath);
    if (!fullPath.startsWith(projectDir + "/") && fullPath !== projectDir) return c.json({ error: "forbidden" }, 403);
    try {
      const content = await readFile(fullPath, "utf-8");
      return c.json({ content, path: relPath });
    } catch {
      return c.json({ error: "not found" }, 404);
    }
  });
  app.get("/diff", async (c) => {
    const relPath = c.req.query("path");
    if (!relPath) return c.json({ error: "path required" }, 400);
    const fullPath = join15(projectDir, relPath);
    if (!fullPath.startsWith(projectDir + "/") && fullPath !== projectDir) return c.json({ error: "forbidden" }, 403);
    const stagedParam = c.req.query("staged");
    const staged = stagedParam === "true" || stagedParam === "1";
    try {
      const args = staged ? ["diff", "--cached", "--", relPath] : ["diff", "--", relPath];
      const { stdout } = await execAsync("git", args, { cwd: projectDir });
      if (!stdout) {
        try {
          const content = await readFile(fullPath, "utf-8");
          const lines = content.split("\n").map((l) => `+${l}`).join("\n");
          const fakeDiff = `--- /dev/null
+++ b/${relPath}
@@ -0,0 +1,${content.split("\n").length} @@
${lines}`;
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
    const body = await c.req.json().catch(() => ({ paths: void 0 }));
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
    const body = await c.req.json().catch(() => ({ paths: void 0 }));
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
    const body = await c.req.json().catch(() => ({ paths: [] }));
    if (!body.paths?.length) return c.json({ error: "paths required" }, 400);
    try {
      for (const p of body.paths) {
        if (!safePath(p)) continue;
        try {
          await execAsync("git", ["checkout", "--", p], { cwd: projectDir });
        } catch {
          await execAsync("git", ["clean", "-f", p], { cwd: projectDir });
        }
      }
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });
  app.post("/commit", async (c) => {
    const body = await c.req.json();
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
  function safePath(relPath) {
    const full = resolve2(projectDir, relPath);
    if (!full.startsWith(projectDir + "/") && full !== projectDir) return null;
    return full;
  }
  app.post("/create", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const relPath = body.path;
    if (!relPath || typeof relPath !== "string") return c.json({ error: "path required" }, 400);
    const fullPath = safePath(relPath);
    if (!fullPath) return c.json({ error: "forbidden" }, 403);
    const isDir = body.type === "dir";
    try {
      if (isDir) {
        await mkdir(fullPath, { recursive: true });
      } else {
        await mkdir(dirname2(fullPath), { recursive: true });
        await writeFile(fullPath, body.content ?? "", "utf-8");
      }
      return c.json({ ok: true, path: relPath }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
  app.put("/rename", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.oldPath || !body.newPath) return c.json({ error: "oldPath and newPath required" }, 400);
    const fullOld = safePath(body.oldPath);
    const fullNew = safePath(body.newPath);
    if (!fullOld || !fullNew) return c.json({ error: "forbidden" }, 403);
    try {
      await mkdir(dirname2(fullNew), { recursive: true });
      await rename(fullOld, fullNew);
      return c.json({ ok: true, oldPath: body.oldPath, newPath: body.newPath });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
  app.delete("/delete", async (c) => {
    const relPath = c.req.query("path");
    if (!relPath) return c.json({ error: "path required" }, 400);
    const fullPath = safePath(relPath);
    if (!fullPath) return c.json({ error: "forbidden" }, 403);
    if (fullPath === projectDir) return c.json({ error: "cannot delete project root" }, 403);
    try {
      await rm(fullPath, { recursive: true });
      return c.json({ ok: true, path: relPath });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
  app.get("/search", async (c) => {
    const q = c.req.query("q") ?? "";
    if (!q) return c.json({ results: [], matchCount: 0 });
    const globPattern = c.req.query("glob") || void 0;
    const maxResults = 200;
    try {
      const args = [
        "--json",
        "--max-count",
        "50",
        // max matches per file
        "--max-filesize",
        "1M",
        "-n"
        // line numbers
      ];
      if (globPattern) {
        args.push("--glob", globPattern);
      }
      args.push("--", q, ".");
      const { stdout } = await execAsync("rg", args, {
        cwd: projectDir,
        maxBuffer: 8 * 1024 * 1024
      });
      const matches = [];
      for (const line of stdout.split("\n")) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.type === "match" && obj.data) {
            matches.push({
              path: obj.data.path?.text ?? "",
              line: obj.data.line_number ?? 0,
              text: (obj.data.lines?.text ?? "").replace(/\n$/, "")
            });
          }
        } catch {
        }
      }
      const grouped = {};
      for (const m of matches) {
        const rel = m.path.startsWith("./") ? m.path.slice(2) : m.path;
        if (!grouped[rel]) grouped[rel] = [];
        grouped[rel].push({ line: m.line, text: m.text });
      }
      const results2 = Object.entries(grouped).slice(0, maxResults).map(([file, lines]) => ({
        file,
        matches: lines
      }));
      const matchCount2 = matches.length;
      return c.json({ results: results2, matchCount: matchCount2 });
    } catch {
    }
    const SEARCH_EXTS = /* @__PURE__ */ new Set([
      "ts",
      "tsx",
      "js",
      "jsx",
      "mjs",
      "cjs",
      "py",
      "go",
      "rs",
      "rb",
      "java",
      "c",
      "cpp",
      "h",
      "cs",
      "swift",
      "kt",
      "sh",
      "bash",
      "sql",
      "json",
      "yaml",
      "yml",
      "toml",
      "md",
      "txt",
      "css",
      "scss",
      "html",
      "xml",
      "vue",
      "svelte"
    ]);
    const results = [];
    let matchCount = 0;
    async function searchDir(dir, depth) {
      if (depth > 5 || results.length >= maxResults) return;
      let entries;
      try {
        entries = await readdir(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        if (results.length >= maxResults) break;
        if (name.startsWith(".")) continue;
        if (IGNORED.has(name)) continue;
        const fullPath = join15(dir, name);
        let s;
        try {
          s = await stat(fullPath);
        } catch {
          continue;
        }
        if (s.isDirectory()) {
          await searchDir(fullPath, depth + 1);
        } else if (s.isFile() && s.size < 1e6) {
          const ext = extname3(name).slice(1).toLowerCase();
          if (!SEARCH_EXTS.has(ext)) continue;
          if (globPattern) {
            const globExt = globPattern.replace("*.", "");
            if (ext !== globExt) continue;
          }
          try {
            const content = await readFile(fullPath, "utf-8");
            const lines = content.split("\n");
            const fileMatches = [];
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(q)) {
                fileMatches.push({ line: i + 1, text: lines[i] });
                matchCount++;
              }
            }
            if (fileMatches.length > 0) {
              results.push({ file: relative3(projectDir, fullPath), matches: fileMatches });
            }
          } catch {
          }
        }
      }
    }
    await searchDir(projectDir, 0);
    return c.json({ results, matchCount });
  });
  app.get("/impact", (c) => {
    const branch = c.req.query("branch");
    if (!branch) return c.json({ error: "branch query param required" }, 400);
    const base = c.req.query("base") ?? "HEAD";
    if (branch.startsWith("-") || base.startsWith("-")) return c.json({ error: "invalid ref name" }, 400);
    const report = analyzeImpact(projectDir, branch, base);
    return c.json(report);
  });
  app.get("/symbols", async (c) => {
    const relPath = c.req.query("path");
    if (!relPath) return c.json({ error: "path required" }, 400);
    const fullPath = join15(projectDir, relPath);
    if (!fullPath.startsWith(projectDir + "/") && fullPath !== projectDir) return c.json({ error: "forbidden" }, 403);
    try {
      const content = await readFile(fullPath, "utf-8");
      const lines = content.split("\n");
      const symbols = [];
      const patterns = [
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
        { re: /^(?:pub\s+)?trait\s+(\w+)/, kind: "interface" }
      ];
      const skipNames = /* @__PURE__ */ new Set([
        "if",
        "else",
        "for",
        "while",
        "switch",
        "case",
        "return",
        "break",
        "continue",
        "try",
        "catch",
        "throw",
        "new",
        "get",
        "set",
        "of",
        "in",
        "do",
        "it",
        "to"
      ]);
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trimStart();
        if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("#")) continue;
        for (const { re, kind } of patterns) {
          const m = trimmed.match(re);
          if (m && m[1] && m[1].length > 1 && !skipNames.has(m[1])) {
            if (kind === "const") {
              const already = symbols.some((s) => s.name === m[1] && s.line === i + 1);
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
    const cachePath = join15(projectDir, ".hashmark", "complexity-cache.json");
    if (!existsSync12(cachePath)) return c.json({ data: null });
    try {
      const raw = await readFile(cachePath, "utf-8");
      return c.json({ data: JSON.parse(raw) });
    } catch {
      return c.json({ data: null });
    }
  });
  app.get("/git/log", async (c) => {
    try {
      const { stdout: logRaw } = await execAsync(
        "git",
        ["log", "--format=%H|%h|%s|%an|%ai", "-50"],
        { cwd: projectDir, maxBuffer: 4 * 1024 * 1024 }
      );
      const commitLines = logRaw.trim().split("\n").filter(Boolean);
      const { stdout: numstatRaw } = await execAsync(
        "git",
        ["log", "--format=COMMIT:%H", "--numstat", "-50"],
        { cwd: projectDir, maxBuffer: 8 * 1024 * 1024 }
      );
      const statsMap = {};
      let currentHash = "";
      for (const line of numstatRaw.split("\n")) {
        if (line.startsWith("COMMIT:")) {
          currentHash = line.slice(7).trim();
          statsMap[currentHash] = { filesChanged: 0, insertions: 0, deletions: 0, files: [] };
        } else if (currentHash && line.trim()) {
          const parts = line.split("	");
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
      const { stdout: branchRaw } = await execAsync(
        "git",
        ["branch", "-v", "--no-abbrev"],
        { cwd: projectDir }
      ).catch(() => ({ stdout: "" }));
      const branchMap = {};
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
          branches: branchMap[hash] ?? []
        };
      });
      return c.json({ commits });
    } catch (err) {
      return c.json({ commits: [], error: String(err) });
    }
  });
  app.get("/git/commit-diff", async (c) => {
    const hash = c.req.query("hash");
    const file = c.req.query("file");
    if (!hash || !file) return c.json({ error: "hash and file required" }, 400);
    if (!/^[0-9a-fA-F]{4,40}$/.test(hash)) return c.json({ error: "invalid hash" }, 400);
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
        execAsync("git", ["branch", "--show-current"], { cwd: projectDir })
      ]);
      const branches = branchesOut.stdout.trim().split("\n").filter(Boolean);
      const current = currentOut.stdout.trim();
      return c.json({ branches, current });
    } catch (err) {
      return c.json({ branches: [], current: "", error: String(err) });
    }
  });
  app.post("/git/branch", async (c) => {
    const body = await c.req.json().catch(() => ({ name: "" }));
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
    const body = await c.req.json().catch(() => ({ branch: "" }));
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
  app.get("/git/gh-available", async (c) => {
    try {
      await execAsync("which", ["gh"]);
      await execAsync("gh", ["auth", "status"], { cwd: projectDir });
      return c.json({ available: true });
    } catch {
      return c.json({ available: false });
    }
  });
  app.post("/git/create-pr", async (c) => {
    const body = await c.req.json().catch(() => ({ title: "", body: void 0, base: void 0 }));
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
      const { stdout } = await execAsync("gh", args, { cwd: projectDir, timeout: 3e4 });
      const url = stdout.trim();
      return c.json({ ok: true, url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stderrMatch = msg.match(/stderr:\s*([\s\S]*)/);
      return c.json({ error: stderrMatch ? stderrMatch[1].trim() : msg }, 500);
    }
  });
  app.get("/git/outgoing", async (c) => {
    try {
      const { stdout: branchRaw } = await execAsync(
        "git",
        ["rev-parse", "--abbrev-ref", "HEAD"],
        { cwd: projectDir }
      );
      const branch = branchRaw.trim();
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
        execAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: projectDir })
      ]);
      const branch = branchOut.stdout.trim();
      let ahead = 0;
      let behind = 0;
      try {
        const { stdout: revCount } = await execAsync(
          "git",
          ["rev-list", "--left-right", "--count", `${branch}...@{u}`],
          { cwd: projectDir }
        );
        const parts = revCount.trim().split(/\s+/);
        ahead = parseInt(parts[0]) || 0;
        behind = parseInt(parts[1]) || 0;
      } catch {
      }
      const rawFiles = statusOut.stdout.trim().split("\n").filter(Boolean).map((line) => {
        const xy = line.slice(0, 2);
        const file = line.slice(3).trim();
        const x = xy[0];
        const y = xy[1];
        const isUntracked = x === "?" && y === "?";
        const isStaged = x !== " " && x !== "?";
        const isUnstaged = !isUntracked && y !== " ";
        return { status: xy, file, x, y, isStaged, isUnstaged, isUntracked };
      });
      const filesWithStats = await Promise.all(rawFiles.map(async (f) => {
        try {
          const args = f.isStaged ? ["diff", "--numstat", "--cached", "--", f.file] : ["diff", "--numstat", "HEAD", "--", f.file];
          const { stdout } = await execAsync("git", args, { cwd: projectDir });
          const parts = stdout.trim().split("	");
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

// server/routes/workspace.ts
import { Hono as Hono7 } from "hono";
import { existsSync as existsSync13, readFileSync as readFileSync11, writeFileSync as writeFileSync8, mkdirSync as mkdirSync7 } from "fs";
import { join as join16, resolve as resolve3 } from "path";
import { spawn as spawn6 } from "child_process";
function getConfigPath(projectDir) {
  return join16(projectDir, ".hashmark", "workspace.json");
}
function readConfig(projectDir) {
  try {
    const p = getConfigPath(projectDir);
    if (existsSync13(p)) return JSON.parse(readFileSync11(p, "utf-8"));
  } catch {
  }
  return {};
}
function writeConfig(projectDir, config) {
  const dir = join16(projectDir, ".hashmark");
  mkdirSync7(dir, { recursive: true });
  writeFileSync8(getConfigPath(projectDir), JSON.stringify(config, null, 2));
}
var runningProcesses = /* @__PURE__ */ new Map();
function streamCommand(name, command, cwd, env) {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (data) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}

`));
        } catch {
        }
      };
      const parts = command.trim().split(/\s+/);
      const bin = parts[0];
      const args = parts.slice(1);
      send({ type: "start", command });
      const proc = spawn6(bin, args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...env },
        shell: false
      });
      runningProcesses.set(name, {
        name,
        kill: () => proc.kill("SIGTERM")
      });
      proc.stdout.on("data", (chunk) => {
        send({ type: "stdout", text: chunk.toString() });
      });
      proc.stderr.on("data", (chunk) => {
        send({ type: "stderr", text: chunk.toString() });
      });
      proc.on("close", (code) => {
        runningProcesses.delete(name);
        send({ type: "done", code, success: code === 0 || code === null });
        controller.close();
      });
      proc.on("error", (err) => {
        runningProcesses.delete(name);
        send({ type: "error", message: err.message });
        controller.close();
      });
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}
function workspaceRoutes(projectDir) {
  const app = new Hono7();
  app.post("/detect", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const rawPath = body.path?.trim();
    const dir = rawPath ? resolve3(projectDir, rawPath) : projectDir;
    if (rawPath && !dir.startsWith(projectDir + "/") && dir !== projectDir) {
      return c.json({ error: "forbidden" }, 403);
    }
    if (!existsSync13(dir)) return c.json({ error: "path not found" }, 400);
    const name = (() => {
      try {
        const pkgPath = join16(dir, "package.json");
        if (existsSync13(pkgPath)) {
          const pkg = JSON.parse(readFileSync11(pkgPath, "utf-8"));
          if (pkg.name) return pkg.name;
        }
      } catch {
      }
      return dir.split("/").filter(Boolean).pop() ?? "project";
    })();
    const checks = [
      { file: "tsconfig.json", framework: "TypeScript" },
      { file: "package.json", framework: "JavaScript" },
      { file: "Cargo.toml", framework: "Rust" },
      { file: "go.mod", framework: "Go" },
      { file: "pyproject.toml", framework: "Python" },
      { file: "setup.py", framework: "Python" },
      { file: "requirements.txt", framework: "Python" },
      { file: "Gemfile", framework: "Ruby" },
      { file: "pom.xml", framework: "Java" },
      { file: "build.gradle", framework: "Java" }
    ];
    let framework = "Unknown";
    for (const check of checks) {
      if (existsSync13(join16(dir, check.file))) {
        framework = check.framework;
        break;
      }
    }
    return c.json({ framework, name });
  });
  app.get("/config", (c) => {
    return c.json({ config: readConfig(projectDir) });
  });
  app.put("/config", async (c) => {
    const body = await c.req.json();
    const current = readConfig(projectDir);
    const updated = { ...current, ...body };
    writeConfig(projectDir, updated);
    return c.json({ config: updated });
  });
  app.post("/run-setup", (c) => {
    const config = readConfig(projectDir);
    if (!config.setupCommand) return c.json({ error: "No setup command configured" }, 400);
    return streamCommand("setup", config.setupCommand, projectDir, config.env ?? {});
  });
  app.post("/run", (c) => {
    const config = readConfig(projectDir);
    if (!config.runCommand) return c.json({ error: "No run command configured" }, 400);
    return streamCommand("run", config.runCommand, projectDir, config.env ?? {});
  });
  app.post("/stop", async (c) => {
    const body = await c.req.json().catch(() => ({ processName: "" }));
    const proc = runningProcesses.get(body.processName);
    if (proc) {
      proc.kill();
      return c.json({ ok: true });
    }
    return c.json({ ok: false, error: "Process not found" });
  });
  app.get("/status", (c) => {
    const running = Array.from(runningProcesses.keys());
    return c.json({ running });
  });
  return app;
}

// server/routes/checkpoints.ts
import { Hono as Hono8 } from "hono";
import { execFile as execFileCb2 } from "child_process";
import { promisify as promisify3 } from "util";
var execFile3 = promisify3(execFileCb2);
function slugify2(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "checkpoint";
}
function checkpointRoutes(projectDir) {
  const app = new Hono8();
  const opts = { cwd: projectDir };
  app.get("/", async (c) => {
    let output = "";
    try {
      const result = await execFile3(
        "git",
        [
          "for-each-ref",
          "refs/studio-checkpoints",
          "--format=%(refname) %(objectname) %(committerdate:iso8601) %(subject)",
          "--sort=-committerdate"
        ],
        opts
      );
      output = result.stdout;
    } catch {
      return c.json({ checkpoints: [] });
    }
    const checkpoints = await Promise.all(
      output.trim().split("\n").filter(Boolean).map(async (line) => {
        const parts = line.match(
          /^(refs\/studio-checkpoints\/\S+)\s+(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\S+)\s+(.*)$/
        );
        if (!parts) return null;
        const ref = parts[1];
        const hash = parts[2];
        const timestamp = parts[3];
        const subject = parts[4];
        const label = subject.replace(/^studio-checkpoint:\s*/, "");
        let filesChanged = 0;
        try {
          const { stdout: diffStat } = await execFile3(
            "git",
            ["diff-tree", "--no-commit-id", "-r", "--name-only", hash],
            opts
          );
          filesChanged = diffStat.trim().split("\n").filter(Boolean).length;
        } catch {
        }
        let status = "active";
        try {
          const { stdout: mergeBase } = await execFile3(
            "git",
            ["merge-base", "--is-ancestor", hash, "HEAD"],
            opts
          );
          void mergeBase;
          status = "merged";
        } catch {
          try {
            const { stdout: refDate } = await execFile3(
              "git",
              ["log", "-1", "--format=%ct", hash],
              opts
            );
            const age = Date.now() / 1e3 - parseInt(refDate.trim());
            if (age > 7 * 24 * 3600) status = "abandoned";
          } catch {
          }
        }
        const slug = ref.replace("refs/studio-checkpoints/", "");
        return { id: slug, ref, hash: hash.slice(0, 7), hashFull: hash, timestamp, label, message: subject, filesChanged, status };
      })
    );
    return c.json({ checkpoints: checkpoints.filter(Boolean) });
  });
  app.get("/:id/diff", async (c) => {
    const id = c.req.param("id");
    const refName = `refs/studio-checkpoints/${id}`;
    let hash;
    try {
      const { stdout } = await execFile3("git", ["rev-parse", refName], opts);
      hash = stdout.trim();
    } catch {
      return c.json({ error: "checkpoint not found" }, 404);
    }
    let diff = "";
    try {
      const { stdout } = await execFile3(
        "git",
        ["show", "--format=", hash],
        { ...opts, maxBuffer: 4 * 1024 * 1024 }
      );
      diff = stdout;
    } catch {
    }
    return c.json({ diff });
  });
  app.post("/", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const timestamp = Date.now();
    const label = body.label || `checkpoint-${timestamp}`;
    const slug = `${timestamp}-${slugify2(label)}`;
    const refName = `refs/studio-checkpoints/${slug}`;
    const { stdout: treeHash } = await execFile3("git", ["write-tree"], opts);
    let parentArgs = [];
    try {
      const { stdout: headHash } = await execFile3("git", ["rev-parse", "HEAD"], opts);
      if (headHash.trim()) parentArgs = ["-p", headHash.trim()];
    } catch {
    }
    const { stdout: commitHash } = await execFile3(
      "git",
      ["commit-tree", treeHash.trim(), ...parentArgs, "-m", `studio-checkpoint: ${label}`],
      opts
    );
    await execFile3("git", ["update-ref", refName, commitHash.trim()], opts);
    return c.json({ ok: true, id: slug, ref: refName, label, timestamp });
  });
  app.post("/:id/restore", async (c) => {
    const id = c.req.param("id");
    const refName = `refs/studio-checkpoints/${id}`;
    let hash;
    try {
      const { stdout } = await execFile3("git", ["rev-parse", refName], opts);
      hash = stdout.trim();
    } catch {
      return c.json({ error: "checkpoint not found" }, 404);
    }
    const { stdout: objType } = await execFile3("git", ["cat-file", "-t", hash], opts);
    if (objType.trim() !== "commit") {
      return c.json({ error: "ref is not a commit" }, 400);
    }
    const branchName = `restore/${id}`;
    await execFile3("git", ["branch", "-f", branchName, hash], opts);
    return c.json({ ok: true, branch: branchName });
  });
  app.delete("/:refSlug", async (c) => {
    const refSlug = c.req.param("refSlug");
    if (refSlug === "prune") {
      return c.json({ error: "use DELETE /prune" }, 400);
    }
    const refName = `refs/studio-checkpoints/${refSlug}`;
    await execFile3("git", ["update-ref", "-d", refName], opts);
    return c.json({ ok: true });
  });
  app.delete("/prune", async (c) => {
    let output = "";
    try {
      const result = await execFile3(
        "git",
        [
          "for-each-ref",
          "refs/studio-checkpoints",
          "--format=%(refname) %(objectname) %(committerdate:unix)",
          "--sort=-committerdate"
        ],
        opts
      );
      output = result.stdout;
    } catch {
      return c.json({ pruned: 0 });
    }
    const cutoff = Date.now() / 1e3 - 7 * 24 * 3600;
    const lines = output.trim().split("\n").filter(Boolean);
    let pruned = 0;
    for (const line of lines) {
      const parts = line.split(" ");
      if (parts.length < 3) continue;
      const [refName, hash, unixTs] = parts;
      const age = parseFloat(unixTs);
      if (age > cutoff) continue;
      let shouldPrune = false;
      try {
        await execFile3("git", ["merge-base", "--is-ancestor", hash, "HEAD"], opts);
        shouldPrune = true;
      } catch {
        shouldPrune = true;
      }
      if (shouldPrune) {
        try {
          await execFile3("git", ["update-ref", "-d", refName], opts);
          pruned++;
        } catch {
        }
      }
    }
    return c.json({ ok: true, pruned });
  });
  app.post("/restore", async (c) => {
    const body = await c.req.json();
    const ref = body.ref;
    const { stdout: objType } = await execFile3("git", ["cat-file", "-t", ref], opts);
    if (objType.trim() !== "commit") {
      return c.json({ error: "ref is not a commit" }, 400);
    }
    await execFile3("git", ["checkout", ref, "--", "."], opts);
    return c.json({ ok: true });
  });
  return app;
}

// server/routes/mcp.ts
import { Hono as Hono9 } from "hono";
import { existsSync as existsSync14, readFileSync as readFileSync12, writeFileSync as writeFileSync9 } from "fs";
import { readFile as readFile2 } from "fs/promises";
import { join as join17 } from "path";
import { createHash as createHash2 } from "crypto";
import { tmpdir as tmpdir2, homedir as homedir2 } from "os";
import { spawn as spawn7, execFile as execFileCb3 } from "child_process";
import { promisify as promisify4 } from "util";
var execFile4 = promisify4(execFileCb3);
function readMcpFile(filePath) {
  if (!existsSync14(filePath)) return null;
  try {
    const raw = readFileSync12(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
function mcpRoutes(projectDir) {
  const app = new Hono9();
  app.get("/config", (c) => {
    const projectMcpPath = join17(projectDir, ".mcp.json");
    const globalMcpPath = join17(homedir2(), ".claude", "claude_desktop_config.json");
    const projectConfig = readMcpFile(projectMcpPath);
    const globalConfig = readMcpFile(globalMcpPath);
    const sources = [
      {
        path: projectMcpPath,
        exists: projectConfig !== null,
        serverCount: projectConfig?.mcpServers ? Object.keys(projectConfig.mcpServers).length : 0,
        label: "Project (.mcp.json)"
      },
      {
        path: globalMcpPath,
        exists: globalConfig !== null,
        serverCount: globalConfig?.mcpServers ? Object.keys(globalConfig.mcpServers).length : 0,
        label: "Global (claude_desktop_config.json)"
      }
    ];
    const merged = {};
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
  app.post("/test", async (c) => {
    const body = await c.req.json();
    const { serverName } = body;
    if (!serverName) {
      return c.json({ ok: false, error: "serverName required" }, 400);
    }
    const projectMcpPath = join17(projectDir, ".mcp.json");
    const globalMcpPath = join17(homedir2(), ".claude", "claude_desktop_config.json");
    const projectConfig = readMcpFile(projectMcpPath);
    const globalConfig = readMcpFile(globalMcpPath);
    const serverEntry = projectConfig?.mcpServers?.[serverName] ?? globalConfig?.mcpServers?.[serverName];
    if (!serverEntry) {
      return c.json({ ok: false, error: `Server "${serverName}" not found in any config` }, 404);
    }
    const testConfig = { mcpServers: { [serverName]: serverEntry } };
    const content = JSON.stringify(testConfig);
    const hash = createHash2("md5").update(content).digest("hex");
    const tmpPath = join17(tmpdir2(), `studio-mcp-test-${hash}.json`);
    writeFileSync9(tmpPath, content, "utf-8");
    return new Promise((resolve4) => {
      const timeout = setTimeout(() => {
        proc.kill("SIGTERM");
        resolve4(c.json({ ok: false, error: "Timeout after 10s" }));
      }, 1e4);
      const proc = spawn7(
        "claude",
        ["--mcp-config", tmpPath, "--print", "List available tools"],
        {
          cwd: projectDir,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env }
        }
      );
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve4(c.json({ ok: true, output: stdout.slice(0, 2e3) }));
        } else {
          resolve4(c.json({ ok: false, error: stderr.slice(0, 1e3) || `Exit code ${code}` }));
        }
      });
      proc.on("error", (err) => {
        clearTimeout(timeout);
        resolve4(c.json({ ok: false, error: err.message }));
      });
    });
  });
  app.get("/tools/diff", async (c) => {
    const file = c.req.query("file");
    const stat3 = c.req.query("stat") === "true";
    const opts = { cwd: projectDir, maxBuffer: 4 * 1024 * 1024 };
    try {
      let mergeBase = "";
      try {
        const { stdout: mb } = await execFile4(
          "git",
          ["merge-base", "HEAD", "HEAD@{upstream}"],
          opts
        );
        mergeBase = mb.trim();
      } catch {
        mergeBase = "HEAD";
      }
      const args = stat3 ? ["diff", "--stat"] : ["diff"];
      if (file) {
        args.push(mergeBase, "--", file);
      } else {
        args.push(mergeBase);
      }
      const { stdout: tracked } = await execFile4("git", args, opts);
      let untracked = "";
      if (!file && !stat3) {
        try {
          const { stdout: untrackedFiles } = await execFile4(
            "git",
            ["ls-files", "--others", "--exclude-standard"],
            opts
          );
          const newFiles = untrackedFiles.trim().split("\n").filter(Boolean);
          for (const f of newFiles.slice(0, 20)) {
            try {
              const { stdout: content } = await execFile4(
                "git",
                ["diff", "--no-index", "--", "/dev/null", f],
                { ...opts, env: { ...process.env } }
              );
              untracked += content;
            } catch (e) {
              if (e && typeof e === "object" && "stdout" in e) {
                untracked += e.stdout;
              }
            }
          }
        } catch {
        }
      }
      const diff = (tracked + untracked).trim();
      return c.json({ diff: diff || "No changes detected" });
    } catch (err) {
      return c.json({ diff: "", error: String(err) }, 500);
    }
  });
  app.get("/tools/terminal", async (c) => {
    const maxLines = parseInt(c.req.query("maxLines") ?? "100", 10);
    const logPath = join17(projectDir, ".hashmark", "terminal-output.log");
    try {
      if (existsSync14(logPath)) {
        const raw = readFileSync12(logPath, "utf-8");
        const lines = raw.split("\n");
        const tail = lines.slice(-maxLines).join("\n");
        return c.json({ output: tail, source: "log", lines: lines.length });
      }
    } catch {
    }
    try {
      const { stdout } = await execFile4(
        "git",
        ["log", "--oneline", "-20"],
        { cwd: projectDir }
      );
      return c.json({
        output: `No terminal output log found. Recent git activity:
${stdout}`,
        source: "git-fallback"
      });
    } catch {
      return c.json({
        output: "No terminal output available. Terminal log not found at .hashmark/terminal-output.log",
        source: "none"
      });
    }
  });
  app.get("/tools/file", async (c) => {
    const relPath = c.req.query("path");
    if (!relPath) return c.json({ error: "path query parameter is required" }, 400);
    const fullPath = join17(projectDir, relPath);
    if (!fullPath.startsWith(projectDir + "/") && fullPath !== projectDir) {
      return c.json({ error: "path traversal blocked" }, 403);
    }
    try {
      const content = await readFile2(fullPath, "utf-8");
      return c.json({ content, path: relPath });
    } catch {
      return c.json({ error: `File not found: ${relPath}` }, 404);
    }
  });
  return app;
}

// server/routes/company.ts
import { Hono as Hono10 } from "hono";
import { spawn as spawn8, execFile as execFileCb4 } from "child_process";
import { existsSync as existsSync15, readFileSync as readFileSync13, readdirSync as readdirSync3 } from "fs";
import { join as join19, relative as relative4 } from "path";
import { randomUUID as randomUUID3 } from "crypto";
import { promisify as promisify5 } from "util";
import { tmpdir as tmpdir3 } from "os";

// server/lib/action-log.ts
import { appendFileSync, mkdirSync as mkdirSync8 } from "fs";
import { join as join18 } from "path";
function logAgentAction(dataDir, event) {
  try {
    mkdirSync8(dataDir, { recursive: true });
    const line = JSON.stringify(event) + "\n";
    appendFileSync(join18(dataDir, "agent-actions.jsonl"), line);
  } catch {
  }
}
function parseActionsFromOutput(output, runId, agentId, workerId) {
  const events = [];
  const now = Date.now();
  const writeRe = /(?:(?:Edit|Write|Create|Updated?|Modified?|Created?|Writing to|Editing)\s+[`']?)([\w./\-]+\.(?:ts|tsx|js|jsx|py|go|rs|md|json|yaml|yml|css|html|sh|env))/gi;
  for (const m of output.matchAll(writeRe)) {
    events.push({ timestamp: now, runId, agentId, workerId, action: "file_write", target: m[1], outcome: "success" });
  }
  const bashRe = /\$\s+((?:npm|npx|yarn|pnpm|git|python|node|tsc|eslint|jest|vitest|cargo|go)\s+[\w\s\-./]+)/g;
  for (const m of output.matchAll(bashRe)) {
    events.push({ timestamp: now, runId, agentId, workerId, action: "bash_exec", target: m[1].trim().slice(0, 120), outcome: "success" });
  }
  return events;
}

// server/routes/company.ts
var execFile5 = promisify5(execFileCb4);
var MAX_WORKERS = 5;
function loadAgents(projectDir) {
  const agentsDir = join19(projectDir, ".claude", "agents");
  if (!existsSync15(agentsDir)) return [];
  const agents = [];
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync3(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(join19(dir, entry.name));
      } else if (entry.name.endsWith(".md") && entry.name !== "INDEX.md") {
        const fullPath = join19(dir, entry.name);
        const relPath = relative4(agentsDir, fullPath);
        try {
          const content = readFileSync13(fullPath, "utf-8");
          const nameMatch = content.match(/^name:\s*(.+)$/m);
          const descMatch = content.match(/^description:\s*(.+)$/m);
          agents.push({
            id: relPath.replace(/\.md$/, "").replace(/\//g, "-"),
            name: nameMatch?.[1]?.trim() ?? relPath,
            description: descMatch?.[1]?.trim() ?? "",
            content
          });
        } catch {
        }
      }
    }
  }
  walk(agentsDir);
  return agents;
}
var activeRun = false;
function findClaudeBin2(projectDir) {
  const candidates = [
    join19(projectDir, "node_modules", ".bin", "claude"),
    "/Applications/Conductor.app/Contents/Resources/bin/claude",
    "/usr/local/bin/claude",
    "claude"
  ];
  return candidates.find((p) => {
    try {
      return existsSync15(p);
    } catch {
      return false;
    }
  }) ?? "claude";
}
function companyRoutes(projectDir) {
  const app = new Hono10();
  const dataDir = `${projectDir}/.hashmark`;
  app.get("/status", (c) => {
    return c.json({ active: activeRun });
  });
  app.get("/agents", (c) => {
    const agents = loadAgents(projectDir).map(({ id, name, description }) => ({ id, name, description }));
    return c.json({ agents });
  });
  app.post("/plan", async (c) => {
    const body = await c.req.json();
    const claudeBin = findClaudeBin2(projectDir);
    const agents = loadAgents(projectDir);
    const agentList = agents.length > 0 ? agents.map((a) => `  - id: "${a.id}" | name: "${a.name}" | ${a.description}`).join("\n") : `  - id: "general" | name: "General" | general purpose agent`;
    const prompt = `You are a software project manager. Decompose this task into 2-${Math.min(MAX_WORKERS, 4)} concrete, parallel subtasks. Each subtask must be independent and map to one of the available agents.

Task: ${body.task}

Available agents:
${agentList}

Rules:
- Each subtask MUST use one of the agent IDs listed above exactly as shown
- Subtasks must be truly parallel (no subtask should depend on another)
- If agents are irrelevant or only 1-2 are relevant, use fewer subtasks
- If no specific agent fits, use "general" as agentId

Respond with ONLY a JSON array, no markdown, no explanation:
[{"id":1,"title":"short title under 50 chars","description":"detailed what to implement","agentId":"exact-agent-id-here"}]`;
    try {
      const { stdout } = await execFile5(claudeBin, ["--print", prompt], {
        cwd: projectDir,
        env: { ...process.env, CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1" },
        maxBuffer: 1024 * 1024
      });
      const jsonMatch = stdout.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return c.json({ error: "Failed to parse plan \u2014 Claude output:\n" + stdout.slice(0, 300) }, 500);
      }
      const plan = JSON.parse(jsonMatch[0]);
      const validIds = new Set(agents.map((a) => a.id));
      const sanitized = plan.map((s) => ({
        ...s,
        agentId: validIds.has(s.agentId) ? s.agentId : "general"
      }));
      return c.json({ plan: sanitized });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 500);
    }
  });
  app.post("/run", async (c) => {
    const body = await c.req.json();
    const claudeBin = findClaudeBin2(projectDir);
    const runId = randomUUID3().slice(0, 8);
    const plan = body.plan.slice(0, MAX_WORKERS);
    const agents = loadAgents(projectDir);
    const agentMap = new Map(agents.map((a) => [a.id, a]));
    activeRun = true;
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const send = (data) => {
          try {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}

`));
          } catch {
          }
        };
        const worktreeDirs = /* @__PURE__ */ new Map();
        async function runWorker(subtask) {
          const branchName = `studio-swarm-${runId}-${subtask.id}`;
          const worktreeDir = join19(tmpdir3(), branchName);
          worktreeDirs.set(subtask.id, worktreeDir);
          send({ type: "worker_start", id: subtask.id, title: subtask.title, agentId: subtask.agentId });
          try {
            const db = getDb(dataDir);
            db.prepare(
              "UPDATE swarm_workers SET status='running', started_at=? WHERE run_id=? AND worker_id=?"
            ).run(Date.now(), runId, subtask.id);
          } catch {
          }
          try {
            await execFile5("git", ["worktree", "add", worktreeDir, "-b", branchName], {
              cwd: projectDir
            });
            logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: subtask.agentId, workerId: subtask.id, action: "worktree_create", target: branchName, outcome: "success" });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: subtask.agentId, workerId: subtask.id, action: "worktree_create", target: branchName, outcome: "failure", detail: msg });
            send({ type: "worker_error", id: subtask.id, error: `Worktree failed: ${msg}` });
            try {
              const db = getDb(dataDir);
              db.prepare(
                "UPDATE swarm_workers SET status='error', error=?, completed_at=? WHERE run_id=? AND worker_id=?"
              ).run(`Worktree failed: ${msg}`, Date.now(), runId, subtask.id);
            } catch {
            }
            throw err;
          }
          const agentDef = agentMap.get(subtask.agentId);
          const agentContext = agentDef ? `You are operating as the agent defined below. Follow its instructions exactly.

---AGENT DEFINITION---
${agentDef.content}
---END AGENT DEFINITION---

` : "";
          const workerPrompt = `${agentContext}Overall objective: ${body.task}

Your specific subtask: ${subtask.title}

${subtask.description}

Work in the current directory. Make the necessary code changes, create or modify files as needed.`;
          return new Promise((resolve4, reject) => {
            const proc = spawn8(claudeBin, ["--print", workerPrompt], {
              cwd: worktreeDir,
              stdio: ["ignore", "pipe", "pipe"],
              env: { ...process.env, CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1" }
            });
            let fullOutput = "";
            proc.stdout.on("data", (chunk) => {
              const text = chunk.toString();
              fullOutput += text;
              send({ type: "worker_chunk", id: subtask.id, text });
              try {
                const db = getDb(dataDir);
                db.prepare(
                  "UPDATE swarm_workers SET output = output || ? WHERE run_id=? AND worker_id=?"
                ).run(text, runId, subtask.id);
              } catch {
              }
            });
            proc.stderr.on("data", () => {
            });
            proc.on("close", async (code) => {
              if (code !== 0 && code !== null) {
                send({ type: "worker_error", id: subtask.id, error: `Exit code ${code}` });
                try {
                  const db = getDb(dataDir);
                  db.prepare(
                    "UPDATE swarm_workers SET status='error', error=?, completed_at=? WHERE run_id=? AND worker_id=?"
                  ).run(`Exit code ${code}`, Date.now(), runId, subtask.id);
                } catch {
                }
                reject(new Error(`Exit ${code}`));
                return;
              }
              let hasChanges = false;
              try {
                const { stdout: statusOut } = await execFile5("git", ["status", "--porcelain"], { cwd: worktreeDir });
                hasChanges = statusOut.trim().length > 0;
                if (hasChanges) {
                  await execFile5("git", ["add", "-A"], { cwd: worktreeDir });
                  await execFile5("git", ["commit", "-m", `feat(swarm/${runId}): agent ${subtask.id} - ${subtask.title}`], { cwd: worktreeDir });
                  logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: subtask.agentId, workerId: subtask.id, action: "git_commit", target: branchName, outcome: "success" });
                }
              } catch {
              }
              const actionEvents = parseActionsFromOutput(fullOutput, runId, subtask.agentId, subtask.id);
              for (const ev of actionEvents) logAgentAction(dataDir, ev);
              let testResult = { passed: true, output: "", skipped: false };
              try {
                const pkgPath = join19(worktreeDir, "package.json");
                let hasTestScript = false;
                try {
                  const pkg = JSON.parse(readFileSync13(pkgPath, "utf-8"));
                  hasTestScript = !!(pkg?.scripts?.test && !pkg.scripts.test.includes("no test specified"));
                } catch {
                }
                if (hasTestScript) {
                  send({ type: "worker_verifying", id: subtask.id });
                  const { stdout: testOut, stderr: testErr } = await execFile5(
                    "npm",
                    ["test", "--", "--passWithNoTests"],
                    { cwd: worktreeDir, timeout: 6e4, maxBuffer: 512 * 1024 }
                  ).catch((e) => ({ stdout: e.stdout ?? "", stderr: e.stderr ?? "" }));
                  const combined = testOut + testErr;
                  const passed = !combined.match(/\b(FAILED|FAIL|failed|Error:|error:)\b/) || combined.includes("passing");
                  testResult = { passed, output: combined.slice(0, 2e3), skipped: false };
                  send({ type: "worker_verify_result", id: subtask.id, passed: testResult.passed, output: testResult.output });
                } else {
                  testResult.skipped = true;
                  send({ type: "worker_verify_result", id: subtask.id, passed: true, output: "", skipped: true });
                }
              } catch (err) {
                testResult = { passed: false, output: String(err), skipped: false };
                send({ type: "worker_verify_result", id: subtask.id, passed: false, output: String(err) });
              }
              try {
                const db = getDb(dataDir);
                db.prepare(
                  "UPDATE swarm_workers SET status='done', completed_at=? WHERE run_id=? AND worker_id=?"
                ).run(Date.now(), runId, subtask.id);
              } catch {
              }
              send({ type: "worker_done", id: subtask.id, output: fullOutput, hasChanges });
              resolve4({ id: subtask.id, output: fullOutput, hasChanges, testPassed: testResult.passed, testSkipped: testResult.skipped });
            });
            proc.on("error", (err) => {
              send({ type: "worker_error", id: subtask.id, error: err.message });
              try {
                const db = getDb(dataDir);
                db.prepare(
                  "UPDATE swarm_workers SET status='error', error=?, completed_at=? WHERE run_id=? AND worker_id=?"
                ).run(err.message, Date.now(), runId, subtask.id);
              } catch {
              }
              reject(err);
            });
          });
        }
        async function orchestrate() {
          try {
            const db = getDb(dataDir);
            db.prepare(
              "INSERT INTO swarm_runs (id, task, status, worker_count, created_at) VALUES (?, ?, 'running', ?, ?)"
            ).run(runId, body.task, plan.length, Date.now());
            for (const subtask of plan) {
              const agentDef = agentMap.get(subtask.agentId);
              db.prepare(
                "INSERT INTO swarm_workers (run_id, worker_id, title, agent_id, agent_name, status) VALUES (?, ?, ?, ?, ?, 'pending')"
              ).run(runId, subtask.id, subtask.title, subtask.agentId, agentDef?.name ?? subtask.agentId);
            }
          } catch {
          }
          const results = await Promise.allSettled(plan.map(runWorker));
          send({ type: "phase", phase: "merging" });
          const merged = [];
          const conflicts = [];
          const skipped = [];
          for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const subtask = plan[i];
            const branchName = `studio-swarm-${runId}-${subtask.id}`;
            if (result.status === "rejected") {
              conflicts.push(subtask.id);
              continue;
            }
            if (!result.value.hasChanges) {
              skipped.push(subtask.id);
              continue;
            }
            try {
              await execFile5("git", [
                "merge",
                branchName,
                "--no-ff",
                "-m",
                `feat(swarm): merge agent ${subtask.id} - ${subtask.title}`
              ], { cwd: projectDir });
              merged.push(subtask.id);
              logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: subtask.agentId, workerId: subtask.id, action: "git_merge", target: branchName, outcome: "success" });
            } catch {
              try {
                await execFile5("git", ["merge", "--abort"], { cwd: projectDir });
              } catch {
              }
              conflicts.push(subtask.id);
              logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: subtask.agentId, workerId: subtask.id, action: "git_merge", target: branchName, outcome: "failure", detail: "merge conflict" });
            }
          }
          for (const subtask of plan) {
            const branchName = `studio-swarm-${runId}-${subtask.id}`;
            const worktreeDir = worktreeDirs.get(subtask.id);
            try {
              if (worktreeDir) {
                await execFile5("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir });
                logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: subtask.agentId, workerId: subtask.id, action: "worktree_remove", target: branchName, outcome: "success" });
              }
            } catch {
            }
            try {
              await execFile5("git", ["branch", "-D", branchName], { cwd: projectDir });
            } catch {
            }
          }
          try {
            const db = getDb(dataDir);
            db.prepare(
              "UPDATE swarm_runs SET merged_count=?, conflict_count=?, skipped_count=?, status='done', completed_at=? WHERE id=?"
            ).run(merged.length, conflicts.length, skipped.length, Date.now(), runId);
          } catch {
          }
          send({ type: "merge_result", merged, conflicts, skipped, testResults: plan.map((s, i) => {
            const r = results[i];
            return {
              id: s.id,
              testPassed: r.status === "fulfilled" ? r.value.testPassed : null,
              testSkipped: r.status === "fulfilled" ? r.value.testSkipped : false
            };
          }) });
          send({ type: "complete" });
          activeRun = false;
          controller.close();
        }
        orchestrate().catch((err) => {
          send({ type: "error", error: err instanceof Error ? err.message : String(err) });
          try {
            const db = getDb(dataDir);
            db.prepare(
              "UPDATE swarm_runs SET status='error', completed_at=? WHERE id=?"
            ).run(Date.now(), runId);
          } catch {
          }
          activeRun = false;
          controller.close();
        });
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  });
  app.get("/runs", (c) => {
    const db = getDb(dataDir);
    const runs = db.prepare(
      "SELECT * FROM swarm_runs ORDER BY created_at DESC LIMIT 50"
    ).all();
    const workers = db.prepare(
      "SELECT * FROM swarm_workers WHERE run_id IN (SELECT id FROM swarm_runs ORDER BY created_at DESC LIMIT 50) ORDER BY worker_id"
    ).all();
    const workersByRun = /* @__PURE__ */ new Map();
    for (const w of workers) {
      const rid = w.run_id;
      if (!workersByRun.has(rid)) workersByRun.set(rid, []);
      workersByRun.get(rid).push(w);
    }
    const result = runs.map((r) => ({ ...r, workers: workersByRun.get(r.id) ?? [] }));
    return c.json({ runs: result });
  });
  app.get("/runs/:id", (c) => {
    const db = getDb(dataDir);
    const run = db.prepare("SELECT * FROM swarm_runs WHERE id=?").get(c.req.param("id"));
    if (!run) return c.json({ error: "Not found" }, 404);
    const workers = db.prepare(
      "SELECT * FROM swarm_workers WHERE run_id=? ORDER BY worker_id"
    ).all(c.req.param("id"));
    return c.json({ run, workers });
  });
  app.delete("/runs/:id", (c) => {
    const db = getDb(dataDir);
    db.prepare("DELETE FROM swarm_runs WHERE id=?").run(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/conflicts", async (c) => {
    const body = await c.req.json();
    if (!Array.isArray(body.agents) || body.agents.length < 2) {
      return c.json({
        hasConflicts: false,
        conflicts: [],
        summary: "Need at least 2 agents with file data to detect conflicts"
      });
    }
    const fileToAgents = /* @__PURE__ */ new Map();
    for (const agent of body.agents) {
      for (const file of agent.files ?? []) {
        const existing = fileToAgents.get(file) ?? [];
        existing.push(agent.id);
        fileToAgents.set(file, existing);
      }
    }
    const HIGH_IMPACT = [
      /package\.json$/,
      /tsconfig.*\.json$/,
      /\.env/,
      /prisma\/schema/,
      /schema\.(ts|js)$/,
      /middleware\.(ts|js)$/
    ];
    const conflicts = [];
    for (const [file, agentIds] of fileToAgents) {
      if (agentIds.length > 1) {
        let severity = "medium";
        if (agentIds.length > 2) severity = "high";
        else if (HIGH_IMPACT.some((p) => p.test(file))) severity = "high";
        conflicts.push({ file, agents: agentIds, severity });
      }
    }
    const order = { high: 0, medium: 1, low: 2 };
    conflicts.sort((a, b) => order[a.severity] - order[b.severity]);
    return c.json({
      hasConflicts: conflicts.length > 0,
      conflicts,
      summary: conflicts.length === 0 ? "No conflicts detected" : `${conflicts.length} file(s) modified by multiple agents`
    });
  });
  return app;
}

// server/routes/run.ts
import { Hono as Hono11 } from "hono";
import { spawn as spawn9, execFile as execFileCb5 } from "child_process";
import { existsSync as existsSync16, readFileSync as readFileSync14, readdirSync as readdirSync4 } from "fs";
import { join as join20, relative as relative5 } from "path";
import { randomUUID as randomUUID4 } from "crypto";
import { promisify as promisify6 } from "util";
import { tmpdir as tmpdir4 } from "os";
var execFile6 = promisify6(execFileCb5);
function loadAgents2(projectDir) {
  const agentsDir = join20(projectDir, ".claude", "agents");
  if (!existsSync16(agentsDir)) return [];
  const agents = [];
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync4(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(join20(dir, entry.name));
      } else if (entry.name.endsWith(".md") && entry.name !== "INDEX.md") {
        const fullPath = join20(dir, entry.name);
        const relPath = relative5(agentsDir, fullPath);
        try {
          const content = readFileSync14(fullPath, "utf-8");
          const nameMatch = content.match(/^name:\s*(.+)$/m);
          const descMatch = content.match(/^description:\s*(.+)$/m);
          agents.push({
            id: relPath.replace(/\.md$/, "").replace(/\//g, "-"),
            name: nameMatch?.[1]?.trim() ?? relPath,
            description: descMatch?.[1]?.trim() ?? "",
            content
          });
        } catch {
        }
      }
    }
  }
  walk(agentsDir);
  return agents;
}
function findClaudeBin3(projectDir) {
  const candidates = [
    join20(projectDir, "node_modules", ".bin", "claude"),
    "/Applications/Conductor.app/Contents/Resources/bin/claude",
    "/usr/local/bin/claude",
    "claude"
  ];
  return candidates.find((p) => {
    try {
      return existsSync16(p);
    } catch {
      return false;
    }
  }) ?? "claude";
}
var activeRun2 = false;
function runRoutes(projectDir) {
  const app = new Hono11();
  const dataDir = `${projectDir}/.hashmark`;
  app.get("/status", (c) => c.json({ active: activeRun2 }));
  app.delete("/", (c) => {
    activeRun2 = false;
    return c.json({ ok: true, message: "Run cancelled" });
  });
  app.get("/runs", (c) => {
    try {
      const db = getDb(dataDir);
      const cols = db.prepare("PRAGMA table_info(runs)").all();
      if (!cols.some((col) => col.name === "task")) {
        db.exec("ALTER TABLE runs ADD COLUMN task TEXT NOT NULL DEFAULT ''");
      }
      if (!cols.some((col) => col.name === "worktree_branch")) {
        db.exec("ALTER TABLE runs ADD COLUMN worktree_branch TEXT");
      }
      const rows = db.prepare(
        `SELECT id, task, status, started_at AS created_at, worktree_branch
           FROM runs ORDER BY started_at DESC LIMIT 50`
      ).all();
      return c.json({ runs: rows });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
  app.get("/runs/:id/diff", async (c) => {
    const id = c.req.param("id");
    try {
      const db = getDb(dataDir);
      const run = db.prepare("SELECT worktree_branch, task FROM runs WHERE id = ?").get(id);
      if (!run) return c.json({ error: "Run not found" }, 404);
      const branch = run.worktree_branch;
      if (!branch) return c.json({ diff: "", branch: null });
      let diff = "";
      try {
        const res = await execFile6("git", ["diff", `main...${branch}`], {
          cwd: projectDir,
          maxBuffer: 4 * 1024 * 1024
        });
        diff = res.stdout;
      } catch {
        try {
          const logRes = await execFile6(
            "git",
            ["log", "--all", "--oneline", `--grep=run/${id}`],
            { cwd: projectDir }
          );
          const hash = logRes.stdout.trim().split(/\s/)[0];
          if (hash) {
            const showRes = await execFile6("git", ["show", hash], {
              cwd: projectDir,
              maxBuffer: 4 * 1024 * 1024
            });
            diff = showRes.stdout;
          }
        } catch {
        }
      }
      return c.json({ diff, branch });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
  app.post("/", async (c) => {
    if (activeRun2) {
      return c.json({ error: "A run is already in progress" }, 409);
    }
    const body = await c.req.json();
    if (!body.task?.trim()) {
      return c.json({ error: "task is required" }, 400);
    }
    const mode = body.mode === "plan" ? "plan" : "build";
    const claudeBin = findClaudeBin3(projectDir);
    const runId = randomUUID4().slice(0, 8);
    const agents = loadAgents2(projectDir);
    const agentMap = new Map(agents.map((a) => [a.id, a]));
    activeRun2 = true;
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const send = (data) => {
          try {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}

`));
          } catch {
          }
        };
        const branchName = `studio-run-${runId}`;
        const worktreeDir = join20(tmpdir4(), branchName);
        async function run() {
          send({ type: "start", runId, task: body.task, agentId: body.agentId ?? null });
          try {
            const db = getDb(dataDir);
            const cols = db.prepare("PRAGMA table_info(runs)").all();
            if (!cols.some((col) => col.name === "task")) db.exec("ALTER TABLE runs ADD COLUMN task TEXT NOT NULL DEFAULT ''");
            if (!cols.some((col) => col.name === "worktree_branch")) db.exec("ALTER TABLE runs ADD COLUMN worktree_branch TEXT");
            db.prepare(
              `INSERT INTO runs (id, task, status, worktree_branch, started_at) VALUES (?, ?, 'running', ?, ?)`
            ).run(runId, body.task, branchName, Date.now());
          } catch {
          }
          try {
            await execFile6("git", ["worktree", "add", worktreeDir, "-b", branchName], {
              cwd: projectDir
            });
            logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "worktree_create", target: branchName, outcome: "success" });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "worktree_create", target: branchName, outcome: "failure", detail: msg });
            send({ type: "error", error: `Worktree failed: ${msg}` });
            activeRun2 = false;
            controller.close();
            return;
          }
          const agentDef = body.agentId ? agentMap.get(body.agentId) : void 0;
          const agentContext = agentDef ? `You are operating as the agent defined below. Follow its instructions exactly.

---AGENT DEFINITION---
${agentDef.content}
---END AGENT DEFINITION---

` : "";
          const planPrefix = mode === "plan" ? `You are operating in PLAN MODE. You may read files, analyze code, and produce reports. You MUST NOT write or modify any files, run git commands, or execute shell commands that modify state. Provide a detailed analysis and action plan instead.

` : "";
          const prompt = `${planPrefix}${agentContext}${body.task}

Work in the current directory. Make the necessary code changes, create or modify files as needed.`;
          let fullOutput = "";
          await new Promise((resolve4) => {
            const proc = spawn9(claudeBin, ["--print", prompt], {
              cwd: worktreeDir,
              stdio: ["ignore", "pipe", "pipe"],
              env: { ...process.env, CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1" }
            });
            proc.stdout.on("data", (chunk) => {
              const text = chunk.toString();
              fullOutput += text;
              send({ type: "chunk", text });
            });
            proc.stderr.on("data", () => {
            });
            proc.on("close", (code) => {
              if (code !== 0 && code !== null) {
                send({ type: "error", error: `Claude exited with code ${code}` });
              }
              resolve4();
            });
            proc.on("error", (err) => {
              send({ type: "error", error: err.message });
              resolve4();
            });
          });
          let hasChanges = false;
          if (mode === "plan") {
            try {
              getDb(dataDir).prepare("UPDATE runs SET status = ?, ended_at = ? WHERE id = ?").run("complete", Date.now(), runId);
            } catch {
            }
            send({ type: "complete", hasChanges: false, mode: "plan" });
            activeRun2 = false;
            controller.close();
            try {
              await execFile6("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir });
            } catch {
            }
            try {
              await execFile6("git", ["branch", "-D", branchName], { cwd: projectDir });
            } catch {
            }
            return;
          }
          const actionEvents = parseActionsFromOutput(fullOutput, runId, body.agentId ?? "general");
          for (const ev of actionEvents) logAgentAction(dataDir, ev);
          try {
            const { stdout: statusOut } = await execFile6("git", ["status", "--porcelain"], { cwd: worktreeDir });
            hasChanges = statusOut.trim().length > 0;
            if (hasChanges) {
              await execFile6("git", ["add", "-A"], { cwd: worktreeDir });
              await execFile6("git", ["commit", "-m", `feat(run/${runId}): ${body.task.slice(0, 72)}`], { cwd: worktreeDir });
              logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "git_commit", target: branchName, outcome: "success" });
              send({ type: "committed", hasChanges: true, branch: branchName });
            } else {
              send({ type: "committed", hasChanges: false, branch: branchName });
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            send({ type: "error", error: `Commit failed: ${msg}` });
          }
          if (hasChanges) {
            try {
              await execFile6("git", [
                "merge",
                branchName,
                "--no-ff",
                "-m",
                `feat(run): merge ${branchName}`
              ], { cwd: projectDir });
              logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "git_merge", target: branchName, outcome: "success" });
              send({ type: "merged" });
            } catch {
              try {
                await execFile6("git", ["merge", "--abort"], { cwd: projectDir });
              } catch {
              }
              logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "git_merge", target: branchName, outcome: "failure", detail: "merge conflict" });
              send({ type: "merge_conflict", branch: branchName });
            }
          }
          try {
            await execFile6("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir });
            logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "worktree_remove", target: branchName, outcome: "success" });
          } catch {
          }
          if (hasChanges) {
            try {
              await execFile6("git", ["branch", "-d", branchName], { cwd: projectDir });
            } catch {
            }
          }
          try {
            const db = getDb(dataDir);
            db.prepare("UPDATE runs SET status = ?, ended_at = ? WHERE id = ?").run("complete", Date.now(), runId);
          } catch {
          }
          send({ type: "complete", hasChanges, mode: "build" });
          activeRun2 = false;
          controller.close();
        }
        run().catch((err) => {
          try {
            getDb(dataDir).prepare("UPDATE runs SET status = ?, ended_at = ? WHERE id = ?").run("error", Date.now(), runId);
          } catch {
          }
          send({ type: "error", error: err instanceof Error ? err.message : String(err) });
          activeRun2 = false;
          controller.close();
        });
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  });
  return app;
}

// server/routes/swarm.ts
import { Hono as Hono12 } from "hono";
import { spawn as spawn10, execFile as execFileCb6 } from "child_process";
import { existsSync as existsSync17, readFileSync as readFileSync15, readdirSync as readdirSync5 } from "fs";
import { join as join21, relative as relative6 } from "path";
import { randomUUID as randomUUID5 } from "crypto";
import { promisify as promisify7 } from "util";
import { tmpdir as tmpdir5 } from "os";
var execFile7 = promisify7(execFileCb6);
var swarms = /* @__PURE__ */ new Map();
function loadAgents3(projectDir) {
  const agentsDir = join21(projectDir, ".claude", "agents");
  if (!existsSync17(agentsDir)) return [];
  const agents = [];
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync5(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(join21(dir, entry.name));
      } else if (entry.name.endsWith(".md") && entry.name !== "INDEX.md") {
        const fullPath = join21(dir, entry.name);
        const relPath = relative6(agentsDir, fullPath);
        try {
          const content = readFileSync15(fullPath, "utf-8");
          const nameMatch = content.match(/^name:\s*(.+)$/m);
          const descMatch = content.match(/^description:\s*(.+)$/m);
          agents.push({
            id: relPath.replace(/\.md$/, "").replace(/\//g, "-"),
            name: nameMatch?.[1]?.trim() ?? relPath,
            description: descMatch?.[1]?.trim() ?? "",
            content
          });
        } catch {
        }
      }
    }
  }
  walk(agentsDir);
  return agents;
}
function findClaudeBin4(projectDir) {
  const candidates = [
    join21(projectDir, "node_modules", ".bin", "claude"),
    "/Applications/Conductor.app/Contents/Resources/bin/claude",
    "/usr/local/bin/claude",
    "claude"
  ];
  return candidates.find((p) => {
    try {
      return existsSync17(p);
    } catch {
      return false;
    }
  }) ?? "claude";
}
function ensureSwarmTables(dataDir) {
  try {
    const db = getDb(dataDir);
    db.exec(`
      CREATE TABLE IF NOT EXISTS swarm_runs (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL DEFAULT 'build',
        status TEXT NOT NULL DEFAULT 'running',
        started_at INTEGER NOT NULL,
        ended_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS swarm_agents (
        id TEXT PRIMARY KEY,
        swarm_id TEXT NOT NULL,
        task TEXT NOT NULL,
        agent_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        branch TEXT,
        started_at INTEGER NOT NULL,
        ended_at INTEGER
      );
    `);
  } catch {
  }
}
function emit(swarm, agentIndex, event) {
  const s = swarm;
  for (const fn of s._listeners ?? []) {
    try {
      fn(agentIndex, event);
    } catch {
    }
  }
}
async function runAgent(swarm, agentIndex, projectDir, dataDir, claudeBin, agentMap) {
  if (swarm.cancelled) return;
  const agent = swarm.agents[agentIndex];
  const { branch } = agent;
  const worktreeDir = join21(tmpdir5(), branch);
  agent.status = "running";
  emit(swarm, agentIndex, { type: "status", data: "running" });
  try {
    getDb(dataDir).prepare("UPDATE swarm_agents SET status = 'running' WHERE id = ?").run(agent.id);
  } catch {
  }
  try {
    await execFile7("git", ["worktree", "add", worktreeDir, "-b", branch], { cwd: projectDir });
    logAgentAction(dataDir, {
      timestamp: Date.now(),
      runId: swarm.swarmId,
      agentId: agent.agentId ?? "general",
      action: "worktree_create",
      target: branch,
      outcome: "success"
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    agent.status = "failed";
    agent.output += `
[worktree error] ${msg}`;
    emit(swarm, agentIndex, { type: "status", data: "failed" });
    emit(swarm, agentIndex, { type: "chunk", data: `[worktree error] ${msg}` });
    try {
      getDb(dataDir).prepare("UPDATE swarm_agents SET status = 'failed', ended_at = ? WHERE id = ?").run(Date.now(), agent.id);
    } catch {
    }
    return;
  }
  const agentDef = agent.agentId ? agentMap.get(agent.agentId) : void 0;
  const agentContext = agentDef ? `You are operating as the agent defined below. Follow its instructions exactly.

---AGENT DEFINITION---
${agentDef.content}
---END AGENT DEFINITION---

` : "";
  const planPrefix = swarm.mode === "plan" ? `You are operating in PLAN MODE. Read files and produce analysis only. Do NOT write or modify files.

` : "";
  const prompt = `${planPrefix}${agentContext}${agent.task}

Work in the current directory. Make the necessary code changes, create or modify files as needed.`;
  const ctrl = swarm.controllers[agentIndex];
  await new Promise((resolve4) => {
    if (ctrl.signal.aborted) {
      resolve4();
      return;
    }
    const proc = spawn10(claudeBin, ["--print", prompt], {
      cwd: worktreeDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1" }
    });
    ctrl.signal.addEventListener("abort", () => {
      try {
        proc.kill("SIGTERM");
      } catch {
      }
    });
    proc.stdout.on("data", (chunk) => {
      if (swarm.cancelled) return;
      const text = chunk.toString();
      agent.output += text;
      emit(swarm, agentIndex, { type: "chunk", data: text });
    });
    proc.stderr.on("data", () => {
    });
    proc.on("close", (code) => {
      if (code !== 0 && code !== null && !swarm.cancelled) {
        const msg = `[claude exited with code ${code}]`;
        agent.output += `
${msg}`;
        emit(swarm, agentIndex, { type: "chunk", data: msg });
      }
      resolve4();
    });
    proc.on("error", (err) => {
      agent.output += `
[spawn error] ${err.message}`;
      emit(swarm, agentIndex, { type: "chunk", data: `[spawn error] ${err.message}` });
      resolve4();
    });
  });
  if (swarm.cancelled || ctrl.signal.aborted) {
    agent.status = "cancelled";
    emit(swarm, agentIndex, { type: "status", data: "cancelled" });
    try {
      await execFile7("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir });
    } catch {
    }
    try {
      await execFile7("git", ["branch", "-D", branch], { cwd: projectDir });
    } catch {
    }
    return;
  }
  if (swarm.mode === "plan") {
    agent.status = "done";
    emit(swarm, agentIndex, { type: "status", data: "done" });
    emit(swarm, agentIndex, { type: "complete", data: "plan" });
    try {
      getDb(dataDir).prepare("UPDATE swarm_agents SET status = 'done', ended_at = ? WHERE id = ?").run(Date.now(), agent.id);
    } catch {
    }
    try {
      await execFile7("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir });
    } catch {
    }
    try {
      await execFile7("git", ["branch", "-D", branch], { cwd: projectDir });
    } catch {
    }
    checkSwarmComplete(swarm, dataDir);
    return;
  }
  let hasChanges = false;
  try {
    const { stdout } = await execFile7("git", ["status", "--porcelain"], { cwd: worktreeDir });
    hasChanges = stdout.trim().length > 0;
    if (hasChanges) {
      await execFile7("git", ["add", "-A"], { cwd: worktreeDir });
      await execFile7(
        "git",
        ["commit", "-m", `feat(swarm/${swarm.swarmId}): ${agent.task.slice(0, 72)}`],
        { cwd: worktreeDir }
      );
      emit(swarm, agentIndex, { type: "committed", data: branch });
      logAgentAction(dataDir, {
        timestamp: Date.now(),
        runId: swarm.swarmId,
        agentId: agent.agentId ?? "general",
        action: "git_commit",
        target: branch,
        outcome: "success"
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    agent.output += `
[commit error] ${msg}`;
    emit(swarm, agentIndex, { type: "chunk", data: `
[commit error] ${msg}` });
  }
  if (hasChanges) {
    try {
      await execFile7(
        "git",
        ["merge", branch, "--no-ff", "-m", `feat(swarm): merge ${branch}`],
        { cwd: projectDir }
      );
      emit(swarm, agentIndex, { type: "merged", data: branch });
      logAgentAction(dataDir, {
        timestamp: Date.now(),
        runId: swarm.swarmId,
        agentId: agent.agentId ?? "general",
        action: "git_merge",
        target: branch,
        outcome: "success"
      });
    } catch {
      try {
        await execFile7("git", ["merge", "--abort"], { cwd: projectDir });
      } catch {
      }
      emit(swarm, agentIndex, { type: "merge_conflict", data: branch });
      logAgentAction(dataDir, {
        timestamp: Date.now(),
        runId: swarm.swarmId,
        agentId: agent.agentId ?? "general",
        action: "git_merge",
        target: branch,
        outcome: "failure",
        detail: "merge conflict"
      });
    }
  }
  try {
    await execFile7("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir });
  } catch {
  }
  if (hasChanges) {
    try {
      await execFile7("git", ["branch", "-d", branch], { cwd: projectDir });
    } catch {
    }
  }
  agent.status = "done";
  emit(swarm, agentIndex, { type: "status", data: "done" });
  emit(swarm, agentIndex, { type: "complete", data: swarm.mode });
  try {
    getDb(dataDir).prepare("UPDATE swarm_agents SET status = 'done', ended_at = ? WHERE id = ?").run(Date.now(), agent.id);
  } catch {
  }
  checkSwarmComplete(swarm, dataDir);
}
function checkSwarmComplete(swarm, dataDir) {
  const allDone = swarm.agents.every(
    (a) => a.status === "done" || a.status === "failed" || a.status === "cancelled"
  );
  if (allDone) {
    try {
      getDb(dataDir).prepare("UPDATE swarm_runs SET status = 'complete', ended_at = ? WHERE id = ?").run(Date.now(), swarm.swarmId);
    } catch {
    }
  }
}
function swarmRoutes(projectDir) {
  const app = new Hono12();
  const dataDir = `${projectDir}/.hashmark`;
  app.post("/", async (c) => {
    const body = await c.req.json();
    if (!Array.isArray(body.tasks) || body.tasks.length === 0) {
      return c.json({ error: "tasks array is required and must not be empty" }, 400);
    }
    if (body.tasks.length > 8) {
      return c.json({ error: "Maximum 8 tasks per swarm" }, 400);
    }
    for (const t of body.tasks) {
      if (!t.task?.trim()) {
        return c.json({ error: "Each task must have a non-empty task string" }, 400);
      }
    }
    const mode = body.mode === "plan" ? "plan" : "build";
    const swarmId = randomUUID5().slice(0, 8);
    ensureSwarmTables(dataDir);
    const agents = body.tasks.map((t) => ({
      id: randomUUID5().slice(0, 8),
      task: t.task.trim(),
      agentId: t.agentId,
      status: "pending",
      output: "",
      branch: `swarm-${swarmId}-${randomUUID5().slice(0, 6)}`
    }));
    const swarm = {
      swarmId,
      mode,
      agents,
      cancelled: false,
      controllers: agents.map(() => new AbortController())
    };
    swarms.set(swarmId, swarm);
    try {
      const db = getDb(dataDir);
      db.prepare(
        "INSERT INTO swarm_runs (id, mode, status, started_at) VALUES (?, ?, 'running', ?)"
      ).run(swarmId, mode, Date.now());
      for (const agent of agents) {
        db.prepare(
          "INSERT INTO swarm_agents (id, swarm_id, task, agent_id, status, branch, started_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)"
        ).run(agent.id, swarmId, agent.task, agent.agentId ?? null, agent.branch, Date.now());
      }
    } catch {
    }
    const claudeBin = findClaudeBin4(projectDir);
    const agentDefs = loadAgents3(projectDir);
    const agentMap = new Map(agentDefs.map((a) => [a.id, a]));
    for (let i = 0; i < agents.length; i++) {
      runAgent(swarm, i, projectDir, dataDir, claudeBin, agentMap).catch(() => {
      });
    }
    return c.json(
      { swarmId, agents: agents.map(({ id, task, status }) => ({ id, task, status })) },
      202
    );
  });
  app.get("/:id", (c) => {
    const swarm = swarms.get(c.req.param("id"));
    if (!swarm) return c.json({ error: "Swarm not found" }, 404);
    return c.json({
      swarmId: swarm.swarmId,
      mode: swarm.mode,
      cancelled: swarm.cancelled,
      agents: swarm.agents.map(({ id, task, agentId, status, output, branch }) => ({
        id,
        task,
        agentId,
        status,
        output,
        branch
      }))
    });
  });
  app.get("/:id/conflicts", (c) => {
    const swarm = swarms.get(c.req.param("id"));
    if (!swarm) return c.json({ error: "Swarm not found" }, 404);
    const activeWorkers = swarm.agents.filter((a) => a.branch && a.status !== "pending").map((a) => ({ id: a.id, branch: a.branch }));
    if (activeWorkers.length < 2) {
      return c.json({
        hasConflicts: false,
        conflicts: [],
        summary: "Need at least 2 active workers to detect conflicts"
      });
    }
    const report = detectConflicts(projectDir, activeWorkers, "HEAD");
    return c.json(report);
  });
  app.get("/:id/stream", (c) => {
    const swarm = swarms.get(c.req.param("id"));
    if (!swarm) return c.json({ error: "Swarm not found" }, 404);
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const send = (data) => {
          try {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}

`));
          } catch {
          }
        };
        for (let i = 0; i < swarm.agents.length; i++) {
          const agent = swarm.agents[i];
          send({ agentIndex: i, type: "status", data: agent.status });
          if (agent.output) {
            send({ agentIndex: i, type: "chunk", data: agent.output });
          }
        }
        const s = swarm;
        s._listeners ??= [];
        s._listeners.push((agentIndex, event) => {
          send({ agentIndex, ...event });
        });
        const interval = setInterval(() => {
          const allDone = swarm.agents.every(
            (a) => a.status === "done" || a.status === "failed" || a.status === "cancelled"
          );
          if (allDone || swarm.cancelled) {
            send({ type: "swarm_complete", swarmId: swarm.swarmId });
            clearInterval(interval);
            try {
              controller.close();
            } catch {
            }
          }
        }, 500);
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  });
  app.delete("/:id", (c) => {
    const swarm = swarms.get(c.req.param("id"));
    if (!swarm) return c.json({ error: "Swarm not found" }, 404);
    swarm.cancelled = true;
    for (const ctrl of swarm.controllers) {
      try {
        ctrl.abort();
      } catch {
      }
    }
    for (const agent of swarm.agents) {
      if (agent.status === "pending" || agent.status === "running") {
        agent.status = "cancelled";
      }
    }
    try {
      getDb(dataDir).prepare("UPDATE swarm_runs SET status = 'cancelled', ended_at = ? WHERE id = ?").run(Date.now(), swarm.swarmId);
    } catch {
    }
    return c.json({ ok: true, swarmId: swarm.swarmId });
  });
  return app;
}

// server/routes/drift.ts
import { Hono as Hono13 } from "hono";
import { readFile as readFile3, stat as stat2 } from "fs/promises";
import { join as join22 } from "path";
import { execFile as execFile8 } from "child_process";
import { promisify as promisify8 } from "util";
var execAsync2 = promisify8(execFile8);
var CONTEXT_FILES = ["CLAUDE.md", "AGENTS.md", "GEMINI.md"];
function extractBaselineFileCount(content) {
  const m = content.match(/\*\*Codebase\*\*[^0-9]*(\d+)\s*files/i);
  return m ? parseInt(m[1], 10) : null;
}
function extractCommitHash(content) {
  const m = content.match(/<!--\s*commit:\s*([a-f0-9]{7,40})\s*-->/i);
  return m ? m[1] : null;
}
function driftRoutes(projectDir) {
  const app = new Hono13();
  app.get("/check", async (c) => {
    let fileName = null;
    let content = null;
    for (const name of CONTEXT_FILES) {
      try {
        content = await readFile3(join22(projectDir, name), "utf-8");
        fileName = name;
        break;
      } catch {
      }
    }
    if (!fileName || !content) {
      return c.json({ hasContextFile: false });
    }
    const signals = [];
    let currentFileCount = null;
    let headCommit = null;
    try {
      const { stdout } = await execAsync2(
        "git",
        ["ls-files", "--cached", "--others", "--exclude-standard"],
        { cwd: projectDir, maxBuffer: 4 * 1024 * 1024 }
      );
      const allFiles = stdout.split("\n").filter(Boolean);
      currentFileCount = allFiles.filter(
        (f) => /\.(ts|tsx|js|jsx|py|go|rs|rb|java|kt|swift|cs)$/.test(f)
      ).length;
    } catch {
    }
    try {
      const { stdout } = await execAsync2("git", ["log", "--oneline", "-1"], { cwd: projectDir });
      headCommit = stdout.trim().split(" ")[0] ?? null;
    } catch {
    }
    const baselineCount = extractBaselineFileCount(content);
    if (baselineCount !== null && currentFileCount !== null && baselineCount > 0) {
      const delta = Math.round(Math.abs(currentFileCount - baselineCount) / baselineCount * 100);
      if (delta >= 5) {
        signals.push({
          type: "file_count_delta",
          current: currentFileCount,
          baseline: baselineCount,
          delta
        });
      }
    }
    const fileCommit = extractCommitHash(content);
    if (fileCommit && headCommit && !headCommit.startsWith(fileCommit) && !fileCommit.startsWith(headCommit)) {
      signals.push({ type: "commit_mismatch", fileCommit, headCommit });
    }
    let ageDays = null;
    try {
      const { stdout } = await execAsync2(
        "git",
        ["log", "-1", "--format=%ct", "--", fileName],
        { cwd: projectDir }
      );
      const ts = parseInt(stdout.trim(), 10);
      if (!isNaN(ts) && ts > 0) {
        ageDays = Math.floor((Date.now() / 1e3 - ts) / 86400);
      }
    } catch {
    }
    if (ageDays === null) {
      try {
        const s = await stat2(join22(projectDir, fileName));
        ageDays = Math.floor((Date.now() - s.mtimeMs) / 864e5);
      } catch {
      }
    }
    if (ageDays !== null && ageDays >= 7) {
      signals.push({ type: "age_days", days: ageDays });
    }
    let driftLevel = "none";
    const fileCountSignal = signals.find((s) => s.type === "file_count_delta");
    const hasCommitMismatch = signals.some((s) => s.type === "commit_mismatch");
    const ageDaysVal = signals.find((s) => s.type === "age_days")?.days ?? 0;
    if (fileCountSignal && (fileCountSignal.delta ?? 0) >= 20) {
      driftLevel = "major";
    } else if (hasCommitMismatch) {
      driftLevel = "major";
    } else if (signals.length > 0) {
      driftLevel = "minor";
    }
    let recommendation = `${fileName} appears up to date`;
    if (driftLevel === "major") {
      if (fileCountSignal && (fileCountSignal.delta ?? 0) >= 20) {
        recommendation = `Regenerate context file \u2014 file count has drifted ${fileCountSignal.delta}% since last scan`;
      } else if (hasCommitMismatch) {
        recommendation = `Regenerate context file \u2014 commit has changed since last scan`;
      }
    } else if (driftLevel === "minor") {
      if (ageDaysVal >= 7) {
        recommendation = `${fileName} is ${ageDaysVal} days old \u2014 consider regenerating`;
      } else if (fileCountSignal) {
        recommendation = `File count shifted ${fileCountSignal.delta}% \u2014 regeneration recommended`;
      }
    }
    return c.json({
      hasContextFile: true,
      fileName,
      driftLevel,
      signals,
      recommendation
    });
  });
  return app;
}

// server/routes/providers.ts
import { Hono as Hono14 } from "hono";
var STATIC_MODELS = {
  claude: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  openai: ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini"],
  gemini: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  mistral: ["mistral-large-latest", "mistral-small-latest", "codestral-latest"],
  grok: ["grok-3", "grok-3-mini"],
  codex: ["gpt-4o", "gpt-4o-mini", "o3", "o3-mini", "o1", "o1-mini"],
  aider: ["gpt-4o", "claude-sonnet-4-6", "deepseek-chat"],
  amp: ["amp-default"],
  goose: ["goose-default"],
  copilot: ["copilot-default"]
};
function providersRoutes(projectDir) {
  const dataDir = `${projectDir}/.hashmark`;
  const app = new Hono14();
  app.get("/", (c) => {
    const store = loadProviders(dataDir);
    const cliResults = detectCLIs(projectDir);
    const cliInstalled = new Set(cliResults.filter((r) => r.installed).map((r) => r.id));
    const masked = store.providers.map(({ apiKey, ...rest }) => ({
      ...rest,
      hasKey: Boolean(apiKey && apiKey.length > 0),
      cliDetected: cliInstalled.has(rest.id)
    }));
    return c.json({ active: store.active, model: store.model, providers: masked });
  });
  app.get("/detect", (c) => {
    const providers = detectCLIs(projectDir);
    return c.json({ providers });
  });
  app.put("/active", async (c) => {
    const body = await c.req.json();
    if (!body.providerId) return c.json({ error: "providerId required" }, 400);
    const store = loadProviders(dataDir);
    const provider = store.providers.find((p) => p.id === body.providerId);
    if (!provider) return c.json({ error: "Provider not found" }, 404);
    store.active = body.providerId;
    if (body.model) store.model = body.model;
    saveProviders(dataDir, store);
    return c.json({ active: store.active, model: store.model });
  });
  app.put("/:id/key", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    if (body.apiKey === void 0) return c.json({ error: "apiKey required" }, 400);
    const store = loadProviders(dataDir);
    const provider = store.providers.find((p) => p.id === id);
    if (!provider) return c.json({ error: "Provider not found" }, 404);
    provider.apiKey = body.apiKey;
    provider.enabled = body.apiKey.length > 0;
    saveProviders(dataDir, store);
    return c.json({ ok: true, hasKey: body.apiKey.length > 0 });
  });
  app.get("/models/:id", async (c) => {
    const id = c.req.param("id");
    const store = loadProviders(dataDir);
    const provider = store.providers.find((p) => p.id === id);
    if (!provider) return c.json({ error: "Provider not found" }, 404);
    if (id === "ollama") {
      const base = provider.baseUrl ?? "http://localhost:11434";
      try {
        const res = await fetch(`${base}/api/tags`);
        if (!res.ok) throw new Error(`Ollama responded with ${res.status}`);
        const data = await res.json();
        const models2 = (data.models ?? []).map((m) => m.name);
        return c.json({ models: models2 });
      } catch (err) {
        return c.json({ models: [], error: err instanceof Error ? err.message : String(err) });
      }
    }
    const models = STATIC_MODELS[id] ?? [];
    return c.json({ models });
  });
  app.put("/:id/baseUrl", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    if (!body.baseUrl) return c.json({ error: "baseUrl required" }, 400);
    const store = loadProviders(dataDir);
    const provider = store.providers.find((p) => p.id === id);
    if (!provider) return c.json({ error: "Provider not found" }, 404);
    provider.baseUrl = body.baseUrl;
    saveProviders(dataDir, store);
    return c.json({ ok: true });
  });
  return app;
}

// server/routes/governance.ts
import { Hono as Hono15 } from "hono";
import { randomUUID as randomUUID6 } from "crypto";
import { existsSync as existsSync18, readFileSync as readFileSync16 } from "fs";
import { join as join23 } from "path";
function governanceRoutes(dataDir) {
  const app = new Hono15();
  app.get("/policies", (c) => {
    const db = getDb(dataDir);
    const policies = db.prepare("SELECT * FROM governance_policies ORDER BY created_at DESC").all();
    return c.json({ policies: policies.map((p) => {
      const r = p;
      return { ...r, rules: JSON.parse(r.rules) };
    }) });
  });
  app.post("/policies", async (c) => {
    const body = await c.req.json();
    const db = getDb(dataDir);
    const id = randomUUID6().slice(0, 8);
    db.prepare(
      "INSERT INTO governance_policies (id, name, description, scope, rules, enabled, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)"
    ).run(id, body.name, body.description ?? "", body.scope ?? "all", JSON.stringify(body.rules ?? []), Date.now());
    return c.json({ id }, 201);
  });
  app.put("/policies/:id", async (c) => {
    const body = await c.req.json();
    const db = getDb(dataDir);
    const fields = [];
    const vals = [];
    if (body.name !== void 0) {
      fields.push("name=?");
      vals.push(body.name);
    }
    if (body.description !== void 0) {
      fields.push("description=?");
      vals.push(body.description);
    }
    if (body.scope !== void 0) {
      fields.push("scope=?");
      vals.push(body.scope);
    }
    if (body.rules !== void 0) {
      fields.push("rules=?");
      vals.push(JSON.stringify(body.rules));
    }
    if (body.enabled !== void 0) {
      fields.push("enabled=?");
      vals.push(body.enabled ? 1 : 0);
    }
    if (fields.length) {
      vals.push(c.req.param("id"));
      db.prepare(`UPDATE governance_policies SET ${fields.join(", ")} WHERE id=?`).run(...vals);
    }
    return c.json({ ok: true });
  });
  app.delete("/policies/:id", (c) => {
    const db = getDb(dataDir);
    db.prepare("DELETE FROM governance_policies WHERE id=?").run(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.get("/actions", (c) => {
    const db = getDb(dataDir);
    const limit = parseInt(c.req.query("limit") ?? "100");
    const offset = parseInt(c.req.query("offset") ?? "0");
    const agentId = c.req.query("agentId");
    const outcome = c.req.query("outcome");
    let query = "SELECT * FROM agent_actions";
    const conditions = [];
    const filterParams = [];
    if (agentId) {
      conditions.push("agent_id=?");
      filterParams.push(agentId);
    }
    if (outcome) {
      conditions.push("outcome=?");
      filterParams.push(outcome);
    }
    if (conditions.length) query += " WHERE " + conditions.join(" AND ");
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    const actions = db.prepare(query).all(...filterParams, limit, offset);
    const countQuery = `SELECT COUNT(*) as c FROM agent_actions${conditions.length ? " WHERE " + conditions.join(" AND ") : ""}`;
    const total = db.prepare(countQuery).get(...filterParams)?.c ?? 0;
    return c.json({ actions, total });
  });
  app.post("/actions", async (c) => {
    const body = await c.req.json();
    const db = getDb(dataDir);
    db.prepare(
      "INSERT INTO agent_actions (session_id, agent_id, action_type, target, outcome, policy_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(body.sessionId ?? null, body.agentId ?? null, body.actionType, body.target ?? null, body.outcome ?? "allowed", body.policyId ?? null, Date.now());
    return c.json({ ok: true }, 201);
  });
  app.get("/summary", (c) => {
    const db = getDb(dataDir);
    const total = db.prepare("SELECT COUNT(*) as c FROM agent_actions").get()?.c ?? 0;
    const blocked = db.prepare("SELECT COUNT(*) as c FROM agent_actions WHERE outcome='blocked'").get()?.c ?? 0;
    const flagged = db.prepare("SELECT COUNT(*) as c FROM agent_actions WHERE outcome='flagged'").get()?.c ?? 0;
    const byType = db.prepare("SELECT action_type, COUNT(*) as count FROM agent_actions GROUP BY action_type").all();
    const recentBlocked = db.prepare("SELECT * FROM agent_actions WHERE outcome IN ('blocked','flagged') ORDER BY created_at DESC LIMIT 5").all();
    return c.json({ total, blocked, flagged, byType, recentBlocked });
  });
  app.get("/action-log", (c) => {
    const logPath = join23(dataDir, "agent-actions.jsonl");
    if (!existsSync18(logPath)) return c.json({ events: [], total: 0 });
    const limit = parseInt(c.req.query("limit") ?? "100");
    const offset = parseInt(c.req.query("offset") ?? "0");
    const filterRunId = c.req.query("runId");
    const filterAgentId = c.req.query("agentId");
    const lines = readFileSync16(logPath, "utf-8").trim().split("\n").filter(Boolean);
    let events = lines.map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean);
    events.reverse();
    if (filterRunId) events = events.filter((e) => e.runId === filterRunId);
    if (filterAgentId) events = events.filter((e) => e.agentId === filterAgentId);
    const total = events.length;
    return c.json({ events: events.slice(offset, offset + limit), total });
  });
  return app;
}

// server/routes/workspaces.ts
import { Hono as Hono16 } from "hono";
import { randomUUID as randomUUID7 } from "crypto";
import { existsSync as existsSync19, readFileSync as readFileSync17, statSync as statSync3 } from "fs";
import { join as join24, basename } from "path";
function readProjectName(projectDir) {
  const pkgPath = join24(projectDir, "package.json");
  try {
    if (existsSync19(pkgPath)) {
      const pkg = JSON.parse(readFileSync17(pkgPath, "utf-8"));
      if (pkg.name) return pkg.name;
    }
  } catch {
  }
  return basename(projectDir);
}
function workspacesRoutes(globalDataDir, ctx) {
  const app = new Hono16();
  app.get("/", (c) => {
    const db = getDb(globalDataDir);
    const rows = db.prepare(
      "SELECT id, name, path, last_opened, is_active FROM workspaces ORDER BY last_opened DESC"
    ).all();
    return c.json({ workspaces: rows });
  });
  app.post("/", async (c) => {
    const body = await c.req.json();
    const rawPath = body?.path?.trim();
    if (!rawPath) return c.json({ error: "path required" }, 400);
    let stat3;
    try {
      stat3 = statSync3(rawPath);
    } catch {
      return c.json({ error: "path does not exist" }, 400);
    }
    if (!stat3.isDirectory()) return c.json({ error: "path must be a directory" }, 400);
    const name = readProjectName(rawPath);
    const db = getDb(globalDataDir);
    const existing = db.prepare("SELECT id FROM workspaces WHERE path = ?").get(rawPath);
    if (existing) {
      db.prepare("UPDATE workspaces SET name = ?, last_opened = ? WHERE id = ?").run(name, Date.now(), existing.id);
      const updated = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(existing.id);
      return c.json({ workspace: updated });
    }
    const id = randomUUID7();
    db.prepare("INSERT INTO workspaces (id, name, path, last_opened, is_active) VALUES (?, ?, ?, ?, 0)").run(id, name, rawPath, Date.now());
    const created = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id);
    return c.json({ workspace: created }, 201);
  });
  app.post("/:id/activate", (c) => {
    const id = c.req.param("id");
    const db = getDb(globalDataDir);
    const ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id);
    if (!ws) return c.json({ error: "workspace not found" }, 404);
    if (!existsSync19(ws.path)) return c.json({ error: "workspace path no longer exists" }, 400);
    db.prepare("UPDATE workspaces SET is_active = 0").run();
    db.prepare("UPDATE workspaces SET is_active = 1, last_opened = ? WHERE id = ?").run(Date.now(), id);
    resetDb();
    ctx.projectDir = ws.path;
    ctx.dataDir = `${ws.path}/.hashmark`;
    return c.json({ ok: true, path: ws.path, name: ws.name });
  });
  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const db = getDb(globalDataDir);
    const ws = db.prepare("SELECT id FROM workspaces WHERE id = ?").get(id);
    if (!ws) return c.json({ error: "workspace not found" }, 404);
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(id);
    return c.json({ ok: true }, 200);
  });
  return app;
}

// server/routes/config.ts
import { Hono as Hono17 } from "hono";
import { existsSync as existsSync20, readFileSync as readFileSync18, writeFileSync as writeFileSync10, mkdirSync as mkdirSync9 } from "fs";
import { join as join25 } from "path";
var DEFAULT_CONFIG = {
  formats: ["CLAUDE.md", "AGENTS.md", ".cursorrules"],
  maxTokens: 1e5,
  watchDebounceMs: 2e3,
  autoRescan: false
};
function loadConfig(dataDir) {
  const filePath = join25(dataDir, "scan-config.json");
  if (!existsSync20(filePath)) return { ...DEFAULT_CONFIG };
  try {
    const raw = readFileSync18(filePath, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
function saveConfig(dataDir, config) {
  if (!existsSync20(dataDir)) mkdirSync9(dataDir, { recursive: true });
  writeFileSync10(join25(dataDir, "scan-config.json"), JSON.stringify(config, null, 2), "utf-8");
}
function configRoutes(projectDir) {
  const app = new Hono17();
  const dataDir = join25(projectDir, ".hashmark");
  app.get("/", (c) => {
    return c.json(loadConfig(dataDir));
  });
  app.put("/", async (c) => {
    const body = await c.req.json();
    const current = loadConfig(dataDir);
    const updated = {
      formats: Array.isArray(body.formats) ? body.formats : current.formats,
      maxTokens: typeof body.maxTokens === "number" ? body.maxTokens : current.maxTokens,
      watchDebounceMs: typeof body.watchDebounceMs === "number" ? body.watchDebounceMs : current.watchDebounceMs,
      autoRescan: typeof body.autoRescan === "boolean" ? body.autoRescan : current.autoRescan
    };
    saveConfig(dataDir, updated);
    return c.json(updated);
  });
  return app;
}

// server/routes/sandbox.ts
import { Hono as Hono18 } from "hono";
import { Bash } from "just-bash";
import { readFileSync as readFileSync19, readdirSync as readdirSync6, statSync as statSync4 } from "fs";
import { join as join26, relative as relative7 } from "path";
function sandboxRoutes(projectDir) {
  const app = new Hono18();
  const sandboxes = /* @__PURE__ */ new Map();
  function getOrCreate(sessionId, seedFromProject = false) {
    let bash = sandboxes.get(sessionId);
    if (bash) return bash;
    const files = {};
    if (seedFromProject && projectDir && projectDir !== "__unset__") {
      try {
        seedFiles(projectDir, projectDir, files, 0);
      } catch {
      }
    }
    bash = new Bash({
      files,
      cwd: "/project",
      env: {
        HOME: "/home/user",
        USER: "agent",
        PROJECT_DIR: "/project",
        PATH: "/usr/local/bin:/usr/bin:/bin"
      }
    });
    sandboxes.set(sessionId, bash);
    return bash;
  }
  function seedFiles(baseDir, currentDir, files, depth) {
    if (depth > 4 || Object.keys(files).length > 100) return;
    const SKIP = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".cache"]);
    const TEXT_EXTS = /* @__PURE__ */ new Set([
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".json",
      ".md",
      ".txt",
      ".css",
      ".html",
      ".yaml",
      ".yml",
      ".toml",
      ".sh",
      ".py",
      ".go",
      ".rs",
      ".sql",
      ".graphql",
      ".prisma"
    ]);
    try {
      const entries = readdirSync6(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (Object.keys(files).length >= 100) break;
        if (SKIP.has(entry.name)) continue;
        if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
        const fullPath = join26(currentDir, entry.name);
        const virtualPath = "/project/" + relative7(baseDir, fullPath);
        if (entry.isDirectory()) {
          seedFiles(baseDir, fullPath, files, depth + 1);
        } else if (entry.isFile()) {
          const ext = entry.name.includes(".") ? "." + entry.name.split(".").pop() : "";
          if (!TEXT_EXTS.has(ext)) continue;
          try {
            const stat3 = statSync4(fullPath);
            if (stat3.size > 5e4) continue;
            files[virtualPath] = readFileSync19(fullPath, "utf-8");
          } catch {
          }
        }
      }
    } catch {
    }
  }
  app.post("/exec", async (c) => {
    const body = await c.req.json();
    const sessionId = body.sessionId || "default";
    const bash = getOrCreate(sessionId, body.seed ?? false);
    try {
      const result = await bash.exec(body.command);
      return c.json({ stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode });
    } catch (err) {
      return c.json({
        stdout: "",
        stderr: err instanceof Error ? err.message : "Sandbox failed",
        exitCode: 1
      }, 500);
    }
  });
  app.post("/reset", async (c) => {
    const body = await c.req.json();
    sandboxes.delete(body.sessionId || "default");
    return c.json({ ok: true });
  });
  app.get("/files", async (c) => {
    const sessionId = c.req.query("sessionId") || "default";
    const bash = getOrCreate(sessionId, false);
    try {
      const result = await bash.exec("find /project -type f 2>/dev/null | head -100");
      return c.json({ files: result.stdout.trim().split("\n").filter(Boolean) });
    } catch {
      return c.json({ files: [] });
    }
  });
  app.post("/preview", async (c) => {
    const body = await c.req.json();
    const sid = body.sessionId || "preview-" + Date.now();
    const bash = getOrCreate(sid, body.seed ?? true);
    const beforeResult = await bash.exec("find /project -type f | sort | xargs md5sum 2>/dev/null || true");
    try {
      const result = await bash.exec(body.script);
      const afterResult = await bash.exec("find /project -type f | sort | xargs md5sum 2>/dev/null || true");
      const beforeLines = new Set(beforeResult.stdout.trim().split("\n"));
      const afterLines = afterResult.stdout.trim().split("\n");
      const changed = [];
      const added = [];
      for (const line of afterLines) {
        if (!line.trim()) continue;
        if (!beforeLines.has(line)) {
          const path = line.split(/\s+/).pop() || "";
          if (beforeResult.stdout.includes(path)) changed.push(path);
          else added.push(path);
        }
      }
      sandboxes.delete(sid);
      return c.json({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        filesChanged: changed,
        filesAdded: added
      });
    } catch (err) {
      sandboxes.delete(sid);
      return c.json({
        stdout: "",
        stderr: err instanceof Error ? err.message : "Preview failed",
        exitCode: 1,
        filesChanged: [],
        filesAdded: []
      }, 500);
    }
  });
  return app;
}

// server/index.ts
function createServer(opts) {
  const app = new Hono19();
  const ctx = {
    projectDir: opts.projectDir,
    dataDir: `${opts.projectDir}/.hashmark`
  };
  const globalDataDir = ctx.dataDir;
  if (opts.projectDir !== "__unset__") {
    try {
      const db = getDb(globalDataDir);
      const pkgPath = join27(opts.projectDir, "package.json");
      let name = basename2(opts.projectDir);
      try {
        if (existsSync21(pkgPath)) {
          const pkg = JSON.parse(readFileSync20(pkgPath, "utf-8"));
          if (pkg.name) name = pkg.name;
        }
      } catch {
      }
      const existing = db.prepare("SELECT id FROM workspaces WHERE path = ?").get(opts.projectDir);
      if (existing) {
        db.prepare("UPDATE workspaces SET name = ?, last_opened = ?, is_active = 1 WHERE id = ?").run(name, Date.now(), existing.id);
        db.prepare("UPDATE workspaces SET is_active = 0 WHERE id != ?").run(existing.id);
      } else {
        const id = randomUUID8();
        db.prepare("UPDATE workspaces SET is_active = 0").run();
        db.prepare("INSERT INTO workspaces (id, name, path, last_opened, is_active) VALUES (?, ?, ?, ?, 1)").run(id, name, opts.projectDir, Date.now());
      }
    } catch {
    }
  }
  setStudioPort(opts.port);
  app.use("*", cors({ origin: "*" }));
  app.get("/api/health", (c) => c.json({ ok: true, timestamp: Date.now() }));
  app.get("/api/info", async (c) => {
    const { join: pathJoin, basename: pathBasename } = await import("path");
    const { existsSync: fsExists, readFileSync: fsRead } = await import("fs");
    const pkgPath = pathJoin(ctx.projectDir, "package.json");
    let projectName = pathBasename(ctx.projectDir);
    try {
      if (fsExists(pkgPath)) {
        const pkg = JSON.parse(fsRead(pkgPath, "utf-8"));
        projectName = pkg.name ?? projectName;
      }
    } catch {
    }
    return c.json({
      projectName,
      projectDir: ctx.projectDir,
      configured: ctx.projectDir !== "__unset__",
      nodeVersion: process.versions.node,
      port: opts.port
    });
  });
  app.get("/api/settings/env", async (c) => {
    const { join: pjoin } = await import("path");
    const { existsSync: fsExists, readFileSync: fsRead } = await import("fs");
    const vars = [];
    const seen = /* @__PURE__ */ new Set();
    for (const fname of [".env.local", ".env"]) {
      const filePath = pjoin(ctx.projectDir, fname);
      if (!fsExists(filePath)) continue;
      try {
        for (const line of fsRead(filePath, "utf-8").split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eq = trimmed.indexOf("=");
          if (eq === -1) continue;
          const key = trimmed.slice(0, eq).trim();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          vars.push({ key, source: fname, set: trimmed.slice(eq + 1).trim().length > 0 });
        }
      } catch {
      }
    }
    return c.json({ vars });
  });
  app.route("/api/scan", scanRoutes(opts.projectDir));
  app.route("/api/agents", agentsRoutes(opts.projectDir));
  app.route("/api/generate", generateRoutes(opts.projectDir));
  app.route("/api/tasks", tasksRoutes(opts.projectDir));
  app.route("/api/sessions", sessionsRoutes(opts.projectDir));
  app.route("/api/files", filesRoutes(opts.projectDir));
  app.route("/api/workspace", workspaceRoutes(opts.projectDir));
  app.route("/api/checkpoints", checkpointRoutes(opts.projectDir));
  app.route("/api/mcp", mcpRoutes(opts.projectDir));
  app.route("/api/run", runRoutes(opts.projectDir));
  app.route("/api/swarm", swarmRoutes(opts.projectDir));
  app.route("/api/company", companyRoutes(opts.projectDir));
  app.route("/api/drift", driftRoutes(opts.projectDir));
  app.route("/api/providers", providersRoutes(opts.projectDir));
  app.route("/api/governance", governanceRoutes(opts.projectDir));
  app.route("/api/workspaces", workspacesRoutes(globalDataDir, ctx));
  app.route("/api/config", configRoutes(opts.projectDir));
  app.route("/api/sandbox", sandboxRoutes(opts.projectDir));
  app.use(
    "/*",
    serveStatic({ root: opts.staticDir })
  );
  app.get("*", (c) => {
    const indexPath = join27(opts.staticDir, "index.html");
    if (existsSync21(indexPath)) {
      const html = readFileSync20(indexPath, "utf-8");
      return c.html(html);
    }
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head><title>hashmark studio</title></head>
        <body style="background:#09090b;color:#71717a;font-family:monospace;padding:40px">
          <h2 style="color:#10b981"># hashmark studio</h2>
          <p>Studio client not built yet.</p>
          <p>Run: <code style="color:#fafafa">cd packages/studio && npm install && npm run build:client</code></p>
        </body>
      </html>
    `);
  });
  const server = serve({ fetch: app.fetch, port: opts.port, hostname: "localhost" }, () => {
  });
  attachTerminalWS(server, opts.projectDir);
  return { app, server };
}
export {
  createServer,
  killAllActiveSessions
};
