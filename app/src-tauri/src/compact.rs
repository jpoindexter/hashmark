use crate::sessions::Message;
use rusqlite::Connection;
use serde_json::json;
use std::sync::Mutex;
use tauri::Emitter;

const TOKEN_THRESHOLD: i64 = 80_000;
const KEEP_RECENT: usize = 6;

/// Checks if the session needs compaction. If so, summarizes old messages via Anthropic,
/// replaces them with a single system summary message, and emits "session-compacted".
/// Returns true if compaction was performed.
pub async fn maybe_compact(
    db: &Mutex<Connection>,
    session_id: &str,
    messages: &[Message],
    api_key: &str,
    app: &tauri::AppHandle,
) -> Result<bool, String> {
    let total_tokens: i64 = messages
        .iter()
        .map(|m| {
            let in_tok = m.input_tokens.unwrap_or_else(|| (m.content.len() as i64) / 4);
            let out_tok = m.output_tokens.unwrap_or(0);
            in_tok + out_tok
        })
        .sum();

    if total_tokens < TOKEN_THRESHOLD || messages.len() <= KEEP_RECENT {
        return Ok(false);
    }

    let to_compact = &messages[..messages.len() - KEEP_RECENT];

    let conversation_text: String = to_compact
        .iter()
        .filter(|m| m.role != "system") // skip existing summaries
        .map(|m| format!("[{}]: {}", m.role, &m.content))
        .collect::<Vec<_>>()
        .join("\n\n");

    let summary = call_anthropic_summary(api_key, &conversation_text).await?;

    let compact_ids: Vec<String> = to_compact.iter().map(|m| m.id.clone()).collect();
    let count = compact_ids.len();

    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        for id in &compact_ids {
            conn.execute("DELETE FROM messages WHERE id = ?1", rusqlite::params![id])
                .map_err(|e| e.to_string())?;
        }
        let summary_id = uuid::Uuid::new_v4().to_string();
        let summary_content = format!(
            "[Context summary — {} messages compacted]\n\n{}",
            count, summary
        );
        // Insert with created_at = earliest kept message time - 1 so ordering is preserved
        conn.execute(
            "INSERT INTO messages (id, session_id, role, content, created_at) \
             VALUES (?1, ?2, 'system', ?3, unixepoch())",
            rusqlite::params![summary_id, session_id, summary_content],
        )
        .map_err(|e| e.to_string())?;
    }

    app.emit("session-compacted", session_id).ok();

    Ok(true)
}

async fn call_anthropic_summary(api_key: &str, conversation: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let body = json!({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 1024,
        "messages": [{
            "role": "user",
            "content": format!(
                "Summarize this conversation concisely. Preserve key decisions, \
                 code changes, outcomes, file paths mentioned, and any context \
                 needed to continue the work:\n\n{}",
                conversation
            )
        }]
    });

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Compaction summary failed: {text}"));
    }

    let val: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    val["content"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No text in compaction response".to_string())
}
