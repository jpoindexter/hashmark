import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync } from "fs";

let _db: Database.Database | null = null;

export function resetDb(): void {
  if (_db) { try { _db.close(); } catch {} _db = null; }
}

export function getDb(dataDir: string): Database.Database {
  if (_db) return _db;
  mkdirSync(dataDir, { recursive: true });
  _db = new Database(join(dataDir, "studio.db"));
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.pragma("busy_timeout = 5000");
  migrate(_db);
  return _db;
}

function hasColumn(db: Database.Database, table: string, col: string): boolean {
  const info = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return info.some(r => r.name === col);
}

function addColumn(db: Database.Database, table: string, col: string, def: string) {
  if (!hasColumn(db, table, col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
}

function migrate(db: Database.Database) {
  const version = db.pragma("user_version", { simple: true }) as number;

  if (version < 1) {
    db.exec("BEGIN");
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'New Session',
        model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
        provider TEXT NOT NULL DEFAULT 'claude',
        system_prompt TEXT,
        project_dir TEXT,
        status TEXT NOT NULL DEFAULT 'idle',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user','assistant')),
        content TEXT NOT NULL,
        blocks TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        model TEXT,
        system_prompt TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
    `);
    db.exec("COMMIT");
    db.pragma("user_version = 1");
  }

  if (version < 2) {
    db.exec("BEGIN");
    db.exec(`
      CREATE TABLE IF NOT EXISTS issues (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'backlog',
        agent_id TEXT,
        project_dir TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        agent_id TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        output TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS issue_seq (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        next_val INTEGER NOT NULL DEFAULT 1
      );
      INSERT OR IGNORE INTO issue_seq (id, next_val) VALUES (1, 1);
      CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_runs_issue ON runs(issue_id, created_at);
    `);
    db.exec("COMMIT");
    db.pragma("user_version = 2");
  }

  if (version < 3) {
    addColumn(db, "sessions", "claude_session_id", "TEXT");
    db.pragma("user_version = 3");
  }

  if (version < 4) {
    addColumn(db, "sessions", "input_tokens", "INTEGER NOT NULL DEFAULT 0");
    addColumn(db, "sessions", "output_tokens", "INTEGER NOT NULL DEFAULT 0");
    db.pragma("user_version = 4");
  }

  if (version < 5) {
    addColumn(db, "sessions", "thinking_enabled", "INTEGER NOT NULL DEFAULT 0");
    db.pragma("user_version = 5");
  }

  if (version < 6) {
    addColumn(db, "sessions", "token_budget", "INTEGER");
    db.pragma("user_version = 6");
  }

  if (version < 7) {
    addColumn(db, "sessions", "notes", "TEXT");
    db.pragma("user_version = 7");
  }

  if (version < 8) {
    addColumn(db, "sessions", "worktree_dir", "TEXT");
    db.pragma("user_version = 8");
  }

  if (version < 9) {
    addColumn(db, "sessions", "thinking_level", "TEXT NOT NULL DEFAULT 'none'");
    db.pragma("user_version = 9");
  }

  if (version < 10) {
    addColumn(db, "messages", "duration_ms", "INTEGER");
    addColumn(db, "sessions", "require_tool_approval", "INTEGER NOT NULL DEFAULT 1");
    addColumn(db, "sessions", "freshly_compacted", "INTEGER NOT NULL DEFAULT 0");
    db.pragma("user_version = 10");
  }

  if (version < 11) {
    addColumn(db, "messages", "git_checkpoint", "TEXT");
    db.pragma("user_version = 11");
  }

  if (version < 12) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        system_prompt TEXT,
        model TEXT,
        project_dir TEXT,
        created_at INTEGER NOT NULL
      );
    `);
    db.pragma("user_version = 12");
  }

  if (version < 13) {
    addColumn(db, "issues", "tasks", "TEXT");          // JSON: {id,title,passes}[]
    addColumn(db, "runs", "satisfaction", "TEXT");     // JSON: {satisfied,score,notes}
    db.pragma("user_version = 13");
  }

  // Additive catch-up: ensures all columns exist regardless of DB origin / skipped migrations
  addColumn(db, "sessions", "title", "TEXT NOT NULL DEFAULT 'New Session'");
  addColumn(db, "sessions", "model", "TEXT NOT NULL DEFAULT 'claude-sonnet-4-6'");
  addColumn(db, "sessions", "provider", "TEXT NOT NULL DEFAULT 'claude'");
  addColumn(db, "sessions", "system_prompt", "TEXT");
  addColumn(db, "sessions", "project_dir", "TEXT");
  addColumn(db, "sessions", "status", "TEXT NOT NULL DEFAULT 'idle'");
  addColumn(db, "sessions", "claude_session_id", "TEXT");
  addColumn(db, "sessions", "input_tokens", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "sessions", "output_tokens", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "sessions", "thinking_enabled", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "sessions", "thinking_level", "TEXT NOT NULL DEFAULT 'none'");
  addColumn(db, "sessions", "token_budget", "INTEGER");
  addColumn(db, "sessions", "notes", "TEXT");
  addColumn(db, "sessions", "worktree_dir", "TEXT");
  addColumn(db, "sessions", "require_tool_approval", "INTEGER NOT NULL DEFAULT 1");
  addColumn(db, "sessions", "freshly_compacted", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "sessions", "pinned", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "sessions", "plan_mode", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "sessions", "fast_mode", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "messages", "duration_ms", "INTEGER");
  addColumn(db, "messages", "git_checkpoint", "TEXT");
  addColumn(db, "messages", "bookmarked", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "issues", "tasks", "TEXT");
  addColumn(db, "runs", "satisfaction", "TEXT");
}

export function nextIssueId(db: Database.Database): string {
  const row = db.prepare("UPDATE issue_seq SET next_val = next_val + 1 WHERE id = 1 RETURNING next_val").get() as { next_val: number };
  return `HASH-${row.next_val - 1}`;
}
