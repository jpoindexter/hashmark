// server/index.ts
import { Hono as Hono31 } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { readFileSync as readFileSync27, existsSync as existsSync35 } from "fs";
import { join as join40, basename as basename8 } from "path";
import { randomUUID as randomUUID18 } from "crypto";

// server/routes/agents.ts
import { Hono } from "hono";
import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync, mkdirSync as mkdirSync2, renameSync, statSync } from "fs";
import { join as join2, relative } from "path";

// server/db.ts
import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync, chmodSync } from "fs";

// server/migrations.ts
function getSchemaVersion(db) {
  const tableExists = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_version'"
  ).get();
  if (!tableExists) {
    db.exec("CREATE TABLE schema_version (version INTEGER NOT NULL)");
    db.exec("INSERT INTO schema_version (version) VALUES (0)");
    return 0;
  }
  const row = db.prepare("SELECT version FROM schema_version LIMIT 1").get();
  if (!row) {
    db.exec("INSERT INTO schema_version (version) VALUES (0)");
    return 0;
  }
  return row.version;
}
function setVersion(db, version) {
  db.prepare("UPDATE schema_version SET version = ?").run(version);
}
function colNames(db, table) {
  return db.pragma(`table_info(${table})`).map((r) => r.name);
}
function runMigrations(db) {
  let version = getSchemaVersion(db);
  const migrations = [
    { target: 1, fn: migrateV1 },
    { target: 2, fn: migrateV2 },
    { target: 3, fn: migrateV3 },
    { target: 4, fn: migrateV4 },
    { target: 5, fn: migrateV5 },
    { target: 6, fn: migrateV6 },
    { target: 7, fn: migrateV7 },
    { target: 8, fn: migrateV8 }
  ];
  for (const migration of migrations) {
    if (version < migration.target) {
      db.transaction(() => {
        migration.fn(db);
        setVersion(db, migration.target);
      })();
      version = migration.target;
    }
  }
}
function migrateV1(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Session',
      agent_id TEXT, agent_name TEXT,
      model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
      status TEXT NOT NULL DEFAULT 'idle',
      total_input_tokens INTEGER NOT NULL DEFAULT 0,
      total_output_tokens INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      input_tokens INTEGER, output_tokens INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session
      ON session_messages(session_id, created_at);
    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY, identifier TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL, description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'medium',
      agent_id TEXT, agent_name TEXT, assignee TEXT,
      run_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
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
      started_at INTEGER NOT NULL, ended_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS swarm_runs (
      id TEXT PRIMARY KEY, task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      worker_count INTEGER NOT NULL DEFAULT 0,
      merged_count INTEGER NOT NULL DEFAULT 0,
      conflict_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS swarm_workers (
      run_id TEXT NOT NULL REFERENCES swarm_runs(id) ON DELETE CASCADE,
      worker_id INTEGER NOT NULL,
      title TEXT NOT NULL, agent_id TEXT NOT NULL, agent_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      output TEXT NOT NULL DEFAULT '', error TEXT,
      started_at INTEGER, completed_at INTEGER,
      PRIMARY KEY (run_id, worker_id)
    );
    CREATE TABLE IF NOT EXISTS governance_policies (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
      scope TEXT NOT NULL DEFAULT 'all',
      rules TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT, agent_id TEXT,
      action_type TEXT NOT NULL, target TEXT,
      outcome TEXT NOT NULL DEFAULT 'allowed', policy_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      last_opened INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0
    );

    -- Performance indexes for common query patterns
    CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(archived, updated_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_runs_session ON runs(session_id);
    CREATE INDEX IF NOT EXISTS idx_runs_issue ON runs(issue_id);
  `);
}
function migrateV2(db) {
  const sessionCols = colNames(db, "sessions");
  if (!sessionCols.includes("archived")) {
    db.exec("ALTER TABLE sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");
  }
  if (!sessionCols.includes("claude_session_id")) {
    db.exec("ALTER TABLE sessions ADD COLUMN claude_session_id TEXT");
  }
  if (!sessionCols.includes("cost_usd")) {
    db.exec("ALTER TABLE sessions ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0");
  }
  const msgCols = colNames(db, "session_messages");
  if (!msgCols.includes("sent_at")) {
    db.exec("ALTER TABLE session_messages ADD COLUMN sent_at INTEGER");
    db.exec(
      "UPDATE session_messages SET sent_at = created_at WHERE sent_at IS NULL AND role = 'user'"
    );
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, session_id TEXT,
      agent_name TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      file_path TEXT NOT NULL, diff_content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','approved','rejected')),
      created_at INTEGER NOT NULL, reviewed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status, created_at);
    CREATE TABLE IF NOT EXISTS workflow_templates (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
      steps TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shared_context (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL DEFAULT '',
      key TEXT NOT NULL, value TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'global',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(key, workspace_id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_context_scope ON shared_context(scope);
    CREATE TABLE IF NOT EXISTS review_comments (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      line_number INTEGER NOT NULL, content TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'user', created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_review_comments ON review_comments(review_id);
    CREATE TABLE IF NOT EXISTS review_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL, author TEXT NOT NULL DEFAULT 'system',
      data TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_review_events ON review_events(review_id, created_at);
    CREATE TABLE IF NOT EXISTS review_policies (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      rule_type TEXT NOT NULL CHECK(rule_type IN ('path_pattern','file_action','always')),
      pattern TEXT NOT NULL DEFAULT '*',
      require_review INTEGER NOT NULL DEFAULT 1,
      auto_reviewer TEXT, enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '', token TEXT NOT NULL,
      refresh_token TEXT, token_expires_at INTEGER,
      scopes TEXT NOT NULL DEFAULT '', metadata TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_provider ON connections(provider);
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'local', path TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      config TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pipelines (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      stages TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'idle',
      current_stage INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
}
function migrateV3(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL, session_id TEXT NOT NULL,
      event_type TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_activity_time ON agent_activity(created_at);
    CREATE INDEX IF NOT EXISTS idx_agent_activity_agent ON agent_activity(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_activity_session ON agent_activity(session_id);
    CREATE TABLE IF NOT EXISTS user_state (
      key TEXT PRIMARY KEY, value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  const reviewCols = colNames(db, "reviews");
  if (!reviewCols.includes("reviewer_session_id")) {
    db.exec("ALTER TABLE reviews ADD COLUMN reviewer_session_id TEXT");
  }
  if (!reviewCols.includes("reviewer_output")) {
    db.exec("ALTER TABLE reviews ADD COLUMN reviewer_output TEXT");
  }
  if (!reviewCols.includes("review_policy_id")) {
    db.exec("ALTER TABLE reviews ADD COLUMN review_policy_id TEXT");
  }
  if (!reviewCols.includes("confidence_score")) {
    db.exec("ALTER TABLE reviews ADD COLUMN confidence_score REAL");
  }
  const policyCols = colNames(db, "review_policies");
  if (!policyCols.includes("auto_approve_threshold")) {
    db.exec("ALTER TABLE review_policies ADD COLUMN auto_approve_threshold REAL DEFAULT 0.0");
  }
}
function migrateV4(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT,
      content TEXT,
      meta TEXT DEFAULT '{}',
      file_path TEXT,
      session_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kn_kind ON knowledge_nodes(kind);
    CREATE INDEX IF NOT EXISTS idx_kn_file_path ON knowledge_nodes(file_path);
    CREATE INDEX IF NOT EXISTS idx_kn_session_id ON knowledge_nodes(session_id);

    CREATE TABLE IF NOT EXISTS knowledge_edges (
      id TEXT PRIMARY KEY,
      src_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
      dst_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      weight REAL DEFAULT 0.5,
      label TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      UNIQUE(src_id, dst_id, kind)
    );
    CREATE INDEX IF NOT EXISTS idx_ke_src ON knowledge_edges(src_id);
    CREATE INDEX IF NOT EXISTS idx_ke_dst ON knowledge_edges(dst_id);
    CREATE INDEX IF NOT EXISTS idx_ke_kind ON knowledge_edges(kind);

    CREATE TABLE IF NOT EXISTS knowledge_embeddings (
      node_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
      model TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
      vector BLOB,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(node_id, model)
    );

    CREATE TABLE IF NOT EXISTS embedding_jobs (
      id TEXT PRIMARY KEY,
      node_id TEXT REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ej_status ON embedding_jobs(status);

    CREATE TABLE IF NOT EXISTS knowledge_canvas (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}
function migrateV7(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      model_ids TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `);
}
function migrateV6(db) {
  const msgCols = colNames(db, "session_messages");
  if (!msgCols.includes("is_compaction_summary")) {
    db.exec("ALTER TABLE session_messages ADD COLUMN is_compaction_summary INTEGER NOT NULL DEFAULT 0");
  }
}
function migrateV5(db) {
  const cols = colNames(db, "sessions");
  if (!cols.includes("agent_branch")) {
    db.exec("ALTER TABLE sessions ADD COLUMN agent_branch TEXT");
  }
  if (!cols.includes("base_branch")) {
    db.exec("ALTER TABLE sessions ADD COLUMN base_branch TEXT");
  }
  if (!cols.includes("worktree_path")) {
    db.exec("ALTER TABLE sessions ADD COLUMN worktree_path TEXT");
  }
  if (!cols.includes("base_commit_sha")) {
    db.exec("ALTER TABLE sessions ADD COLUMN base_commit_sha TEXT");
  }
}

// server/db.ts
var _dbs = /* @__PURE__ */ new Map();
function resetDb(dataDir) {
  if (dataDir) {
    const db = _dbs.get(dataDir);
    if (db) {
      try {
        db.close();
      } catch {
      }
      _dbs.delete(dataDir);
    }
  } else {
    for (const db of _dbs.values()) {
      try {
        db.close();
      } catch {
      }
    }
    _dbs.clear();
  }
}
function getDb(dataDir) {
  const existing = _dbs.get(dataDir);
  if (existing) return existing;
  mkdirSync(dataDir, { recursive: true, mode: 448 });
  const dbPath = join(dataDir, "studio.db");
  const db = new Database(dbPath);
  try {
    chmodSync(dbPath, 384);
  } catch {
  }
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  runMigrations(db);
  _dbs.set(dataDir, db);
  return db;
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
      } else if (entry.name.endsWith(".md") && entry.name !== "INDEX.md" && !entry.name.endsWith(".md.deleted")) {
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
var DELETED_TTL_MS = 24 * 60 * 60 * 1e3;
function purgeExpiredDeletedAgents(projectDir) {
  const agentsDir = join2(projectDir, ".claude", "agents");
  if (!existsSync(agentsDir)) return;
  const now = Date.now();
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
      } else if (entry.name.endsWith(".md.deleted")) {
        const fullPath = join2(dir, entry.name);
        try {
          const stat3 = statSync(fullPath);
          if (now - stat3.mtimeMs >= DELETED_TTL_MS) {
            unlinkSync(fullPath);
          }
        } catch {
        }
      }
    }
  }
  walk(agentsDir);
}
function startDeletedAgentsCleanup(getProjectDir) {
  const run = () => {
    const dir = getProjectDir();
    if (dir) purgeExpiredDeletedAgents(dir);
  };
  run();
  setInterval(run, 60 * 60 * 1e3);
}
function agentsRoutes() {
  const app = new Hono();
  app.get("/route", (c) => {
    const { projectDir } = c.get("project");
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
    const { projectDir } = c.get("project");
    const agents = readAgentsDir(projectDir);
    const findings = scanAgentSecurity(agents);
    return c.json({ findings, scannedAt: Date.now(), agentCount: agents.length });
  });
  app.get("/", (c) => {
    const { projectDir } = c.get("project");
    const agents = readAgentsDir(projectDir);
    return c.json({ agents });
  });
  app.post("/", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json();
    if (!body.name?.trim()) return c.json({ error: "name required" }, 400);
    const dept = body.department?.trim() || "general";
    const slug = body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const agentsDir = join2(projectDir, ".claude", "agents", dept);
    const { mkdirSync: mkdirSync17 } = await import("fs");
    try {
      mkdirSync17(agentsDir, { recursive: true });
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
    const { dataDir } = c.get("project");
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
    const { dataDir } = c.get("project");
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
    const { projectDir } = c.get("project");
    const id = c.req.param("id");
    const agents = readAgentsDir(projectDir);
    const agent = agents.find((a) => a.id === id);
    if (!agent) return c.json({ error: "Not found" }, 404);
    return c.json({ agent });
  });
  app.delete("/:id", (c) => {
    const { projectDir } = c.get("project");
    const id = c.req.param("id");
    const agentsDir = join2(projectDir, ".claude", "agents");
    const agents = readAgentsDir(projectDir);
    const agent = agents.find((a) => a.id === id);
    if (!agent) return c.json({ error: "Not found" }, 404);
    const fullPath = join2(agentsDir, agent.path);
    const deletedPath = `${fullPath}.deleted`;
    try {
      renameSync(fullPath, deletedPath);
    } catch {
      return c.json({ error: "Failed to delete agent file" }, 500);
    }
    return c.json({ ok: true });
  });
  app.post("/:id/restore", (c) => {
    const { projectDir } = c.get("project");
    const id = c.req.param("id");
    const agentsDir = join2(projectDir, ".claude", "agents");
    function findDeletedPath(dir) {
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return null;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const found = findDeletedPath(join2(dir, entry.name));
          if (found) return found;
        } else if (entry.name.endsWith(".md.deleted")) {
          const fullPath = join2(dir, entry.name);
          const relativePath = relative(agentsDir, fullPath).replace(/\.deleted$/, "");
          const derivedId = relativePath.replace(/\.md$/, "").replace(/\//g, "-");
          if (derivedId === id) return fullPath;
        }
      }
      return null;
    }
    const deletedPath = findDeletedPath(agentsDir);
    if (!deletedPath) return c.json({ error: "Not found" }, 404);
    const originalPath = deletedPath.replace(/\.deleted$/, "");
    try {
      renameSync(deletedPath, originalPath);
    } catch {
      return c.json({ error: "Failed to restore agent file" }, 500);
    }
    return c.json({ ok: true });
  });
  app.put("/:id", async (c) => {
    const { projectDir } = c.get("project");
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
  app.get("/:id/export", (c) => {
    const { projectDir } = c.get("project");
    const id = c.req.param("id");
    const agents = readAgentsDir(projectDir);
    const agent = agents.find((a) => a.id === id);
    if (!agent) return c.json({ error: "Not found" }, 404);
    const agentsDir = join2(projectDir, ".claude", "agents");
    const fullPath = join2(agentsDir, agent.path);
    let content = "";
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      return c.json({ error: "Cannot read agent file" }, 500);
    }
    const bundle = {
      format: "hashmark-agent-v1",
      exported_at: (/* @__PURE__ */ new Date()).toISOString(),
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        department: agent.department,
        path: agent.path,
        content
      }
    };
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${agent.id}.agent.json"`
      }
    });
  });
  app.post("/import", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json();
    if (body.format !== "hashmark-agent-v1") {
      return c.json({ error: "Unsupported format" }, 400);
    }
    if (!body.agent?.content || !body.agent?.path) {
      return c.json({ error: "Missing agent content or path" }, 400);
    }
    const agentsDir = join2(projectDir, ".claude", "agents");
    mkdirSync2(agentsDir, { recursive: true });
    const targetPath = join2(agentsDir, body.agent.path);
    const targetDir = join2(targetPath, "..");
    mkdirSync2(targetDir, { recursive: true });
    writeFileSync(targetPath, body.agent.content, "utf-8");
    return c.json({ ok: true, id: body.agent.id }, 201);
  });
  return app;
}

// server/routes/generate.ts
import { Hono as Hono2 } from "hono";
import { spawn } from "child_process";
import { mkdirSync as mkdirSync3, writeFileSync as writeFileSync2, existsSync as existsSync2, symlinkSync, lstatSync } from "fs";
import { join as join3, resolve, dirname } from "path";
function generateRoutes() {
  const app = new Hono2();
  app.post("/", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json();
    let proc = null;
    let generateTimeout = null;
    const stream = new ReadableStream({
      cancel() {
        if (generateTimeout) clearTimeout(generateTimeout);
        try {
          proc?.kill("SIGTERM");
        } catch {
        }
      },
      start(controller) {
        let closed = false;
        const send = (data) => {
          if (closed) return;
          try {
            const chunk = `data: ${JSON.stringify(data)}

`;
            controller.enqueue(new TextEncoder().encode(chunk));
          } catch {
            closed = true;
          }
        };
        const safeClose = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
          }
        };
        send({ type: "start", message: "Starting agent generation..." });
        if (body.companyType?.startsWith("-") || body.projectName?.startsWith("-")) {
          send({ type: "error", message: "Invalid input" });
          safeClose();
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
        if (isMonorepo) {
          const distNm = join3(projectDir, "packages", "cli", "dist", "node_modules");
          const cliNm = join3(projectDir, "packages", "cli", "node_modules");
          try {
            if (!lstatSync(distNm).isSymbolicLink()) symlinkSync(cliNm, distNm);
          } catch {
            try {
              symlinkSync(cliNm, distNm);
            } catch {
            }
          }
        }
        const spawnCwd = isMonorepo ? join3(projectDir, "packages", "cli") : projectDir;
        proc = spawn(resolvedBin, args, { cwd: spawnCwd, env });
        generateTimeout = setTimeout(() => {
          try {
            proc?.kill("SIGTERM");
          } catch {
          }
          send({ type: "error", message: "Agent generation timed out after 5 minutes" });
          safeClose();
        }, 3e5);
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
          if (generateTimeout) clearTimeout(generateTimeout);
          send({ type: "done", success: code === 0 });
          safeClose();
        });
        proc.on("error", (err) => {
          if (generateTimeout) clearTimeout(generateTimeout);
          send({ type: "error", message: err.message });
          safeClose();
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
    const { projectDir } = c.get("project");
    const body = await c.req.json();
    const agentsDir = join3(projectDir, ".claude", "agents");
    let written = 0;
    for (const agent of body.agents) {
      if (!agent.path || typeof agent.path !== "string") continue;
      const fullPath = resolve(agentsDir, agent.path);
      if (!fullPath.startsWith(agentsDir + "/") && fullPath !== agentsDir) continue;
      mkdirSync3(dirname(fullPath), { recursive: true });
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
import { join as join5, extname } from "path";
import { existsSync as existsSync4, readFileSync as readFileSync3, writeFileSync as writeFileSync3, mkdirSync as mkdirSync4, symlinkSync as symlinkSync2, lstatSync as lstatSync2, readdirSync as readdirSync2, statSync as statSync3 } from "fs";

// server/context.ts
import { existsSync as existsSync3, readFileSync as readFileSync2, statSync as statSync2 } from "fs";
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
  const indexPath2 = join4(projectDir, ".hashmark", "index.json");
  if (existsSync3(indexPath2)) {
    try {
      const raw = readFileSync2(indexPath2, "utf-8").trim();
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
        const stat3 = statSync2(claudeMdPath);
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
  const indexPath2 = join4(projectDir, ".hashmark", "index.json");
  if (existsSync3(indexPath2)) {
    try {
      const raw = readFileSync2(indexPath2, "utf-8").trim();
      if (raw) {
        const stat3 = statSync2(indexPath2);
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

// server/lib/secret-scanner.ts
var CREDENTIAL_PATTERNS = [
  // AWS
  { label: "AWS Access Key ID", severity: "critical", pattern: /\b(AKIA[0-9A-Z]{16})\b/ },
  { label: "AWS Secret Access Key", severity: "critical", pattern: /(?:aws[_\-.]?secret[_\-.]?(?:access[_\-.]?)?key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*["']?([A-Za-z0-9/+=]{40})["']?/i },
  // Anthropic
  { label: "Anthropic API Key", severity: "critical", pattern: /\b(sk-ant-(?:api\d+-)?[A-Za-z0-9_-]{40,})\b/ },
  // OpenAI
  { label: "OpenAI API Key", severity: "critical", pattern: /\b(sk-(?:proj-)?[A-Za-z0-9_-]{48,})\b/ },
  // GitHub
  { label: "GitHub Personal Token", severity: "critical", pattern: /\b(gh[pousr]_[A-Za-z0-9]{36,})\b/ },
  { label: "GitHub App Token", severity: "critical", pattern: /\b(ghs_[A-Za-z0-9]{36,})\b/ },
  { label: "GitHub Refresh Token", severity: "high", pattern: /\b(ghr_[A-Za-z0-9]{76,})\b/ },
  // Stripe
  { label: "Stripe Secret Key", severity: "critical", pattern: /\b(sk_live_[0-9a-zA-Z]{24,})\b/ },
  { label: "Stripe Restricted Key", severity: "high", pattern: /\b(rk_live_[0-9a-zA-Z]{24,})\b/ },
  // npm
  { label: "npm Access Token", severity: "high", pattern: /\b(npm_[A-Za-z0-9]{36,})\b/ },
  // Slack
  { label: "Slack Bot Token", severity: "high", pattern: /\b(xox[baprs]-[0-9]+-[0-9A-Za-z-]+)\b/ },
  { label: "Slack Webhook URL", severity: "high", pattern: /hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/ },
  // JWT
  { label: "JSON Web Token", severity: "medium", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  // Private keys
  { label: "PEM Private Key", severity: "critical", pattern: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY(?:\s+BLOCK)?-----/ },
  // Twilio
  { label: "Twilio Account SID", severity: "high", pattern: /\b(AC[0-9a-fA-F]{32})\b/ },
  { label: "Twilio Auth Token", severity: "critical", pattern: /\b(SK[0-9a-fA-F]{32})\b/ },
  // SendGrid
  { label: "SendGrid API Key", severity: "critical", pattern: /\b(SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43})\b/ },
  // Supabase service-role key (JWT with service_role payload)
  { label: "Supabase Service Key", severity: "critical", pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]*"role"\s*:\s*"service_role"/ },
  // Generic hardcoded secrets (last resort)
  { label: "Hardcoded Secret", severity: "high", pattern: /(?:password|passwd|secret|api_?key|auth_?token|access_?token|private_?key)\s*[=:]\s*["']([^"'\s]{16,})["']/i }
];
var DANGER_PATTERNS = [
  // Disk destruction
  { label: "Recursive force delete root", severity: "critical", pattern: /\brm\s+(?:-[a-z]*f[a-z]*r[a-z]*|-[a-z]*r[a-z]*f[a-z]*)\s+\/(?:\s|$|\*)/ },
  { label: "Disk format (mkfs)", severity: "critical", pattern: /\bmkfs\b.*\/dev\// },
  { label: "Raw disk overwrite (dd)", severity: "critical", pattern: /\bdd\b.*\bof=\/dev\/(?:sd|hd|nvme|xvd)/ },
  { label: "Disk wipe via redirect", severity: "critical", pattern: />\s*\/dev\/(?:sd[a-z]|hd[a-z]|nvme\d|xvd[a-z])\b/ },
  // Fork bomb
  { label: "Fork bomb", severity: "critical", pattern: /:\(\s*\)\s*\{\s*:|:\(\s*\)/ },
  // Reverse shells
  { label: "Netcat reverse shell", severity: "critical", pattern: /\bnc(?:at)?\b.*-e\s+(?:\/bin\/(?:ba)?sh|cmd\.exe)/i },
  { label: "Bash TCP reverse shell", severity: "critical", pattern: /bash\s+-i\s+>&\s+\/dev\/tcp\// },
  { label: "Python socket reverse shell", severity: "critical", pattern: /python[23]?\s+-c\s+['"].*socket.*connect/i },
  { label: "Perl socket reverse shell", severity: "critical", pattern: /perl\s+-e\s+['"].*socket.*connect/i },
  // Encoded payload execution
  { label: "Base64 decode to shell", severity: "critical", pattern: /echo\s+[A-Za-z0-9+/]{20,}={0,2}\s*\|\s*base64\s+-d\s*\|\s*(?:bash|sh)/ },
  // Privilege escalation
  { label: "World-writable recursive chmod", severity: "critical", pattern: /\bchmod\s+(?:-[Rr]\s+)?[0-9]*7[0-9]{2}\s+\/(?:\s|$)/ },
  { label: "World-writable system files", severity: "critical", pattern: /chmod\s+[0-9]*[67][0-9]{2}\s+\/etc\/(?:passwd|shadow|sudoers)/ },
  { label: "Sudo NOPASSWD write", severity: "high", pattern: /echo\s+['"].*NOPASSWD.*['"]\s*(?:>>|>)\s*\/etc\/sudoers/ },
  // Download and run
  { label: "Curl pipe to shell", severity: "high", pattern: /curl\s+(?:-[a-z]+\s+)*https?:\/\/\S+\s*\|\s*(?:ba)?sh/ },
  { label: "Wget pipe to shell", severity: "high", pattern: /wget\s+(?:-[a-z]+\s+)*https?:\/\/\S+\s*-O\s*-\s*\|\s*(?:ba)?sh/ },
  // Env exfiltration
  { label: "Env dump to network", severity: "high", pattern: /(?:env|printenv)\s*\|\s*(?:curl|wget|nc)\s+/ },
  { label: "/proc/environ read", severity: "high", pattern: /cat\s+\/proc\/(?:self\/)?environ/ }
];
function redact(s) {
  if (s.length <= 8) return "****";
  return s.slice(0, 4) + "*".repeat(Math.min(s.length - 4, 12));
}
var BINARY_EXTS = /* @__PURE__ */ new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".xz",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".db",
  ".sqlite",
  ".sqlite3"
]);
function scanText(text, opts = {}) {
  if (opts.fileExt && BINARY_EXTS.has(opts.fileExt.toLowerCase())) return [];
  const findings = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();
    if (/^[#*].*(?:example|placeholder|your[_\-\s]?key|xxx|your-token|insert|replace)/i.test(stripped)) continue;
    if (/=(?:YOUR_|<[A-Z_]+>|\$\{[A-Z_]+\}|%%[A-Z_]+%%)/.test(line)) continue;
    if (!opts.skipCredentials) {
      for (const def of CREDENTIAL_PATTERNS) {
        const m = def.pattern.exec(line);
        if (!m) continue;
        findings.push({
          kind: "credential",
          severity: def.severity,
          label: def.label,
          match: redact(m[1] ?? m[0]),
          line: i + 1,
          col: (m.index ?? 0) + 1
        });
        break;
      }
    }
    if (!opts.skipDangerousCommands) {
      for (const def of DANGER_PATTERNS) {
        const m = def.pattern.exec(line);
        if (!m) continue;
        findings.push({
          kind: "dangerous_command",
          severity: def.severity,
          label: def.label,
          match: stripped.slice(0, 120),
          line: i + 1,
          col: (m.index ?? 0) + 1
        });
        break;
      }
    }
  }
  return findings;
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
function scanRoutes() {
  const app = new Hono3();
  app.get("/history", (c) => {
    const { dataDir } = c.get("project");
    const snapshotPath = join5(dataDir, "last-scan-snapshot.json");
    if (!existsSync4(snapshotPath)) return c.json({ snapshots: [] });
    try {
      const snap = JSON.parse(readFileSync3(snapshotPath, "utf-8"));
      return c.json({ snapshots: [snap] });
    } catch {
      return c.json({ snapshots: [] });
    }
  });
  app.get("/context", (c) => {
    const { projectDir } = c.get("project");
    const meta = getScanContextMeta(projectDir);
    return c.json(meta);
  });
  app.get("/staleness", (c) => {
    const { projectDir } = c.get("project");
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
    const { projectDir, dataDir } = c.get("project");
    const snapshotPath = join5(dataDir, "last-scan-snapshot.json");
    const timeoutSec = Math.min(Number(c.req.query("timeout") || "180"), 600);
    let formats = [];
    try {
      const body = await c.req.json().catch(() => ({}));
      if (Array.isArray(body.formats)) formats = body.formats;
    } catch {
    }
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
    let proc = null;
    let timeout = null;
    let safeClose = () => {
    };
    const stream = new ReadableStream({
      cancel() {
        if (timeout !== null) clearTimeout(timeout);
        try {
          proc?.kill("SIGTERM");
        } catch {
        }
        safeClose();
      },
      start(controller) {
        controller.enqueue(send({ type: "start", message: "Starting scan..." }));
        const localBin = join5(projectDir, "node_modules", ".bin", "hashmark");
        const monoBin = join5(projectDir, "packages", "cli", "dist", "cli.js");
        const isMonorepo = !existsSync4(localBin) && existsSync4(monoBin);
        const bin = existsSync4(localBin) ? localBin : isMonorepo ? "node" : "hashmark";
        const baseArgs = bin === "node" ? [monoBin, projectDir, "--yes"] : ["--yes"];
        const formatArg = formats.length > 0 ? ["--format", formats.join(",")] : [];
        const args = [...baseArgs, ...formatArg];
        if (isMonorepo) {
          const distNodeModules = join5(projectDir, "packages", "cli", "dist", "node_modules");
          const cliNodeModules = join5(projectDir, "packages", "cli", "node_modules");
          try {
            if (!lstatSync2(distNodeModules).isSymbolicLink()) {
              symlinkSync2(cliNodeModules, distNodeModules);
            }
          } catch {
            try {
              symlinkSync2(cliNodeModules, distNodeModules);
            } catch {
            }
          }
        }
        const spawnCwd = isMonorepo ? join5(projectDir, "packages", "cli") : projectDir;
        proc = spawn2(bin, args, {
          cwd: spawnCwd,
          env: process.env
        });
        let closed = false;
        const safeEnqueue = (data) => {
          if (closed) return;
          try {
            controller.enqueue(data);
          } catch {
            closed = true;
          }
        };
        safeClose = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
          }
        };
        timeout = setTimeout(() => {
          try {
            proc?.kill("SIGTERM");
          } catch {
          }
          safeEnqueue(send({ type: "error", message: `Scan timed out after ${timeoutSec}s. The codebase may be too large for a full scan. Try running 'npx hashmark' from terminal.` }));
          safeClose();
        }, timeoutSec * 1e3);
        let lastResult = "";
        let stdoutBuf = "";
        proc.stdout?.on("data", (chunk) => {
          stdoutBuf += chunk.toString();
        });
        proc.stderr?.on("data", (chunk) => {
          const lines = chunk.toString().split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith("{")) {
              try {
                const evt = JSON.parse(trimmed);
                if (evt._progress && evt.phase === "traverse" && evt.file) {
                  safeEnqueue(send({ type: "progress", message: `Scanning ${evt.file}`, current: evt.current, total: evt.total }));
                } else if (evt._progress && evt.label) {
                  safeEnqueue(send({ type: "progress", message: evt.label }));
                } else if (evt.ok && evt.files) {
                  lastResult = trimmed;
                }
                continue;
              } catch {
              }
            }
            safeEnqueue(send({ type: "progress", message: trimmed }));
          }
        });
        proc.on("close", (code) => {
          if (timeout !== null) clearTimeout(timeout);
          if (closed) return;
          if (code === 0) {
            try {
              const rawResult = lastResult || stdoutBuf.trim().split("\n").pop() || "{}";
              const result = JSON.parse(rawResult);
              const files = result.files ?? [];
              const currSnapshot = snapshotFromResult(result);
              let delta = null;
              try {
                if (prevSnapshot) delta = computeDelta(prevSnapshot, currSnapshot);
                mkdirSync4(dataDir, { recursive: true });
                writeFileSync3(snapshotPath, JSON.stringify(currSnapshot, null, 2));
              } catch (err) {
                console.error("[scan] failed to save snapshot:", err);
              }
              safeEnqueue(send({ type: "complete", result: { ...result, fileCount: files.length }, delta }));
            } catch {
              safeEnqueue(send({ type: "complete", result: null, delta: null }));
            }
          } else {
            safeEnqueue(send({ type: "error", message: `Scan exited with code ${code}` }));
          }
          safeClose();
        });
        proc.on("error", (err) => {
          if (timeout !== null) clearTimeout(timeout);
          safeEnqueue(send({ type: "error", message: err.message }));
          safeClose();
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
  app.post("/secrets", async (c) => {
    const { projectDir } = c.get("project");
    let body = {};
    try {
      body = await c.req.json();
    } catch {
    }
    if (body.text) {
      const findings = scanText(body.text);
      return c.json({ findings, scannedFiles: 0 });
    }
    const SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".turbo", "out"]);
    const MAX_FILE_SIZE = 512 * 1024;
    const TEXT_EXTS = /* @__PURE__ */ new Set([
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      ".env",
      ".env.local",
      ".env.production",
      ".env.staging",
      ".json",
      ".yaml",
      ".yml",
      ".toml",
      ".sh",
      ".bash",
      ".zsh",
      ".fish",
      ".py",
      ".rb",
      ".go",
      ".rs",
      ".java",
      ".cs",
      ".php",
      ".tf",
      ".hcl",
      ".Dockerfile",
      ".dockerignore",
      ".conf",
      ".config",
      ".ini",
      ".properties"
    ]);
    const filesToScan = body.files ?? [];
    if (filesToScan.length === 0) {
      const walk = (dir) => {
        let entries = [];
        try {
          entries = readdirSync2(dir);
        } catch {
          return;
        }
        for (const entry of entries) {
          if (SKIP_DIRS.has(entry)) continue;
          const full = join5(dir, entry);
          try {
            const stat3 = statSync3(full);
            if (stat3.isDirectory()) {
              walk(full);
            } else if (stat3.isFile() && stat3.size < MAX_FILE_SIZE) {
              const ext = extname(entry).toLowerCase();
              if (TEXT_EXTS.has(ext) || entry.startsWith(".env")) {
                filesToScan.push(full);
              }
            }
          } catch {
          }
        }
      };
      walk(projectDir);
    }
    const allFindings = [];
    for (const filePath of filesToScan) {
      let content = "";
      try {
        content = readFileSync3(filePath, "utf-8");
      } catch {
        continue;
      }
      const ext = extname(filePath);
      const findings = scanText(content, { fileExt: ext });
      for (const f of findings) {
        allFindings.push({ file: filePath.replace(projectDir + "/", ""), ...f });
      }
    }
    const ORDER = { critical: 0, high: 1, medium: 2 };
    allFindings.sort((a, b) => (ORDER[a.severity] ?? 3) - (ORDER[b.severity] ?? 3));
    return c.json({ findings: allFindings, scannedFiles: filesToScan.length });
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
function tasksRoutes() {
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
    const { projectDir } = c.get("project");
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
import { z } from "zod";
import { randomUUID as randomUUID3 } from "crypto";
import { spawn as spawn6 } from "child_process";
import { existsSync as existsSync16, readFileSync as readFileSync11 } from "fs";
import { join as join17, basename as basename2 } from "path";

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
import { existsSync as existsSync6, readFileSync as readFileSync5, writeFileSync as writeFileSync4, mkdirSync as mkdirSync5 } from "fs";
import { join as join7 } from "path";
import { execFileSync } from "child_process";

// server/lib/credential-store.ts
var ENC_PREFIX = "enc:";
var _encrypt = null;
var _decrypt = null;
function encryptValue(plaintext) {
  if (!plaintext || !_encrypt) return plaintext;
  try {
    return ENC_PREFIX + _encrypt(plaintext);
  } catch {
    return plaintext;
  }
}
function decryptValue(value) {
  if (!value || !value.startsWith(ENC_PREFIX) || !_decrypt) return value;
  try {
    return _decrypt(value.slice(ENC_PREFIX.length));
  } catch {
    return value;
  }
}

// server/lib/providers.ts
var CLI_TOOLS = [
  { id: "claude", name: "Claude Code", bin: "claude", versionFlag: "--version" },
  { id: "codex", name: "OpenAI Codex", bin: "codex", versionFlag: "--version" },
  { id: "gemini", name: "Google Gemini CLI", bin: "gemini", versionFlag: "--version" },
  { id: "aider", name: "Aider", bin: "aider", versionFlag: "--version" },
  { id: "copilot", name: "GitHub Copilot", bin: "github-copilot-cli", versionFlag: "--version" },
  { id: "amp", name: "Amp", bin: "amp", versionFlag: "--version" },
  { id: "goose", name: "Goose", bin: "goose", versionFlag: "--version" },
  { id: "kimi", name: "Kimi CLI", bin: "kimi", versionFlag: "--version" }
];
var EXTRA_BIN_DIRS = [
  "/usr/local/bin",
  "/opt/homebrew/bin",
  "/Applications/Conductor.app/Contents/Resources/bin"
];
function tryExecFile(bin, args) {
  try {
    return execFileSync(bin, args, { stdio: "pipe", timeout: 2e3 }).toString().trim();
  } catch {
    return null;
  }
}
function resolveBinPath(bin, projectDir) {
  const whichResult = tryExecFile("which", [bin]);
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
    const versionRaw = tryExecFile(binPath, [tool.versionFlag]);
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
  model: "claude-sonnet-4-6",
  providers: [
    { id: "claude", name: "Claude", enabled: true },
    { id: "openai", name: "OpenAI", enabled: false },
    { id: "gemini", name: "Gemini", enabled: false },
    { id: "mistral", name: "Mistral", enabled: false },
    { id: "grok", name: "Grok", enabled: false },
    { id: "ollama", name: "Ollama", baseUrl: "http://localhost:11434", enabled: false },
    { id: "codex", name: "Codex (OpenAI)", enabled: false },
    { id: "kimi", name: "Kimi (Moonshot)", enabled: false }
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
        ...(parsed.providers ?? []).map((p) => ({
          ...p,
          apiKey: p.apiKey ? decryptValue(p.apiKey) : p.apiKey
        })),
        ...DEFAULT_STORE.providers.filter((p) => !providerIds.has(p.id))
      ]
    };
    return merged;
  } catch {
    return structuredClone(DEFAULT_STORE);
  }
}
function saveProviders(dataDir, store) {
  if (!existsSync6(dataDir)) mkdirSync5(dataDir, { recursive: true });
  const filePath = join7(dataDir, "providers.json");
  const encrypted = {
    ...store,
    providers: store.providers.map((p) => ({
      ...p,
      apiKey: p.apiKey ? encryptValue(p.apiKey) : p.apiKey
    }))
  };
  writeFileSync4(filePath, JSON.stringify(encrypted, null, 2), { encoding: "utf-8", mode: 384 });
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
      case "kimi":
        return await streamOpenAICompat(opts, "https://api.moonshot.cn/v1/chat/completions");
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
var CLAUDE_THINKING_BUDGET = {
  low: 1024,
  medium: 8192,
  high: 32768
};
async function streamClaude(opts) {
  if (!opts.apiKey) throw new Error("Claude provider requires an API key");
  const userMessages = opts.messages.filter((m) => m.role !== "system");
  const budgetTokens = opts.reasoningEffort ? CLAUDE_THINKING_BUDGET[opts.reasoningEffort] : void 0;
  const body = {
    model: opts.model,
    max_tokens: budgetTokens ? Math.max(16e3, budgetTokens * 4) : 8192,
    stream: true,
    messages: userMessages
  };
  if (budgetTokens) {
    body.thinking = { type: "enabled", budget_tokens: budgetTokens };
  }
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
  if (!opts.apiKey) throw new Error("OpenAI provider requires an API key");
  const messages = opts.systemPrompt ? [{ role: "system", content: opts.systemPrompt }, ...opts.messages] : opts.messages;
  const reqBody = { model: opts.model, stream: true, messages };
  if (opts.reasoningEffort) reqBody.reasoning_effort = opts.reasoningEffort;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${opts.apiKey}`
    },
    body: JSON.stringify(reqBody)
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": opts.apiKey
    },
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
  try {
    const parsed = new URL(base);
    const host = parsed.hostname.toLowerCase();
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1" && host !== "[::1]") {
      throw new Error(`Ollama baseUrl must be localhost, got: ${host}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("must be localhost")) throw e;
    throw new Error(`Invalid Ollama baseUrl: ${base}`);
  }
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
import { existsSync as existsSync8, mkdirSync as mkdirSync6, readFileSync as readFileSync6, writeFileSync as writeFileSync5 } from "fs";
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
    mkdirSync6(dir, { recursive: true });
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
import { existsSync as existsSync9, unlinkSync as unlinkSync2, statSync as statSync4 } from "fs";
import { join as join10 } from "path";
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
    const lockPath = join10(projectDir, ".git", "index.lock");
    if (existsSync9(lockPath)) {
      try {
        const age = Date.now() - statSync4(lockPath).mtimeMs;
        if (age > 3e4) unlinkSync2(lockPath);
      } catch {
      }
    }
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
async function cleanupOldCheckpoints(projectDir, maxAgeDays = 7) {
  const opts = { cwd: projectDir };
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1e3;
  let deleted = 0;
  try {
    const { stdout } = await execFile(
      "git",
      ["for-each-ref", "--format=%(refname) %(creatordate:unix)", "refs/studio-checkpoints/"],
      opts
    );
    if (!stdout.trim()) return 0;
    for (const line of stdout.trim().split("\n")) {
      const parts = line.split(" ");
      if (parts.length < 2) continue;
      const refName = parts[0];
      const commitEpochSec = Number(parts[1]);
      if (isNaN(commitEpochSec)) continue;
      const commitMs = commitEpochSec * 1e3;
      if (commitMs < cutoff) {
        try {
          await execFile("git", ["update-ref", "-d", refName], opts);
          deleted++;
        } catch {
        }
      }
    }
  } catch {
  }
  return deleted;
}

// server/lib/snapshot.ts
import { execFile as execFileCb2 } from "child_process";
import { promisify as promisify2 } from "util";
import {
  existsSync as existsSync10,
  mkdirSync as mkdirSync7,
  readFileSync as readFileSync7,
  writeFileSync as writeFileSync6,
  cpSync
} from "fs";
import { join as join11, dirname as dirname2 } from "path";
var execFile2 = promisify2(execFileCb2);
function shadowDir(projectDir) {
  return join11(projectDir, ".hashmark", "snapshots");
}
function indexPath(projectDir) {
  return join11(shadowDir(projectDir), "index.json");
}
function readIndex(projectDir) {
  const p = indexPath(projectDir);
  if (!existsSync10(p)) return [];
  try {
    return JSON.parse(readFileSync7(p, "utf-8"));
  } catch {
    return [];
  }
}
function writeIndex(projectDir, snapshots) {
  writeFileSync6(indexPath(projectDir), JSON.stringify(snapshots, null, 2));
}
function initSnapshots(projectDir) {
  const dir = shadowDir(projectDir);
  if (!existsSync10(dir)) mkdirSync7(dir, { recursive: true });
  if (!existsSync10(join11(dir, ".git"))) {
    execFileCb2("git", ["init"], { cwd: dir }, () => {
    });
    execFileCb2("git", ["config", "user.email", "studio@hashmark.local"], { cwd: dir }, () => {
    });
    execFileCb2("git", ["config", "user.name", "hashmark-studio"], { cwd: dir }, () => {
    });
  }
}
async function syncToShadow(projectDir) {
  const shadow = shadowDir(projectDir);
  const SKIP = /* @__PURE__ */ new Set([".hashmark", "node_modules", ".git", "dist", ".next"]);
  const entries = (await import("fs")).readdirSync(projectDir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const src = join11(projectDir, entry.name);
    const dest = join11(shadow, entry.name);
    try {
      cpSync(src, dest, { recursive: true, force: true });
    } catch {
    }
  }
}
async function takeSnapshot(projectDir, sessionId, messageIndex) {
  initSnapshots(projectDir);
  const shadow = shadowDir(projectDir);
  try {
    await execFile2("git", ["config", "user.email", "studio@hashmark.local"], { cwd: shadow });
    await execFile2("git", ["config", "user.name", "hashmark-studio"], { cwd: shadow });
  } catch {
  }
  await syncToShadow(projectDir);
  await execFile2("git", ["add", "-A"], { cwd: shadow });
  const { stdout: statusOut } = await execFile2("git", ["status", "--porcelain"], { cwd: shadow });
  const filesChanged = statusOut.split("\n").filter(Boolean).map((line) => line.slice(3).trim());
  const msg = `snapshot-${sessionId.slice(0, 8)}-${messageIndex}`;
  let hash = "";
  try {
    await execFile2("git", ["commit", "-m", msg, "--allow-empty"], { cwd: shadow });
    const { stdout: hashOut } = await execFile2("git", ["rev-parse", "HEAD"], { cwd: shadow });
    hash = hashOut.trim();
  } catch (err) {
    try {
      const { stdout: hashOut } = await execFile2("git", ["rev-parse", "HEAD"], { cwd: shadow });
      hash = hashOut.trim();
    } catch {
      hash = `no-git-${Date.now()}`;
    }
  }
  const snapshot = {
    hash,
    sessionId,
    messageIndex,
    timestamp: Date.now(),
    filesChanged
  };
  const index = readIndex(projectDir);
  index.push(snapshot);
  writeIndex(projectDir, index);
  return snapshot;
}

// server/lib/env.ts
import { existsSync as existsSync11, readFileSync as readFileSync8 } from "fs";
import { join as join12 } from "path";
function loadProjectEnvVars(projectDir) {
  const vars = {};
  for (const fname of [".env", ".env.local"]) {
    const filePath = join12(projectDir, fname);
    if (!existsSync11(filePath)) continue;
    try {
      const raw = readFileSync8(filePath, "utf-8");
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
import { writeFileSync as writeFileSync7, mkdirSync as mkdirSync8, existsSync as existsSync12, readFileSync as readFileSync9 } from "fs";
import { join as join13 } from "path";
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
  const configDir = join13(tmpdir(), "hashmark-studio-mcp");
  mkdirSync8(configDir, { recursive: true, mode: 448 });
  const scriptPath = join13(configDir, `bridge-${port}.js`);
  writeFileSync7(scriptPath, bridgeScript, { encoding: "utf-8", mode: 384 });
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
  const configPath = join13(configDir, `mcp-config-${hash}.json`);
  if (!existsSync12(configPath)) {
    writeFileSync7(configPath, content, "utf-8");
  }
  return configPath;
}
function collectUserMcpServers(projectDir) {
  const merged = {};
  const candidates = [
    join13(homedir(), ".claude", "claude_desktop_config.json"),
    join13(projectDir, ".mcp.json")
  ];
  for (const filePath of candidates) {
    if (!existsSync12(filePath)) continue;
    try {
      const raw = readFileSync9(filePath, "utf-8");
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

// server/lib/agent-events.ts
var AgentEventBus = class {
  listeners = /* @__PURE__ */ new Set();
  on(fn) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  /** Broadcast to live listeners only (ephemeral) */
  emit(event) {
    for (const fn of this.listeners) {
      try {
        fn(event);
      } catch {
      }
    }
  }
  /** Persist to SQLite + broadcast to live listeners (durable) */
  record(event, db) {
    try {
      db.prepare(
        "INSERT INTO agent_activity (agent_id, session_id, event_type, data, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(event.agentId, event.sessionId, event.type, JSON.stringify(event.data), event.timestamp);
    } catch (err) {
      console.error("[agent-events] failed to persist event:", err);
    }
    this.emit(event);
  }
  /** Replay events from DB since a timestamp */
  replay(db, since) {
    try {
      const rows = db.prepare(
        "SELECT agent_id, session_id, event_type, data, created_at FROM agent_activity WHERE created_at > ? ORDER BY created_at ASC"
      ).all(since);
      return rows.map((r) => ({
        type: r.event_type,
        agentId: r.agent_id,
        sessionId: r.session_id,
        timestamp: r.created_at,
        data: JSON.parse(r.data)
      }));
    } catch (err) {
      console.error("[agent-events] replay failed:", err);
      return [];
    }
  }
  /** Build a digest of activity since a timestamp */
  digest(db, since) {
    const events = this.replay(db, since);
    const completed = events.filter((e) => e.type === "agent:done").length;
    const failed = events.filter((e) => e.type === "agent:error").length;
    const files = /* @__PURE__ */ new Set();
    let tokens = 0;
    const summary = [];
    for (const e of events) {
      if (e.data.filePath) files.add(e.data.filePath);
      if (e.data.tokens) tokens += e.data.tokens;
      if (e.type === "agent:start" || e.type === "agent:done" || e.type === "agent:error") {
        summary.push({ agentId: e.agentId, name: e.data.name || "agent", type: e.type, timestamp: e.timestamp });
      }
    }
    return { completed, failed, filesChanged: Array.from(files), totalTokens: tokens, since, events: summary };
  }
  /** Delete events older than maxAge ms (default 7 days) */
  cleanup(db, maxAge = 7 * 24 * 60 * 60 * 1e3) {
    try {
      db.prepare("DELETE FROM agent_activity WHERE created_at < ?").run(Date.now() - maxAge);
    } catch (err) {
      console.error("[agent-events] cleanup failed:", err);
    }
  }
  get listenerCount() {
    return this.listeners.size;
  }
};
var agentEvents = new AgentEventBus();

// server/lib/doom-loop.ts
function createDoomLoopDetector(threshold = 3) {
  const window = [];
  const MAX_WINDOW = 10;
  return {
    record(tool) {
      window.push({ tool, timestamp: Date.now() });
      if (window.length > MAX_WINDOW) window.shift();
    },
    check() {
      if (window.length < threshold) return { looping: false };
      const last = window[window.length - 1].tool;
      let count = 0;
      for (let i = window.length - 1; i >= 0; i--) {
        if (window[i].tool === last) count++;
        else break;
      }
      if (count >= threshold) {
        return { looping: true, tool: last, count };
      }
      return { looping: false };
    },
    reset() {
      window.length = 0;
    }
  };
}

// server/routes/session-utils.ts
import { existsSync as existsSync14, readFileSync as readFileSync10 } from "fs";
import { join as join15, extname as extname2 } from "path";

// server/lib/agent-binary.ts
import { existsSync as existsSync13 } from "fs";
import { join as join14 } from "path";
function resolveAgentBinary(name) {
  const resourcesPath = process.resourcesPath;
  if (resourcesPath) {
    const bundled = join14(resourcesPath, "bin", name);
    if (existsSync13(bundled)) return bundled;
  }
  return name;
}

// server/routes/session-utils.ts
var studioPort = 3200;
var studioToken = "";
function setStudioPort(port) {
  studioPort = port;
}
function setStudioToken(token) {
  studioToken = token;
}
function getStudioPort() {
  return studioPort;
}
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
    const fullPath = join15(projectDir, relPath);
    if (!fullPath.startsWith(projectDir + "/") && fullPath !== projectDir) continue;
    if (!existsSync14(fullPath)) continue;
    try {
      const raw = readFileSync10(fullPath);
      if (raw.length > MAX_FILE_BYTES) {
        blocks.push(`

**@${relPath}** (file too large to inline, ${raw.length} bytes)`);
        continue;
      }
      const content = raw.toString("utf-8");
      const ext = extname2(relPath).slice(1) || "text";
      blocks.push(`

**@${relPath}**
\`\`\`${ext}
${content}
\`\`\``);
    } catch (err) {
      console.error(`[sessions] failed to read mentioned file ${relPath}:`, err);
    }
  }
  return blocks.length > 0 ? message + blocks.join("") : message;
}
function extractAndStoreFindings(dataDir, sessionId, output) {
  const patterns = [
    { key: "security", re: /(?:vulnerabilit|XSS|injection|CSRF|auth bypass|exposed secret)/i },
    { key: "breaking_change", re: /(?:breaking change|BREAKING|backward.?compat)/i },
    { key: "deprecation", re: /(?:deprecated|will be removed|no longer supported)/i },
    { key: "performance", re: /(?:performance issue|slow query|memory leak|O\(n\^2\))/i },
    { key: "pattern", re: /(?:pattern|convention|best practice|standard approach)/i }
  ];
  try {
    const db = getDb(dataDir);
    const now = Date.now();
    const lines = output.split("\n");
    for (const { key, re } of patterns) {
      const matchingLines = lines.filter((l) => re.test(l));
      if (matchingLines.length === 0) continue;
      const summary = matchingLines.slice(0, 3).map((l) => l.trim().slice(0, 200)).join("; ");
      const contextKey = `finding:${key}:${sessionId.slice(0, 8)}`;
      db.prepare(`
        INSERT INTO shared_context (id, workspace_id, key, value, scope, created_at, updated_at)
        VALUES (?, '', ?, ?, 'agent', ?, ?)
        ON CONFLICT(key, workspace_id) DO UPDATE SET value = ?, updated_at = ?
      `).run(contextKey, contextKey, summary, now, now, summary, now);
    }
  } catch (err) {
    console.error("[sessions] failed to extract/store findings:", err);
  }
}
function findBin(name, projectDir) {
  const candidates = [
    resolveAgentBinary(name),
    join15(projectDir, "node_modules", ".bin", name),
    `/Applications/Conductor.app/Contents/Resources/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
    name
  ];
  return candidates.find((p) => {
    try {
      return existsSync14(p);
    } catch {
      return false;
    }
  }) ?? name;
}
function findClaudeBin(projectDir) {
  return findBin("claude", projectDir);
}
function resolveProvider(model) {
  if (model.startsWith("o3") || model.startsWith("o4") || model.startsWith("gpt-") || model === "codex") return "codex";
  if (model.startsWith("gemini")) return "gemini";
  if (model.startsWith("moonshot-") || model === "kimi") return "kimi";
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

// server/lib/worktree.ts
import { execFile as execFileCb3 } from "child_process";
import { promisify as promisify3 } from "util";
import { existsSync as existsSync15, mkdirSync as mkdirSync9 } from "fs";
import { join as join16 } from "path";
import { homedir as homedir2 } from "os";
var execFile3 = promisify3(execFileCb3);
var WORKTREE_BASE = join16(homedir2(), ".hashmark", "worktrees");
function sanitizeBranch(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "session";
}
async function createWorktree(projectDir, sessionName) {
  mkdirSync9(WORKTREE_BASE, { recursive: true });
  const slug = sanitizeBranch(sessionName);
  const timestamp = Date.now();
  const branch = `studio/session/${slug}-${timestamp}`;
  const worktreePath = join16(WORKTREE_BASE, `${slug}_${timestamp}`);
  const opts = { cwd: projectDir };
  const { stdout: headSha } = await execFile3("git", ["rev-parse", "HEAD"], opts);
  const baseCommitSHA = headSha.trim();
  await execFile3("git", [
    "worktree",
    "add",
    "-b",
    branch,
    worktreePath,
    baseCommitSHA
  ], opts);
  return { worktreePath, branch, baseCommitSHA };
}
async function worktreeDiff(worktreePath, baseCommitSHA) {
  const opts = { cwd: worktreePath };
  await execFile3("git", ["add", "-N", "."], opts);
  const { stdout } = await execFile3("git", [
    "--no-pager",
    "diff",
    "--numstat",
    baseCommitSHA
  ], opts);
  const files = stdout.trim().split("\n").filter(Boolean).map((line) => {
    const [addStr, rmStr, file] = line.split("	");
    return {
      file: file ?? "",
      added: parseInt(addStr) || 0,
      removed: parseInt(rmStr) || 0
    };
  });
  return {
    files,
    totalAdded: files.reduce((s, f) => s + f.added, 0),
    totalRemoved: files.reduce((s, f) => s + f.removed, 0)
  };
}
async function pauseWorktree(projectDir, worktreePath, branch) {
  if (!existsSync15(worktreePath)) return;
  const opts = { cwd: worktreePath };
  try {
    await execFile3("git", ["add", "-A"], opts);
    await execFile3("git", ["commit", "-m", `studio: paused session on ${branch}`, "--allow-empty"], opts);
  } catch {
  }
  await execFile3("git", ["worktree", "remove", "-f", worktreePath], { cwd: projectDir });
}
async function resumeWorktree(projectDir, branch) {
  const slug = sanitizeBranch(branch.replace(/^studio\/session\//, ""));
  const worktreePath = join16(WORKTREE_BASE, `${slug}_${Date.now()}`);
  await execFile3("git", ["worktree", "add", worktreePath, branch], { cwd: projectDir });
  return worktreePath;
}
async function removeWorktree(projectDir, worktreePath, branch) {
  const opts = { cwd: projectDir };
  if (existsSync15(worktreePath)) {
    try {
      await execFile3("git", ["worktree", "remove", "-f", worktreePath], opts);
    } catch {
    }
  }
  try {
    await execFile3("git", ["worktree", "prune"], opts);
  } catch {
  }
  try {
    await execFile3("git", ["branch", "-D", branch], opts);
  } catch {
  }
}
async function mergeWorktree(projectDir, worktreePath, branch, commitMessage) {
  try {
    await execFile3("git", ["add", "-A"], { cwd: worktreePath });
    await execFile3("git", ["commit", "-m", commitMessage || `studio: agent work on ${branch}`, "--allow-empty"], { cwd: worktreePath });
  } catch {
  }
  try {
    await execFile3("git", ["merge", branch, "--no-ff", "-m", commitMessage || `Merge agent session: ${branch}`], { cwd: projectDir });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Merge failed" };
  }
  await removeWorktree(projectDir, worktreePath, branch);
  return { ok: true };
}
async function listWorktrees(projectDir) {
  try {
    const { stdout } = await execFile3("git", ["worktree", "list", "--porcelain"], { cwd: projectDir });
    const entries = [];
    let current = {};
    for (const line of stdout.split("\n")) {
      if (line.startsWith("worktree ")) current.path = line.slice(9);
      else if (line.startsWith("HEAD ")) current.head = line.slice(5);
      else if (line.startsWith("branch refs/heads/")) current.branch = line.slice(18);
      else if (line === "") {
        if (current.path && current.branch?.startsWith("studio/session/")) {
          entries.push(current);
        }
        current = {};
      }
    }
    return entries;
  } catch {
    return [];
  }
}

// server/lib/agent-branch.ts
import { execFile as execFileCb4 } from "child_process";
import { promisify as promisify4 } from "util";
var execFile4 = promisify4(execFileCb4);
async function createAgentBranch(projectDir, sessionId, sessionName, useWorktree = true) {
  try {
    const opts = { cwd: projectDir };
    const baseBranch = (await execFile4("git", ["branch", "--show-current"], opts)).stdout.trim();
    if (!baseBranch) return null;
    if (useWorktree) {
      const info = await createWorktree(projectDir, sessionName);
      return {
        branch: info.branch,
        baseBranch,
        worktreePath: info.worktreePath,
        baseCommitSHA: info.baseCommitSHA
      };
    }
    const branchName = `agent/${sessionId.slice(0, 8)}`;
    const { stdout: headSha } = await execFile4("git", ["rev-parse", "HEAD"], opts);
    await execFile4("git", ["branch", branchName, headSha.trim()], opts);
    return {
      branch: branchName,
      baseBranch,
      worktreePath: null,
      baseCommitSHA: headSha.trim()
    };
  } catch {
    return null;
  }
}
async function mergeAgentBranch(projectDir, branch, baseBranch, worktreePath, commitMessage) {
  if (worktreePath) {
    return mergeWorktree(projectDir, worktreePath, branch, commitMessage);
  }
  try {
    const opts = { cwd: projectDir };
    await execFile4("git", ["checkout", baseBranch], opts);
    await execFile4("git", ["merge", branch, "--no-ff", "-m", commitMessage || `Merge agent session: ${branch}`], opts);
    await execFile4("git", ["branch", "-d", branch], opts);
    return { ok: true };
  } catch (err) {
    try {
      await execFile4("git", ["merge", "--abort"], { cwd: projectDir });
    } catch {
    }
    return { ok: false, error: err instanceof Error ? err.message : "Merge failed" };
  }
}
async function cleanupAgentBranch(projectDir, branch, baseBranch, worktreePath) {
  if (worktreePath) {
    await removeWorktree(projectDir, worktreePath, branch);
    return;
  }
  try {
    const opts = { cwd: projectDir };
    await execFile4("git", ["checkout", baseBranch], opts);
    await execFile4("git", ["branch", "-D", branch], opts);
  } catch {
  }
}

// server/lib/auto-compact.ts
import { randomUUID as randomUUID2 } from "crypto";
import { spawn as spawn5 } from "child_process";
var DEFAULT_CONFIG = {
  enabled: true,
  reservedTokens: 2e4,
  contextLimit: 2e5
};
function shouldCompact(tokenCount, config = DEFAULT_CONFIG) {
  if (!config.enabled) return false;
  return tokenCount > config.contextLimit - config.reservedTokens;
}
function buildCompactionPrompt(messages) {
  const conversation = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
  return `You are a conversation summarizer. Below is a conversation history that needs to be condensed.

Summarize the conversation, preserving:
1. Key decisions made and their rationale
2. Files created or modified (with paths)
3. Current task status and what remains to do
4. Any important context needed to continue the work
5. Errors encountered and how they were resolved

Be concise but complete. The summary will replace older messages so the agent can continue with full context.

CONVERSATION:
${conversation}

SUMMARY:`;
}
function applyCompaction(db, sessionId, summary) {
  const messages = db.prepare(
    `SELECT * FROM session_messages
     WHERE session_id = ? AND (role = 'assistant' OR sent_at IS NOT NULL)
     AND (is_compaction_summary IS NULL OR is_compaction_summary = 0)
     ORDER BY created_at ASC`
  ).all(sessionId);
  if (messages.length <= 3) return;
  const toCompact = messages.slice(0, messages.length - 3);
  if (toCompact.length === 0) return;
  const summaryTokenEstimate = Math.ceil(summary.length / 4);
  const now = Date.now();
  const insertSummary = db.prepare(`
    INSERT INTO session_messages
      (id, session_id, role, content, input_tokens, output_tokens, created_at, sent_at, is_compaction_summary)
    VALUES (?, ?, 'assistant', ?, ?, 0, ?, ?, 1)
  `);
  const deleteMsg = db.prepare("DELETE FROM session_messages WHERE id = ?");
  db.transaction(() => {
    const earliestKept = messages[messages.length - 3].created_at;
    insertSummary.run(
      randomUUID2(),
      sessionId,
      summary,
      summaryTokenEstimate,
      earliestKept - 1,
      now
    );
    for (const msg of toCompact) {
      deleteMsg.run(msg.id);
    }
  })();
}
function estimateSessionTokens(db, sessionId) {
  const row = db.prepare(
    "SELECT total_input_tokens, total_output_tokens FROM sessions WHERE id = ?"
  ).get(sessionId);
  if (!row) return 0;
  const tracked = row.total_input_tokens + row.total_output_tokens;
  if (tracked > 0) return tracked;
  const messages = db.prepare(
    "SELECT content FROM session_messages WHERE session_id = ?"
  ).all(sessionId);
  return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
}
function generateSummaryViaCli(prompt, claudeBin, projectDir) {
  return new Promise((resolve4) => {
    const proc = spawn5(claudeBin, ["--output-format", "stream-json", "--verbose"], {
      cwd: projectDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: "1" }
    });
    let output = "";
    let jsonBuf = "";
    proc.stdout.on("data", (chunk) => {
      jsonBuf += chunk.toString();
      const lines = jsonBuf.split("\n");
      jsonBuf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.type === "assistant" && evt.message?.content) {
            for (const block of evt.message.content) {
              if (block.type === "text" && block.text) output += block.text;
            }
          }
        } catch {
        }
      }
    });
    proc.on("close", () => {
      resolve4(output.trim() || null);
    });
    proc.on("error", () => resolve4(null));
    proc.stdin.write(prompt + "\n");
    proc.stdin.end();
    setTimeout(() => {
      proc.kill();
      resolve4(output.trim() || null);
    }, 3e4);
  });
}
async function maybeCompact(db, sessionId, getSummary, config = DEFAULT_CONFIG, onCompacted) {
  try {
    const tokenCount = estimateSessionTokens(db, sessionId);
    if (!shouldCompact(tokenCount, config)) return;
    const messages = db.prepare(
      `SELECT * FROM session_messages
       WHERE session_id = ? AND (role = 'assistant' OR sent_at IS NOT NULL)
       AND (is_compaction_summary IS NULL OR is_compaction_summary = 0)
       ORDER BY created_at ASC`
    ).all(sessionId);
    if (messages.length <= 3) return;
    const toSummarize = messages.slice(0, messages.length - 3);
    const prompt = buildCompactionPrompt(toSummarize);
    const summary = await getSummary(prompt);
    if (!summary || summary.trim().length === 0) return;
    applyCompaction(db, sessionId, summary);
    onCompacted?.();
  } catch (err) {
    console.error("[auto-compact] compaction failed:", err);
  }
}

// server/routes/session-process.ts
var activeProcesses = /* @__PURE__ */ new Map();
var activeChildProcesses = /* @__PURE__ */ new Map();
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
function cleanupOrphanSessions(dataDir) {
  try {
    const db = getDb(dataDir);
    const orphans = db.prepare(
      "SELECT id, title FROM sessions WHERE status = 'streaming'"
    ).all();
    if (orphans.length === 0) return;
    const stmt = db.prepare("UPDATE sessions SET status = 'idle' WHERE id = ?");
    for (const s of orphans) {
      stmt.run(s.id);
      console.warn(`[startup] Reset orphan session "${s.title}" (${s.id}) from streaming to idle`);
    }
  } catch {
  }
}

// server/routes/sessions.ts
var buildKnowledgeContext = async (..._args) => null;
var detectFindings = (..._args) => [];
var clearSessionFindings = (..._args) => {
};
function sessionsRoutes() {
  const app = new Hono5();
  app.get("/config", (c) => {
    const { projectDir } = c.get("project");
    const claudeBin = findClaudeBin(projectDir);
    const claudeAvailable = existsSync16(claudeBin) || claudeBin === "claude";
    return c.json({ claudeAvailable, claudeBin });
  });
  app.get("/search", (c) => {
    const { dataDir } = c.get("project");
    const q = (c.req.query("q") ?? "").trim();
    if (q.length < 2) return c.json({ results: [] });
    const db = getDb(dataDir);
    const escaped = q.replace(/[%_]/g, (ch) => `\\${ch}`);
    const like = `%${escaped}%`;
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
  app.get("/cost-summary", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const now = Date.now();
    const todayStart = /* @__PURE__ */ new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = now - 7 * 24 * 60 * 60 * 1e3;
    const today = db.prepare(
      "SELECT COALESCE(SUM(cost_usd), 0) as total FROM sessions WHERE created_at >= ?"
    ).get(todayStart.getTime()).total;
    const week = db.prepare(
      "SELECT COALESCE(SUM(cost_usd), 0) as total FROM sessions WHERE created_at >= ?"
    ).get(weekStart).total;
    const allTime = db.prepare(
      "SELECT COALESCE(SUM(cost_usd), 0) as total, COUNT(*) as sessionCount FROM sessions"
    ).get();
    return c.json({
      today,
      week,
      total: allTime.total,
      sessionCount: allTime.sessionCount
    });
  });
  app.get("/", (c) => {
    const { dataDir } = c.get("project");
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
  const createSessionSchema = z.object({
    title: z.string().max(200).optional(),
    agentId: z.string().nullable().optional(),
    agentName: z.string().max(200).nullable().optional(),
    systemPrompt: z.string().nullable().optional(),
    isolateBranch: z.boolean().optional()
  });
  app.post("/", async (c) => {
    const { dataDir, projectDir } = c.get("project");
    let rawBody;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const parsed = createSessionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0].message }, 400);
    }
    const body = parsed.data;
    const db = getDb(dataDir);
    const id = randomUUID3();
    const now = Date.now();
    const title = body.title ?? "New Session";
    db.prepare(`
      INSERT INTO sessions (id, title, agent_id, agent_name, model, status, total_input_tokens, total_output_tokens, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'claude', 'idle', 0, 0, ?, ?)
    `).run(id, title, body.agentId ?? null, body.agentName ?? null, now, now);
    if (body.isolateBranch !== false) {
      const branchInfo = await createAgentBranch(projectDir, id, title).catch(() => null);
      if (branchInfo) {
        db.prepare(
          "UPDATE sessions SET agent_branch = ?, base_branch = ?, worktree_path = ?, base_commit_sha = ? WHERE id = ?"
        ).run(branchInfo.branch, branchInfo.baseBranch, branchInfo.worktreePath, branchInfo.baseCommitSHA, id);
      }
    }
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
    return c.json({ session }, 201);
  });
  app.get("/:id", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(c.req.param("id"));
    if (!session) return c.json({ error: "Not found" }, 404);
    const messages = db.prepare(
      "SELECT * FROM session_messages WHERE session_id = ? ORDER BY created_at ASC"
    ).all(c.req.param("id"));
    return c.json({ session, messages });
  });
  app.delete("/:id", (c) => {
    const { dataDir } = c.get("project");
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
    const { dataDir } = c.get("project");
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
    const { dataDir } = c.get("project");
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
  const chatBodySchema = z.object({
    message: z.string().min(1, "message is required"),
    systemPrompt: z.string().optional(),
    thinking: z.boolean().optional(),
    planMode: z.boolean().optional(),
    model: z.string().optional(),
    reasoningEffort: z.enum(["auto", "low", "medium", "high"]).optional()
  });
  app.post("/:id/chat", async (c) => {
    const { projectDir, dataDir } = c.get("project");
    const sessionId = c.req.param("id");
    let rawBody;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const parsed = chatBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0].message }, 400);
    }
    const body = parsed.data;
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
    const userMsgId = randomUUID3();
    const inputEstimate = Math.ceil(body.message.length / 4);
    db.prepare(`
      INSERT INTO session_messages (id, session_id, role, content, input_tokens, created_at, sent_at)
      VALUES (?, ?, 'user', ?, ?, ?, NULL)
    `).run(userMsgId, sessionId, body.message, inputEstimate, Date.now());
    if (history.length === 0 && (session.title === "New Session" || session.title === "")) {
      const title = body.message.slice(0, 60).replace(/\n/g, " ");
      db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title, sessionId);
    }
    const claudeMdPath = join17(projectDir, "CLAUDE.md");
    let claudeSections = [];
    try {
      if (existsSync16(claudeMdPath)) {
        const raw = readFileSync11(claudeMdPath, "utf-8");
        claudeSections = parseClaudeMdSections(raw);
      }
    } catch (err) {
      console.error("[sessions] failed to parse CLAUDE.md sections:", err);
    }
    const scanContext = loadScanContext(projectDir);
    const agentIdentity = session.agent_name ? `You are ${session.agent_name}, an AI assistant.` : null;
    const userSystemPrompt = body.systemPrompt ?? null;
    let sharedContextBlock = null;
    try {
      const entries = db.prepare(
        "SELECT key, value FROM shared_context WHERE scope IN ('global', 'agent') ORDER BY updated_at DESC LIMIT 20"
      ).all();
      if (entries.length > 0) {
        const lines = entries.map((e) => `- **${e.key}**: ${e.value}`).join("\n");
        sharedContextBlock = `## Shared Context (from other agents)
${lines}`;
      }
    } catch {
    }
    let knowledgeContext = null;
    try {
      knowledgeContext = await buildKnowledgeContext(dataDir, effectiveMessage, projectDir);
    } catch {
    }
    const effectiveSystemPrompt = [scanContext, agentIdentity, sharedContextBlock, knowledgeContext, userSystemPrompt].filter(Boolean).join("\n\n---\n\n") || void 0;
    const expandedMessage = expandMentions(effectiveMessage, projectDir);
    const fullPrompt = buildConversationPrompt(history, expandedMessage, effectiveSystemPrompt);
    const providersStore = loadProviders(dataDir);
    const activeProvider = providersStore.providers.find((p) => p.id === providersStore.active);
    const useApiStream = providersStore.active !== "claude" || activeProvider?.apiKey && activeProvider.apiKey.length > 0;
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        let controllerClosed = false;
        const send = (data) => {
          try {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}

`));
          } catch {
          }
        };
        const safeClose = () => {
          if (controllerClosed) return;
          controllerClosed = true;
          try {
            controller.close();
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
        const doomLoop = createDoomLoopDetector();
        clearSessionFindings(sessionId);
        agentEvents.record({
          type: "agent:start",
          agentId: sessionId,
          sessionId,
          timestamp: Date.now(),
          data: { name: "chat", status: "running", agentType: "lead", projectName: basename2(projectDir), projectDir }
        }, db);
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
            reasoningEffort: body.reasoningEffort && body.reasoningEffort !== "auto" ? body.reasoningEffort : void 0,
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
              const msgIndex = db.prepare(
                "SELECT COUNT(*) as cnt FROM session_messages WHERE session_id = ? AND role = 'assistant'"
              ).get(sessionId).cnt;
              db.prepare(`
                INSERT INTO session_messages (id, session_id, role, content, input_tokens, output_tokens, created_at, sent_at)
                VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)
              `).run(randomUUID3(), sessionId, savedText, msgInputEstimate, msgOutputEstimate, Date.now(), Date.now());
              db.prepare(`
                UPDATE sessions
                SET status = 'idle',
                    total_input_tokens = total_input_tokens + ?,
                    total_output_tokens = total_output_tokens + ?,
                    updated_at = ?
                WHERE id = ?
              `).run(msgInputEstimate, msgOutputEstimate, Date.now(), sessionId);
              agentEvents.record({
                type: "agent:done",
                agentId: sessionId,
                sessionId,
                timestamp: Date.now(),
                data: { status: "done", tokens: msgOutputEstimate }
              }, db);
              takeSnapshot(projectDir, sessionId, msgIndex).catch(() => null);
              const claudeBinForCompact = findClaudeBin(projectDir);
              maybeCompact(db, sessionId, (prompt) => generateSummaryViaCli(prompt, claudeBinForCompact, projectDir), void 0, () => {
                send({ type: "studio:compaction", sessionId });
              }).catch(() => {
              });
              send({ type: "done", success: true });
              safeClose();
            },
            onError: (err) => {
              activeProcesses.delete(sessionId);
              sessionLastActivity.delete(sessionId);
              agentEvents.record({
                type: "agent:error",
                agentId: sessionId,
                sessionId,
                timestamp: Date.now(),
                data: { status: "failed", error: err.message }
              }, db);
              send({ type: "error", message: err.message });
              db.prepare(`
                INSERT INTO session_messages (id, session_id, role, content, created_at, sent_at)
                VALUES (?, ?, 'assistant', ?, ?, ?)
              `).run(randomUUID3(), sessionId, `Error: ${err.message}`, Date.now(), Date.now());
              db.prepare("UPDATE sessions SET status = 'idle', updated_at = ? WHERE id = ?").run(Date.now(), sessionId);
              safeClose();
            }
          }).catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            send({ type: "error", message: msg });
            safeClose();
          });
        } else {
          const provider = resolveProvider(body.model || "claude-sonnet-4-6");
          const cliBin = findBin(
            provider === "codex" ? "codex" : provider === "gemini" ? "gemini" : provider === "kimi" ? "kimi" : "claude",
            projectDir
          );
          let mcpConfigPath = null;
          try {
            mcpConfigPath = createStudioMcpConfig(projectDir, getStudioPort());
          } catch (err) {
            console.error("[sessions] MCP config generation failed:", err);
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
          } else if (provider === "kimi") {
            cliArgs = ["--print", "--output-format", "stream-json", "--yolo"];
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
            const effortBudget = { low: 1024, medium: 8192, high: 32768 };
            const effort = body.reasoningEffort;
            if (body.thinking || effort && effort !== "auto") {
              cliArgs.push("--thinking");
              if (effort && effort !== "auto" && effortBudget[effort]) {
                cliArgs.push("--budget-tokens", String(effortBudget[effort]));
              }
            }
            if (body.planMode) cliArgs.push("--permission-mode", "plan");
            if (mcpConfigPath) {
              cliArgs.unshift("--mcp-config", mcpConfigPath);
            }
            cliEnv.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = "1";
          }
          const proc = spawn6(cliBin, cliArgs, {
            cwd: projectDir,
            stdio: ["pipe", "pipe", "pipe"],
            env: cliEnv
          });
          activeProcesses.set(sessionId, { kill: () => proc.kill("SIGTERM") });
          activeChildProcesses.set(sessionId, proc);
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
                const raw = JSON.parse(line);
                if (provider === "kimi") {
                  if (raw.role === "assistant") {
                    markMessagesSent();
                    const parts = raw.content ?? [];
                    for (const part of parts) {
                      if (part.type === "text" && part.text) {
                        fullText += part.text;
                        send({ type: "text", text: part.text });
                      }
                      if ((part.type === "think" || part.type === "thinking") && part.text) {
                        send({ type: "thinking", content: part.text, id: randomUUID3() });
                      }
                    }
                    const toolCalls = raw.tool_calls;
                    for (const tc of toolCalls ?? []) {
                      if (tc.function?.name) {
                        let input = {};
                        try {
                          input = JSON.parse(tc.function.arguments ?? "{}");
                        } catch {
                        }
                        send({ type: "tool_use", tool: tc.function.name, input });
                        doomLoop.record(tc.function.name);
                        const loop = doomLoop.check();
                        if (loop.looping) {
                          send({ type: "studio:doom-loop", tool: loop.tool, count: loop.count });
                        }
                      }
                    }
                  }
                  continue;
                }
                const event = raw;
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
                      const findings = detectFindings(sessionId, block.text);
                      for (const f of findings) {
                        agentEvents.record({
                          type: "agent:progress",
                          agentId: sessionId,
                          sessionId,
                          timestamp: Date.now(),
                          data: { currentAction: `[${f.severity.toUpperCase()}] ${f.summary}: ${f.line}` }
                        }, db);
                        send({ type: "finding", finding: f });
                      }
                    }
                    if (block.type === "thinking") {
                      send({ type: "thinking", content: block.text ?? "", id: block.id ?? randomUUID3() });
                    }
                    if (block.type === "tool_use") {
                      send({ type: "tool_use", tool: block.name, input: block.input });
                      doomLoop.record(block.name ?? "unknown");
                      const loop = doomLoop.check();
                      if (loop.looping) {
                        send({ type: "studio:doom-loop", tool: loop.tool, count: loop.count });
                      }
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
                  if (cost > 0) {
                    db.prepare("UPDATE sessions SET cost_usd = cost_usd + ? WHERE id = ?").run(cost, sessionId);
                  }
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
            activeChildProcesses.delete(sessionId);
            sessionLastActivity.delete(sessionId);
            const killed = code === null || code === 130 || code === 143;
            const savedText = fullText.trim() || (killed ? "[interrupted]" : "[no response]");
            const msgInputEstimate = Math.ceil(body.message.length / 4);
            const msgOutputEstimate = Math.ceil(savedText.length / 4);
            const msgIndex = db.prepare(
              "SELECT COUNT(*) as cnt FROM session_messages WHERE session_id = ? AND role = 'assistant'"
            ).get(sessionId).cnt;
            db.prepare(`
              INSERT INTO session_messages (id, session_id, role, content, input_tokens, output_tokens, created_at, sent_at)
              VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)
            `).run(randomUUID3(), sessionId, savedText, msgInputEstimate, msgOutputEstimate, Date.now(), Date.now());
            db.prepare(`
              UPDATE sessions
              SET status = 'idle',
                  total_input_tokens = total_input_tokens + ?,
                  total_output_tokens = total_output_tokens + ?,
                  updated_at = ?
              WHERE id = ?
            `).run(msgInputEstimate, msgOutputEstimate, Date.now(), sessionId);
            if (code === 0) {
              extractAndStoreFindings(dataDir, sessionId, savedText);
            }
            if (!killed) {
              takeSnapshot(projectDir, sessionId, msgIndex).catch(() => null);
            }
            agentEvents.record({
              type: code !== 0 && !killed ? "agent:error" : "agent:done",
              agentId: sessionId,
              sessionId,
              timestamp: Date.now(),
              data: { status: code !== 0 && !killed ? "failed" : "done", tokens: msgOutputEstimate }
            }, db);
            if (code !== 0 && !killed) {
              send({ type: "done", success: false });
            } else if (killed) {
              send({ type: "done", success: false, interrupted: true });
            } else if (code === 0 && provider !== "claude") {
              send({ type: "done", cost: 0, usage: {} });
            }
            if (code === 0 && !killed) {
              maybeCompact(db, sessionId, (prompt) => generateSummaryViaCli(prompt, cliBin, projectDir), void 0, () => {
                send({ type: "studio:compaction", sessionId });
              }).catch(() => {
              });
            }
            safeClose();
          });
          proc.on("error", (err) => {
            activeProcesses.delete(sessionId);
            activeChildProcesses.delete(sessionId);
            sessionLastActivity.delete(sessionId);
            agentEvents.record({
              type: "agent:error",
              agentId: sessionId,
              sessionId,
              timestamp: Date.now(),
              data: { status: "failed", error: err.message }
            }, db);
            send({ type: "error", message: err.message });
            db.prepare(`
              INSERT INTO session_messages (id, session_id, role, content, created_at, sent_at)
              VALUES (?, ?, 'assistant', ?, ?, ?)
            `).run(randomUUID3(), sessionId, `Error: ${err.message}`, Date.now(), Date.now());
            db.prepare("UPDATE sessions SET status = 'idle', updated_at = ? WHERE id = ?").run(Date.now(), sessionId);
            safeClose();
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
  app.get("/:id/branch", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const row = db.prepare(
      "SELECT agent_branch, base_branch, worktree_path, base_commit_sha, status FROM sessions WHERE id = ?"
    ).get(c.req.param("id"));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({
      branch: row.agent_branch,
      baseBranch: row.base_branch,
      worktreePath: row.worktree_path,
      baseCommitSHA: row.base_commit_sha,
      isolated: !!row.agent_branch,
      sessionStatus: row.status
    });
  });
  app.get("/:id/analytics", async (c) => {
    const { dataDir } = c.get("project");
    const id = c.req.param("id");
    const db = getDb(dataDir);
    const session = db.prepare("SELECT id FROM sessions WHERE id = ?").get(id);
    if (!session) return c.json({ error: "Not found" }, 404);
    const analytics = await loadSessionAnalytics(dataDir, id);
    return c.json(analytics);
  });
  app.get("/:id/loop-analysis", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const session = db.prepare("SELECT id FROM sessions WHERE id = ?").get(c.req.param("id"));
    if (!session) return c.json({ error: "Not found" }, 404);
    const messages = db.prepare(
      "SELECT role, content FROM session_messages WHERE session_id = ? ORDER BY created_at ASC"
    ).all(c.req.param("id"));
    return c.json(analyzeSessionLoop(messages));
  });
  app.post("/:id/pause", (c) => {
    const sessionId = c.req.param("id");
    const proc = activeChildProcesses.get(sessionId);
    if (!proc) return c.json({ error: "No active process" }, 404);
    try {
      proc.kill("SIGSTOP");
      const { dataDir } = c.get("project");
      const db = getDb(dataDir);
      agentEvents.record({
        type: "agent:status-change",
        agentId: sessionId,
        sessionId,
        timestamp: Date.now(),
        data: { status: "paused" }
      }, db);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });
  app.post("/:id/resume", (c) => {
    const sessionId = c.req.param("id");
    const proc = activeChildProcesses.get(sessionId);
    if (!proc) return c.json({ error: "No active process" }, 404);
    try {
      proc.kill("SIGCONT");
      const { dataDir } = c.get("project");
      const db = getDb(dataDir);
      agentEvents.record({
        type: "agent:status-change",
        agentId: sessionId,
        sessionId,
        timestamp: Date.now(),
        data: { status: "running" }
      }, db);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });
  app.post("/:id/fork", async (c) => {
    const { dataDir } = c.get("project");
    const sourceId = c.req.param("id");
    const db = getDb(dataDir);
    const source = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sourceId);
    if (!source) return c.json({ error: "Not found" }, 404);
    let body = {};
    try {
      body = await c.req.json();
    } catch {
    }
    const allMessages = db.prepare(
      "SELECT * FROM session_messages WHERE session_id = ? ORDER BY created_at ASC"
    ).all(sourceId);
    const cutoff = body.messageIndex !== void 0 ? Math.max(0, Math.min(body.messageIndex + 1, allMessages.length)) : allMessages.length;
    const messagesToCopy = allMessages.slice(0, cutoff);
    const baseTitle = source.title.replace(/ \(fork #\d+\)$/, "");
    const forkPattern = `${baseTitle} (fork #%`;
    const existing = db.prepare(
      "SELECT COUNT(*) as cnt FROM sessions WHERE title LIKE ? OR title = ?"
    ).get(forkPattern, baseTitle);
    const forkN = existing.cnt;
    const newTitle = `${baseTitle} (fork #${forkN})`;
    const newId = randomUUID3();
    const now = Date.now();
    db.prepare(`
      INSERT INTO sessions (id, title, agent_id, agent_name, model, status, total_input_tokens, total_output_tokens, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'idle', 0, 0, ?, ?)
    `).run(newId, newTitle, source.agent_id, source.agent_name, source.model, now, now);
    const insertMsg = db.prepare(`
      INSERT INTO session_messages (id, session_id, role, content, input_tokens, output_tokens, created_at, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const msg of messagesToCopy) {
      insertMsg.run(randomUUID3(), newId, msg.role, msg.content, msg.input_tokens, msg.output_tokens, msg.created_at, msg.sent_at);
    }
    const newSession = db.prepare("SELECT * FROM sessions WHERE id = ?").get(newId);
    return c.json({ session: newSession }, 201);
  });
  app.get("/:id/tokens", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const sessionId = c.req.param("id");
    const session = db.prepare(`
      SELECT total_input_tokens, total_output_tokens, COALESCE(cost_usd, 0) as cost_usd,
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
      avgMessageTokens,
      costUsd: session.cost_usd
    });
  });
  return app;
}

// server/routes/terminal.ts
import os from "os";
import { mkdtempSync, writeFileSync as writeFileSync8, rmSync } from "fs";
import { join as join18 } from "path";

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
    const tmpDir = mkdtempSync(join18(os.tmpdir(), "studio-zsh-"));
    const zshrc = [
      "# source original rc if it exists",
      'if [[ -f "$STUDIO_ORIG_ZDOTDIR/.zshrc" ]]; then',
      '  source "$STUDIO_ORIG_ZDOTDIR/.zshrc"',
      "fi",
      ZSH_INTEGRATION
    ].join("\n");
    writeFileSync8(join18(tmpDir, ".zshrc"), zshrc, "utf-8");
    return {
      env: {
        ...baseEnv,
        ZDOTDIR: tmpDir,
        STUDIO_ORIG_ZDOTDIR: origZdotdir
      },
      args: [],
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
    const tmpDir = mkdtempSync(join18(os.tmpdir(), "studio-bash-"));
    const bashEnvFile = join18(tmpDir, "studio-init.bash");
    const bashrc = [
      "# source original rc",
      'if [[ -f "$STUDIO_ORIG_BASHRC" ]]; then',
      '  source "$STUDIO_ORIG_BASHRC"',
      "fi",
      BASH_INTEGRATION
    ].join("\n");
    writeFileSync8(bashEnvFile, bashrc, "utf-8");
    return {
      env: {
        ...baseEnv,
        STUDIO_ORIG_BASHRC: origBashrc
      },
      // --init-file required for interactive bash (BASH_ENV only works for non-interactive)
      args: ["--init-file", bashEnvFile],
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
    args: [],
    cleanup: () => {
    }
  };
}
async function spawnPty(projectDir) {
  const shell = process.env.SHELL ?? (os.platform() === "win32" ? "cmd.exe" : "/bin/zsh");
  const { env, cleanup, args } = setupShellIntegration(shell);
  let cwd = projectDir;
  if (!cwd || cwd === "__unset__") {
    cwd = os.homedir();
  }
  const pty = await import("./lib-234R4XPR.js");
  const proc = pty.spawn(shell, args, {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd,
    env
  });
  return { proc, cleanup };
}
var _wsToken = null;
function setTerminalWSToken(token) {
  _wsToken = token;
}
function attachTerminalWS(httpServer, projectDir) {
  void OSC633_PROMPT_START;
  void OSC633_PROMPT_END;
  import("ws").then(({ WebSocketServer }) => {
    const wss = new WebSocketServer({ noServer: true });
    httpServer.on("upgrade", (request, socket, head) => {
      const url = request.url ?? "";
      if (!url.startsWith("/api/terminal/ws")) return;
      if (_wsToken) {
        const parsed = new URL(url, "http://localhost");
        if (parsed.searchParams.get("token") !== _wsToken) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });
    wss.on("connection", async (ws) => {
      let ptyProcess = null;
      let cleaned = false;
      const cleanupOnce = () => {
        if (cleaned) return;
        cleaned = true;
        if (ptyProcess) {
          ptyProcess.cleanup();
          try {
            ptyProcess.proc.kill();
          } catch {
          }
          ptyProcess = null;
        }
      };
      try {
        ptyProcess = await spawnPty(projectDir);
      } catch (err) {
        ws.send(`\r
Failed to start terminal: ${err}\r
`);
        ws.close();
        return;
      }
      const { proc } = ptyProcess;
      proc.onData((data) => {
        try {
          ws.send(data);
        } catch {
        }
      });
      proc.onExit(() => {
        cleanupOnce();
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
        cleanupOnce();
      });
      ws.on("error", () => {
        cleanupOnce();
      });
    });
  });
}

// server/routes/files.ts
import { Hono as Hono6 } from "hono";
import { readdir, stat, readFile, writeFile, mkdir, rename, rm } from "fs/promises";
import { join as join19, relative as relative3, extname as extname3, resolve as resolve2, dirname as dirname3 } from "path";
import { execFile as execFile5 } from "child_process";
import { promisify as promisify5 } from "util";
import { existsSync as existsSync17 } from "fs";
var analyzeImpact = (..._args) => ({ affected: [], risk: "low" });
var execAsync = promisify5(execFile5);
function sanitizeGitError(err, fallback) {
  console.error(`[files] git error: ${err instanceof Error ? err.message : String(err)}`);
  return fallback;
}
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
    const fullPath = join19(dir, name);
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
function filesRoutes() {
  const app = new Hono6();
  app.get("/tree", async (c) => {
    const { projectDir } = c.get("project");
    const tree = await buildTree(projectDir, projectDir);
    return c.json({ tree, root: projectDir });
  });
  app.get("/list", async (c) => {
    const { projectDir } = c.get("project");
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
    const { projectDir } = c.get("project");
    const relPath = c.req.query("path");
    if (!relPath) return c.json({ error: "path required" }, 400);
    const fullPath = safePath(projectDir, relPath);
    if (!fullPath) return c.json({ error: "forbidden" }, 403);
    try {
      const content = await readFile(fullPath, "utf-8");
      return c.json({ content, path: relPath });
    } catch {
      return c.json({ error: "not found" }, 404);
    }
  });
  app.get("/diff", async (c) => {
    const { projectDir } = c.get("project");
    const relPath = c.req.query("path");
    if (!relPath) return c.json({ error: "path required" }, 400);
    const fullPath = safePath(projectDir, relPath);
    if (!fullPath) return c.json({ error: "forbidden" }, 403);
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
    const { projectDir } = c.get("project");
    const body = await c.req.json().catch(() => ({ paths: void 0 }));
    try {
      if (body.paths?.length) {
        for (const p of body.paths) {
          if (!safePath(projectDir, p)) continue;
          await execAsync("git", ["add", "--", p], { cwd: projectDir });
        }
      } else {
        await execAsync("git", ["add", "-A"], { cwd: projectDir });
      }
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: sanitizeGitError(err, "Stage failed") }, 500);
    }
  });
  app.post("/unstage", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json().catch(() => ({ paths: void 0 }));
    try {
      if (body.paths?.length) {
        for (const p of body.paths) {
          if (!safePath(projectDir, p)) continue;
          await execAsync("git", ["restore", "--staged", "--", p], { cwd: projectDir });
        }
      } else {
        await execAsync("git", ["restore", "--staged", "."], { cwd: projectDir });
      }
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: sanitizeGitError(err, "Unstage failed") }, 500);
    }
  });
  app.post("/discard", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json().catch(() => ({ paths: [] }));
    if (!body.paths?.length) return c.json({ error: "paths required" }, 400);
    try {
      for (const p of body.paths) {
        if (!safePath(projectDir, p)) continue;
        try {
          await execAsync("git", ["checkout", "--", p], { cwd: projectDir });
        } catch {
          await execAsync("git", ["clean", "-f", p], { cwd: projectDir });
        }
      }
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: sanitizeGitError(err, "Discard failed") }, 500);
    }
  });
  app.post("/commit", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json();
    if (!body.message?.trim()) return c.json({ error: "message required" }, 400);
    const trailers = [
      body.sessionId ? `Agent-Session: ${body.sessionId}` : null,
      body.model ? `Agent-Model: ${body.model}` : null,
      body.cost != null ? `Agent-Cost: $${body.cost.toFixed(2)}` : null
    ].filter(Boolean).join("\n");
    const fullMessage = trailers ? `${body.message}

${trailers}` : body.message;
    try {
      await execAsync("git", ["commit", "-m", fullMessage], { cwd: projectDir });
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: sanitizeGitError(err, "Commit failed") }, 500);
    }
  });
  app.post("/batch-commit", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json();
    if (!body.commits?.length) return c.json({ error: "commits array required" }, 400);
    const results = [];
    for (const commit of body.commits) {
      if (!commit.message?.trim()) {
        results.push({ message: commit.message, ok: false, error: "empty message" });
        continue;
      }
      const trailers = [
        commit.sessionId ? `Agent-Session: ${commit.sessionId}` : null,
        commit.model ? `Agent-Model: ${commit.model}` : null,
        commit.cost != null ? `Agent-Cost: $${commit.cost.toFixed(2)}` : null
      ].filter(Boolean).join("\n");
      const fullMessage = trailers ? `${commit.message}

${trailers}` : commit.message;
      try {
        if (commit.paths.length > 0) {
          await execAsync("git", ["add", "--", ...commit.paths], { cwd: projectDir });
        } else {
          await execAsync("git", ["add", "-A"], { cwd: projectDir });
        }
        await execAsync("git", ["commit", "-m", fullMessage], { cwd: projectDir });
        results.push({ message: commit.message, ok: true });
      } catch (err) {
        sanitizeGitError(err, "Commit failed");
        results.push({ message: commit.message, ok: false, error: "Commit failed" });
      }
    }
    const allOk = results.every((r) => r.ok);
    return c.json({ ok: allOk, results }, allOk ? 200 : 207);
  });
  app.post("/push", async (c) => {
    const { projectDir } = c.get("project");
    try {
      const { stdout } = await execAsync("git", ["push"], { cwd: projectDir });
      return c.json({ ok: true, output: stdout });
    } catch (err) {
      return c.json({ error: sanitizeGitError(err, "Push failed") }, 500);
    }
  });
  app.post("/pull", async (c) => {
    const { projectDir } = c.get("project");
    try {
      const { stdout } = await execAsync("git", ["pull"], { cwd: projectDir });
      return c.json({ ok: true, output: stdout });
    } catch (err) {
      return c.json({ error: sanitizeGitError(err, "Pull failed") }, 500);
    }
  });
  app.post("/fetch", async (c) => {
    const { projectDir } = c.get("project");
    try {
      const { stdout } = await execAsync("git", ["fetch", "--all"], { cwd: projectDir });
      return c.json({ ok: true, output: stdout });
    } catch (err) {
      return c.json({ error: sanitizeGitError(err, "Fetch failed") }, 500);
    }
  });
  function safePath(projectDir, relPath) {
    if (!relPath || relPath.includes("\0")) return null;
    const full = resolve2(projectDir, relPath);
    if (!full.startsWith(projectDir + "/") && full !== projectDir) return null;
    return full;
  }
  app.post("/create", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json().catch(() => ({}));
    const relPath = body.path;
    if (!relPath || typeof relPath !== "string") return c.json({ error: "path required" }, 400);
    const fullPath = safePath(projectDir, relPath);
    if (!fullPath) return c.json({ error: "forbidden" }, 403);
    const isDir = body.type === "dir";
    try {
      if (isDir) {
        await mkdir(fullPath, { recursive: true });
      } else {
        await mkdir(dirname3(fullPath), { recursive: true });
        await writeFile(fullPath, body.content ?? "", "utf-8");
      }
      return c.json({ ok: true, path: relPath }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
  app.put("/rename", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json().catch(() => ({}));
    if (!body.oldPath || !body.newPath) return c.json({ error: "oldPath and newPath required" }, 400);
    const fullOld = safePath(projectDir, body.oldPath);
    const fullNew = safePath(projectDir, body.newPath);
    if (!fullOld || !fullNew) return c.json({ error: "forbidden" }, 403);
    try {
      await mkdir(dirname3(fullNew), { recursive: true });
      await rename(fullOld, fullNew);
      return c.json({ ok: true, oldPath: body.oldPath, newPath: body.newPath });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
  app.delete("/delete", async (c) => {
    const { projectDir } = c.get("project");
    const relPath = c.req.query("path");
    if (!relPath) return c.json({ error: "path required" }, 400);
    const fullPath = safePath(projectDir, relPath);
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
    const { projectDir } = c.get("project");
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
        const fullPath = join19(dir, name);
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
    const { projectDir } = c.get("project");
    const branch = c.req.query("branch");
    if (!branch) return c.json({ error: "branch query param required" }, 400);
    const base = c.req.query("base") ?? "HEAD";
    if (branch.startsWith("-") || base.startsWith("-")) return c.json({ error: "invalid ref name" }, 400);
    const report = analyzeImpact(projectDir, branch, base);
    return c.json(report);
  });
  app.get("/symbols", async (c) => {
    const { projectDir } = c.get("project");
    const relPath = c.req.query("path");
    if (!relPath) return c.json({ error: "path required" }, 400);
    const fullPath = safePath(projectDir, relPath);
    if (!fullPath) return c.json({ error: "forbidden" }, 403);
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
    const { projectDir } = c.get("project");
    const cachePath = join19(projectDir, ".hashmark", "complexity-cache.json");
    if (!existsSync17(cachePath)) return c.json({ data: null });
    try {
      const raw = await readFile(cachePath, "utf-8");
      return c.json({ data: JSON.parse(raw) });
    } catch {
      return c.json({ data: null });
    }
  });
  app.get("/git/log", async (c) => {
    const { projectDir } = c.get("project");
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
      return c.json({ commits: [], error: sanitizeGitError(err, "Failed to load commits") });
    }
  });
  app.get("/git/commit-diff", async (c) => {
    const { projectDir } = c.get("project");
    const hash = c.req.query("hash");
    const file = c.req.query("file");
    if (!hash || !file) return c.json({ error: "hash and file required" }, 400);
    if (!/^[0-9a-fA-F]{4,40}$/.test(hash)) return c.json({ error: "invalid hash" }, 400);
    if (!safePath(projectDir, file)) return c.json({ error: "forbidden" }, 403);
    try {
      const { stdout } = await execAsync(
        "git",
        ["show", "--format=", hash, "--", file],
        { cwd: projectDir, maxBuffer: 4 * 1024 * 1024 }
      );
      return c.json({ diff: stdout, file, hash });
    } catch (err) {
      return c.json({ diff: "", file, hash, error: sanitizeGitError(err, "Failed to load diff") });
    }
  });
  app.get("/git/branches", async (c) => {
    const { projectDir } = c.get("project");
    try {
      const [branchesOut, currentOut] = await Promise.all([
        execAsync("git", ["branch", "--format=%(refname:short)"], { cwd: projectDir }),
        execAsync("git", ["branch", "--show-current"], { cwd: projectDir })
      ]);
      const branches = branchesOut.stdout.trim().split("\n").filter(Boolean);
      const current = currentOut.stdout.trim();
      return c.json({ branches, current });
    } catch (err) {
      return c.json({ branches: [], current: "", error: sanitizeGitError(err, "Failed to list branches") });
    }
  });
  app.post("/git/branch", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json().catch(() => ({ name: "" }));
    const name = body.name?.trim();
    if (!name) return c.json({ error: "Branch name required" }, 400);
    if (name.startsWith("-")) return c.json({ error: "Invalid branch name" }, 400);
    try {
      await execAsync("git", ["checkout", "-b", "--", name], { cwd: projectDir });
      return c.json({ ok: true, branch: name });
    } catch (err) {
      return c.json({ error: sanitizeGitError(err, "Branch creation failed") }, 500);
    }
  });
  app.post("/git/checkout", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json().catch(() => ({ branch: "" }));
    const branch = body.branch?.trim();
    if (!branch) return c.json({ error: "branch required" }, 400);
    if (branch.startsWith("-")) return c.json({ error: "Invalid branch name" }, 400);
    try {
      await execAsync("git", ["checkout", "--", branch], { cwd: projectDir });
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: sanitizeGitError(err, "Checkout failed") }, 500);
    }
  });
  app.get("/git/gh-available", async (c) => {
    const { projectDir } = c.get("project");
    try {
      await execAsync("which", ["gh"]);
      await execAsync("gh", ["auth", "status"], { cwd: projectDir });
      return c.json({ available: true });
    } catch {
      return c.json({ available: false });
    }
  });
  app.post("/git/create-pr", async (c) => {
    const { projectDir } = c.get("project");
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
      return c.json({ error: sanitizeGitError(err, "PR creation failed") }, 500);
    }
  });
  app.get("/git/outgoing", async (c) => {
    const { projectDir } = c.get("project");
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
    const { projectDir } = c.get("project");
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
      }).filter((f) => !f.file.startsWith("dist/") && !f.file.startsWith("client/dist/"));
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
  app.get("/worktrees", async (c) => {
    const { projectDir } = c.get("project");
    try {
      const trees = await listWorktrees(projectDir);
      return c.json({ worktrees: trees });
    } catch (err) {
      return c.json({ worktrees: [], error: sanitizeGitError(err, "Failed to list worktrees") });
    }
  });
  app.post("/worktrees", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json().catch(() => ({ sessionName: "session" }));
    try {
      const info = await createWorktree(projectDir, body.sessionName);
      return c.json({ ok: true, ...info }, 201);
    } catch (err) {
      return c.json({ ok: false, error: sanitizeGitError(err, "Worktree creation failed") }, 500);
    }
  });
  app.post("/worktrees/diff", async (c) => {
    const body = await c.req.json();
    try {
      const diff = await worktreeDiff(body.worktreePath, body.baseCommitSHA);
      return c.json(diff);
    } catch (err) {
      return c.json({ files: [], totalAdded: 0, totalRemoved: 0, error: sanitizeGitError(err, "Diff failed") });
    }
  });
  app.post("/worktrees/merge", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json();
    try {
      const result = await mergeWorktree(projectDir, body.worktreePath, body.branch, body.message);
      return c.json(result);
    } catch (err) {
      return c.json({ ok: false, error: sanitizeGitError(err, "Merge failed") }, 500);
    }
  });
  app.post("/worktrees/remove", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json();
    try {
      await removeWorktree(projectDir, body.worktreePath, body.branch);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ ok: false, error: sanitizeGitError(err, "Worktree removal failed") }, 500);
    }
  });
  app.post("/worktrees/pause", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json();
    try {
      await pauseWorktree(projectDir, body.worktreePath, body.branch);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ ok: false, error: sanitizeGitError(err, "Pause failed") }, 500);
    }
  });
  app.post("/worktrees/resume", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json();
    try {
      const worktreePath = await resumeWorktree(projectDir, body.branch);
      return c.json({ ok: true, worktreePath });
    } catch (err) {
      return c.json({ ok: false, error: sanitizeGitError(err, "Resume failed") }, 500);
    }
  });
  app.post("/create-env", async (c) => {
    const { projectDir } = c.get("project");
    const envPath = join19(projectDir, ".env.local");
    try {
      const { existsSync: existsSync36 } = await import("fs");
      if (existsSync36(envPath)) {
        return c.json({ path: ".env.local", exists: true });
      }
      const template = [
        "# hashmark studio environment",
        "# Add API keys for AI providers here",
        "",
        "# ANTHROPIC_API_KEY=sk-ant-...",
        "# OPENAI_API_KEY=sk-...",
        "# GOOGLE_AI_API_KEY=...",
        ""
      ].join("\n");
      await writeFile(envPath, template, "utf-8");
      return c.json({ path: ".env.local", created: true }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
  return app;
}

// server/routes/workspace.ts
import { Hono as Hono7 } from "hono";
import { existsSync as existsSync18, readFileSync as readFileSync12, writeFileSync as writeFileSync9, mkdirSync as mkdirSync10 } from "fs";
import { join as join20, resolve as resolve3 } from "path";
import { spawn as spawn7 } from "child_process";
function getConfigPath(projectDir) {
  return join20(projectDir, ".hashmark", "workspace.json");
}
function readConfig(projectDir) {
  try {
    const p = getConfigPath(projectDir);
    if (existsSync18(p)) return JSON.parse(readFileSync12(p, "utf-8"));
  } catch {
  }
  return {};
}
function writeConfig(projectDir, config) {
  const dir = join20(projectDir, ".hashmark");
  mkdirSync10(dir, { recursive: true });
  writeFileSync9(getConfigPath(projectDir), JSON.stringify(config, null, 2));
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
      const proc = spawn7(bin, args, {
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
function workspaceRoutes() {
  const app = new Hono7();
  app.post("/detect", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json().catch(() => ({}));
    const rawPath = body.path?.trim();
    const dir = rawPath ? resolve3(projectDir, rawPath) : projectDir;
    if (rawPath && !dir.startsWith(projectDir + "/") && dir !== projectDir) {
      return c.json({ error: "forbidden" }, 403);
    }
    if (!existsSync18(dir)) return c.json({ error: "path not found" }, 400);
    const name = (() => {
      try {
        const pkgPath = join20(dir, "package.json");
        if (existsSync18(pkgPath)) {
          const pkg = JSON.parse(readFileSync12(pkgPath, "utf-8"));
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
      if (existsSync18(join20(dir, check.file))) {
        framework = check.framework;
        break;
      }
    }
    return c.json({ framework, name });
  });
  app.get("/config", (c) => {
    const { projectDir } = c.get("project");
    return c.json({ config: readConfig(projectDir) });
  });
  app.put("/config", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json();
    const current = readConfig(projectDir);
    const updated = { ...current, ...body };
    writeConfig(projectDir, updated);
    return c.json({ config: updated });
  });
  app.post("/run-setup", (c) => {
    const { projectDir } = c.get("project");
    const config = readConfig(projectDir);
    if (!config.setupCommand) return c.json({ error: "No setup command configured" }, 400);
    return streamCommand("setup", config.setupCommand, projectDir, config.env ?? {});
  });
  app.post("/run", (c) => {
    const { projectDir } = c.get("project");
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
import { execFile as execFileCb5 } from "child_process";
import { promisify as promisify6 } from "util";
import { existsSync as existsSync19, unlinkSync as unlinkSync3, statSync as statSync6 } from "fs";
import { join as join21 } from "path";
var execFile6 = promisify6(execFileCb5);
function slugify2(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "checkpoint";
}
function checkpointRoutes() {
  const app = new Hono8();
  app.get("/", async (c) => {
    const { projectDir } = c.get("project");
    const opts = { cwd: projectDir };
    let output = "";
    try {
      const result = await execFile6(
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
          const { stdout: diffStat } = await execFile6(
            "git",
            ["diff-tree", "--no-commit-id", "-r", "--name-only", hash],
            opts
          );
          filesChanged = diffStat.trim().split("\n").filter(Boolean).length;
        } catch {
        }
        let status = "active";
        try {
          const { stdout: mergeBase } = await execFile6(
            "git",
            ["merge-base", "--is-ancestor", hash, "HEAD"],
            opts
          );
          void mergeBase;
          status = "merged";
        } catch {
          try {
            const { stdout: refDate } = await execFile6(
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
    const { projectDir } = c.get("project");
    const opts = { cwd: projectDir };
    const id = c.req.param("id");
    const refName = `refs/studio-checkpoints/${id}`;
    let hash;
    try {
      const { stdout } = await execFile6("git", ["rev-parse", refName], opts);
      hash = stdout.trim();
    } catch {
      return c.json({ error: "checkpoint not found" }, 404);
    }
    let diff = "";
    try {
      const { stdout } = await execFile6(
        "git",
        ["show", "--format=", hash],
        { ...opts, maxBuffer: 4 * 1024 * 1024 }
      );
      diff = stdout;
    } catch {
    }
    return c.json({ diff });
  });
  app.get("/:id/diff-since", async (c) => {
    const { projectDir } = c.get("project");
    const opts = { cwd: projectDir };
    const id = c.req.param("id");
    const refName = `refs/studio-checkpoints/${id}`;
    let hash;
    try {
      const { stdout } = await execFile6("git", ["rev-parse", refName], opts);
      hash = stdout.trim();
    } catch {
      return c.json({ error: "checkpoint not found" }, 404);
    }
    let treeHash;
    try {
      const { stdout } = await execFile6("git", ["rev-parse", `${hash}^{tree}`], opts);
      treeHash = stdout.trim();
    } catch {
      return c.json({ files: [], diff: "" });
    }
    let dirtyBaseline = /* @__PURE__ */ new Set();
    try {
      const { stdout: msg } = await execFile6("git", ["log", "-1", "--format=%B", hash], opts);
      const m = msg.match(/DIRTY_BASELINE:(\[.*?\])/s);
      if (m) {
        const parsed = JSON.parse(m[1]);
        dirtyBaseline = new Set(parsed);
      }
    } catch {
    }
    let files = [];
    let diff = "";
    try {
      const { stdout: diffNames } = await execFile6(
        "git",
        ["diff-index", "--name-only", treeHash],
        opts
      );
      files = diffNames.trim().split("\n").filter((f) => f && !dirtyBaseline.has(f));
      if (files.length > 0) {
        const { stdout: fullDiff } = await execFile6(
          "git",
          ["diff", treeHash],
          { ...opts, maxBuffer: 4 * 1024 * 1024 }
        );
        diff = fullDiff;
      }
    } catch {
    }
    return c.json({ files, diff });
  });
  app.post("/", async (c) => {
    const { projectDir } = c.get("project");
    const opts = { cwd: projectDir };
    const body = await c.req.json().catch(() => ({}));
    const timestamp = Date.now();
    const label = body.label || `checkpoint-${timestamp}`;
    const slug = `${timestamp}-${slugify2(label)}`;
    const refName = `refs/studio-checkpoints/${slug}`;
    const lockPath = join21(projectDir, ".git", "index.lock");
    if (existsSync19(lockPath)) {
      try {
        const age = Date.now() - statSync6(lockPath).mtimeMs;
        if (age > 3e4) unlinkSync3(lockPath);
      } catch {
      }
    }
    try {
      await execFile6("git", ["rev-parse", "--git-dir"], opts);
    } catch {
      return c.json({ error: "Not a git repository", id: null }, 200);
    }
    try {
      const { stdout: treeHash } = await execFile6("git", ["write-tree"], opts);
      let dirtyBaseline = [];
      try {
        const { stdout: statusOut } = await execFile6("git", ["status", "--porcelain"], opts);
        dirtyBaseline = statusOut.trim().split("\n").filter(Boolean).map((l) => l.slice(3).trim());
      } catch {
      }
      let parentArgs = [];
      try {
        const { stdout: headHash } = await execFile6("git", ["rev-parse", "HEAD"], opts);
        if (headHash.trim()) parentArgs = ["-p", headHash.trim()];
      } catch {
      }
      const commitMsg = `studio-checkpoint: ${label}

DIRTY_BASELINE:${JSON.stringify(dirtyBaseline)}`;
      const { stdout: commitHash } = await execFile6(
        "git",
        ["commit-tree", treeHash.trim(), ...parentArgs, "-m", commitMsg],
        opts
      );
      await execFile6("git", ["update-ref", refName, commitHash.trim()], opts);
      return c.json({ ok: true, id: slug, ref: refName, label, timestamp });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Checkpoint failed: ${msg}`, id: null }, 200);
    }
  });
  app.post("/:id/restore", async (c) => {
    const { projectDir } = c.get("project");
    const opts = { cwd: projectDir };
    const id = c.req.param("id");
    const refName = `refs/studio-checkpoints/${id}`;
    let hash;
    try {
      const { stdout } = await execFile6("git", ["rev-parse", refName], opts);
      hash = stdout.trim();
    } catch {
      return c.json({ error: "checkpoint not found" }, 404);
    }
    try {
      const { stdout: objType } = await execFile6("git", ["cat-file", "-t", hash], opts);
      if (objType.trim() !== "commit") {
        return c.json({ error: "ref is not a commit" }, 400);
      }
      const branchName = `restore/${id}`;
      await execFile6("git", ["branch", "-f", branchName, hash], opts);
      return c.json({ ok: true, branch: branchName });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Restore failed: ${msg}` }, 500);
    }
  });
  app.delete("/:refSlug", async (c) => {
    const { projectDir } = c.get("project");
    const opts = { cwd: projectDir };
    const refSlug = c.req.param("refSlug");
    if (refSlug === "prune") {
      return c.json({ error: "use DELETE /prune" }, 400);
    }
    const refName = `refs/studio-checkpoints/${refSlug}`;
    await execFile6("git", ["update-ref", "-d", refName], opts);
    return c.json({ ok: true });
  });
  app.delete("/prune", async (c) => {
    const { projectDir } = c.get("project");
    const opts = { cwd: projectDir };
    let output = "";
    try {
      const result = await execFile6(
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
        await execFile6("git", ["merge-base", "--is-ancestor", hash, "HEAD"], opts);
        shouldPrune = true;
      } catch {
        shouldPrune = true;
      }
      if (shouldPrune) {
        try {
          await execFile6("git", ["update-ref", "-d", refName], opts);
          pruned++;
        } catch {
        }
      }
    }
    return c.json({ ok: true, pruned });
  });
  app.post("/restore", async (c) => {
    const { projectDir } = c.get("project");
    const opts = { cwd: projectDir };
    const body = await c.req.json();
    const ref = body.ref;
    if (!ref || !/^[0-9a-f]{4,40}$|^refs\/studio-checkpoints\/[a-z0-9-]+$/i.test(ref)) {
      return c.json({ error: "invalid ref format" }, 400);
    }
    const { stdout: objType } = await execFile6("git", ["cat-file", "-t", ref], opts);
    if (objType.trim() !== "commit") {
      return c.json({ error: "ref is not a commit" }, 400);
    }
    await execFile6("git", ["checkout", ref, "--", "."], opts);
    return c.json({ ok: true });
  });
  return app;
}

// server/routes/mcp.ts
import { Hono as Hono9 } from "hono";
import { existsSync as existsSync20, readFileSync as readFileSync13, writeFileSync as writeFileSync10 } from "fs";
import { readFile as readFile2 } from "fs/promises";
import { join as join22 } from "path";
import { createHash as createHash2 } from "crypto";
import { tmpdir as tmpdir2, homedir as homedir3 } from "os";
import { spawn as spawn8, execFile as execFileCb6 } from "child_process";
import { promisify as promisify7 } from "util";
var execFile7 = promisify7(execFileCb6);
function readMcpFile(filePath) {
  if (!existsSync20(filePath)) return null;
  try {
    const raw = readFileSync13(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
function mcpRoutes() {
  const app = new Hono9();
  app.get("/config", (c) => {
    const { projectDir } = c.get("project");
    const projectMcpPath = join22(projectDir, ".mcp.json");
    const globalMcpPath = join22(homedir3(), ".claude", "claude_desktop_config.json");
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
        merged[name] = { command: entry.command, source: "global", disabled: !!entry.disabled };
      }
    }
    if (projectConfig?.mcpServers) {
      for (const [name, entry] of Object.entries(projectConfig.mcpServers)) {
        merged[name] = { command: entry.command, source: "project", disabled: !!entry.disabled };
      }
    }
    return c.json({ sources, servers: merged });
  });
  app.post("/servers", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json();
    if (!body.name?.trim() || !body.command?.trim()) {
      return c.json({ error: "name and command required" }, 400);
    }
    const mcpPath = join22(projectDir, ".mcp.json");
    const config = readMcpFile(mcpPath) ?? { mcpServers: {} };
    if (!config.mcpServers) config.mcpServers = {};
    config.mcpServers[body.name.trim()] = {
      command: body.command.trim(),
      ...body.args?.length ? { args: body.args } : {}
    };
    writeFileSync10(mcpPath, JSON.stringify(config, null, 2), "utf-8");
    return c.json({ ok: true }, 201);
  });
  app.delete("/servers/:name", (c) => {
    const { projectDir } = c.get("project");
    const name = decodeURIComponent(c.req.param("name"));
    const mcpPath = join22(projectDir, ".mcp.json");
    const config = readMcpFile(mcpPath);
    if (!config?.mcpServers?.[name]) {
      return c.json({ error: "Server not found" }, 404);
    }
    delete config.mcpServers[name];
    writeFileSync10(mcpPath, JSON.stringify(config, null, 2), "utf-8");
    return c.json({ ok: true });
  });
  app.patch("/servers/:name", (c) => {
    const { projectDir } = c.get("project");
    const name = decodeURIComponent(c.req.param("name"));
    const mcpPath = join22(projectDir, ".mcp.json");
    const config = readMcpFile(mcpPath);
    if (!config?.mcpServers?.[name]) {
      return c.json({ error: "Server not found in project config" }, 404);
    }
    const entry = config.mcpServers[name];
    entry.disabled = !entry.disabled;
    if (!entry.disabled) delete entry.disabled;
    writeFileSync10(mcpPath, JSON.stringify(config, null, 2), "utf-8");
    return c.json({ ok: true, disabled: !!entry.disabled });
  });
  app.post("/test", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json();
    const { serverName } = body;
    if (!serverName) {
      return c.json({ ok: false, error: "serverName required" }, 400);
    }
    const projectMcpPath = join22(projectDir, ".mcp.json");
    const globalMcpPath = join22(homedir3(), ".claude", "claude_desktop_config.json");
    const projectConfig = readMcpFile(projectMcpPath);
    const globalConfig = readMcpFile(globalMcpPath);
    const serverEntry = projectConfig?.mcpServers?.[serverName] ?? globalConfig?.mcpServers?.[serverName];
    if (!serverEntry) {
      return c.json({ ok: false, error: `Server "${serverName}" not found in any config` }, 404);
    }
    const testConfig = { mcpServers: { [serverName]: serverEntry } };
    const content = JSON.stringify(testConfig);
    const hash = createHash2("md5").update(content).digest("hex");
    const tmpPath = join22(tmpdir2(), `studio-mcp-test-${hash}.json`);
    writeFileSync10(tmpPath, content, "utf-8");
    return new Promise((resolve4) => {
      const timeout = setTimeout(() => {
        proc.kill("SIGTERM");
        resolve4(c.json({ ok: false, error: "Timeout after 10s" }));
      }, 1e4);
      const proc = spawn8(
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
    const { projectDir } = c.get("project");
    const file = c.req.query("file");
    const stat3 = c.req.query("stat") === "true";
    const opts = { cwd: projectDir, maxBuffer: 4 * 1024 * 1024 };
    try {
      let mergeBase = "";
      try {
        const { stdout: mb } = await execFile7(
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
      const { stdout: tracked } = await execFile7("git", args, opts);
      let untracked = "";
      if (!file && !stat3) {
        try {
          const { stdout: untrackedFiles } = await execFile7(
            "git",
            ["ls-files", "--others", "--exclude-standard"],
            opts
          );
          const newFiles = untrackedFiles.trim().split("\n").filter(Boolean);
          for (const f of newFiles.slice(0, 20)) {
            try {
              const { stdout: content } = await execFile7(
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
    const { projectDir } = c.get("project");
    const maxLines = parseInt(c.req.query("maxLines") ?? "100", 10);
    const logPath = join22(projectDir, ".hashmark", "terminal-output.log");
    try {
      if (existsSync20(logPath)) {
        const raw = readFileSync13(logPath, "utf-8");
        const lines = raw.split("\n");
        const tail = lines.slice(-maxLines).join("\n");
        return c.json({ output: tail, source: "log", lines: lines.length });
      }
    } catch {
    }
    try {
      const { stdout } = await execFile7(
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
    const { projectDir } = c.get("project");
    const relPath = c.req.query("path");
    if (!relPath) return c.json({ error: "path query parameter is required" }, 400);
    const fullPath = join22(projectDir, relPath);
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
import { spawn as spawn9, execFile as execFileCb7 } from "child_process";
import { existsSync as existsSync21, readFileSync as readFileSync14, readdirSync as readdirSync3 } from "fs";
import { join as join24, relative as relative4, basename as basename3 } from "path";
import { randomUUID as randomUUID4 } from "crypto";
import { promisify as promisify8 } from "util";
import { tmpdir as tmpdir3 } from "os";

// server/lib/action-log.ts
import { appendFileSync, mkdirSync as mkdirSync11 } from "fs";
import { join as join23 } from "path";
function logAgentAction(dataDir, event) {
  try {
    mkdirSync11(dataDir, { recursive: true });
    const line = JSON.stringify(event) + "\n";
    appendFileSync(join23(dataDir, "agent-actions.jsonl"), line);
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
var execFile8 = promisify8(execFileCb7);
var MAX_WORKERS = 5;
function loadAgents(projectDir) {
  const agentsDir = join24(projectDir, ".claude", "agents");
  if (!existsSync21(agentsDir)) return [];
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
        walk(join24(dir, entry.name));
      } else if (entry.name.endsWith(".md") && entry.name !== "INDEX.md") {
        const fullPath = join24(dir, entry.name);
        const relPath = relative4(agentsDir, fullPath);
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
var activeRuns = /* @__PURE__ */ new Set();
function findClaudeBin2(projectDir) {
  const candidates = [
    join24(projectDir, "node_modules", ".bin", "claude"),
    "/Applications/Conductor.app/Contents/Resources/bin/claude",
    "/usr/local/bin/claude",
    "claude"
  ];
  return candidates.find((p) => {
    try {
      return existsSync21(p);
    } catch {
      return false;
    }
  }) ?? "claude";
}
function companyRoutes() {
  const app = new Hono10();
  app.get("/status", (c) => {
    return c.json({ active: activeRuns.size > 0, runCount: activeRuns.size, runIds: [...activeRuns] });
  });
  app.get("/agents", (c) => {
    const { projectDir } = c.get("project");
    const agents = loadAgents(projectDir).map(({ id, name, description }) => ({ id, name, description }));
    return c.json({ agents });
  });
  app.post("/plan", async (c) => {
    const { projectDir } = c.get("project");
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
      const { stdout } = await execFile8(claudeBin, ["--print", prompt], {
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
    const { projectDir, dataDir } = c.get("project");
    const body = await c.req.json();
    const claudeBin = findClaudeBin2(projectDir);
    const runId = randomUUID4().slice(0, 8);
    const plan = body.plan.slice(0, MAX_WORKERS);
    const agents = loadAgents(projectDir);
    const agentMap = new Map(agents.map((a) => [a.id, a]));
    activeRuns.add(runId);
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
        send({ type: "run_start", runId, workerCount: plan.length });
        const worktreeDirs = /* @__PURE__ */ new Map();
        async function runWorker(subtask) {
          const branchName = `studio-swarm-${runId}-${subtask.id}`;
          const worktreeDir = join24(tmpdir3(), branchName);
          worktreeDirs.set(subtask.id, worktreeDir);
          send({ type: "worker_start", id: subtask.id, title: subtask.title, agentId: subtask.agentId });
          agentEvents.record({
            type: "agent:start",
            agentId: String(subtask.id),
            sessionId: runId,
            timestamp: Date.now(),
            data: { name: subtask.title, status: "running", agentType: "worker", parentId: runId, projectName: basename3(projectDir), projectDir }
          }, getDb(dataDir));
          try {
            const db = getDb(dataDir);
            db.prepare(
              "UPDATE swarm_workers SET status='running', started_at=? WHERE run_id=? AND worker_id=?"
            ).run(Date.now(), runId, subtask.id);
          } catch {
          }
          try {
            await execFile8("git", ["worktree", "add", worktreeDir, "-b", branchName], {
              cwd: projectDir
            });
            logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: subtask.agentId, workerId: subtask.id, action: "worktree_create", target: branchName, outcome: "success" });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: subtask.agentId, workerId: subtask.id, action: "worktree_create", target: branchName, outcome: "failure", detail: msg });
            send({ type: "worker_error", id: subtask.id, error: `Worktree failed: ${msg}` });
            agentEvents.record({ type: "agent:error", agentId: String(subtask.id), sessionId: runId, timestamp: Date.now(), data: { status: "failed", error: msg } }, getDb(dataDir));
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
            const proc = spawn9(claudeBin, ["--print", workerPrompt], {
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
                agentEvents.record({ type: "agent:error", agentId: String(subtask.id), sessionId: runId, timestamp: Date.now(), data: { status: "failed", error: `Exit code ${code}` } }, getDb(dataDir));
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
                const { stdout: statusOut } = await execFile8("git", ["status", "--porcelain"], { cwd: worktreeDir });
                hasChanges = statusOut.trim().length > 0;
                if (hasChanges) {
                  await execFile8("git", ["add", "-A"], { cwd: worktreeDir });
                  await execFile8("git", ["commit", "-m", `feat(swarm/${runId}): agent ${subtask.id} - ${subtask.title}`], { cwd: worktreeDir });
                  logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: subtask.agentId, workerId: subtask.id, action: "git_commit", target: branchName, outcome: "success" });
                }
              } catch {
              }
              const actionEvents = parseActionsFromOutput(fullOutput, runId, subtask.agentId, subtask.id);
              for (const ev of actionEvents) logAgentAction(dataDir, ev);
              let testResult = { passed: true, output: "", skipped: false };
              try {
                const pkgPath = join24(worktreeDir, "package.json");
                let hasTestScript = false;
                try {
                  const pkg = JSON.parse(readFileSync14(pkgPath, "utf-8"));
                  hasTestScript = !!(pkg?.scripts?.test && !pkg.scripts.test.includes("no test specified"));
                } catch {
                }
                if (hasTestScript) {
                  send({ type: "worker_verifying", id: subtask.id });
                  const { stdout: testOut, stderr: testErr } = await execFile8(
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
              agentEvents.record({ type: "agent:done", agentId: String(subtask.id), sessionId: runId, timestamp: Date.now(), data: { status: "done" } }, getDb(dataDir));
              resolve4({ id: subtask.id, output: fullOutput, hasChanges, testPassed: testResult.passed, testSkipped: testResult.skipped });
            });
            proc.on("error", (err) => {
              send({ type: "worker_error", id: subtask.id, error: err.message });
              agentEvents.record({ type: "agent:error", agentId: String(subtask.id), sessionId: runId, timestamp: Date.now(), data: { status: "failed", error: err.message } }, getDb(dataDir));
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
              await execFile8("git", [
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
                await execFile8("git", ["merge", "--abort"], { cwd: projectDir });
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
                await execFile8("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir });
                logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: subtask.agentId, workerId: subtask.id, action: "worktree_remove", target: branchName, outcome: "success" });
              }
            } catch {
            }
            try {
              await execFile8("git", ["branch", "-D", branchName], { cwd: projectDir });
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
          send({ type: "complete", runId });
          activeRuns.delete(runId);
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
          activeRuns.delete(runId);
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
    const { dataDir } = c.get("project");
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
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const run = db.prepare("SELECT * FROM swarm_runs WHERE id=?").get(c.req.param("id"));
    if (!run) return c.json({ error: "Not found" }, 404);
    const workers = db.prepare(
      "SELECT * FROM swarm_workers WHERE run_id=? ORDER BY worker_id"
    ).all(c.req.param("id"));
    return c.json({ run, workers });
  });
  app.delete("/runs/:id", (c) => {
    const { dataDir } = c.get("project");
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
import { spawn as spawn10, execFile as execFileCb8 } from "child_process";
import { existsSync as existsSync22, readFileSync as readFileSync15, readdirSync as readdirSync4 } from "fs";
import { join as join25, relative as relative5 } from "path";
import { randomUUID as randomUUID5 } from "crypto";
import { promisify as promisify9 } from "util";
import { tmpdir as tmpdir4 } from "os";
var execFile9 = promisify9(execFileCb8);
function loadAgents2(projectDir) {
  const agentsDir = join25(projectDir, ".claude", "agents");
  if (!existsSync22(agentsDir)) return [];
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
        walk(join25(dir, entry.name));
      } else if (entry.name.endsWith(".md") && entry.name !== "INDEX.md") {
        const fullPath = join25(dir, entry.name);
        const relPath = relative5(agentsDir, fullPath);
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
function findClaudeBin3(projectDir) {
  const candidates = [
    join25(projectDir, "node_modules", ".bin", "claude"),
    "/Applications/Conductor.app/Contents/Resources/bin/claude",
    "/usr/local/bin/claude",
    "claude"
  ];
  return candidates.find((p) => {
    try {
      return existsSync22(p);
    } catch {
      return false;
    }
  }) ?? "claude";
}
var activeRun = false;
function runRoutes() {
  const app = new Hono11();
  app.get("/status", (c) => c.json({ active: activeRun }));
  app.delete("/", (c) => {
    activeRun = false;
    return c.json({ ok: true, message: "Run cancelled" });
  });
  app.get("/runs", (c) => {
    const { dataDir } = c.get("project");
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
    const { projectDir, dataDir } = c.get("project");
    const id = c.req.param("id");
    try {
      const db = getDb(dataDir);
      const run = db.prepare("SELECT worktree_branch, task FROM runs WHERE id = ?").get(id);
      if (!run) return c.json({ error: "Run not found" }, 404);
      const branch = run.worktree_branch;
      if (!branch) return c.json({ diff: "", branch: null });
      let diff = "";
      try {
        const res = await execFile9("git", ["diff", `main...${branch}`], {
          cwd: projectDir,
          maxBuffer: 4 * 1024 * 1024
        });
        diff = res.stdout;
      } catch {
        try {
          const logRes = await execFile9(
            "git",
            ["log", "--all", "--oneline", `--grep=run/${id}`],
            { cwd: projectDir }
          );
          const hash = logRes.stdout.trim().split(/\s/)[0];
          if (hash) {
            const showRes = await execFile9("git", ["show", hash], {
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
    const { projectDir, dataDir } = c.get("project");
    if (activeRun) {
      return c.json({ error: "A run is already in progress" }, 409);
    }
    const body = await c.req.json();
    if (!body.task?.trim()) {
      return c.json({ error: "task is required" }, 400);
    }
    const mode = body.mode === "plan" ? "plan" : "build";
    const claudeBin = findClaudeBin3(projectDir);
    const runId = randomUUID5().slice(0, 8);
    const agents = loadAgents2(projectDir);
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
        const branchName = `studio-run-${runId}`;
        const worktreeDir = join25(tmpdir4(), branchName);
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
            await execFile9("git", ["worktree", "add", worktreeDir, "-b", branchName], {
              cwd: projectDir
            });
            logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "worktree_create", target: branchName, outcome: "success" });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "worktree_create", target: branchName, outcome: "failure", detail: msg });
            send({ type: "error", error: `Worktree failed: ${msg}` });
            activeRun = false;
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
            const proc = spawn10(claudeBin, ["--print", prompt], {
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
            activeRun = false;
            controller.close();
            try {
              await execFile9("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir });
            } catch {
            }
            try {
              await execFile9("git", ["branch", "-D", branchName], { cwd: projectDir });
            } catch {
            }
            return;
          }
          const actionEvents = parseActionsFromOutput(fullOutput, runId, body.agentId ?? "general");
          for (const ev of actionEvents) logAgentAction(dataDir, ev);
          try {
            const { stdout: statusOut } = await execFile9("git", ["status", "--porcelain"], { cwd: worktreeDir });
            hasChanges = statusOut.trim().length > 0;
            if (hasChanges) {
              await execFile9("git", ["add", "-A"], { cwd: worktreeDir });
              await execFile9("git", ["commit", "-m", `feat(run/${runId}): ${body.task.slice(0, 72)}`], { cwd: worktreeDir });
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
              await execFile9("git", [
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
                await execFile9("git", ["merge", "--abort"], { cwd: projectDir });
              } catch {
              }
              logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "git_merge", target: branchName, outcome: "failure", detail: "merge conflict" });
              send({ type: "merge_conflict", branch: branchName });
            }
          }
          try {
            await execFile9("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir });
            logAgentAction(dataDir, { timestamp: Date.now(), runId, agentId: body.agentId ?? "general", action: "worktree_remove", target: branchName, outcome: "success" });
          } catch {
          }
          if (hasChanges) {
            try {
              await execFile9("git", ["branch", "-d", branchName], { cwd: projectDir });
            } catch {
            }
          }
          try {
            const db = getDb(dataDir);
            db.prepare("UPDATE runs SET status = ?, ended_at = ? WHERE id = ?").run("complete", Date.now(), runId);
          } catch {
          }
          send({ type: "complete", hasChanges, mode: "build" });
          activeRun = false;
          controller.close();
        }
        run().catch((err) => {
          try {
            getDb(dataDir).prepare("UPDATE runs SET status = ?, ended_at = ? WHERE id = ?").run("error", Date.now(), runId);
          } catch {
          }
          send({ type: "error", error: err instanceof Error ? err.message : String(err) });
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
  return app;
}

// server/routes/swarm.ts
import { Hono as Hono12 } from "hono";
import { spawn as spawn11, execFile as execFileCb9 } from "child_process";
import { existsSync as existsSync23, readFileSync as readFileSync16, readdirSync as readdirSync5 } from "fs";
import { join as join26, relative as relative6, basename as basename4 } from "path";
import { randomUUID as randomUUID6 } from "crypto";
import { promisify as promisify10 } from "util";
import { tmpdir as tmpdir5 } from "os";
var detectConflicts = (..._args) => ({ conflicts: [], summary: "No conflict detection available" });
var execFile10 = promisify10(execFileCb9);
var swarms = /* @__PURE__ */ new Map();
function loadAgents3(projectDir) {
  const agentsDir = join26(projectDir, ".claude", "agents");
  if (!existsSync23(agentsDir)) return [];
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
        walk(join26(dir, entry.name));
      } else if (entry.name.endsWith(".md") && entry.name !== "INDEX.md") {
        const fullPath = join26(dir, entry.name);
        const relPath = relative6(agentsDir, fullPath);
        try {
          const content = readFileSync16(fullPath, "utf-8");
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
    join26(projectDir, "node_modules", ".bin", "claude"),
    "/Applications/Conductor.app/Contents/Resources/bin/claude",
    "/usr/local/bin/claude",
    "claude"
  ];
  return candidates.find((p) => {
    try {
      return existsSync23(p);
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
  const worktreeDir = join26(tmpdir5(), branch);
  agent.status = "running";
  emit(swarm, agentIndex, { type: "status", data: "running" });
  agentEvents.record({
    type: "agent:start",
    agentId: agent.id,
    sessionId: swarm.swarmId,
    timestamp: Date.now(),
    data: { name: agent.task, status: "running", agentType: "worker", projectName: basename4(projectDir), projectDir }
  }, getDb(dataDir));
  try {
    getDb(dataDir).prepare("UPDATE swarm_agents SET status = 'running' WHERE id = ?").run(agent.id);
  } catch {
  }
  try {
    await execFile10("git", ["worktree", "add", worktreeDir, "-b", branch], { cwd: projectDir });
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
    agentEvents.record({
      type: "agent:error",
      agentId: agent.id,
      sessionId: swarm.swarmId,
      timestamp: Date.now(),
      data: { status: "failed", error: msg }
    }, getDb(dataDir));
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
    const proc = spawn11(claudeBin, ["--print", prompt], {
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
      await execFile10("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir });
    } catch {
    }
    try {
      await execFile10("git", ["branch", "-D", branch], { cwd: projectDir });
    } catch {
    }
    return;
  }
  if (swarm.mode === "plan") {
    agent.status = "done";
    emit(swarm, agentIndex, { type: "status", data: "done" });
    emit(swarm, agentIndex, { type: "complete", data: "plan" });
    agentEvents.record({ type: "agent:done", agentId: agent.id, sessionId: swarm.swarmId, timestamp: Date.now(), data: { status: "done" } }, getDb(dataDir));
    try {
      getDb(dataDir).prepare("UPDATE swarm_agents SET status = 'done', ended_at = ? WHERE id = ?").run(Date.now(), agent.id);
    } catch {
    }
    try {
      await execFile10("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir });
    } catch {
    }
    try {
      await execFile10("git", ["branch", "-D", branch], { cwd: projectDir });
    } catch {
    }
    checkSwarmComplete(swarm, dataDir);
    return;
  }
  let hasChanges = false;
  try {
    const { stdout } = await execFile10("git", ["status", "--porcelain"], { cwd: worktreeDir });
    hasChanges = stdout.trim().length > 0;
    if (hasChanges) {
      await execFile10("git", ["add", "-A"], { cwd: worktreeDir });
      await execFile10(
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
      await execFile10(
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
        await execFile10("git", ["merge", "--abort"], { cwd: projectDir });
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
    await execFile10("git", ["worktree", "remove", worktreeDir, "--force"], { cwd: projectDir });
  } catch {
  }
  if (hasChanges) {
    try {
      await execFile10("git", ["branch", "-d", branch], { cwd: projectDir });
    } catch {
    }
  }
  agent.status = "done";
  emit(swarm, agentIndex, { type: "status", data: "done" });
  emit(swarm, agentIndex, { type: "complete", data: swarm.mode });
  agentEvents.record({ type: "agent:done", agentId: agent.id, sessionId: swarm.swarmId, timestamp: Date.now(), data: { status: "done" } }, getDb(dataDir));
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
function swarmRoutes() {
  const app = new Hono12();
  app.post("/", async (c) => {
    const { projectDir, dataDir } = c.get("project");
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
    const swarmId = randomUUID6().slice(0, 8);
    ensureSwarmTables(dataDir);
    const agents = body.tasks.map((t) => ({
      id: randomUUID6().slice(0, 8),
      task: t.task.trim(),
      agentId: t.agentId,
      status: "pending",
      output: "",
      branch: `swarm-${swarmId}-${randomUUID6().slice(0, 6)}`
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
    const { projectDir } = c.get("project");
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
    const { dataDir } = c.get("project");
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
import { join as join27 } from "path";
import { execFile as execFile11 } from "child_process";
import { promisify as promisify11 } from "util";
var execAsync2 = promisify11(execFile11);
var CONTEXT_FILES = ["CLAUDE.md", "AGENTS.md", "GEMINI.md"];
function extractBaselineFileCount(content) {
  const m = content.match(/\*\*Codebase\*\*[^0-9]*(\d+)\s*files/i);
  return m ? parseInt(m[1], 10) : null;
}
function extractCommitHash(content) {
  const m = content.match(/<!--\s*commit:\s*([a-f0-9]{7,40})\s*-->/i);
  return m ? m[1] : null;
}
function driftRoutes() {
  const app = new Hono13();
  app.get("/check", async (c) => {
    const { projectDir } = c.get("project");
    let fileName = null;
    let content = null;
    for (const name of CONTEXT_FILES) {
      try {
        content = await readFile3(join27(projectDir, name), "utf-8");
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
        const s = await stat2(join27(projectDir, fileName));
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

// server/lib/oauth-anthropic.ts
import { execFileSync as execFileSync2 } from "child_process";
import { existsSync as existsSync24 } from "fs";
import { join as join28 } from "path";
var CLAUDE_MODELS = [
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", contextWindow: 2e5 },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", contextWindow: 2e5 },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", contextWindow: 2e5 }
];
var EXTRA_DIRS = ["/usr/local/bin", "/opt/homebrew/bin"];
function tryExec(bin, args, timeoutMs = 3e3) {
  try {
    return execFileSync2(bin, args, { stdio: "pipe", timeout: timeoutMs }).toString().trim();
  } catch {
    return null;
  }
}
function resolveClaude() {
  const fromWhich = tryExec("which", ["claude"]);
  if (fromWhich) return fromWhich;
  for (const dir of EXTRA_DIRS) {
    const p = join28(dir, "claude");
    if (existsSync24(p)) return p;
  }
  return null;
}
function extractVersion2(raw) {
  const match = raw.match(/(\d+\.\d+[\w.+-]*)/);
  return match ? match[1] : raw.slice(0, 40);
}
async function detectClaudeCLI() {
  const binPath = resolveClaude();
  if (!binPath) return { installed: false, authenticated: false };
  const versionRaw = tryExec(binPath, ["--version"]);
  const version = versionRaw ? extractVersion2(versionRaw) : void 0;
  const authOutput = tryExec(binPath, ["auth", "status"]);
  if (!authOutput) {
    return { installed: true, authenticated: false, version, path: binPath };
  }
  const lower = authOutput.toLowerCase();
  const authenticated = !lower.includes("not logged") && !lower.includes("unauthenticated");
  let plan = "unknown";
  if (lower.includes("max")) plan = "max";
  else if (lower.includes("pro")) plan = "pro";
  return { installed: true, authenticated, version, path: binPath, plan };
}
function getClaudeModels() {
  return CLAUDE_MODELS;
}

// server/routes/providers.ts
var _detectCache = null;
var _detectCacheTs = 0;
function cachedDetectCLIs(projectDir) {
  const now = Date.now();
  if (_detectCache && now - _detectCacheTs < 6e4) return _detectCache;
  _detectCache = detectCLIs(projectDir);
  _detectCacheTs = now;
  return _detectCache;
}
var STATIC_MODELS = {
  claude: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  openai: ["gpt-5.4", "gpt-4o", "gpt-4o-mini"],
  gemini: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  mistral: ["mistral-large-latest", "mistral-small-latest", "codestral-latest"],
  grok: ["grok-3", "grok-3-mini"],
  codex: ["gpt-5.4", "gpt-5.3-codex-spark", "gpt-5.3-codex", "gpt-5.2-codex", "o3", "o4-mini"],
  aider: ["gpt-4o", "claude-sonnet-4-6", "deepseek-chat"],
  amp: ["amp-default"],
  goose: ["goose-default"],
  copilot: ["copilot-default"]
};
function providersRoutes() {
  const app = new Hono14();
  app.get("/", (c) => {
    const { projectDir, dataDir } = c.get("project");
    const store = loadProviders(dataDir);
    const cliResults = cachedDetectCLIs(projectDir);
    const cliInstalled = new Set(cliResults.filter((r) => r.installed).map((r) => r.id));
    const masked = store.providers.map(({ apiKey, ...rest }) => ({
      ...rest,
      hasKey: Boolean(apiKey && apiKey.length > 0),
      cliDetected: cliInstalled.has(rest.id)
    }));
    return c.json({ active: store.active, model: store.model, providers: masked });
  });
  app.get("/detect", (c) => {
    const { projectDir } = c.get("project");
    const providers = cachedDetectCLIs(projectDir);
    return c.json({ providers });
  });
  app.put("/active", async (c) => {
    const { dataDir } = c.get("project");
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
    const { dataDir } = c.get("project");
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
    const { dataDir } = c.get("project");
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
  app.get("/anthropic/status", async (c) => {
    const status = await detectClaudeCLI();
    return c.json({
      ...status,
      models: status.authenticated ? getClaudeModels() : []
    });
  });
  app.post("/anthropic/detect", async (c) => {
    const status = await detectClaudeCLI();
    return c.json({
      ...status,
      models: status.authenticated ? getClaudeModels() : []
    });
  });
  app.put("/:id/baseUrl", async (c) => {
    const { dataDir } = c.get("project");
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
import { randomUUID as randomUUID7 } from "crypto";
import { existsSync as existsSync25, readFileSync as readFileSync17 } from "fs";
import { join as join29 } from "path";
function governanceRoutes() {
  const app = new Hono15();
  app.get("/policies", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const policies = db.prepare("SELECT * FROM governance_policies ORDER BY created_at DESC").all();
    return c.json({ policies: policies.map((p) => {
      const r = p;
      return { ...r, rules: JSON.parse(r.rules) };
    }) });
  });
  app.post("/policies", async (c) => {
    const { dataDir } = c.get("project");
    const body = await c.req.json();
    const db = getDb(dataDir);
    const id = randomUUID7().slice(0, 8);
    db.prepare(
      "INSERT INTO governance_policies (id, name, description, scope, rules, enabled, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)"
    ).run(id, body.name, body.description ?? "", body.scope ?? "all", JSON.stringify(body.rules ?? []), Date.now());
    return c.json({ id }, 201);
  });
  app.put("/policies/:id", async (c) => {
    const { dataDir } = c.get("project");
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
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    db.prepare("DELETE FROM governance_policies WHERE id=?").run(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.get("/actions", (c) => {
    const { dataDir } = c.get("project");
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
    const { dataDir } = c.get("project");
    const body = await c.req.json();
    const db = getDb(dataDir);
    db.prepare(
      "INSERT INTO agent_actions (session_id, agent_id, action_type, target, outcome, policy_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(body.sessionId ?? null, body.agentId ?? null, body.actionType, body.target ?? null, body.outcome ?? "allowed", body.policyId ?? null, Date.now());
    return c.json({ ok: true }, 201);
  });
  app.get("/summary", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const total = db.prepare("SELECT COUNT(*) as c FROM agent_actions").get()?.c ?? 0;
    const blocked = db.prepare("SELECT COUNT(*) as c FROM agent_actions WHERE outcome='blocked'").get()?.c ?? 0;
    const flagged = db.prepare("SELECT COUNT(*) as c FROM agent_actions WHERE outcome='flagged'").get()?.c ?? 0;
    const byType = db.prepare("SELECT action_type, COUNT(*) as count FROM agent_actions GROUP BY action_type").all();
    const recentBlocked = db.prepare("SELECT * FROM agent_actions WHERE outcome IN ('blocked','flagged') ORDER BY created_at DESC LIMIT 5").all();
    return c.json({ total, blocked, flagged, byType, recentBlocked });
  });
  app.get("/action-log", (c) => {
    const { dataDir } = c.get("project");
    const logPath = join29(dataDir, "agent-actions.jsonl");
    if (!existsSync25(logPath)) return c.json({ events: [], total: 0 });
    const limit = parseInt(c.req.query("limit") ?? "100");
    const offset = parseInt(c.req.query("offset") ?? "0");
    const filterRunId = c.req.query("runId");
    const filterAgentId = c.req.query("agentId");
    const lines = readFileSync17(logPath, "utf-8").trim().split("\n").filter(Boolean);
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
import { randomUUID as randomUUID8 } from "crypto";
import { existsSync as existsSync26, readFileSync as readFileSync18, statSync as statSync7, mkdirSync as mkdirSync12 } from "fs";
import { join as join30, basename as basename5 } from "path";
import { homedir as homedir4 } from "os";
import { spawn as spawn12 } from "child_process";
function readProjectName(projectDir) {
  const pkgPath = join30(projectDir, "package.json");
  try {
    if (existsSync26(pkgPath)) {
      const pkg = JSON.parse(readFileSync18(pkgPath, "utf-8"));
      if (pkg.name) return pkg.name;
    }
  } catch {
  }
  return basename5(projectDir);
}
function workspacesRoutes(globalDataDir) {
  const app = new Hono16();
  app.get("/", (c) => {
    try {
      const db = getDb(globalDataDir);
      const rows = db.prepare(
        "SELECT id, name, path, last_opened, is_active FROM workspaces ORDER BY last_opened DESC"
      ).all();
      return c.json({ workspaces: rows });
    } catch (err) {
      return c.json({ workspaces: [], error: err instanceof Error ? err.message : "Failed to load workspaces" });
    }
  });
  app.post("/", async (c) => {
    const body = await c.req.json();
    const rawPath = body?.path?.trim();
    if (!rawPath) return c.json({ error: "path required" }, 400);
    let stat3;
    try {
      stat3 = statSync7(rawPath);
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
    const id = randomUUID8();
    db.prepare("INSERT INTO workspaces (id, name, path, last_opened, is_active) VALUES (?, ?, ?, ?, 0)").run(id, name, rawPath, Date.now());
    const created = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id);
    return c.json({ workspace: created }, 201);
  });
  app.post("/:id/activate", (c) => {
    const id = c.req.param("id");
    const db = getDb(globalDataDir);
    const ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id);
    if (!ws) return c.json({ error: "workspace not found" }, 404);
    if (!existsSync26(ws.path)) return c.json({ error: "workspace path no longer exists" }, 400);
    db.prepare("UPDATE workspaces SET is_active = 0").run();
    db.prepare("UPDATE workspaces SET is_active = 1, last_opened = ? WHERE id = ?").run(Date.now(), id);
    resetDb();
    return c.json({ ok: true, path: ws.path, name: ws.name });
  });
  app.post("/clone", async (c) => {
    const body = await c.req.json().catch(() => ({ url: void 0 }));
    const url = body?.url?.trim();
    if (!url) return c.json({ error: "url required" }, 400);
    if (!url.startsWith("https://") && !url.startsWith("git@")) {
      return c.json({ error: "url must start with https:// or git@" }, 400);
    }
    const segments = url.replace(/\.git$/, "").split(/[/:]/).filter(Boolean);
    const repoName = segments[segments.length - 1];
    if (!repoName) return c.json({ error: "could not determine repo name from url" }, 400);
    const workspacesDir = join30(homedir4(), ".hashmark", "workspaces");
    try {
      mkdirSync12(workspacesDir, { recursive: true });
    } catch {
    }
    const clonePath = join30(workspacesDir, repoName);
    if (existsSync26(clonePath)) {
      return c.json({ error: `directory already exists: ${clonePath}` }, 409);
    }
    try {
      await new Promise((resolve4, reject) => {
        const child = spawn12("git", ["clone", url, clonePath], { stdio: "pipe" });
        const chunks = [];
        child.stderr.on("data", (d) => chunks.push(d));
        child.stdout.on("data", (d) => chunks.push(d));
        child.on("close", (code) => {
          if (code === 0) {
            resolve4();
          } else {
            const output = Buffer.concat(chunks).toString().trim();
            reject(new Error(output || `git clone exited with code ${code}`));
          }
        });
        child.on("error", reject);
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "git clone failed" }, 500);
    }
    const name = readProjectName(clonePath);
    const db = getDb(globalDataDir);
    const existing = db.prepare("SELECT id FROM workspaces WHERE path = ?").get(clonePath);
    let id;
    if (existing) {
      id = existing.id;
      db.prepare("UPDATE workspaces SET name = ?, last_opened = ? WHERE id = ?").run(name, Date.now(), id);
    } else {
      id = randomUUID8();
      db.prepare("INSERT INTO workspaces (id, name, path, last_opened, is_active) VALUES (?, ?, ?, ?, 0)").run(id, name, clonePath, Date.now());
    }
    return c.json({ ok: true, path: clonePath, name, id });
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
import { existsSync as existsSync27, readFileSync as readFileSync19, writeFileSync as writeFileSync11, mkdirSync as mkdirSync13 } from "fs";
import { join as join31 } from "path";
var DEFAULT_CONFIG2 = {
  formats: ["CLAUDE.md", "AGENTS.md", ".cursorrules"],
  maxTokens: 1e5,
  watchDebounceMs: 2e3,
  autoRescan: false
};
function loadConfig(dataDir) {
  const filePath = join31(dataDir, "scan-config.json");
  if (!existsSync27(filePath)) return { ...DEFAULT_CONFIG2 };
  try {
    const raw = readFileSync19(filePath, "utf-8");
    return { ...DEFAULT_CONFIG2, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG2 };
  }
}
function saveConfig(dataDir, config) {
  if (!existsSync27(dataDir)) mkdirSync13(dataDir, { recursive: true });
  writeFileSync11(join31(dataDir, "scan-config.json"), JSON.stringify(config, null, 2), "utf-8");
}
function configRoutes() {
  const app = new Hono17();
  app.get("/", (c) => {
    const { dataDir } = c.get("project");
    return c.json(loadConfig(dataDir));
  });
  app.put("/", async (c) => {
    const { dataDir } = c.get("project");
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

// server/routes/reviews.ts
import { Hono as Hono18 } from "hono";
import { randomUUID as randomUUID9 } from "crypto";
import { execFile as execFileCb10 } from "child_process";
import { promisify as promisify12 } from "util";
var execFile12 = promisify12(execFileCb10);
function parseGitRemote(remoteUrl) {
  const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}
function logEvent(dataDir, reviewId, eventType, author, data = {}) {
  const db = getDb(dataDir);
  db.prepare("INSERT INTO review_events (review_id, event_type, author, data, created_at) VALUES (?, ?, ?, ?, ?)").run(reviewId, eventType, author, JSON.stringify(data), Date.now());
}
function reviewsRoutes() {
  const app = new Hono18();
  app.get("/", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const status = c.req.query("status");
    let query = "SELECT * FROM reviews";
    const params = [];
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      query += " WHERE status = ?";
      params.push(status);
    }
    query += " ORDER BY created_at DESC";
    const rows = db.prepare(query).all(...params);
    return c.json({ reviews: rows });
  });
  app.post("/", async (c) => {
    const { dataDir } = c.get("project");
    const body = await c.req.json();
    if (!body.agent_name || !body.title || !body.file_path || !body.diff_content) {
      return c.json({ error: "Missing required fields: agent_name, title, file_path, diff_content" }, 400);
    }
    const db = getDb(dataDir);
    const id = randomUUID9().slice(0, 8);
    const now = Date.now();
    let policyId = null;
    const policies = db.prepare("SELECT * FROM review_policies WHERE enabled = 1").all();
    for (const policy of policies) {
      if (policy.rule_type === "always") {
        policyId = policy.id;
        break;
      }
      if (policy.rule_type === "path_pattern") {
        try {
          const regex = new RegExp(policy.pattern.replace(/\*/g, ".*"));
          if (regex.test(body.file_path)) {
            policyId = policy.id;
            break;
          }
        } catch {
        }
      }
      if (policy.rule_type === "file_action" && policy.pattern === "delete" && body.diff_content.includes("deleted file")) {
        policyId = policy.id;
        break;
      }
    }
    db.prepare(`
      INSERT INTO reviews (id, session_id, agent_name, title, description, file_path, diff_content, status, created_at, review_policy_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(id, body.session_id ?? null, body.agent_name, body.title, body.description ?? "", body.file_path, body.diff_content, now, policyId);
    logEvent(dataDir, id, "created", body.agent_name, { file_path: body.file_path });
    return c.json({ id, policyId }, 201);
  });
  app.patch("/:id", async (c) => {
    const { dataDir, projectDir } = c.get("project");
    const body = await c.req.json();
    if (!body.status || !["approved", "rejected"].includes(body.status)) {
      return c.json({ error: "status must be 'approved' or 'rejected'" }, 400);
    }
    const db = getDb(dataDir);
    const id = c.req.param("id");
    const now = Date.now();
    const result = db.prepare("UPDATE reviews SET status = ?, reviewed_at = ? WHERE id = ?").run(body.status, now, id);
    if (result.changes === 0) {
      return c.json({ error: "Review not found" }, 404);
    }
    logEvent(dataDir, id, body.status, "user", { reason: body.reason });
    const review = db.prepare("SELECT session_id FROM reviews WHERE id = ?").get(id);
    if (review?.session_id) {
      const sess = db.prepare(
        "SELECT agent_branch, base_branch, worktree_path FROM sessions WHERE id = ?"
      ).get(review.session_id);
      if (sess?.agent_branch && sess.base_branch) {
        if (body.status === "approved") {
          const mergeResult = await mergeAgentBranch(
            projectDir,
            sess.agent_branch,
            sess.base_branch,
            sess.worktree_path
          );
          if (!mergeResult.ok) {
            return c.json({ ok: false, error: mergeResult.error, mergeConflict: true }, 409);
          }
          db.prepare("UPDATE sessions SET agent_branch = NULL, worktree_path = NULL WHERE id = ?").run(review.session_id);
        } else {
          await cleanupAgentBranch(projectDir, sess.agent_branch, sess.base_branch, sess.worktree_path);
          db.prepare("UPDATE sessions SET agent_branch = NULL, worktree_path = NULL WHERE id = ?").run(review.session_id);
        }
      }
    }
    let pr_url;
    if (body.status === "approved" && body.create_pr) {
      try {
        const token = db.prepare("SELECT token FROM connections WHERE provider = 'github' AND enabled = 1").get()?.token;
        if (!token) throw new Error("GitHub not connected");
        const opts = { cwd: projectDir };
        const { stdout: branch } = await execFile12("git", ["branch", "--show-current"], opts);
        const { stdout: remote } = await execFile12("git", ["remote", "get-url", "origin"], opts);
        const parsed = parseGitRemote(remote.trim());
        if (!branch.trim() || !parsed) throw new Error("Not on a branch or no GitHub remote");
        const review2 = db.prepare("SELECT title FROM reviews WHERE id = ?").get(id);
        const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
          body: JSON.stringify({ title: review2?.title ?? "Agent changes", head: branch.trim(), base: "main" })
        });
        if (res.ok) {
          const data = await res.json();
          pr_url = data.html_url;
          logEvent(dataDir, id, "pr_created", "system", { pr_url });
        }
      } catch (err) {
        logEvent(dataDir, id, "pr_failed", "system", { error: String(err) });
      }
    }
    return c.json({ ok: true, pr_url });
  });
  app.post("/:id/dispatch-review", async (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const id = c.req.param("id");
    const review = db.prepare("SELECT * FROM reviews WHERE id = ?").get(id);
    if (!review) return c.json({ error: "Not found" }, 404);
    if (review.reviewer_session_id) return c.json({ error: "Already dispatched" }, 409);
    const body = await c.req.json().catch(() => ({ reviewer_agent: void 0 }));
    const sessionId = randomUUID9();
    const now = Date.now();
    db.prepare("INSERT INTO sessions (id, title, model, status, created_at, updated_at) VALUES (?, ?, 'claude-sonnet-4-6', 'idle', ?, ?)").run(sessionId, `Review: ${review.title}`, now, now);
    db.prepare("UPDATE reviews SET reviewer_session_id = ? WHERE id = ?").run(sessionId, id);
    logEvent(dataDir, id, "review_dispatched", "system", {
      reviewer_agent: body.reviewer_agent || "code-reviewer",
      session_id: sessionId
    });
    const reviewTimeout = setTimeout(() => {
      reviewUnsub();
      logEvent(dataDir, id, "review_timeout", "system");
    }, 30 * 60 * 1e3);
    const reviewUnsub = agentEvents.on((event) => {
      if (event.agentId !== sessionId) return;
      if (event.type !== "agent:done" && event.type !== "agent:error") return;
      clearTimeout(reviewTimeout);
      reviewUnsub();
      try {
        const db2 = getDb(dataDir);
        const msgs = db2.prepare(
          "SELECT content FROM session_messages WHERE session_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1"
        ).get(sessionId);
        if (msgs?.content) {
          db2.prepare("UPDATE reviews SET reviewer_output = ? WHERE id = ?").run(msgs.content, id);
          logEvent(dataDir, id, "review_completed", "agent", { output_length: msgs.content.length });
        }
      } catch {
      }
    });
    return c.json({ ok: true, sessionId }, 202);
  });
  app.get("/:id/comments", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const comments = db.prepare(
      "SELECT * FROM review_comments WHERE review_id = ? ORDER BY line_number ASC, created_at ASC"
    ).all(c.req.param("id"));
    return c.json({ comments });
  });
  app.post("/:id/comments", async (c) => {
    const { dataDir } = c.get("project");
    const body = await c.req.json();
    if (body.line_number == null || !body.content?.trim()) {
      return c.json({ error: "line_number and content required" }, 400);
    }
    const db = getDb(dataDir);
    const reviewId = c.req.param("id");
    const id = randomUUID9().slice(0, 8);
    db.prepare("INSERT INTO review_comments (id, review_id, line_number, content, author, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, reviewId, body.line_number, body.content.trim(), body.author ?? "user", Date.now());
    logEvent(dataDir, reviewId, "comment_added", body.author ?? "user", { line_number: body.line_number });
    return c.json({ id }, 201);
  });
  app.get("/history", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const limitParam = parseInt(c.req.query("limit") ?? "100", 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 100;
    const rows = db.prepare(`
      SELECT
        r.id AS review_id,
        r.title,
        r.agent_name,
        r.file_path,
        r.status,
        r.created_at,
        r.reviewed_at,
        (SELECT COUNT(*) FROM review_comments rc WHERE rc.review_id = r.id) AS comments_count,
        e.event_type AS outcome_event,
        e.author AS reviewer,
        e.created_at AS outcome_at
      FROM reviews r
      LEFT JOIN review_events e
        ON e.review_id = r.id AND e.event_type IN ('approved', 'rejected')
      WHERE r.status IN ('approved', 'rejected')
      ORDER BY r.reviewed_at DESC
      LIMIT ?
    `).all(limit);
    return c.json({ history: rows });
  });
  app.get("/:id/history", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const events = db.prepare(
      "SELECT * FROM review_events WHERE review_id = ? ORDER BY created_at ASC"
    ).all(c.req.param("id"));
    return c.json({ events });
  });
  app.get("/policies", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const policies = db.prepare("SELECT * FROM review_policies ORDER BY created_at DESC").all();
    return c.json({ policies });
  });
  app.post("/policies", async (c) => {
    const { dataDir } = c.get("project");
    const body = await c.req.json();
    if (!body.name?.trim() || !body.rule_type) {
      return c.json({ error: "name and rule_type required" }, 400);
    }
    const db = getDb(dataDir);
    const id = randomUUID9().slice(0, 8);
    db.prepare(`
      INSERT INTO review_policies (id, name, description, rule_type, pattern, auto_reviewer, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, body.name, body.description ?? "", body.rule_type, body.pattern ?? "*", body.auto_reviewer ?? null, Date.now());
    return c.json({ id }, 201);
  });
  app.patch("/policies/:id", async (c) => {
    const { dataDir } = c.get("project");
    const body = await c.req.json();
    const db = getDb(dataDir);
    const id = c.req.param("id");
    if (body.enabled !== void 0) {
      db.prepare("UPDATE review_policies SET enabled = ? WHERE id = ?").run(body.enabled ? 1 : 0, id);
    }
    if (body.name) {
      db.prepare("UPDATE review_policies SET name = ? WHERE id = ?").run(body.name, id);
    }
    if (body.pattern) {
      db.prepare("UPDATE review_policies SET pattern = ? WHERE id = ?").run(body.pattern, id);
    }
    return c.json({ ok: true });
  });
  app.delete("/policies/:id", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    db.prepare("DELETE FROM review_policies WHERE id = ?").run(c.req.param("id"));
    return c.json({ ok: true });
  });
  return app;
}

// server/routes/shared-context.ts
import { Hono as Hono19 } from "hono";
import { randomUUID as randomUUID10 } from "crypto";
function sharedContextRoutes() {
  const app = new Hono19();
  app.get("/", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const scope = c.req.query("scope");
    const workspaceId = c.req.query("workspace_id");
    let query = "SELECT * FROM shared_context";
    const conditions = [];
    const params = [];
    if (scope) {
      conditions.push("scope = ?");
      params.push(scope);
    }
    if (workspaceId) {
      conditions.push("workspace_id = ?");
      params.push(workspaceId);
    }
    if (conditions.length) query += " WHERE " + conditions.join(" AND ");
    query += " ORDER BY updated_at DESC";
    const entries = db.prepare(query).all(...params);
    return c.json({ entries });
  });
  app.get("/inject", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const workspaceId = c.req.query("workspace_id");
    let query = "SELECT key, value, scope FROM shared_context WHERE scope = 'global'";
    const params = [];
    if (workspaceId) {
      query += " OR workspace_id = ?";
      params.push(workspaceId);
    }
    query += " ORDER BY key ASC";
    const entries = db.prepare(query).all(...params);
    if (!entries.length) {
      return c.json({ context: "", count: 0 });
    }
    const context = entries.map((e) => `## ${e.key}
${e.value}`).join("\n\n---\n\n");
    return c.json({ context, count: entries.length });
  });
  app.get("/:key", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const key = c.req.param("key");
    const entry = db.prepare("SELECT * FROM shared_context WHERE key = ?").get(key);
    if (!entry) return c.json({ error: "not found" }, 404);
    return c.json({ entry });
  });
  app.post("/", async (c) => {
    const { dataDir } = c.get("project");
    const body = await c.req.json();
    const key = body.key?.trim();
    const value = body.value?.trim();
    if (!key) return c.json({ error: "key required" }, 400);
    if (!value) return c.json({ error: "value required" }, 400);
    const workspaceId = body.workspace_id ?? "";
    const scope = body.scope ?? "global";
    const now = Date.now();
    const db = getDb(dataDir);
    const existing = db.prepare(
      "SELECT id FROM shared_context WHERE key = ? AND workspace_id = ?"
    ).get(key, workspaceId);
    if (existing) {
      db.prepare(
        "UPDATE shared_context SET value = ?, scope = ?, updated_at = ? WHERE id = ?"
      ).run(value, scope, now, existing.id);
      return c.json({ id: existing.id, updated: true });
    }
    const id = randomUUID10().slice(0, 12);
    db.prepare(
      "INSERT INTO shared_context (id, workspace_id, key, value, scope, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(id, workspaceId, key, value, scope, now, now);
    return c.json({ id, updated: false }, 201);
  });
  app.delete("/:key", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const key = c.req.param("key");
    const workspaceId = c.req.query("workspace_id") ?? "";
    const result = db.prepare(
      "DELETE FROM shared_context WHERE key = ? AND workspace_id = ?"
    ).run(key, workspaceId);
    if (result.changes === 0) {
      db.prepare("DELETE FROM shared_context WHERE key = ?").run(key);
    }
    return c.json({ ok: true });
  });
  return app;
}

// server/routes/agent-state.ts
import { Hono as Hono20 } from "hono";

// server/lib/project-scanner.ts
import { execFile as execFile13 } from "child_process";

// server/lib/project-registry.ts
import { createHash as createHash3 } from "crypto";
import { existsSync as existsSync28, readFileSync as readFileSync20 } from "fs";
import { join as join32, basename as basename6 } from "path";
function projectId(absolutePath) {
  return createHash3("sha256").update(absolutePath).digest("hex").slice(0, 12);
}
function readProjectName2(projectDir) {
  try {
    const pkgPath = join32(projectDir, "package.json");
    if (existsSync28(pkgPath)) {
      const pkg = JSON.parse(readFileSync20(pkgPath, "utf-8"));
      if (pkg.name) return pkg.name;
    }
  } catch {
  }
  return basename6(projectDir);
}
var ProjectRegistry = class {
  projects = /* @__PURE__ */ new Map();
  _activeId = null;
  /** Register a project. Returns its handle. Idempotent. */
  register(projectDir) {
    const id = projectId(projectDir);
    const existing = this.projects.get(id);
    if (existing) return existing;
    const handle = {
      id,
      name: readProjectName2(projectDir),
      projectDir,
      dataDir: join32(projectDir, ".hashmark")
    };
    this.projects.set(id, handle);
    if (!this._activeId) this._activeId = id;
    return handle;
  }
  /** Get project by ID. */
  get(id) {
    return this.projects.get(id);
  }
  /** Get project by absolute path. */
  getByPath(projectDir) {
    const id = projectId(projectDir);
    return this.projects.get(id);
  }
  /** List all registered projects. */
  list() {
    return [...this.projects.values()];
  }
  /** Remove a project from the registry. */
  remove(id) {
    this.projects.delete(id);
    if (this._activeId === id) {
      this._activeId = this.projects.size > 0 ? this.projects.keys().next().value ?? null : null;
    }
  }
  /** Get/set the active project ID. */
  get activeId() {
    return this._activeId;
  }
  set activeId(id) {
    this._activeId = id;
  }
  /** Get the active project handle. */
  get active() {
    return this._activeId ? this.projects.get(this._activeId) : void 0;
  }
  /** Resolve a project from a request -- checks header, query, or falls back to active. */
  resolve(projectIdOrNull) {
    if (projectIdOrNull) return this.projects.get(projectIdOrNull);
    return this.active;
  }
  /** Get a DB connection for a project. Uses the pooled getDb(). */
  db(handle) {
    return getDb(handle.dataDir);
  }
};
var registry = new ProjectRegistry();

// server/lib/project-scanner.ts
var SCAN_INTERVAL = 3e4;
var healthCache = /* @__PURE__ */ new Map();
var scanTimer = null;
function gitCmd(args, cwd) {
  return new Promise((resolve4) => {
    execFile13("git", args, { cwd, encoding: "utf-8", timeout: 5e3 }, (err, stdout) => {
      resolve4(err ? "" : stdout.trim());
    });
  });
}
async function scanProject(projectId2) {
  const handle = registry.get(projectId2);
  if (!handle) return null;
  const now = Date.now();
  const { projectDir, dataDir, name, id } = handle;
  const [branch, statusOut, lastCommit] = await Promise.all([
    gitCmd(["rev-parse", "--abbrev-ref", "HEAD"], projectDir),
    gitCmd(["status", "--porcelain"], projectDir),
    gitCmd(["log", "--oneline", "-1", "--format=%s"], projectDir)
  ]);
  const changedFiles = statusOut ? statusOut.split("\n").filter((l) => l.trim()).length : 0;
  let activeSessions = 0;
  let totalSessions = 0;
  let pendingReviews = 0;
  let recentCompleted = 0;
  let recentFailed = 0;
  const activeAgents = [];
  try {
    const db = getDb(dataDir);
    try {
      const counts = db.prepare(
        "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'streaming' THEN 1 ELSE 0 END) as active FROM sessions WHERE archived = 0"
      ).get();
      totalSessions = counts?.total ?? 0;
      activeSessions = counts?.active ?? 0;
    } catch {
    }
    try {
      const reviewCount = db.prepare("SELECT COUNT(*) as cnt FROM reviews WHERE status = 'pending'").get();
      pendingReviews = reviewCount?.cnt ?? 0;
    } catch {
    }
    try {
      const streaming = db.prepare("SELECT id, updated_at FROM sessions WHERE status = 'streaming'").all();
      for (const s of streaming) {
        activeAgents.push({ id: s.id, name: "chat", status: "running", elapsed: now - s.updated_at });
      }
    } catch {
    }
    try {
      const workers = db.prepare("SELECT worker_id, title, status, started_at FROM swarm_workers WHERE status IN ('pending', 'running')").all();
      for (const w of workers) {
        activeAgents.push({ id: w.worker_id, name: w.title, status: w.status === "pending" ? "idle" : "running", elapsed: w.started_at ? now - w.started_at : 0 });
      }
    } catch {
    }
    try {
      const cutoff = now - 30 * 60 * 1e3;
      const recent = db.prepare(
        "SELECT event_type, COUNT(*) as cnt FROM agent_activity WHERE event_type IN ('agent:done', 'agent:error') AND created_at > ? GROUP BY event_type"
      ).all(cutoff);
      for (const r of recent) {
        if (r.event_type === "agent:done") recentCompleted = r.cnt;
        if (r.event_type === "agent:error") recentFailed = r.cnt;
      }
    } catch {
    }
  } catch {
  }
  return {
    id,
    name,
    projectDir,
    branch: branch || "unknown",
    changedFiles,
    lastCommit: lastCommit || "",
    isActive: id === registry.activeId,
    activeSessions,
    totalSessions,
    pendingReviews,
    recentCompleted,
    recentFailed,
    activeAgents,
    lastScanned: now
  };
}
async function scanAll() {
  const projects = registry.list();
  for (const p of projects) {
    const health = await scanProject(p.id);
    if (health) {
      healthCache.set(p.id, health);
      if (Math.random() < 0.01) {
        cleanupOldCheckpoints(health.projectDir).catch(() => {
        });
      }
    }
  }
}
function getAllProjectHealth() {
  const results = [];
  for (const h of healthCache.values()) {
    results.push({ ...h, isActive: h.id === registry.activeId });
  }
  return results;
}
async function rescanProject(projectId2) {
  const health = await scanProject(projectId2);
  if (health) healthCache.set(projectId2, health);
}
function startScanner() {
  if (scanTimer) return;
  scanAll().catch(() => {
  });
  scanTimer = setInterval(() => scanAll().catch(() => {
  }), SCAN_INTERVAL);
}

// server/routes/agent-state.ts
function agentStateRoutes() {
  const app = new Hono20();
  app.get("/", (c) => {
    const project = c.get("project");
    if (!project) return c.json({ agents: [] });
    const { dataDir } = project;
    const agents = [];
    const now = Date.now();
    try {
      const db = getDb(dataDir);
      try {
        const sessions = db.prepare("SELECT id, updated_at FROM sessions WHERE status = 'streaming'").all();
        for (const s of sessions) {
          agents.push({
            id: s.id,
            name: "chat",
            status: "running",
            parentId: null,
            sessionId: s.id,
            type: "lead",
            elapsed: now - s.updated_at
          });
        }
      } catch {
      }
      try {
        const workers = db.prepare("SELECT worker_id, title, run_id, status, started_at FROM swarm_workers WHERE status IN ('pending', 'running')").all();
        for (const w of workers) {
          agents.push({
            id: w.worker_id,
            name: w.title,
            status: w.status === "pending" ? "idle" : "running",
            parentId: w.run_id,
            sessionId: w.run_id,
            type: "worker",
            elapsed: w.started_at ? now - w.started_at : 0
          });
        }
      } catch {
      }
      try {
        const cutoff = now - 30 * 60 * 1e3;
        const recent = db.prepare(
          `SELECT DISTINCT agent_id, session_id, data, created_at
           FROM agent_activity
           WHERE event_type IN ('agent:done', 'agent:error')
             AND created_at > ?
             AND agent_id NOT IN (${agents.map(() => "?").join(",") || "''"})
           ORDER BY created_at DESC
           LIMIT 20`
        ).all(cutoff, ...agents.map((a) => a.id));
        for (const r of recent) {
          const data = JSON.parse(r.data);
          agents.push({
            id: r.agent_id,
            name: data.name || "agent",
            status: data.status === "failed" ? "failed" : "done",
            parentId: data.parentId || null,
            sessionId: r.session_id,
            type: data.agentType || "lead",
            elapsed: now - r.created_at
          });
        }
      } catch {
      }
      if (Math.random() < 0.01) {
        agentEvents.cleanup(db);
      }
    } catch {
    }
    return c.json({ agents });
  });
  app.get("/cross-project", (c) => {
    const health = getAllProjectHealth();
    const crossProject = health.map((h) => ({
      projectId: h.id,
      projectName: h.name,
      branch: h.branch,
      changedFiles: h.changedFiles,
      activeAgents: h.activeAgents,
      recentCompleted: h.recentCompleted,
      recentFailed: h.recentFailed,
      pendingReviews: h.pendingReviews
    }));
    return c.json({ projects: crossProject });
  });
  app.get("/digest", (c) => {
    const project = c.get("project");
    if (!project) return c.json({ completed: 0, failed: 0, filesChanged: [], totalTokens: 0, since: 0, events: [] });
    const since = Number(c.req.query("since") || "0");
    try {
      const db = getDb(project.dataDir);
      const digest = agentEvents.digest(db, since);
      return c.json(digest);
    } catch (err) {
      console.error("[agent-state] digest failed:", err);
      return c.json({ completed: 0, failed: 0, filesChanged: [], totalTokens: 0, since, events: [] });
    }
  });
  app.get("/stream", (c) => {
    const enc = new TextEncoder();
    const project = c.get("project");
    const since = Number(c.req.query("since") || "0");
    const stream = new ReadableStream({
      start(controller) {
        const send = (data) => {
          try {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}

`));
          } catch {
          }
        };
        if (project && since > 0) {
          try {
            const db = getDb(project.dataDir);
            const missed = agentEvents.replay(db, since);
            for (const event of missed) {
              send(event);
            }
          } catch (err) {
            console.error("[agent-state] event replay failed:", err);
          }
        }
        send({ type: "replay:done", timestamp: Date.now() });
        const unsub = agentEvents.on((event) => {
          send(event);
        });
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(enc.encode(": heartbeat\n\n"));
          } catch {
            clearInterval(heartbeat);
          }
        }, 15e3);
        c.req.raw.signal.addEventListener("abort", () => {
          unsub();
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
          }
        });
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      }
    });
  });
  return app;
}

// server/routes/connections.ts
import { Hono as Hono21 } from "hono";
import { z as z2 } from "zod";
import { randomUUID as randomUUID14 } from "crypto";

// server/routes/connections-github.ts
import { randomUUID as randomUUID11 } from "crypto";
import { execFile as execFileCb11 } from "child_process";
import { promisify as promisify13 } from "util";
var execFile14 = promisify13(execFileCb11);
var validGhName = (s) => /^[a-zA-Z0-9._-]+$/.test(s);
var pendingDeviceFlows = /* @__PURE__ */ new Map();
async function saveGithubToken(dataDir, token, login, name) {
  const db = getDb(dataDir);
  const now = Date.now();
  const existing = db.prepare("SELECT id FROM connections WHERE provider = 'github'").get();
  const meta = JSON.stringify({ login, name });
  if (existing) {
    db.prepare("UPDATE connections SET token = ?, label = ?, scopes = ?, metadata = ?, updated_at = ? WHERE id = ?").run(token, `GitHub (${login})`, "repo,read:user", meta, now, existing.id);
  } else {
    db.prepare("INSERT INTO connections (id, provider, label, token, scopes, metadata, created_at, updated_at) VALUES (?, 'github', ?, ?, 'repo,read:user', ?, ?, ?)").run(randomUUID11().slice(0, 12), `GitHub (${login})`, token, meta, now, now);
  }
}
function registerGithubRoutes(app) {
  app.get("/github/repos", async (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const row = db.prepare("SELECT token FROM connections WHERE provider = 'github' AND enabled = 1").get();
    if (!row) return c.json({ error: "GitHub not connected" }, 401);
    const res = await fetch("https://api.github.com/user/repos?sort=updated&per_page=30", {
      headers: { Authorization: `Bearer ${row.token}`, Accept: "application/vnd.github.v3+json" }
    });
    if (!res.ok) return c.json({ error: `GitHub API ${res.status}` }, res.status);
    return c.json({ repos: await res.json() });
  });
  app.post("/github/issues", async (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const row = db.prepare("SELECT token FROM connections WHERE provider = 'github' AND enabled = 1").get();
    if (!row) return c.json({ error: "GitHub not connected" }, 401);
    const body = await c.req.json();
    if (!validGhName(body.owner) || !validGhName(body.repo)) return c.json({ error: "Invalid owner/repo" }, 400);
    const res = await fetch(`https://api.github.com/repos/${body.owner}/${body.repo}/issues`, {
      method: "POST",
      headers: { Authorization: `Bearer ${row.token}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
      body: JSON.stringify({ title: body.title, body: body.body, labels: body.labels })
    });
    if (!res.ok) return c.json({ error: `GitHub API ${res.status}` }, res.status);
    const issue = await res.json();
    return c.json({ number: issue.number, url: issue.html_url }, 201);
  });
  app.get("/github/issues", async (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const row = db.prepare("SELECT token FROM connections WHERE provider = 'github' AND enabled = 1").get();
    if (!row) return c.json({ error: "GitHub not connected" }, 401);
    const owner = c.req.query("owner");
    const repo = c.req.query("repo");
    if (!owner || !repo) return c.json({ error: "owner and repo required" }, 400);
    if (!validGhName(owner) || !validGhName(repo)) return c.json({ error: "Invalid owner/repo" }, 400);
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=20`, {
      headers: { Authorization: `Bearer ${row.token}`, Accept: "application/vnd.github.v3+json" }
    });
    if (!res.ok) return c.json({ error: `GitHub API ${res.status}` }, res.status);
    return c.json({ issues: await res.json() });
  });
  app.post("/github/pr", async (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const row = db.prepare("SELECT token FROM connections WHERE provider = 'github' AND enabled = 1").get();
    if (!row) return c.json({ error: "GitHub not connected" }, 401);
    const body = await c.req.json();
    if (!validGhName(body.owner) || !validGhName(body.repo)) return c.json({ error: "Invalid owner/repo" }, 400);
    const res = await fetch(`https://api.github.com/repos/${body.owner}/${body.repo}/pulls`, {
      method: "POST",
      headers: { Authorization: `Bearer ${row.token}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
      body: JSON.stringify({ title: body.title, body: body.body, head: body.head, base: body.base })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return c.json({ error: err.message || `GitHub API ${res.status}` }, res.status);
    }
    const pr = await res.json();
    return c.json({ number: pr.number, url: pr.html_url }, 201);
  });
  app.post("/github/issues/:id/comment", async (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const row = db.prepare("SELECT token FROM connections WHERE provider = 'github' AND enabled = 1").get();
    if (!row) return c.json({ error: "GitHub not connected" }, 401);
    const issueId = c.req.param("id");
    if (!/^\d+$/.test(issueId)) return c.json({ error: "Invalid issue ID" }, 400);
    const body = await c.req.json();
    if (!validGhName(body.owner) || !validGhName(body.repo)) return c.json({ error: "Invalid owner/repo" }, 400);
    if (!body.body?.trim()) return c.json({ error: "Comment body is required" }, 400);
    const res = await fetch(`https://api.github.com/repos/${body.owner}/${body.repo}/issues/${issueId}/comments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${row.token}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.body })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return c.json({ error: err.message || `GitHub API ${res.status}` }, res.status);
    }
    const comment = await res.json();
    return c.json({ id: comment.id, url: comment.html_url }, 201);
  });
  app.post("/github/gh-cli", async (c) => {
    const { dataDir } = c.get("project");
    try {
      const { stdout } = await execFile14("gh", ["auth", "token"]);
      const token = stdout.trim();
      if (!token) return c.json({ error: "No gh auth token found" }, 404);
      const userRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" }
      });
      if (!userRes.ok) return c.json({ error: "Token invalid" }, 400);
      const user = await userRes.json();
      await saveGithubToken(dataDir, token, user.login, user.name);
      return c.json({ ok: true, user: user.login });
    } catch {
      return c.json({ error: "gh CLI not found or not authenticated. Run: gh auth login" }, 404);
    }
  });
  app.get("/github/gh-cli/status", async (c) => {
    try {
      const { stdout } = await execFile14("gh", ["auth", "status", "--show-token"]);
      return c.json({ available: true, loggedIn: stdout.includes("Logged in") });
    } catch {
      return c.json({ available: false, loggedIn: false });
    }
  });
  app.post("/oauth/github/device/start", async (c) => {
    const clientId = process.env.HASHMARK_GITHUB_CLIENT_ID;
    if (!clientId) {
      return c.json({ error: "HASHMARK_GITHUB_CLIENT_ID not configured. Set it in your environment or .env file." }, 400);
    }
    const res = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: clientId, scope: "repo,read:user" })
    });
    if (!res.ok) return c.json({ error: `GitHub returned ${res.status}` }, 502);
    const data = await res.json();
    pendingDeviceFlows.set(data.device_code, {
      device_code: data.device_code,
      client_id: clientId,
      interval: data.interval ?? 5,
      dataDir: c.get("project").dataDir,
      expiresAt: Date.now() + (data.expires_in ?? 900) * 1e3
    });
    return c.json({ user_code: data.user_code, verification_uri: data.verification_uri, device_code: data.device_code, expires_in: data.expires_in });
  });
  app.post("/oauth/github/device/poll", async (c) => {
    const { device_code } = await c.req.json().catch(() => ({ device_code: "" }));
    const entry = pendingDeviceFlows.get(device_code);
    if (!entry) return c.json({ status: "not_found" });
    if (Date.now() > entry.expiresAt) {
      pendingDeviceFlows.delete(device_code);
      return c.json({ status: "expired" });
    }
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: entry.client_id, device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" })
    });
    const data = await res.json();
    if (data.error === "authorization_pending" || data.error === "slow_down") return c.json({ status: "pending" });
    if (data.error === "access_denied") {
      pendingDeviceFlows.delete(device_code);
      return c.json({ status: "denied" });
    }
    if (data.error === "expired_token") {
      pendingDeviceFlows.delete(device_code);
      return c.json({ status: "expired" });
    }
    if (!data.access_token) return c.json({ status: "pending" });
    try {
      const userRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${data.access_token}`, Accept: "application/vnd.github.v3+json" }
      });
      const user = await userRes.json();
      await saveGithubToken(entry.dataDir, data.access_token, user.login, user.name);
      pendingDeviceFlows.delete(device_code);
      return c.json({ status: "connected", user: user.login });
    } catch {
      return c.json({ status: "pending" });
    }
  });
}

// server/lib/oauth-github.ts
import { randomUUID as randomUUID12 } from "crypto";
var GITHUB_SCOPES = "repo,read:org,read:user";
function buildGitHubAuthUrl(clientId, redirectUri, state) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: GITHUB_SCOPES,
    state,
    allow_signup: "true"
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}
async function startDeviceFlow(clientId) {
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, scope: GITHUB_SCOPES })
  });
  if (!res.ok) throw new Error(`GitHub device flow start failed: ${res.status}`);
  return res.json();
}
async function exchangeCodeForToken(clientId, clientSecret, code, redirectUri) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri })
  });
  if (!res.ok) throw new Error(`GitHub token exchange failed: ${res.status}`);
  return res.json();
}
async function fetchGitHubUser(token) {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" }
  });
  if (!res.ok) throw new Error(`GitHub user fetch failed: ${res.status}`);
  return res.json();
}
function storeGitHubToken(dataDir, token, user) {
  const db = getDb(dataDir);
  const now = Date.now();
  const label = `GitHub (${user.login})`;
  const meta = JSON.stringify({ login: user.login, name: user.name, email: user.email });
  const existing = db.prepare("SELECT id FROM connections WHERE provider = 'github'").get();
  if (existing) {
    db.prepare(
      "UPDATE connections SET token = ?, label = ?, scopes = ?, metadata = ?, enabled = 1, updated_at = ? WHERE id = ?"
    ).run(token, label, GITHUB_SCOPES, meta, now, existing.id);
  } else {
    db.prepare(
      "INSERT INTO connections (id, provider, label, token, scopes, metadata, enabled, created_at, updated_at) VALUES (?, 'github', ?, ?, ?, ?, 1, ?, ?)"
    ).run(randomUUID12().slice(0, 12), label, token, GITHUB_SCOPES, meta, now, now);
  }
}

// server/lib/oauth-linear.ts
import { randomUUID as randomUUID13 } from "crypto";
var LINEAR_SCOPES = ["read", "write", "issues:create"];
function buildLinearAuthUrl(clientId, redirectUri, state) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: LINEAR_SCOPES.join(","),
    state,
    actor: "application"
  });
  return `https://linear.app/oauth/authorize?${params.toString()}`;
}
async function exchangeLinearCode(config, code) {
  const res = await fetch("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
      grant_type: "authorization_code"
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Linear token exchange failed (${res.status}): ${body}`);
  }
  return res.json();
}
async function fetchLinearUser(token) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ viewer { id name email } }" })
  });
  if (!res.ok) throw new Error(`Linear viewer fetch failed: ${res.status}`);
  const data = await res.json();
  const viewer = data.data?.viewer;
  if (!viewer) throw new Error("Could not retrieve Linear user");
  return viewer;
}
function storeLinearToken(dataDir, token, user) {
  const db = getDb(dataDir);
  const now = Date.now();
  const label = `Linear (${user.name})`;
  const meta = JSON.stringify({ id: user.id, name: user.name, email: user.email });
  const scopes = LINEAR_SCOPES.join(",");
  const existing = db.prepare("SELECT id FROM connections WHERE provider = 'linear'").get();
  if (existing) {
    db.prepare(
      "UPDATE connections SET token = ?, label = ?, scopes = ?, metadata = ?, enabled = 1, updated_at = ? WHERE id = ?"
    ).run(token, label, scopes, meta, now, existing.id);
  } else {
    db.prepare(
      "INSERT INTO connections (id, provider, label, token, scopes, metadata, enabled, created_at, updated_at) VALUES (?, 'linear', ?, ?, ?, ?, 1, ?, ?)"
    ).run(randomUUID13().slice(0, 12), label, token, scopes, meta, now, now);
  }
}

// server/routes/connections.ts
function connectionsRoutes() {
  const app = new Hono21();
  app.get("/", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const rows = db.prepare("SELECT * FROM connections ORDER BY provider ASC").all();
    return c.json({
      connections: rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        label: r.label,
        scopes: r.scopes,
        enabled: !!r.enabled,
        metadata: JSON.parse(r.metadata),
        connected: true,
        created_at: r.created_at
      }))
    });
  });
  const createConnectionSchema = z2.object({
    provider: z2.string().min(1, "provider is required"),
    token: z2.string().min(1, "token is required"),
    label: z2.string().optional(),
    scopes: z2.string().optional()
  });
  app.post("/", async (c) => {
    const { dataDir } = c.get("project");
    let rawBody;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const parsed = createConnectionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0].message }, 400);
    }
    const body = parsed.data;
    const db = getDb(dataDir);
    const now = Date.now();
    const existing = db.prepare("SELECT id FROM connections WHERE provider = ?").get(body.provider);
    if (existing) {
      db.prepare("UPDATE connections SET token = ?, label = ?, scopes = ?, updated_at = ? WHERE id = ?").run(body.token, body.label ?? "", body.scopes ?? "", now, existing.id);
      return c.json({ id: existing.id, updated: true });
    }
    const id = randomUUID14().slice(0, 12);
    db.prepare("INSERT INTO connections (id, provider, label, token, scopes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, body.provider, body.label ?? "", body.token, body.scopes ?? "", now, now);
    return c.json({ id }, 201);
  });
  app.delete("/:id", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    db.prepare("DELETE FROM connections WHERE id = ?").run(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/test/:provider", async (c) => {
    const { dataDir } = c.get("project");
    const provider = c.req.param("provider");
    const db = getDb(dataDir);
    const conn = db.prepare("SELECT token FROM connections WHERE provider = ?").get(provider);
    if (!conn) return c.json({ ok: false, error: "No connection configured" }, 404);
    if (provider === "github") {
      try {
        const res = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${conn.token}`, Accept: "application/vnd.github.v3+json" }
        });
        if (!res.ok) return c.json({ ok: false, error: `GitHub API returned ${res.status}` });
        const user = await res.json();
        db.prepare("UPDATE connections SET metadata = ?, updated_at = ? WHERE provider = 'github'").run(JSON.stringify({ login: user.login, name: user.name }), Date.now());
        return c.json({ ok: true, user: user.login });
      } catch (err) {
        return c.json({ ok: false, error: err instanceof Error ? err.message : "Test failed" });
      }
    }
    if (provider === "linear") {
      try {
        const res = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: { Authorization: conn.token, "Content-Type": "application/json" },
          body: JSON.stringify({ query: "{ viewer { id name email } }" })
        });
        if (!res.ok) return c.json({ ok: false, error: `Linear API returned ${res.status}` });
        const data = await res.json();
        return c.json({ ok: true, user: data.data?.viewer?.name });
      } catch (err) {
        return c.json({ ok: false, error: err instanceof Error ? err.message : "Test failed" });
      }
    }
    return c.json({ ok: false, error: `Unknown provider: ${provider}` });
  });
  app.get("/linear/teams", async (c) => {
    const token = getToken(c.get("project").dataDir, "linear");
    if (!token) return c.json({ error: "Linear not connected" }, 401);
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ teams { nodes { id name key } } }" })
    });
    const data = await res.json();
    return c.json({ teams: data.data?.teams?.nodes || [] });
  });
  app.get("/linear/issues", async (c) => {
    const token = getToken(c.get("project").dataDir, "linear");
    if (!token) return c.json({ error: "Linear not connected" }, 401);
    const teamId = c.req.query("teamId");
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: teamId ? `query($teamId: String!) { issues(filter: { team: { id: { eq: $teamId } } }) { nodes { id identifier title state { name } priority assignee { name } } } }` : `{ issues { nodes { id identifier title state { name } priority assignee { name } } } }`,
        variables: teamId ? { teamId } : void 0
      })
    });
    const data = await res.json();
    return c.json({ issues: data.data?.issues?.nodes || [] });
  });
  app.post("/linear/issues", async (c) => {
    const token = getToken(c.get("project").dataDir, "linear");
    if (!token) return c.json({ error: "Linear not connected" }, 401);
    const body = await c.req.json();
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }`,
        variables: { input: { teamId: body.teamId, title: body.title, description: body.description || "" } }
      })
    });
    const data = await res.json();
    if (data.data?.issueCreate?.success) return c.json({ issue: data.data.issueCreate.issue }, 201);
    return c.json({ error: "Failed to create issue" }, 500);
  });
  app.post("/:provider/connect", async (c) => {
    const { dataDir } = c.get("project");
    const provider = c.req.param("provider");
    const port = process.env.PORT ?? "19432";
    const redirectUri = `http://localhost:${port}/api/connections/${provider}/callback`;
    if (provider === "github") {
      const clientId = process.env.HASHMARK_GITHUB_CLIENT_ID;
      if (!clientId) {
        try {
          const data = await startDeviceFlow("Iv1.b507a08c87ecfe98");
          return c.json({
            flow: "device",
            user_code: data.user_code,
            verification_uri: data.verification_uri,
            device_code: data.device_code,
            expires_in: data.expires_in
          });
        } catch (err) {
          return c.json({ error: err instanceof Error ? err.message : "Failed to start device flow" }, 502);
        }
      }
      const state = randomUUID14().replace(/-/g, "");
      const authUrl = buildGitHubAuthUrl(clientId, redirectUri, state);
      return c.json({ flow: "redirect", authUrl, state });
    }
    if (provider === "linear") {
      const clientId = process.env.HASHMARK_LINEAR_CLIENT_ID;
      if (!clientId) return c.json({ error: "HASHMARK_LINEAR_CLIENT_ID not configured" }, 400);
      const state = randomUUID14().replace(/-/g, "");
      const authUrl = buildLinearAuthUrl(clientId, redirectUri, state);
      return c.json({ flow: "redirect", authUrl, state });
    }
    return c.json({ error: `Unknown provider: ${provider}` }, 400);
  });
  app.get("/:provider/callback", async (c) => {
    const { dataDir } = c.get("project");
    const provider = c.req.param("provider");
    const code = c.req.query("code");
    const error = c.req.query("error");
    if (error) {
      return c.html(`<html><body><script>window.close();</script><p>Authorization denied: ${error}</p></body></html>`);
    }
    if (!code) {
      return c.json({ error: "Missing authorization code" }, 400);
    }
    const port = process.env.PORT ?? "19432";
    const redirectUri = `http://localhost:${port}/api/connections/${provider}/callback`;
    try {
      if (provider === "github") {
        const clientId = process.env.HASHMARK_GITHUB_CLIENT_ID;
        const clientSecret = process.env.HASHMARK_GITHUB_CLIENT_SECRET;
        if (!clientId || !clientSecret) return c.json({ error: "GitHub OAuth not configured" }, 400);
        const tokenData = await exchangeCodeForToken(clientId, clientSecret, code, redirectUri);
        if (!tokenData.access_token) return c.json({ error: tokenData.error ?? "Token exchange failed" }, 400);
        const user = await fetchGitHubUser(tokenData.access_token);
        storeGitHubToken(dataDir, tokenData.access_token, user);
        return c.html(`<html><body><script>window.close();</script><p>Connected as @${user.login}. You can close this tab.</p></body></html>`);
      }
      if (provider === "linear") {
        const clientId = process.env.HASHMARK_LINEAR_CLIENT_ID;
        const clientSecret = process.env.HASHMARK_LINEAR_CLIENT_SECRET;
        if (!clientId || !clientSecret) return c.json({ error: "Linear OAuth not configured" }, 400);
        const tokenData = await exchangeLinearCode({ clientId, clientSecret, redirectUri }, code);
        const user = await fetchLinearUser(tokenData.access_token);
        storeLinearToken(dataDir, tokenData.access_token, user);
        return c.html(`<html><body><script>window.close();</script><p>Connected to Linear as ${user.name}. You can close this tab.</p></body></html>`);
      }
      return c.json({ error: `Unknown provider: ${provider}` }, 400);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "OAuth callback failed" }, 500);
    }
  });
  registerGithubRoutes(app);
  return app;
}
function getToken(dataDir, provider) {
  const db = getDb(dataDir);
  const row = db.prepare("SELECT token FROM connections WHERE provider = ? AND enabled = 1").get(provider);
  return row?.token ?? null;
}

// server/routes/skills.ts
import { Hono as Hono22 } from "hono";
import { existsSync as existsSync29, readFileSync as readFileSync21, readdirSync as readdirSync6 } from "fs";
import { join as join33, relative as relative7 } from "path";
function discoverSkills(projectDir) {
  const skills = [];
  const dirs = [
    { dir: join33(projectDir, ".claude", "agents"), source: "project" },
    { dir: join33(process.env.HOME || "", ".claude", "agents"), source: "global" }
  ];
  for (const { dir, source } of dirs) {
    if (!existsSync29(dir)) continue;
    walkSkills(dir, dir, source, skills);
  }
  return skills;
}
function walkSkills(root, dir, source, skills) {
  let entries;
  try {
    entries = readdirSync6(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      walkSkills(root, join33(dir, entry.name), source, skills);
    } else if (entry.name.endsWith(".md") && entry.name !== "INDEX.md" && entry.name !== "README.md") {
      const fullPath = join33(dir, entry.name);
      const relPath = relative7(root, fullPath);
      try {
        const content = readFileSync21(fullPath, "utf-8");
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        const descMatch = content.match(/^description:\s*(.+)$/m);
        skills.push({
          id: relPath.replace(/\.md$/, "").replace(/\//g, "-"),
          name: nameMatch?.[1]?.trim() ?? entry.name.replace(/\.md$/, ""),
          description: descMatch?.[1]?.trim() ?? "",
          path: relPath,
          source
        });
      } catch {
      }
    }
  }
}
function skillsRoutes() {
  const app = new Hono22();
  app.get("/", (c) => {
    const { projectDir, dataDir } = c.get("project");
    const discovered = discoverSkills(projectDir);
    const db = getDb(dataDir);
    const registered = db.prepare("SELECT * FROM skills").all();
    const regMap = new Map(registered.map((r) => [r.id, r]));
    const skills = discovered.map((s) => {
      const reg = regMap.get(s.id);
      return {
        ...s,
        enabled: reg ? !!reg.enabled : true,
        config: reg ? JSON.parse(reg.config) : {},
        registered: !!reg
      };
    });
    return c.json({ skills });
  });
  app.post("/:id/toggle", async (c) => {
    const { projectDir, dataDir } = c.get("project");
    const id = c.req.param("id");
    const body = await c.req.json();
    const db = getDb(dataDir);
    const now = Date.now();
    const existing = db.prepare("SELECT id FROM skills WHERE id = ?").get(id);
    if (existing) {
      db.prepare("UPDATE skills SET enabled = ?, updated_at = ? WHERE id = ?").run(body.enabled ? 1 : 0, now, id);
    } else {
      const discovered = discoverSkills(projectDir).find((s) => s.id === id);
      if (!discovered) return c.json({ error: "Skill not found" }, 404);
      db.prepare("INSERT INTO skills (id, name, description, source, path, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, discovered.name, discovered.description, discovered.source, discovered.path, body.enabled ? 1 : 0, now, now);
    }
    return c.json({ ok: true });
  });
  app.get("/:id/content", (c) => {
    const { projectDir } = c.get("project");
    const id = c.req.param("id");
    const discovered = discoverSkills(projectDir).find((s) => s.id === id);
    if (!discovered) return c.json({ error: "Not found" }, 404);
    const dirs = [
      join33(projectDir, ".claude", "agents"),
      join33(process.env.HOME || "", ".claude", "agents")
    ];
    for (const dir of dirs) {
      const fullPath = join33(dir, discovered.path);
      if (existsSync29(fullPath)) {
        return c.json({ content: readFileSync21(fullPath, "utf-8") });
      }
    }
    return c.json({ error: "File not found" }, 404);
  });
  return app;
}

// server/routes/test-runner.ts
import { Hono as Hono23 } from "hono";

// server/lib/test-runner.ts
import { spawn as spawn13 } from "child_process";
import { existsSync as existsSync30, readFileSync as readFileSync22 } from "fs";
import { join as join34 } from "path";
function detectTestCommand(projectDir) {
  const pkgPath = join34(projectDir, "package.json");
  if (!existsSync30(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync22(pkgPath, "utf-8"));
    const scripts = pkg.scripts;
    if (!scripts) return null;
    if (scripts.test && !scripts.test.includes("no test specified")) return "npm test";
    if (scripts["test:unit"]) return "npm run test:unit";
    if (scripts.typecheck) return "npm run typecheck";
    if (scripts.build) return "npm run build";
    if (scripts.lint) return "npm run lint";
    return null;
  } catch {
    return null;
  }
}
var MAX_OUTPUT = 4e3;
var TIMEOUT = 12e4;
function runTests(projectDir, command) {
  const cmd = command ?? detectTestCommand(projectDir);
  if (!cmd) {
    return Promise.resolve({
      success: true,
      output: "No test command found in package.json",
      command: "(none)",
      exitCode: 0,
      elapsed: 0
    });
  }
  const start = Date.now();
  return new Promise((resolve4) => {
    let output = "";
    const proc = spawn13(cmd, {
      cwd: projectDir,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      output += "\n(timed out after 2 minutes)";
    }, TIMEOUT);
    proc.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    proc.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve4({
        success: code === 0,
        output: output.slice(-MAX_OUTPUT),
        command: cmd,
        exitCode: code ?? 1,
        elapsed: Date.now() - start
      });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve4({
        success: false,
        output: err.message,
        command: cmd,
        exitCode: 1,
        elapsed: Date.now() - start
      });
    });
  });
}

// server/routes/test-runner.ts
function testRunnerRoutes() {
  const app = new Hono23();
  app.get("/detect", (c) => {
    const { projectDir } = c.get("project");
    const command = detectTestCommand(projectDir);
    return c.json({ command, available: command !== null });
  });
  app.post("/run", async (c) => {
    const { projectDir } = c.get("project");
    const body = await c.req.json().catch(() => ({ command: void 0 }));
    const SAFE_PREFIXES = ["npm test", "npm run test", "npm run typecheck", "npm run build", "npm run lint"];
    if (body.command) {
      const isSafe = SAFE_PREFIXES.some((prefix) => body.command.startsWith(prefix));
      if (!isSafe) {
        return c.json({ error: "Only standard npm test/build/lint commands are allowed" }, 400);
      }
    }
    const result = await runTests(projectDir, body.command);
    return c.json(result);
  });
  return app;
}

// server/routes/review-confidence.ts
import { Hono as Hono24 } from "hono";
function logEvent2(dataDir, reviewId, eventType, author, data = {}) {
  const db = getDb(dataDir);
  db.prepare("INSERT INTO review_events (review_id, event_type, author, data, created_at) VALUES (?, ?, ?, ?, ?)").run(reviewId, eventType, author, JSON.stringify(data), Date.now());
}
function reviewConfidenceRoutes() {
  const app = new Hono24();
  app.post("/confidence", async (c) => {
    const { dataDir } = c.get("project");
    const body = await c.req.json().catch(() => ({ files: [] }));
    if (!body.files?.length) return c.json({ confidence: 0 });
    const db = getDb(dataDir);
    const allStats = db.prepare(`
      SELECT status, COUNT(*) as count FROM reviews
      WHERE status IN ('approved', 'rejected')
      GROUP BY status
    `).all();
    const totalApproved = allStats.find((s) => s.status === "approved")?.count ?? 0;
    const totalRejected = allStats.find((s) => s.status === "rejected")?.count ?? 0;
    const totalReviewed = totalApproved + totalRejected;
    if (totalReviewed < 3) return c.json({ confidence: 0, reason: "not enough history" });
    const baseRate = totalApproved / totalReviewed;
    const highRisk = body.files.some(
      (f) => /\b(auth|billing|payment|migration|security|secret|credential|env)\b/i.test(f)
    );
    const score = highRisk ? Math.min(baseRate * 100, 30) : Math.round(baseRate * 100);
    return c.json({ confidence: score, reviewed: totalReviewed, highRisk });
  });
  app.post("/:id/auto-evaluate", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const id = c.req.param("id");
    const review = db.prepare("SELECT * FROM reviews WHERE id = ?").get(id);
    if (!review) return c.json({ error: "Not found" }, 404);
    const pathParts = review.file_path.split("/");
    const dir = pathParts.slice(0, -1).join("/") || "/";
    const ext = review.file_path.split(".").pop() || "";
    const dirStats = db.prepare(`
      SELECT status, COUNT(*) as count FROM reviews
      WHERE file_path LIKE ? AND status IN ('approved', 'rejected')
      GROUP BY status
    `).all(`${dir}%`);
    const extStats = db.prepare(`
      SELECT status, COUNT(*) as count FROM reviews
      WHERE file_path LIKE ? AND status IN ('approved', 'rejected')
      GROUP BY status
    `).all(`%.${ext}`);
    const agentStats = db.prepare(`
      SELECT status, COUNT(*) as count FROM reviews
      WHERE agent_name = ? AND status IN ('approved', 'rejected')
      GROUP BY status
    `).all(review.agent_name);
    function approvalRate(stats) {
      const approved = stats.find((s) => s.status === "approved")?.count ?? 0;
      const rejected = stats.find((s) => s.status === "rejected")?.count ?? 0;
      const total = approved + rejected;
      if (total === 0) return 0.5;
      return approved / total;
    }
    const dirRate = approvalRate(dirStats);
    const extRate = approvalRate(extStats);
    const agentRate = approvalRate(agentStats);
    const totalReviewed = dirStats.reduce((s, r) => s + r.count, 0);
    const confidence = totalReviewed < 3 ? 0 : dirRate * 0.5 + extRate * 0.2 + agentRate * 0.3;
    const highRisk = /\b(auth|billing|payment|migration|security|secret|credential|env)\b/i.test(review.file_path);
    const score = highRisk ? Math.min(confidence, 0.3) : confidence;
    db.prepare("UPDATE reviews SET confidence_score = ? WHERE id = ?").run(score, id);
    let autoApproved = false;
    if (review.review_policy_id) {
      const policy = db.prepare("SELECT auto_approve_threshold FROM review_policies WHERE id = ?").get(review.review_policy_id);
      if (policy && policy.auto_approve_threshold > 0 && score >= policy.auto_approve_threshold) {
        db.prepare("UPDATE reviews SET status = 'approved', reviewed_at = ? WHERE id = ? AND status = 'pending'").run(Date.now(), id);
        logEvent2(dataDir, id, "auto_approved", "system", { confidence: score, threshold: policy.auto_approve_threshold });
        autoApproved = true;
      }
    }
    return c.json({
      confidence: Math.round(score * 100),
      breakdown: {
        directory: Math.round(dirRate * 100),
        extension: Math.round(extRate * 100),
        agent: Math.round(agentRate * 100),
        reviewedCount: totalReviewed
      },
      highRisk,
      autoApproved
    });
  });
  return app;
}

// server/routes/analytics.ts
import { Hono as Hono25 } from "hono";
function analyticsRoutes() {
  const app = new Hono25();
  app.get("/costs", (c) => {
    const { dataDir } = c.get("project");
    try {
      const db = getDb(dataDir);
      const runs = db.prepare(`
        SELECT
          id,
          COALESCE(agent_name, 'Chat') as agent_name,
          COALESCE(total_input_tokens, 0) as input_tokens,
          COALESCE(total_output_tokens, 0) as output_tokens,
          created_at
        FROM sessions
        WHERE total_input_tokens > 0 OR total_output_tokens > 0
        ORDER BY created_at DESC
        LIMIT 200
      `).all();
      return c.json({ runs });
    } catch {
      return c.json({ runs: [] });
    }
  });
  app.get("/patterns", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const byModel = db.prepare(`
      SELECT model,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'idle' AND total_output_tokens > 0 THEN 1 ELSE 0 END) as succeeded,
        ROUND(AVG(cost_usd), 4) as avg_cost,
        ROUND(AVG(total_input_tokens + total_output_tokens), 0) as avg_tokens
      FROM sessions
      WHERE total_output_tokens > 0
      GROUP BY model
      ORDER BY total DESC
    `).all();
    const byAgent = db.prepare(`
      SELECT COALESCE(agent_name, 'default') as agent,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'idle' AND total_output_tokens > 0 THEN 1 ELSE 0 END) as succeeded,
        ROUND(AVG(cost_usd), 4) as avg_cost
      FROM sessions
      WHERE total_output_tokens > 0
      GROUP BY agent_name
      ORDER BY total DESC
      LIMIT 10
    `).all();
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1e3;
    const reviewTrend = db.prepare(`
      SELECT
        CAST((created_at - ?) / (7 * 24 * 60 * 60 * 1000) AS INTEGER) as week,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM reviews
      WHERE created_at >= ?
      GROUP BY week
      ORDER BY week ASC
    `).all(thirtyDaysAgo, thirtyDaysAgo);
    const promptPatterns = db.prepare(`
      SELECT SUBSTR(content, 1, 40) as prefix,
        COUNT(*) as count
      FROM session_messages
      WHERE role = 'user' AND LENGTH(content) > 10
      GROUP BY SUBSTR(content, 1, 40)
      HAVING count >= 2
      ORDER BY count DESC
      LIMIT 10
    `).all();
    const byHour = db.prepare(`
      SELECT CAST((created_at / 3600000) % 24 AS INTEGER) as hour,
        COUNT(*) as count
      FROM sessions
      GROUP BY hour
      ORDER BY hour ASC
    `).all();
    const costSummary = db.prepare(`
      SELECT
        COALESCE(SUM(cost_usd), 0) as total_cost,
        COUNT(*) as total_sessions,
        ROUND(AVG(cost_usd), 4) as avg_cost_per_session,
        ROUND(AVG(total_input_tokens + total_output_tokens), 0) as avg_tokens_per_session
      FROM sessions
      WHERE total_output_tokens > 0
    `).get();
    return c.json({
      byModel,
      byAgent,
      reviewTrend,
      promptPatterns,
      byHour,
      costSummary
    });
  });
  app.get("/suggestions", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const successfulPrompts = db.prepare(`
      SELECT sm.content as prompt, s.model, s.agent_name
      FROM session_messages sm
      JOIN sessions s ON s.id = sm.session_id
      WHERE sm.role = 'user'
        AND sm.sent_at IS NOT NULL
        AND LENGTH(sm.content) > 20
        AND LENGTH(sm.content) < 500
      ORDER BY sm.created_at DESC
      LIMIT 20
    `).all();
    const seen = /* @__PURE__ */ new Set();
    const unique = successfulPrompts.filter((p) => {
      const key = p.prompt.slice(0, 30).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);
    return c.json({ suggestions: unique });
  });
  return app;
}

// server/routes/projects.ts
import { Hono as Hono26 } from "hono";
import { existsSync as existsSync31, readFileSync as readFileSync23 } from "fs";
import { join as join35, basename as basename7 } from "path";
function projectRoutes(defaultProjectDir) {
  const app = new Hono26();
  app.get("/status", (c) => {
    const projects = getAllProjectHealth();
    return c.json({ projects });
  });
  app.post("/rescan", async (c) => {
    const body = await c.req.json().catch(() => ({ id: void 0 }));
    const id = body.id || registry.activeId;
    if (id) await rescanProject(id);
    return c.json({ ok: true });
  });
  app.post("/connect", async (c) => {
    const body = await c.req.json().catch(() => ({ path: "" }));
    if (!body.path) return c.json({ error: "path required" }, 400);
    const handle = registry.register(body.path);
    return c.json({ ok: true, project: handle });
  });
  app.post("/disconnect", async (c) => {
    const body = await c.req.json().catch(() => ({ id: "" }));
    if (!body.id) return c.json({ error: "id required" }, 400);
    registry.remove(body.id);
    return c.json({ ok: true });
  });
  app.post("/switch", async (c) => {
    const body = await c.req.json().catch(() => ({ id: "" }));
    if (!body.id || !registry.get(body.id)) return c.json({ error: "unknown project" }, 400);
    registry.activeId = body.id;
    return c.json({ ok: true, activeId: body.id });
  });
  return app;
}
function infoRoutes(defaultProjectDir, port) {
  const app = new Hono26();
  app.get("/", async (c) => {
    const handle = c.get("project");
    const pDir = handle?.projectDir ?? defaultProjectDir;
    const pkgPath = join35(pDir, "package.json");
    let projectName = basename7(pDir);
    try {
      if (existsSync31(pkgPath)) {
        const pkg = JSON.parse(readFileSync23(pkgPath, "utf-8"));
        projectName = pkg.name ?? projectName;
      }
    } catch {
    }
    return c.json({
      projectName,
      projectDir: pDir,
      configured: pDir !== "__unset__",
      nodeVersion: process.versions.node,
      port
    });
  });
  return app;
}
function settingsRoutes(defaultProjectDir) {
  const app = new Hono26();
  app.get("/env", async (c) => {
    const vars = [];
    const seen = /* @__PURE__ */ new Set();
    const handle = c.get("project");
    const pDir = handle?.projectDir ?? defaultProjectDir;
    for (const fname of [".env.local", ".env"]) {
      const filePath = join35(pDir, fname);
      if (!existsSync31(filePath)) continue;
      try {
        for (const line of readFileSync23(filePath, "utf-8").split("\n")) {
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
  return app;
}

// server/routes/model-registry.ts
import { Hono as Hono27 } from "hono";

// server/lib/model-registry.ts
import { existsSync as existsSync32, readFileSync as readFileSync24, writeFileSync as writeFileSync12, mkdirSync as mkdirSync14 } from "fs";
import { join as join36 } from "path";
import { homedir as homedir5 } from "os";
var CACHE_DIR = join36(homedir5(), ".cache", "hashmark");
var CACHE_FILE = join36(CACHE_DIR, "models.json");
var MODELS_DEV_URL = "https://models.dev/api.json";
var CACHE_TTL_MS = 60 * 60 * 1e3;
var _registry = null;
function parseCapabilities(raw) {
  const caps = [];
  if (raw.tool_call) caps.push("tools");
  if (raw.reasoning) caps.push("reasoning");
  if (raw.attachment) caps.push("vision");
  if (raw.modalities?.input?.includes("image")) caps.push("vision");
  if (raw.modalities?.input?.includes("audio")) caps.push("audio");
  return [...new Set(caps)];
}
function parseRegistry(raw) {
  const providers = /* @__PURE__ */ new Map();
  for (const [providerId, providerData] of Object.entries(raw)) {
    if (!providerData?.models) continue;
    const entries = [];
    for (const rawModel of Object.values(providerData.models)) {
      if (!rawModel?.id || !rawModel?.name) continue;
      entries.push({
        id: rawModel.id,
        name: rawModel.name,
        provider: providerId,
        inputCost: rawModel.cost?.input ?? 0,
        outputCost: rawModel.cost?.output ?? 0,
        contextWindow: rawModel.limit?.context ?? 0,
        outputLimit: rawModel.limit?.output ?? 0,
        releaseDate: rawModel.release_date,
        capabilities: parseCapabilities(rawModel),
        isFree: (rawModel.cost?.input ?? 0) === 0 && (rawModel.cost?.output ?? 0) === 0
      });
    }
    if (entries.length > 0) {
      providers.set(providerId, entries);
    }
  }
  return { providers, lastUpdated: Date.now() };
}
function toSerialized(reg) {
  const providers = {};
  for (const [k, v] of reg.providers) providers[k] = v;
  return { lastUpdated: reg.lastUpdated, providers };
}
function fromSerialized(s) {
  const providers = /* @__PURE__ */ new Map();
  for (const [k, v] of Object.entries(s.providers)) providers.set(k, v);
  return { providers, lastUpdated: s.lastUpdated };
}
function readCache() {
  try {
    if (!existsSync32(CACHE_FILE)) return null;
    const raw = JSON.parse(readFileSync24(CACHE_FILE, "utf-8"));
    if (!raw.lastUpdated || !raw.providers) return null;
    return fromSerialized(raw);
  } catch {
    return null;
  }
}
function writeCache(reg) {
  try {
    if (!existsSync32(CACHE_DIR)) mkdirSync14(CACHE_DIR, { recursive: true });
    writeFileSync12(CACHE_FILE, JSON.stringify(toSerialized(reg), null, 2), "utf-8");
  } catch (err) {
    console.warn("[model-registry] failed to write cache:", err);
  }
}
async function fetchRegistry() {
  const res = await fetch(MODELS_DEV_URL, {
    headers: { "User-Agent": "hashmark-studio/1.0" },
    signal: AbortSignal.timeout(15e3)
  });
  if (!res.ok) throw new Error(`models.dev returned ${res.status}`);
  const raw = await res.json();
  const reg = parseRegistry(raw);
  writeCache(reg);
  return reg;
}
async function getRegistry() {
  if (_registry && Date.now() - _registry.lastUpdated < CACHE_TTL_MS) {
    return _registry;
  }
  const cached = readCache();
  if (cached && Date.now() - cached.lastUpdated < CACHE_TTL_MS) {
    _registry = cached;
    return _registry;
  }
  try {
    _registry = await fetchRegistry();
    return _registry;
  } catch (err) {
    console.warn("[model-registry] fetch failed, using stale cache:", err);
    if (cached) {
      _registry = cached;
      return _registry;
    }
    return { providers: /* @__PURE__ */ new Map(), lastUpdated: Date.now() };
  }
}
async function getModelsForProvider(providerId) {
  const reg = await getRegistry();
  return reg.providers.get(providerId) ?? [];
}
async function getAllProviders() {
  const reg = await getRegistry();
  const result = [];
  for (const [id, models] of reg.providers) {
    result.push({ id, name: id, modelCount: models.length });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
async function refreshRegistry() {
  _registry = null;
  try {
    _registry = await fetchRegistry();
    return _registry;
  } catch (err) {
    throw new Error(`Registry refresh failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// server/routes/model-registry.ts
function modelRegistryRoutes() {
  const app = new Hono27();
  app.get("/registry", async (c) => {
    try {
      const reg = await getRegistry();
      const out = {};
      for (const [id, models] of reg.providers) out[id] = models;
      return c.json({ providers: out, lastUpdated: reg.lastUpdated });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });
  app.get("/providers", async (c) => {
    try {
      const providers = await getAllProviders();
      return c.json({ providers });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });
  app.get("/providers/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const models = await getModelsForProvider(id);
      return c.json({ provider: id, models });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });
  app.post("/refresh", async (c) => {
    try {
      const reg = await refreshRegistry();
      return c.json({ ok: true, providerCount: reg.providers.size, lastUpdated: reg.lastUpdated });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });
  return app;
}

// server/routes/custom-providers.ts
import { Hono as Hono28 } from "hono";
import { randomUUID as randomUUID15 } from "crypto";
function toPublic(row) {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    hasKey: Boolean(row.api_key),
    models: row.model_ids ? row.model_ids.split(",").map((s) => s.trim()).filter(Boolean) : [],
    created_at: row.created_at
  };
}
function customProvidersRoutes() {
  const app = new Hono28();
  app.get("/", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const rows = db.prepare("SELECT * FROM custom_providers ORDER BY created_at ASC").all();
    return c.json({ providers: rows.map(toPublic) });
  });
  app.post("/", async (c) => {
    const { dataDir } = c.get("project");
    const body = await c.req.json();
    if (!body.name?.trim()) return c.json({ error: "name required" }, 400);
    if (!body.baseUrl?.trim()) return c.json({ error: "baseUrl required" }, 400);
    const db = getDb(dataDir);
    const now = Date.now();
    if (body.id) {
      const existing = db.prepare("SELECT id FROM custom_providers WHERE id = ?").get(body.id);
      if (!existing) return c.json({ error: "Provider not found" }, 404);
      db.prepare(`
        UPDATE custom_providers
        SET name = ?, base_url = ?, api_key = ?, model_ids = ?
        WHERE id = ?
      `).run(
        body.name.trim(),
        body.baseUrl.trim(),
        body.apiKey ?? "",
        body.modelIds ?? "",
        body.id
      );
      const updated = db.prepare("SELECT * FROM custom_providers WHERE id = ?").get(body.id);
      return c.json({ provider: toPublic(updated) });
    }
    const id = randomUUID15();
    db.prepare(`
      INSERT INTO custom_providers (id, name, base_url, api_key, model_ids, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.name.trim(),
      body.baseUrl.trim(),
      body.apiKey ?? "",
      body.modelIds ?? "",
      now
    );
    const created = db.prepare("SELECT * FROM custom_providers WHERE id = ?").get(id);
    return c.json({ provider: toPublic(created) }, 201);
  });
  app.delete("/:id", (c) => {
    const { dataDir } = c.get("project");
    const id = c.req.param("id");
    const db = getDb(dataDir);
    const existing = db.prepare("SELECT id FROM custom_providers WHERE id = ?").get(id);
    if (!existing) return c.json({ error: "Provider not found" }, 404);
    db.prepare("DELETE FROM custom_providers WHERE id = ?").run(id);
    return c.json({ ok: true });
  });
  return app;
}

// server/routes/oauth.ts
import { Hono as Hono29 } from "hono";
import { createServer as createHttpServer } from "http";
import { URL as URL2 } from "url";
import { randomUUID as randomUUID16 } from "crypto";

// server/lib/oauth-chatgpt.ts
import { randomBytes, createHash as createHash4 } from "crypto";
import { readFileSync as readFileSync25, writeFileSync as writeFileSync13, mkdirSync as mkdirSync15, existsSync as existsSync33, unlinkSync as unlinkSync4 } from "fs";
import { homedir as homedir6 } from "os";
import { join as join37 } from "path";
var CHATGPT_CONFIG = {
  // NOTE: placeholder -- register at https://platform.openai.com/docs/oauth
  clientId: "app_chatgpt_hashmark",
  authorizationEndpoint: "https://auth.openai.com/authorize",
  tokenEndpoint: "https://auth.openai.com/oauth/token",
  redirectUri: "http://localhost:19432/oauth/callback",
  scopes: ["openid", "profile", "model.request"]
};
function generatePKCE() {
  const verifier = randomBytes(48).toString("base64url").slice(0, 96);
  const challenge = createHash4("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
function getAuthUrl(state, pkce, config = CHATGPT_CONFIG) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    state,
    scope: config.scopes.join(" ")
  });
  return `${config.authorizationEndpoint}?${params.toString()}`;
}
async function exchangeCode(code, verifier, config = CHATGPT_CONFIG) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
    client_id: config.clientId
  });
  const res = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString()
  });
  const data = await res.json();
  if (data.error || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? `Token exchange failed (${res.status})`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1e3
  };
}
function tokenPath() {
  return join37(homedir6(), ".hashmark", "auth", "chatgpt.json");
}
function saveTokens(tokens, email) {
  const dir = join37(homedir6(), ".hashmark", "auth");
  if (!existsSync33(dir)) mkdirSync15(dir, { recursive: true });
  const data = { ...tokens, email };
  writeFileSync13(tokenPath(), JSON.stringify(data, null, 2), { mode: 384 });
}
function loadTokens() {
  try {
    if (!existsSync33(tokenPath())) return null;
    const raw = readFileSync25(tokenPath(), "utf-8");
    const data = JSON.parse(raw);
    if (!data.accessToken || !data.refreshToken) return null;
    return data;
  } catch {
    return null;
  }
}
function clearTokens() {
  try {
    if (existsSync33(tokenPath())) unlinkSync4(tokenPath());
  } catch {
  }
}

// server/lib/oauth-copilot.ts
import { existsSync as existsSync34, readFileSync as readFileSync26, writeFileSync as writeFileSync14, mkdirSync as mkdirSync16, unlinkSync as unlinkSync5 } from "fs";
import { join as join38 } from "path";
var COPILOT_CLIENT_ID = "Iv1.b507a08c87ecfe98";
var COPILOT_SCOPE = "read:user";
function authFilePath(dataDir) {
  return join38(dataDir, "copilot-oauth.json");
}
function loadCopilotAuth(dataDir) {
  const path = authFilePath(dataDir);
  if (!existsSync34(path)) return null;
  try {
    return JSON.parse(readFileSync26(path, "utf-8"));
  } catch {
    return null;
  }
}
function saveCopilotAuth(dataDir, auth) {
  if (!existsSync34(dataDir)) mkdirSync16(dataDir, { recursive: true });
  writeFileSync14(authFilePath(dataDir), JSON.stringify(auth, null, 2), { encoding: "utf-8", mode: 384 });
}
function deleteCopilotAuth(dataDir) {
  const path = authFilePath(dataDir);
  if (existsSync34(path)) unlinkSync5(path);
}
async function startDeviceFlow2() {
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: COPILOT_CLIENT_ID, scope: COPILOT_SCOPE })
  });
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  const data = await res.json();
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in ?? 900,
    interval: data.interval ?? 5
  };
}
async function pollDeviceCode(deviceCode) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: COPILOT_CLIENT_ID,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    })
  });
  const data = await res.json();
  if (data.error === "authorization_pending") return { status: "pending" };
  if (data.error === "slow_down") return { status: "slow_down", newInterval: data.interval ?? 10 };
  if (data.error === "access_denied") return { status: "denied" };
  if (data.error === "expired_token") return { status: "expired" };
  if (!data.access_token) return { status: "pending" };
  return {
    status: "approved",
    tokens: {
      githubToken: data.access_token,
      tokenType: data.token_type ?? "bearer",
      scope: data.scope ?? COPILOT_SCOPE
    }
  };
}
async function getCopilotToken(githubToken) {
  const res = await fetch("https://api.github.com/copilot_internal/v2/token", {
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: "application/json",
      "Editor-Version": "hashmark/1.0",
      "Copilot-Integration-Id": "vscode-chat"
    }
  });
  if (!res.ok) throw new Error(`Copilot token exchange failed: ${res.status}`);
  const data = await res.json();
  return data.token;
}
async function getGithubLogin(githubToken) {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github.v3+json" }
  });
  if (!res.ok) return "unknown";
  const user = await res.json();
  return user.login;
}

// server/routes/oauth.ts
var CALLBACK_PORT = 19432;
var pendingFlows = /* @__PURE__ */ new Map();
function cleanExpiredFlows() {
  const now = Date.now();
  for (const [k, v] of pendingFlows) {
    if (now > v.expiresAt) pendingFlows.delete(k);
  }
}
function callbackHtml(title, message, success) {
  const color = success ? "#10b981" : "#ef4444";
  return `<!DOCTYPE html><html><head><title>${title}</title>
<style>body{background:#09090b;color:#a1a1aa;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{text-align:center;max-width:400px}h2{color:${color};margin-bottom:8px}p{font-size:14px;opacity:.7}</style></head>
<body><div class="box"><h2>${title}</h2><p>${message}</p></div></body></html>`;
}
function startCallbackServer(expectedState, onCode, onError) {
  let resolved = false;
  const server = createHttpServer((req, res) => {
    if (resolved) {
      res.end();
      return;
    }
    try {
      const url = new URL2(req.url ?? "/", `http://localhost:${CALLBACK_PORT}`);
      if (url.pathname !== "/oauth/callback") {
        res.end();
        return;
      }
      const errorParam = url.searchParams.get("error");
      if (errorParam) {
        resolved = true;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(callbackHtml("Authorization failed", errorParam, false));
        server.close();
        onError(errorParam);
        return;
      }
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      if (state !== expectedState || !code) {
        resolved = true;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(callbackHtml("Invalid callback", "state mismatch or missing code", false));
        server.close();
        onError("state mismatch or missing code");
        return;
      }
      resolved = true;
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(callbackHtml("Connected", "You can close this tab and return to hashmark.", true));
      server.close();
      onCode(code);
    } catch (err) {
      res.end();
      if (!resolved) {
        resolved = true;
        server.close();
        onError(err instanceof Error ? err.message : "callback error");
      }
    }
  });
  server.listen(CALLBACK_PORT, "127.0.0.1", () => {
  });
  setTimeout(() => {
    if (!resolved) {
      resolved = true;
      server.close();
      onError("OAuth callback timed out");
    }
  }, 5 * 60 * 1e3);
}
var copilotFlows = /* @__PURE__ */ new Map();
function oauthRoutes() {
  const app = new Hono29();
  app.get("/chatgpt/start", async (c) => {
    cleanExpiredFlows();
    const pkce = generatePKCE();
    const state = randomUUID16().replace(/-/g, "");
    pendingFlows.set(state, {
      verifier: pkce.verifier,
      expiresAt: Date.now() + 10 * 60 * 1e3
    });
    const authUrl = getAuthUrl(state, pkce);
    new Promise((resolve4, reject) => {
      startCallbackServer(
        state,
        async (code) => {
          const flow = pendingFlows.get(state);
          pendingFlows.delete(state);
          if (!flow) {
            reject(new Error("flow not found"));
            return;
          }
          try {
            const tokens = await exchangeCode(code, flow.verifier);
            saveTokens(tokens);
            resolve4();
          } catch (err) {
            reject(err);
          }
        },
        (errMsg) => reject(new Error(errMsg))
      );
    }).catch(() => {
    });
    if (typeof process !== "undefined" && process.versions?.electron) {
      try {
        const { shell } = await import("./electron-PCBP3BFH.js");
        await shell.openExternal(authUrl);
      } catch {
      }
    }
    return c.json({ authUrl, state });
  });
  app.get("/chatgpt/status", (c) => {
    const stored = loadTokens();
    if (!stored) return c.json({ connected: false });
    const expired = Date.now() > stored.expiresAt;
    return c.json({ connected: !expired, email: stored.email, expiresAt: stored.expiresAt });
  });
  app.post("/chatgpt/disconnect", (c) => {
    clearTokens();
    return c.json({ ok: true });
  });
  app.get("/chatgpt/config", (c) => {
    return c.json({
      clientId: CHATGPT_CONFIG.clientId,
      scopes: CHATGPT_CONFIG.scopes,
      redirectUri: CHATGPT_CONFIG.redirectUri,
      registered: CHATGPT_CONFIG.clientId !== "app_chatgpt_hashmark"
    });
  });
  app.post("/copilot/start", async (c) => {
    const { dataDir } = c.get("project");
    try {
      const flow = await startDeviceFlow2();
      copilotFlows.set(flow.deviceCode, {
        deviceCode: flow.deviceCode,
        interval: flow.interval,
        expiresAt: Date.now() + flow.expiresIn * 1e3,
        dataDir
      });
      return c.json({
        deviceCode: flow.deviceCode,
        userCode: flow.userCode,
        verificationUri: flow.verificationUri,
        expiresIn: flow.expiresIn,
        interval: flow.interval
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Failed to start device flow" }, 502);
    }
  });
  app.get("/copilot/poll", async (c) => {
    const deviceCode = c.req.query("deviceCode");
    if (!deviceCode) return c.json({ error: "deviceCode required" }, 400);
    const entry = copilotFlows.get(deviceCode);
    if (!entry) return c.json({ status: "not_found" });
    if (Date.now() > entry.expiresAt) {
      copilotFlows.delete(deviceCode);
      return c.json({ status: "expired" });
    }
    try {
      const result = await pollDeviceCode(deviceCode);
      if (result.status === "slow_down") {
        entry.interval = result.newInterval;
        return c.json({ status: "pending", interval: result.newInterval });
      }
      if (result.status === "pending") {
        return c.json({ status: "pending", interval: entry.interval });
      }
      if (result.status === "denied" || result.status === "expired") {
        copilotFlows.delete(deviceCode);
        return c.json({ status: result.status });
      }
      const { tokens } = result;
      const [login, copilotToken] = await Promise.all([
        getGithubLogin(tokens.githubToken),
        getCopilotToken(tokens.githubToken).catch(() => void 0)
      ]);
      saveCopilotAuth(entry.dataDir, {
        githubToken: tokens.githubToken,
        copilotToken: copilotToken ?? void 0,
        login,
        connectedAt: Date.now()
      });
      copilotFlows.delete(deviceCode);
      return c.json({ status: "connected", login });
    } catch (err) {
      return c.json({ status: "error", error: err instanceof Error ? err.message : "poll failed" }, 502);
    }
  });
  app.get("/copilot/status", (c) => {
    const { dataDir } = c.get("project");
    const auth = loadCopilotAuth(dataDir);
    if (!auth) return c.json({ connected: false });
    return c.json({ connected: true, login: auth.login, connectedAt: auth.connectedAt });
  });
  app.post("/copilot/disconnect", (c) => {
    const { dataDir } = c.get("project");
    deleteCopilotAuth(dataDir);
    return c.json({ ok: true });
  });
  return app;
}

// server/routes/issues.ts
import { Hono as Hono30 } from "hono";
import { randomUUID as randomUUID17 } from "crypto";
function nextIdentifier(dataDir) {
  const db = getDb(dataDir);
  const row = db.prepare(
    "SELECT COALESCE(MAX(CAST(SUBSTR(identifier, 5) AS INTEGER)), 0) as max_num FROM issues WHERE identifier LIKE 'HAS-%'"
  ).get();
  return `HAS-${row.max_num + 1}`;
}
function issuesRoutes() {
  const app = new Hono30();
  app.get("/", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const issues = db.prepare("SELECT * FROM issues ORDER BY created_at DESC").all();
    return c.json({ issues });
  });
  app.get("/:id", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(c.req.param("id"));
    if (!issue) return c.json({ error: "Not found" }, 404);
    return c.json({ issue });
  });
  const VALID_STATUSES = /* @__PURE__ */ new Set(["open", "in_progress", "in_review", "done", "cancelled"]);
  const VALID_PRIORITIES = /* @__PURE__ */ new Set(["critical", "high", "medium", "low"]);
  app.post("/", async (c) => {
    const { dataDir } = c.get("project");
    const body = await c.req.json();
    if (!body.title?.trim()) return c.json({ error: "Title required" }, 400);
    if (body.title.length > 500) return c.json({ error: "Title too long (max 500)" }, 400);
    if (body.description && body.description.length > 1e4) return c.json({ error: "Description too long (max 10000)" }, 400);
    if (body.priority && !VALID_PRIORITIES.has(body.priority)) return c.json({ error: `Invalid priority: ${body.priority}` }, 400);
    const db = getDb(dataDir);
    const id = randomUUID17();
    const identifier = nextIdentifier(dataDir);
    const now = Date.now();
    db.prepare(
      `INSERT INTO issues (id, identifier, title, description, status, priority, agent_name, assignee, run_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', ?, ?, ?, 0, ?, ?)`
    ).run(id, identifier, body.title.trim(), body.description ?? null, body.priority ?? "medium", body.agent_name ?? null, body.agent_name ?? null, now, now);
    const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(id);
    return c.json({ issue }, 201);
  });
  app.patch("/:id", async (c) => {
    const { dataDir } = c.get("project");
    const id = c.req.param("id");
    const body = await c.req.json();
    if (body.title !== void 0 && body.title.length > 500) return c.json({ error: "Title too long (max 500)" }, 400);
    if (body.description !== void 0 && body.description.length > 1e4) return c.json({ error: "Description too long (max 10000)" }, 400);
    if (body.status !== void 0 && !VALID_STATUSES.has(body.status)) return c.json({ error: `Invalid status: ${body.status}` }, 400);
    if (body.priority !== void 0 && !VALID_PRIORITIES.has(body.priority)) return c.json({ error: `Invalid priority: ${body.priority}` }, 400);
    const db = getDb(dataDir);
    const existing = db.prepare("SELECT * FROM issues WHERE id = ?").get(id);
    if (!existing) return c.json({ error: "Not found" }, 404);
    const ALLOWED_FIELDS = /* @__PURE__ */ new Set(["title", "description", "status", "priority", "agent_name", "assignee"]);
    const updates = [];
    const values = [];
    for (const [key, val] of Object.entries(body)) {
      if (val !== void 0 && ALLOWED_FIELDS.has(key)) {
        updates.push(`${key} = ?`);
        values.push(val);
      }
    }
    if (updates.length > 0) {
      updates.push("updated_at = ?");
      values.push(Date.now());
      values.push(id);
      db.prepare(`UPDATE issues SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    }
    const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(id);
    return c.json({ issue });
  });
  app.delete("/:id", (c) => {
    const { dataDir } = c.get("project");
    const db = getDb(dataDir);
    db.prepare("DELETE FROM issues WHERE id = ?").run(c.req.param("id"));
    return c.json({ ok: true });
  });
  return app;
}

// server/lib/file-watcher.ts
import { watch } from "fs";
import { join as join39, relative as relative8 } from "path";
import { execFile as execFileCb12 } from "child_process";
import { promisify as promisify14 } from "util";
var execFile15 = promisify14(execFileCb12);
var IGNORE_PATTERNS = [
  ".git",
  "node_modules",
  "dist",
  ".hashmark",
  "target",
  "__pycache__",
  ".next",
  ".turbo",
  ".vercel",
  "build",
  "coverage"
];
var IDLE_TIMEOUT_MS = 2e3;
var HARD_CEILING_MS = 1e4;
var watcher = null;
var idleTimer = null;
var ceilingTimer = null;
var lastCheckpointTime = 0;
var changeCount = 0;
var enabled = false;
function shouldIgnore(filePath, projectDir) {
  const rel = relative8(projectDir, filePath);
  return IGNORE_PATTERNS.some((p) => rel.startsWith(p) || rel.includes(`/${p}/`));
}
async function createAutoCheckpoint(projectDir) {
  const now = Date.now();
  if (now - lastCheckpointTime < 1e3) return;
  try {
    const { stdout: treeHash } = await execFile15("git", ["write-tree"], { cwd: projectDir });
    const tree = treeHash.trim();
    const { stdout: headHash } = await execFile15("git", ["rev-parse", "HEAD"], { cwd: projectDir });
    const head = headHash.trim();
    const label = `auto-checkpoint (${changeCount} change${changeCount !== 1 ? "s" : ""})`;
    const { stdout: commitHash } = await execFile15(
      "git",
      ["commit-tree", tree, "-p", head, "-m", `studio-checkpoint: ${label}`],
      { cwd: projectDir }
    );
    const commit = commitHash.trim();
    const refName = `refs/studio-checkpoints/auto/${Date.now()}`;
    await execFile15("git", ["update-ref", refName, commit], { cwd: projectDir });
    lastCheckpointTime = now;
    changeCount = 0;
    console.log(`[watcher] auto-checkpoint: ${refName} (${commit.slice(0, 7)})`);
  } catch (err) {
    console.error("[watcher] checkpoint failed:", err instanceof Error ? err.message : err);
  }
}
function scheduleCheckpoint(projectDir) {
  changeCount++;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (ceilingTimer) clearTimeout(ceilingTimer);
    ceilingTimer = null;
    createAutoCheckpoint(projectDir);
  }, IDLE_TIMEOUT_MS);
  if (!ceilingTimer) {
    ceilingTimer = setTimeout(() => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
      ceilingTimer = null;
      createAutoCheckpoint(projectDir);
    }, HARD_CEILING_MS);
  }
}
function startFileWatcher(projectDir) {
  if (watcher || enabled) return;
  enabled = true;
  try {
    watcher = watch(projectDir, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const fullPath = join39(projectDir, filename);
      if (shouldIgnore(fullPath, projectDir)) return;
      scheduleCheckpoint(projectDir);
    });
    watcher.on("error", (err) => {
      console.error("[watcher] error:", err.message);
    });
    console.log("[watcher] watching:", projectDir);
  } catch (err) {
    console.error("[watcher] failed to start:", err instanceof Error ? err.message : err);
  }
}
function stopFileWatcher() {
  if (idleTimer) clearTimeout(idleTimer);
  if (ceilingTimer) clearTimeout(ceilingTimer);
  idleTimer = null;
  ceilingTimer = null;
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  enabled = false;
  console.log("[watcher] stopped");
}

// server/index.ts
function registerStartupWorkspace(projectDir, dataDir) {
  try {
    const db = getDb(dataDir);
    const pkgPath = join40(projectDir, "package.json");
    let name = basename8(projectDir);
    try {
      if (existsSync35(pkgPath)) {
        const pkg = JSON.parse(readFileSync27(pkgPath, "utf-8"));
        if (pkg.name) name = pkg.name;
      }
    } catch {
    }
    const existing = db.prepare("SELECT id FROM workspaces WHERE path = ?").get(projectDir);
    if (existing) {
      db.prepare("UPDATE workspaces SET name = ?, last_opened = ?, is_active = 1 WHERE id = ?").run(name, Date.now(), existing.id);
      db.prepare("UPDATE workspaces SET is_active = 0 WHERE id != ?").run(existing.id);
    } else {
      const id = randomUUID18();
      db.prepare("UPDATE workspaces SET is_active = 0").run();
      db.prepare("INSERT INTO workspaces (id, name, path, last_opened, is_active) VALUES (?, ?, ?, ?, 1)").run(id, name, projectDir, Date.now());
    }
  } catch (err) {
    console.error("[startup] failed to register workspace:", err);
  }
}
function createServer(opts) {
  const app = new Hono31();
  const globalDataDir = `${opts.projectDir}/.hashmark`;
  if (opts.projectDir !== "__unset__") {
    registerStartupWorkspace(opts.projectDir, globalDataDir);
    registry.register(opts.projectDir);
    cleanupOrphanSessions(globalDataDir);
    startFileWatcher(opts.projectDir);
  }
  startScanner();
  startDeletedAgentsCleanup(() => registry.active?.projectDir);
  setStudioPort(opts.port);
  const allowedOrigin = `http://localhost:${opts.port}`;
  app.use("*", cors({ origin: [allowedOrigin, `http://localhost:3201`] }));
  app.use("/api/*", bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: "Request body too large" }, 413) }));
  const apiToken = randomUUID18().replace(/-/g, "");
  setStudioToken(apiToken);
  app.get("/api/auth/token", (c) => c.json({ token: apiToken }));
  app.use("/api/*", async (c, next) => {
    const path = c.req.path;
    if (path === "/api/auth/token" || path === "/api/health" || path === "/api/terminal/token") return next();
    const token = c.req.header("x-studio-token") || c.req.query("token");
    if (token !== apiToken) return c.json({ error: "Unauthorized" }, 401);
    return next();
  });
  const NO_PROJECT_OK = /* @__PURE__ */ new Set(["/api/health", "/api/auth/token", "/api/terminal/token", "/api/info", "/api/projects/status", "/api/projects/connect", "/api/workspaces"]);
  app.use("/api/*", async (c, next) => {
    const projectId2 = c.req.header("x-project-id") || c.req.query("projectId") || registry.activeId;
    const project = projectId2 ? registry.get(projectId2) : registry.active;
    if (project) {
      c.set("project", project);
    } else if (registry.active) {
      c.set("project", registry.active);
    } else {
      const path = c.req.path;
      if (!NO_PROJECT_OK.has(path) && !path.startsWith("/api/projects/") && !path.startsWith("/api/workspaces")) {
        return c.json({ error: "No project connected" }, 400);
      }
    }
    await next();
  });
  app.get("/api/health", (c) => c.json({ ok: true, timestamp: Date.now() }));
  app.route("/api/projects", projectRoutes(opts.projectDir));
  app.route("/api/info", infoRoutes(opts.projectDir, opts.port));
  app.route("/api/settings", settingsRoutes(opts.projectDir));
  app.route("/api/scan", scanRoutes());
  app.route("/api/agents", agentsRoutes());
  app.route("/api/generate", generateRoutes());
  app.route("/api/tasks", tasksRoutes());
  app.route("/api/sessions", sessionsRoutes());
  app.route("/api/files", filesRoutes());
  app.route("/api/workspace", workspaceRoutes());
  app.route("/api/checkpoints", checkpointRoutes());
  app.route("/api/mcp", mcpRoutes());
  app.route("/api/run", runRoutes());
  app.route("/api/swarm", swarmRoutes());
  app.route("/api/company", companyRoutes());
  app.route("/api/drift", driftRoutes());
  app.route("/api/providers", providersRoutes());
  app.route("/api/governance", governanceRoutes());
  app.route("/api/workspaces", workspacesRoutes(globalDataDir));
  app.route("/api/config", configRoutes());
  app.route("/api/reviews", reviewsRoutes());
  app.route("/api/shared-context", sharedContextRoutes());
  app.route("/api/agent-state", agentStateRoutes());
  app.route("/api/connections", connectionsRoutes());
  app.route("/api/skills", skillsRoutes());
  app.route("/api/test", testRunnerRoutes());
  app.route("/api/reviews", reviewConfidenceRoutes());
  app.route("/api/analytics", analyticsRoutes());
  app.route("/api/models", modelRegistryRoutes());
  app.route("/api/providers/custom", customProvidersRoutes());
  app.route("/api/oauth", oauthRoutes());
  app.route("/api/issues", issuesRoutes());
  const wsToken = randomUUID18().replace(/-/g, "");
  setTerminalWSToken(wsToken);
  app.get("/api/terminal/token", (c) => c.json({ token: wsToken }));
  app.use("/*", serveStatic({ root: opts.staticDir }));
  app.get("*", (c) => {
    const indexPath2 = join40(opts.staticDir, "index.html");
    if (existsSync35(indexPath2)) return c.html(readFileSync27(indexPath2, "utf-8"));
    return c.html(`<!DOCTYPE html><html><head><title>hashmark studio</title></head>
      <body style="background:#09090b;color:#71717a;font-family:monospace;padding:40px">
      <h2 style="color:#10b981"># hashmark studio</h2>
      <p>Studio client not built yet. Run: <code style="color:#fafafa">npm run build</code></p>
      </body></html>`);
  });
  const server = serve({ fetch: app.fetch, port: opts.port, hostname: "localhost" }, () => {
  });
  attachTerminalWS(server, opts.projectDir);
  const shutdown = () => {
    stopFileWatcher();
    killAllActiveSessions();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  return { app, server };
}

export {
  killAllActiveSessions,
  createServer
};
