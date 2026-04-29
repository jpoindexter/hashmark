use anyhow::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Issue {
    pub id: String,
    pub title: String,
    pub body: String,
    pub status: String,
    pub priority: String,
    pub due_date: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn list_issues(conn: &Connection) -> Result<Vec<Issue>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, body, status, priority, due_date, created_at, updated_at
         FROM issues ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Issue {
            id: r.get(0)?,
            title: r.get(1)?,
            body: r.get(2)?,
            status: r.get(3)?,
            priority: r.get(4)?,
            due_date: r.get(5)?,
            created_at: r.get(6)?,
            updated_at: r.get(7)?,
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn create_issue(conn: &Connection, title: &str, body: &str, priority: &str, due_date: Option<&str>) -> Result<Issue> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO issues (id, title, body, priority, due_date) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, title, body, priority, due_date],
    )?;
    let now: i64 = conn.query_row("SELECT unixepoch()", [], |r| r.get(0))?;
    Ok(Issue {
        id,
        title: title.to_string(),
        body: body.to_string(),
        status: "backlog".to_string(),
        priority: priority.to_string(),
        due_date: due_date.map(|s| s.to_string()),
        created_at: now,
        updated_at: now,
    })
}

pub fn update_issue(
    conn: &Connection,
    id: &str,
    title: &str,
    body: &str,
    status: &str,
    priority: &str,
    due_date: Option<&str>,
) -> Result<()> {
    conn.execute(
        "UPDATE issues SET title=?1, body=?2, status=?3, priority=?4, due_date=?5, updated_at=unixepoch() WHERE id=?6",
        rusqlite::params![title, body, status, priority, due_date, id],
    )?;
    Ok(())
}

pub fn delete_issue(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM issues WHERE id=?1", rusqlite::params![id])?;
    Ok(())
}

pub fn move_issue(conn: &Connection, id: &str, status: &str) -> Result<()> {
    conn.execute(
        "UPDATE issues SET status=?1, updated_at=unixepoch() WHERE id=?2",
        rusqlite::params![status, id],
    )?;
    Ok(())
}
