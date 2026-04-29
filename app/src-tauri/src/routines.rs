use anyhow::Result;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Routine {
    pub id: String,
    pub name: String,
    pub message: String,
    pub agent_id: Option<String>,
    pub schedule: String,
    pub last_run_at: Option<i64>,
    pub created_at: i64,
}

pub fn list_routines(conn: &Connection) -> Result<Vec<Routine>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, message, agent_id, schedule, last_run_at, created_at
         FROM routines ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Routine {
            id: row.get(0)?,
            name: row.get(1)?,
            message: row.get(2)?,
            agent_id: row.get(3)?,
            schedule: row.get(4)?,
            last_run_at: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn create_routine(
    conn: &Connection,
    name: &str,
    message: &str,
    agent_id: Option<&str>,
    schedule: &str,
) -> Result<Routine> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO routines (id, name, message, agent_id, schedule)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, name, message, agent_id, schedule],
    )?;
    let routine = conn.query_row(
        "SELECT id, name, message, agent_id, schedule, last_run_at, created_at
         FROM routines WHERE id = ?1",
        params![id],
        |row| {
            Ok(Routine {
                id: row.get(0)?,
                name: row.get(1)?,
                message: row.get(2)?,
                agent_id: row.get(3)?,
                schedule: row.get(4)?,
                last_run_at: row.get(5)?,
                created_at: row.get(6)?,
            })
        },
    )?;
    Ok(routine)
}

#[allow(dead_code)]
pub fn update_routine(
    conn: &Connection,
    id: &str,
    name: &str,
    message: &str,
    agent_id: Option<&str>,
    schedule: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE routines SET name = ?1, message = ?2, agent_id = ?3, schedule = ?4 WHERE id = ?5",
        params![name, message, agent_id, schedule, id],
    )?;
    Ok(())
}

pub fn delete_routine(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM routines WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn mark_run(conn: &Connection, id: &str) -> Result<()> {
    conn.execute(
        "UPDATE routines SET last_run_at = unixepoch() WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}
