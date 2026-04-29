use anyhow::Result;
use rusqlite::Connection;
use std::path::Path;

pub fn init(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    run_migrations(&conn)?;
    Ok(conn)
}

fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sessions (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL DEFAULT 'New session',
            agent_id    TEXT,
            model       TEXT,
            provider    TEXT,
            created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS messages (
            id          TEXT PRIMARY KEY,
            session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            role        TEXT NOT NULL CHECK(role IN ('user','assistant','tool','system')),
            content     TEXT NOT NULL,
            tool_name   TEXT,
            tool_input  TEXT,
            created_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS agents (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            system      TEXT NOT NULL DEFAULT '',
            model       TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
            provider    TEXT NOT NULL DEFAULT 'anthropic',
            created_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );

        INSERT OR IGNORE INTO agents (id, name, system, model, provider)
        VALUES
            ('default', 'Default', '', 'claude-sonnet-4-6', 'anthropic'),
            ('code-review', 'Code Review', 'You are a strict code reviewer. Be concise and direct.', 'claude-opus-4-6', 'anthropic'),
            ('refactor', 'Refactor', 'You are a refactoring assistant. Focus on clarity and minimal code.', 'claude-haiku-4-5-20251001', 'anthropic');

        CREATE TABLE IF NOT EXISTS issues (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL,
            body        TEXT NOT NULL DEFAULT '',
            status      TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog','todo','in_progress','in_review','done')),
            priority    TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
            created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS routines (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            message     TEXT NOT NULL,
            agent_id    TEXT,
            schedule    TEXT NOT NULL DEFAULT 'manual',
            last_run_at INTEGER,
            created_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );
        ",
    )?;

    // Additive migration: add worktree columns to sessions
    let session_cols: Vec<String> = conn
        .prepare("PRAGMA table_info(sessions)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .collect();

    if !session_cols.iter().any(|c| c == "project_path") {
        conn.execute_batch(
            "ALTER TABLE sessions ADD COLUMN project_path TEXT;
             ALTER TABLE sessions ADD COLUMN worktree_path TEXT;",
        )?;
    }

    if !session_cols.iter().any(|c| c == "trust_level") {
        conn.execute_batch(
            "ALTER TABLE sessions ADD COLUMN trust_level TEXT NOT NULL DEFAULT 'ask';",
        )?;
    }

    if !session_cols.iter().any(|c| c == "pinned") {
        conn.execute_batch(
            "ALTER TABLE sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;",
        )?;
    }

    if !session_cols.iter().any(|c| c == "color") {
        conn.execute_batch(
            "ALTER TABLE sessions ADD COLUMN color TEXT DEFAULT NULL;",
        )?;
    }

    // Additive migration: add token columns to messages
    let message_cols: Vec<String> = conn
        .prepare("PRAGMA table_info(messages)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .collect();

    if !message_cols.iter().any(|c| c == "input_tokens") {
        conn.execute_batch(
            "ALTER TABLE messages ADD COLUMN input_tokens INTEGER;
             ALTER TABLE messages ADD COLUMN output_tokens INTEGER;",
        )?;
    }

    // Additive migration: add due_date to issues
    let issue_cols: Vec<String> = conn
        .prepare("PRAGMA table_info(issues)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .collect();

    if !issue_cols.iter().any(|c| c == "due_date") {
        conn.execute_batch(
            "ALTER TABLE issues ADD COLUMN due_date TEXT DEFAULT NULL;",
        )?;
    }

    if !session_cols.iter().any(|c| c == "parent_session_id") {
        conn.execute_batch(
            "ALTER TABLE sessions ADD COLUMN parent_session_id TEXT;
             ALTER TABLE sessions ADD COLUMN forked_from_message_id TEXT;",
        )?;
    }

    if !message_cols.iter().any(|c| c == "checkpoint_sha") {
        conn.execute_batch(
            "ALTER TABLE messages ADD COLUMN checkpoint_sha TEXT;",
        )?;
    }

    Ok(())
}
