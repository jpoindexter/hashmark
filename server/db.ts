/**
 * SQLite persistence for hashmark studio
 * Sessions, messages, issues, runs
 */

import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync } from "fs";

let _db: Database.Database | null = null;

export function resetDb(): void {
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
  }
}

export function getDb(dataDir: string): Database.Database {
  if (_db) return _db;

  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, "studio.db");
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.pragma("busy_timeout = 5000");

  migrate(_db);
  return _db;
}

function migrate(db: Database.Database) {
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

  // Additive migrations -- safe to run on existing DBs

  const sessionCols = (db.pragma("table_info(sessions)") as Array<{ name: string }>).map(r => r.name);
  if (!sessionCols.includes("archived")) {
    db.exec("ALTER TABLE sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");
  }
  // Claude CLI's internal session ID for --resume support
  if (!sessionCols.includes("claude_session_id")) {
    db.exec("ALTER TABLE sessions ADD COLUMN claude_session_id TEXT");
  }
  // Session duration tracking
  if (!sessionCols.includes("started_at")) {
    db.exec("ALTER TABLE sessions ADD COLUMN started_at INTEGER");
    db.exec("UPDATE sessions SET started_at = created_at WHERE started_at IS NULL");
  }
  if (!sessionCols.includes("ended_at")) {
    db.exec("ALTER TABLE sessions ADD COLUMN ended_at INTEGER");
  }
  if (!sessionCols.includes("error_count")) {
    db.exec("ALTER TABLE sessions ADD COLUMN error_count INTEGER NOT NULL DEFAULT 0");
  }

  // Pending message safety: NULL sent_at = queued, non-NULL = delivered
  const msgCols = (db.pragma("table_info(session_messages)") as Array<{ name: string }>).map(r => r.name);
  if (!msgCols.includes("sent_at")) {
    db.exec("ALTER TABLE session_messages ADD COLUMN sent_at INTEGER");
    // Backfill existing messages as already sent
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

    -- Performance indexes
    CREATE INDEX IF NOT EXISTS idx_sessions_archived_updated ON sessions(archived, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_actions_created ON agent_actions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_actions_agent ON agent_actions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_runs_issue ON runs(issue_id);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
    CREATE INDEX IF NOT EXISTS idx_agent_actions_outcome ON agent_actions(outcome);
  `);

  // swarm_runs additive columns (mode + timing for swarm.ts, which previously created a separate schema)
  const swarmRunCols = (db.pragma("table_info(swarm_runs)") as Array<{ name: string }>).map(r => r.name);
  if (!swarmRunCols.includes("mode")) {
    db.exec("ALTER TABLE swarm_runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'build'");
  }
  if (!swarmRunCols.includes("started_at")) {
    db.exec("ALTER TABLE swarm_runs ADD COLUMN started_at INTEGER");
    db.exec("UPDATE swarm_runs SET started_at = created_at WHERE started_at IS NULL");
  }
  if (!swarmRunCols.includes("ended_at")) {
    db.exec("ALTER TABLE swarm_runs ADD COLUMN ended_at INTEGER");
    db.exec("UPDATE swarm_runs SET ended_at = completed_at WHERE ended_at IS NULL AND completed_at IS NOT NULL");
  }

  // swarm_workers additive columns (task + branch for swarm.ts, which previously used a separate swarm_agents table)
  const swarmWorkerCols = (db.pragma("table_info(swarm_workers)") as Array<{ name: string }>).map(r => r.name);
  if (!swarmWorkerCols.includes("task")) {
    db.exec("ALTER TABLE swarm_workers ADD COLUMN task TEXT NOT NULL DEFAULT ''");
  }
  if (!swarmWorkerCols.includes("branch")) {
    db.exec("ALTER TABLE swarm_workers ADD COLUMN branch TEXT");
  }
  if (!swarmWorkerCols.includes("ended_at")) {
    db.exec("ALTER TABLE swarm_workers ADD COLUMN ended_at INTEGER");
    db.exec("UPDATE swarm_workers SET ended_at = completed_at WHERE ended_at IS NULL AND completed_at IS NOT NULL");
  }

  // runs additive migrations (must come after the CREATE TABLE above)
  const runCols = (db.pragma('table_info(runs)') as Array<{ name: string }>).map(r => r.name);
  if (!runCols.includes('task')) {
    db.exec('ALTER TABLE runs ADD COLUMN task TEXT NOT NULL DEFAULT ""');
  }
  if (!runCols.includes('worktree_branch')) {
    db.exec('ALTER TABLE runs ADD COLUMN worktree_branch TEXT');
  }
  // Claude session ID for --resume support on runs
  if (!runCols.includes('claude_session_id')) {
    db.exec('ALTER TABLE runs ADD COLUMN claude_session_id TEXT');
  }
  // API duration tracking
  if (!runCols.includes('duration_api_ms')) {
    db.exec('ALTER TABLE runs ADD COLUMN duration_api_ms INTEGER');
  }

  // Session cost tracking (actual from Claude result events)
  if (!sessionCols.includes('cost_usd')) {
    db.exec('ALTER TABLE sessions ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0');
  }

  // Studio settings key-value store
  db.exec(`
    CREATE TABLE IF NOT EXISTS studio_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // FTS5 full-text search index for session messages
  // Only create + backfill once; subsequent startups skip via IF NOT EXISTS on table
  const ftsExists = (db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions_fts'"
  ).get() as { name: string } | undefined)?.name;

  if (!ftsExists) {
    db.transaction(() => {
      db.exec(`
        CREATE VIRTUAL TABLE sessions_fts USING fts5(
          session_id UNINDEXED,
          role UNINDEXED,
          body,
          tokenize = 'porter ascii'
        );
        INSERT INTO sessions_fts(session_id, role, body)
          SELECT session_id, role, content FROM session_messages;
        CREATE TRIGGER sessions_fts_ai
        AFTER INSERT ON session_messages BEGIN
          INSERT INTO sessions_fts(session_id, role, body)
          VALUES (NEW.session_id, NEW.role, NEW.content);
        END;
      `);
    })();
  }
}

export function getStudioSetting(db: Database.Database, key: string, defaultValue: string): string {
  const row = db.prepare("SELECT value FROM studio_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? defaultValue;
}

export function setStudioSetting(db: Database.Database, key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO studio_settings (key, value) VALUES (?, ?)").run(key, value);
}
