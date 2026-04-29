use anyhow::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Session {
    pub id: String,
    pub title: String,
    pub agent_id: Option<String>,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub project_path: Option<String>,
    pub worktree_path: Option<String>,
    pub trust_level: String,
    pub pinned: bool,
    pub color: Option<String>,
    pub parent_session_id: Option<String>,
    pub forked_from_message_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub tool_name: Option<String>,
    pub tool_input: Option<String>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub checkpoint_sha: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub system: String,
    pub model: String,
    pub provider: String,
}

pub fn list_sessions(conn: &Connection) -> Result<Vec<Session>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, agent_id, model, provider, project_path, worktree_path, trust_level, pinned, color, parent_session_id, forked_from_message_id, created_at, updated_at
         FROM sessions ORDER BY pinned DESC, created_at DESC LIMIT 100"
    )?;
    let rows = stmt.query_map([], |r| Ok(Session {
        id: r.get(0)?,
        title: r.get(1)?,
        agent_id: r.get(2)?,
        model: r.get(3)?,
        provider: r.get(4)?,
        project_path: r.get(5)?,
        worktree_path: r.get(6)?,
        trust_level: r.get::<_, Option<String>>(7)?.unwrap_or_else(|| "ask".to_string()),
        pinned: r.get::<_, i64>(8)? != 0,
        color: r.get(9)?,
        parent_session_id: r.get(10)?,
        forked_from_message_id: r.get(11)?,
        created_at: r.get(12)?,
        updated_at: r.get(13)?,
    }))?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn set_session_color(conn: &Connection, session_id: &str, color: Option<&str>) -> Result<()> {
    conn.execute(
        "UPDATE sessions SET color = ?1, updated_at = unixepoch() WHERE id = ?2",
        rusqlite::params![color, session_id],
    )?;
    Ok(())
}

pub fn pin_session(conn: &Connection, session_id: &str, pinned: bool) -> Result<()> {
    conn.execute(
        "UPDATE sessions SET pinned = ?1 WHERE id = ?2",
        rusqlite::params![pinned as i64, session_id],
    )?;
    Ok(())
}

pub fn create_session(
    conn: &Connection,
    title: &str,
    agent_id: Option<&str>,
    model: Option<&str>,
    provider: Option<&str>,
    project_path: Option<&str>,
) -> Result<Session> {
    let id = Uuid::new_v4().to_string();

    // Try to create a git worktree if project_path is a git repo
    let worktree_path = project_path.and_then(|pp| setup_worktree(pp, &id));

    conn.execute(
        "INSERT INTO sessions (id, title, agent_id, model, provider, project_path, worktree_path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, title, agent_id, model, provider, project_path, worktree_path],
    )?;
    Ok(Session {
        id,
        title: title.to_string(),
        agent_id: agent_id.map(String::from),
        model: model.map(String::from),
        provider: provider.map(String::from),
        project_path: project_path.map(String::from),
        worktree_path,
        trust_level: "ask".to_string(),
        pinned: false,
        color: None,
        parent_session_id: None,
        forked_from_message_id: None,
        created_at: 0,
        updated_at: 0,
    })
}

/// Create a git worktree for the session. Returns the worktree path on success, None on failure.
fn setup_worktree(project_path: &str, session_id: &str) -> Option<String> {
    use std::process::Command;

    // Check if it's a git repo
    let git_check = Command::new("git")
        .args(["-C", project_path, "rev-parse", "--git-dir"])
        .output()
        .ok()?;
    if !git_check.status.success() {
        return None;
    }

    let worktree_dir = format!("/tmp/hashmark-worktrees/{}", session_id);
    std::fs::create_dir_all("/tmp/hashmark-worktrees").ok()?;

    let result = Command::new("git")
        .args(["-C", project_path, "worktree", "add", &worktree_dir, "HEAD", "--detach"])
        .output()
        .ok()?;

    if result.status.success() {
        Some(worktree_dir)
    } else {
        None
    }
}

pub fn delete_session(conn: &Connection, session_id: &str) -> Result<()> {
    // Load session to check for worktree
    let row: Option<(Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT project_path, worktree_path FROM sessions WHERE id = ?1",
            rusqlite::params![session_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();

    if let Some((Some(project_path), Some(worktree_path))) = row {
        // Remove the git worktree
        let _ = std::process::Command::new("git")
            .args(["-C", &project_path, "worktree", "remove", "--force", &worktree_path])
            .output();
    }

    conn.execute("DELETE FROM sessions WHERE id = ?1", rusqlite::params![session_id])?;
    Ok(())
}

pub fn get_messages(conn: &Connection, session_id: &str) -> Result<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, session_id, role, content, tool_name, tool_input, input_tokens, output_tokens, checkpoint_sha, created_at
         FROM messages WHERE session_id = ?1 ORDER BY created_at ASC"
    )?;
    let rows = stmt.query_map(rusqlite::params![session_id], |r| Ok(Message {
        id: r.get(0)?,
        session_id: r.get(1)?,
        role: r.get(2)?,
        content: r.get(3)?,
        tool_name: r.get(4)?,
        tool_input: r.get(5)?,
        input_tokens: r.get(6)?,
        output_tokens: r.get(7)?,
        checkpoint_sha: r.get(8)?,
        created_at: r.get(9)?,
    }))?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn add_message(
    conn: &Connection,
    session_id: &str,
    role: &str,
    content: &str,
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
) -> Result<Message> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO messages (id, session_id, role, content, input_tokens, output_tokens)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, session_id, role, content, input_tokens, output_tokens],
    )?;
    conn.execute(
        "UPDATE sessions SET updated_at = unixepoch() WHERE id = ?1",
        rusqlite::params![session_id],
    )?;
    Ok(Message {
        id,
        session_id: session_id.to_string(),
        role: role.to_string(),
        content: content.to_string(),
        tool_name: None,
        tool_input: None,
        input_tokens,
        output_tokens,
        checkpoint_sha: None,
        created_at: 0,
    })
}

pub fn update_trust_level(conn: &Connection, session_id: &str, trust_level: &str) -> Result<()> {
    conn.execute(
        "UPDATE sessions SET trust_level = ?1, updated_at = unixepoch() WHERE id = ?2",
        rusqlite::params![trust_level, session_id],
    )?;
    Ok(())
}

pub fn update_session_model(conn: &Connection, session_id: &str, model: &str, provider: &str) -> Result<()> {
    conn.execute(
        "UPDATE sessions SET model = ?1, provider = ?2, updated_at = unixepoch() WHERE id = ?3",
        rusqlite::params![model, provider, session_id],
    )?;
    Ok(())
}

pub fn list_agents(conn: &Connection) -> Result<Vec<Agent>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, system, model, provider FROM agents ORDER BY rowid ASC"
    )?;
    let rows = stmt.query_map([], |r| Ok(Agent {
        id: r.get(0)?,
        name: r.get(1)?,
        system: r.get(2)?,
        model: r.get(3)?,
        provider: r.get(4)?,
    }))?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn create_agent(conn: &Connection, name: &str, system: &str, model: &str, provider: &str) -> Result<Agent> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO agents (id, name, system, model, provider) VALUES (?1,?2,?3,?4,?5)",
        rusqlite::params![id, name, system, model, provider],
    )?;
    Ok(Agent { id, name: name.into(), system: system.into(), model: model.into(), provider: provider.into() })
}

pub fn update_agent(conn: &Connection, id: &str, name: &str, system: &str, model: &str, provider: &str) -> Result<()> {
    conn.execute(
        "UPDATE agents SET name=?1, system=?2, model=?3, provider=?4 WHERE id=?5",
        rusqlite::params![name, system, model, provider, id],
    )?;
    Ok(())
}

pub fn delete_agent(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM agents WHERE id=?1", rusqlite::params![id])?;
    Ok(())
}

pub fn get_session(conn: &Connection, session_id: &str) -> Result<Session> {
    let s = conn.query_row(
        "SELECT id, title, agent_id, model, provider, project_path, worktree_path, trust_level, pinned, color, parent_session_id, forked_from_message_id, created_at, updated_at FROM sessions WHERE id = ?1",
        rusqlite::params![session_id],
        |r| Ok(Session {
            id: r.get(0)?, title: r.get(1)?, agent_id: r.get(2)?, model: r.get(3)?,
            provider: r.get(4)?, project_path: r.get(5)?, worktree_path: r.get(6)?,
            trust_level: r.get::<_, Option<String>>(7)?.unwrap_or_else(|| "ask".to_string()),
            pinned: r.get::<_, i64>(8)? != 0,
            color: r.get(9)?,
            parent_session_id: r.get(10)?,
            forked_from_message_id: r.get(11)?,
            created_at: r.get(12)?, updated_at: r.get(13)?,
        }),
    )?;
    Ok(s)
}

/// Fork a session. If `message_id` is provided, only messages up to and
/// including that message are copied; the new session records the fork point.
/// Otherwise, all messages are copied (full-session fork).
pub fn fork_session(
    conn: &Connection,
    source_id: &str,
    message_id: Option<&str>,
) -> Result<Session> {
    let source = get_session(conn, source_id)?;

    // If forking at a specific message, resolve its created_at so we know
    // where to slice the message list.
    let cutoff_ts: Option<i64> = match message_id {
        Some(mid) => {
            let ts: i64 = conn.query_row(
                "SELECT created_at FROM messages WHERE id = ?1 AND session_id = ?2",
                rusqlite::params![mid, source_id],
                |r| r.get(0),
            )?;
            Some(ts)
        }
        None => None,
    };

    let new_id = Uuid::new_v4().to_string();
    let new_title = format!("Fork of {}", source.title);

    // Fork gets its own worktree from the same project
    let worktree_path = source
        .project_path
        .as_deref()
        .and_then(|pp| setup_worktree(pp, &new_id));

    conn.execute(
        "INSERT INTO sessions (id, title, agent_id, model, provider, project_path, worktree_path, parent_session_id, forked_from_message_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        rusqlite::params![
            new_id,
            new_title,
            source.agent_id,
            source.model,
            source.provider,
            source.project_path,
            worktree_path,
            source_id,
            message_id,
        ],
    )?;

    // Copy messages, optionally cut off at the fork point.
    match cutoff_ts {
        Some(ts) => {
            conn.execute(
                "INSERT INTO messages (id, session_id, role, content, tool_name, tool_input, input_tokens, output_tokens, checkpoint_sha, created_at)
                 SELECT hex(randomblob(16)), ?1, role, content, tool_name, tool_input, input_tokens, output_tokens, checkpoint_sha, created_at
                 FROM messages WHERE session_id = ?2 AND created_at <= ?3 ORDER BY created_at ASC",
                rusqlite::params![new_id, source_id, ts],
            )?;
        }
        None => {
            conn.execute(
                "INSERT INTO messages (id, session_id, role, content, tool_name, tool_input, input_tokens, output_tokens, checkpoint_sha, created_at)
                 SELECT hex(randomblob(16)), ?1, role, content, tool_name, tool_input, input_tokens, output_tokens, checkpoint_sha, created_at
                 FROM messages WHERE session_id = ?2 ORDER BY created_at ASC",
                rusqlite::params![new_id, source_id],
            )?;
        }
    }

    Ok(Session {
        id: new_id,
        title: new_title,
        agent_id: source.agent_id,
        model: source.model,
        provider: source.provider,
        project_path: source.project_path,
        worktree_path,
        trust_level: source.trust_level,
        pinned: false,
        color: None,
        parent_session_id: Some(source_id.to_string()),
        forked_from_message_id: message_id.map(String::from),
        created_at: 0,
        updated_at: 0,
    })
}

/// Delete all messages in the session that were created after the given
/// message's timestamp. The message itself is kept.
pub fn revert_session_to(
    conn: &Connection,
    session_id: &str,
    message_id: &str,
) -> Result<()> {
    let ts: i64 = conn.query_row(
        "SELECT created_at FROM messages WHERE id = ?1 AND session_id = ?2",
        rusqlite::params![message_id, session_id],
        |r| r.get(0),
    )?;
    conn.execute(
        "DELETE FROM messages WHERE session_id = ?1 AND created_at > ?2",
        rusqlite::params![session_id, ts],
    )?;
    conn.execute(
        "UPDATE sessions SET updated_at = unixepoch() WHERE id = ?1",
        rusqlite::params![session_id],
    )?;
    Ok(())
}

/// Attach a git-checkpoint SHA to a persisted message.
pub fn set_message_checkpoint(
    conn: &Connection,
    message_id: &str,
    sha: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE messages SET checkpoint_sha = ?1 WHERE id = ?2",
        rusqlite::params![sha, message_id],
    )?;
    Ok(())
}

/// Look up the checkpoint SHA on a specific message (if any).
pub fn get_message_checkpoint(
    conn: &Connection,
    message_id: &str,
) -> Result<Option<String>> {
    let sha: Option<String> = conn
        .query_row(
            "SELECT checkpoint_sha FROM messages WHERE id = ?1",
            rusqlite::params![message_id],
            |r| r.get(0),
        )
        .ok()
        .flatten();
    Ok(sha)
}
