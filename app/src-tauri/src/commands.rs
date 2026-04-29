use crate::checkpoint;
use crate::compact;
use crate::harness::{self, AlwaysAllowState, PendingApprovals};
use crate::issues::{self, Issue};
use crate::mcp::{self, McpServerConfig, McpState};
use crate::routines::{self, Routine};
use crate::sessions::{self, Agent, Message, Session};
use crate::store::{self, ProviderInfo};
use rusqlite::Connection;
use serde::Deserialize;
use std::fs;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_notification::NotificationExt;

pub struct DbState(pub Mutex<Connection>);

fn smart_title(text: &str) -> String {
    // Strip fenced code blocks (``` ... ```)
    let mut cleaned = String::new();
    let mut in_fence = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            in_fence = !in_fence;
            continue;
        }
        if !in_fence {
            cleaned.push_str(line);
            cleaned.push('\n');
        }
    }

    // Strip inline backticks
    let mut stripped = String::new();
    let mut in_code = false;
    for ch in cleaned.chars() {
        if ch == '`' {
            in_code = !in_code;
        } else if !in_code {
            stripped.push(ch);
        }
    }

    // Strip common markdown formatting chars
    let stripped = stripped
        .replace("**", "")
        .replace('*', "")
        .replace("# ", "")
        .replace("## ", "")
        .replace("### ", "")
        .replace("> ", "")
        .replace("- ", "");

    // Get first non-empty line
    let first_line = stripped
        .lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
        .unwrap_or("")
        .to_string();

    // Trim to first sentence
    let sentence = ["! ", "? ", ". "]
        .iter()
        .filter_map(|sep| {
            first_line
                .find(sep)
                .map(|i| first_line[..i].trim().to_string())
        })
        .min_by_key(|s| s.len())
        .unwrap_or_else(|| first_line.trim().to_string());

    // Truncate to 72 chars
    let truncated: String = sentence.chars().take(72).collect();

    // Title-case
    let titled = truncated
        .split_whitespace()
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + chars.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ");

    // Fallback if result is too short
    if titled.len() < 4 {
        text.chars().take(60).collect()
    } else {
        titled
    }
}

// ── Session commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_sessions(state: State<DbState>) -> Result<Vec<Session>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    sessions::list_sessions(&conn).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct CreateSessionArgs {
    pub title: Option<String>,
    pub agent_id: Option<String>,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub project_path: Option<String>,
}

#[tauri::command]
pub fn create_session(args: CreateSessionArgs, state: State<DbState>) -> Result<Session, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    sessions::create_session(
        &conn,
        args.title.as_deref().unwrap_or("New session"),
        args.agent_id.as_deref(),
        args.model.as_deref(),
        args.provider.as_deref(),
        args.project_path.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_messages(session_id: String, state: State<DbState>) -> Result<Vec<Message>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    sessions::get_messages(&conn, &session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_session(session_id: String, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    sessions::delete_session(&conn, &session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_session(session_id: String, title: String, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE sessions SET title = ?1, updated_at = unixepoch() WHERE id = ?2",
        rusqlite::params![title, session_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_session(session_id: String, model: String, provider: String, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    sessions::update_session_model(&conn, &session_id, &model, &provider).map_err(|e| e.to_string())
}

// ── Agent commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_agents(state: State<DbState>) -> Result<Vec<Agent>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    sessions::list_agents(&conn).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct AgentArgs {
    pub name: String,
    pub system: String,
    pub model: String,
    pub provider: String,
}

#[tauri::command]
pub fn create_agent(args: AgentArgs, state: State<DbState>) -> Result<Agent, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    sessions::create_agent(&conn, &args.name, &args.system, &args.model, &args.provider)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_agent(agent_id: String, args: AgentArgs, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    sessions::update_agent(&conn, &agent_id, &args.name, &args.system, &args.model, &args.provider)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_agent(agent_id: String, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    sessions::delete_agent(&conn, &agent_id).map_err(|e| e.to_string())
}

// ── API key / provider commands ───────────────────────────────────────────────

#[tauri::command]
pub fn list_providers(app: AppHandle) -> Vec<ProviderInfo> {
    store::list_providers(&app)
}

#[tauri::command]
pub async fn list_ollama_models(app: AppHandle) -> Result<Vec<String>, String> {
    let base = store::get_api_key(&app, "ollama")
        .filter(|u| u.starts_with("http"))
        .unwrap_or_else(|| "http://localhost:11434".to_string());
    let url = format!("{}/api/tags", base.trim_end_matches('/'));
    let resp = reqwest::Client::new()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Ollama not reachable: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Ollama error {}", resp.status()));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let models = json["models"]
        .as_array()
        .map(|arr| arr.iter()
            .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
            .collect())
        .unwrap_or_default();
    Ok(models)
}

#[tauri::command]
pub fn get_api_key(provider: String, app: AppHandle) -> Option<String> {
    store::get_api_key(&app, &provider)
}

#[tauri::command]
pub fn set_api_key(provider: String, key: String, app: AppHandle) -> Result<(), String> {
    store::set_api_key(&app, &provider, &key)
}

// ── Streaming ─────────────────────────────────────────────────────────────────

/// Stream a message to the AI, emitting "ai-chunk" events to the frontend.
/// For Anthropic, runs the full agentic loop with tool support.
/// Returns the full accumulated response once done.
#[tauri::command]
pub async fn stream_message(
    session_id: String,
    content: String,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    global_system_prompt: Option<String>,
    state: State<'_, DbState>,
    pending: State<'_, PendingApprovals>,
    always_allow: State<'_, AlwaysAllowState>,
    app: AppHandle,
) -> Result<String, String> {
    // Persist user message
    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        sessions::add_message(&conn, &session_id, "user", &content, None, None).map_err(|e| e.to_string())?;
    }

    // Get session to find provider/model
    let (provider, model) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT provider, model FROM sessions WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        stmt.query_row(rusqlite::params![session_id], |r| {
            Ok((r.get::<_, Option<String>>(0)?, r.get::<_, Option<String>>(1)?))
        })
        .map_err(|e| e.to_string())?
    };

    let provider = provider.unwrap_or_else(|| "anthropic".to_string());
    let model = model.unwrap_or_else(|| "claude-sonnet-4-6".to_string());

    // Get API key — Ollama needs none, other providers require one
    let api_key = store::get_api_key(&app, &provider)
        .or_else(|| if provider == "anthropic" { std::env::var("ANTHROPIC_API_KEY").ok() } else { None })
        .unwrap_or_default();
    if api_key.is_empty() && provider != "ollama" {
        return Err(format!("No API key set for provider '{provider}'. Add it in Settings."));
    }

    // Build message history
    let history = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        sessions::get_messages(&conn, &session_id).map_err(|e| e.to_string())?
    };

    // Auto-compact if token budget exceeded; reload history if compaction ran
    let history = if compact::maybe_compact(&state.0, &session_id, &history, &api_key, &app)
        .await
        .unwrap_or(false)
    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        sessions::get_messages(&conn, &session_id).map_err(|e| e.to_string())?
    } else {
        history
    };

    // Run agent loop (handles tool use for Anthropic; falls through for others)
    let pending_ref: &PendingApprovals = &pending;
    let always_allow_ref: &AlwaysAllowState = &always_allow;
    let (full, in_tok, out_tok) = harness::run_agent_loop(
        &app,
        &session_id,
        &provider,
        &model,
        &api_key,
        None,
        history,
        pending_ref,
        always_allow_ref,
        temperature,
        max_tokens,
        global_system_prompt.as_deref(),
    )
    .await?;

    // Persist assistant response and capture the new row id for checkpointing.
    let (assistant_msg_id, worktree_path) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let msg = sessions::add_message(&conn, &session_id, "assistant", &full, in_tok, out_tok)
            .map_err(|e| e.to_string())?;
        let session = sessions::get_session(&conn, &session_id).map_err(|e| e.to_string())?;
        (msg.id, session.worktree_path)
    };

    // Snapshot the worktree state AFTER the agent turn. Non-git workspaces
    // produce no SHA — that's fine, restore just becomes a chat-only operation.
    if let Some(wt) = worktree_path {
        if let Some(sha) = checkpoint::create_checkpoint(&wt) {
            let conn = state.0.lock().map_err(|e| e.to_string())?;
            let _ = sessions::set_message_checkpoint(&conn, &assistant_msg_id, &sha);
            let _ = app.emit(
                "checkpoint-created",
                serde_json::json!({ "message_id": assistant_msg_id, "sha": sha }),
            );
        }
    }

    // Auto-title session after first exchange
    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let msg_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE session_id = ?1",
                rusqlite::params![session_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if msg_count == 2 {
            let title = smart_title(&content);
            let _ = conn.execute(
                "UPDATE sessions SET title = ?1, updated_at = unixepoch() WHERE id = ?2",
                rusqlite::params![title, session_id],
            );
        }
    }

    Ok(full)
}

#[tauri::command]
pub fn pin_session(session_id: String, pinned: bool, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    sessions::pin_session(&conn, &session_id, pinned).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_session_color(session_id: String, color: Option<String>, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    sessions::set_session_color(&conn, &session_id, color.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_trust_level(session_id: String, trust_level: String, state: State<DbState>) -> Result<(), String> {
    if !matches!(trust_level.as_str(), "ask" | "auto_shell" | "auto_all") {
        return Err(format!("Invalid trust level: '{trust_level}'"));
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    sessions::update_trust_level(&conn, &session_id, &trust_level).map_err(|e| e.to_string())
}

// ── Git info ──────────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct GitInfo {
    pub branch: Option<String>,
    pub dirty: bool,
    pub ahead: u32,
}

#[tauri::command]
pub async fn get_git_info(path: String) -> Result<GitInfo, String> {
    if path.is_empty() {
        return Ok(GitInfo { branch: None, dirty: false, ahead: 0 });
    }

    let branch = std::process::Command::new("git")
        .args(["-C", &path, "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .ok()
        .and_then(|o| if o.status.success() {
            Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
        } else {
            None
        });

    if branch.is_none() {
        return Ok(GitInfo { branch: None, dirty: false, ahead: 0 });
    }

    let dirty = std::process::Command::new("git")
        .args(["-C", &path, "status", "--porcelain"])
        .output()
        .map(|o| !o.stdout.is_empty())
        .unwrap_or(false);

    let ahead = std::process::Command::new("git")
        .args(["-C", &path, "rev-list", "--count", "@{u}..HEAD"])
        .output()
        .ok()
        .and_then(|o| if o.status.success() {
            String::from_utf8_lossy(&o.stdout).trim().parse::<u32>().ok()
        } else {
            None
        })
        .unwrap_or(0);

    Ok(GitInfo { branch, dirty, ahead })
}

// ── File system ──────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut result: Vec<DirEntry> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                return None;
            }
            if meta.is_dir()
                && (name == "node_modules"
                    || name == "target"
                    || name == ".git"
                    || name == "dist")
            {
                return None;
            }
            Some(DirEntry {
                name,
                path: e.path().to_string_lossy().to_string(),
                is_dir: meta.is_dir(),
                size: if meta.is_file() { meta.len() } else { 0 },
            })
        })
        .collect();
    result.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(result)
}

#[tauri::command]
pub fn get_home_dir() -> String {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "/".to_string())
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(p, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_file(from: String, to: String) -> Result<(), String> {
    fs::rename(&from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_path(path: String, recursive: bool) -> Result<(), String> {
    if recursive {
        fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    use std::io::{BufRead, BufReader};
    use std::fs::File;
    let file = File::open(&path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    let lines: Vec<String> = reader.lines()
        .take(200)
        .map(|l| l.unwrap_or_default())
        .collect();
    Ok(lines.join("\n"))
}

// ── Tool approval ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn approve_tool(
    tool_id: String,
    approved: bool,
    pending: State<'_, PendingApprovals>,
) -> Result<(), String> {
    harness::resolve_approval(&pending, &tool_id, approved)
}

// ── Issue commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_issues(state: State<DbState>) -> Result<Vec<Issue>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    issues::list_issues(&conn).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct CreateIssueArgs {
    pub title: String,
    pub body: String,
    pub priority: String,
    pub due_date: Option<String>,
}

#[tauri::command]
pub fn create_issue(args: CreateIssueArgs, state: State<DbState>) -> Result<Issue, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    issues::create_issue(&conn, &args.title, &args.body, &args.priority, args.due_date.as_deref())
        .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct UpdateIssueArgs {
    pub title: String,
    pub body: String,
    pub status: String,
    pub priority: String,
    pub due_date: Option<String>,
}

#[tauri::command]
pub fn update_issue(
    issue_id: String,
    args: UpdateIssueArgs,
    state: State<DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    issues::update_issue(&conn, &issue_id, &args.title, &args.body, &args.status, &args.priority, args.due_date.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_issue(issue_id: String, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    issues::delete_issue(&conn, &issue_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_issue(issue_id: String, status: String, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    issues::move_issue(&conn, &issue_id, &status).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fork_session(
    session_id: String,
    message_id: Option<String>,
    state: State<DbState>,
) -> Result<Session, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    sessions::fork_session(&conn, &session_id, message_id.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn revert_to_message(
    session_id: String,
    message_id: String,
    state: State<DbState>,
) -> Result<(), String> {
    let (worktree_path, sha) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let session = sessions::get_session(&conn, &session_id).map_err(|e| e.to_string())?;
        let sha = sessions::get_message_checkpoint(&conn, &message_id)
            .map_err(|e| e.to_string())?;
        sessions::revert_session_to(&conn, &session_id, &message_id)
            .map_err(|e| e.to_string())?;
        (session.worktree_path, sha)
    };

    // If we had a file-system checkpoint and a worktree, restore file state too.
    if let (Some(wt), Some(sha)) = (worktree_path, sha) {
        checkpoint::restore_checkpoint(&wt, &sha)?;
    }

    Ok(())
}

// ── Routine commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_routines(state: State<DbState>) -> Result<Vec<Routine>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    routines::list_routines(&conn).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct CreateRoutineArgs {
    pub name: String,
    pub message: String,
    pub agent_id: Option<String>,
    pub schedule: String,
}

#[tauri::command]
pub fn create_routine(args: CreateRoutineArgs, state: State<DbState>) -> Result<Routine, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    routines::create_routine(
        &conn,
        &args.name,
        &args.message,
        args.agent_id.as_deref(),
        &args.schedule,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_routine(routine_id: String, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    routines::delete_routine(&conn, &routine_id).map_err(|e| e.to_string())
}

// ── Search ────────────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct SearchResult {
    pub session_id: String,
    pub session_title: String,
    pub message_id: String,
    pub role: String,
    pub snippet: String,
}

#[tauri::command]
pub fn search_messages(query: String, state: State<DbState>) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let pattern = format!("%{}%", query);
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.session_id, s.title, m.role, m.content \
             FROM messages m \
             JOIN sessions s ON m.session_id = s.id \
             WHERE m.content LIKE ?1 \
             ORDER BY m.created_at DESC \
             LIMIT 30",
        )
        .map_err(|e| e.to_string())?;

    let results = stmt
        .query_map(rusqlite::params![pattern], |row| {
            let message_id: String = row.get(0)?;
            let session_id: String = row.get(1)?;
            let session_title: String = row.get(2)?;
            let role: String = row.get(3)?;
            let content: String = row.get(4)?;
            Ok((message_id, session_id, session_title, role, content))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .map(|(message_id, session_id, session_title, role, content)| {
            let lower_content = content.to_lowercase();
            let lower_query = query.to_lowercase();
            let snippet = if let Some(idx) = lower_content.find(&lower_query) {
                let start = idx.saturating_sub(80);
                let end = (idx + 120).min(content.len());
                let prefix = if start > 0 { "..." } else { "" };
                format!("{}{}", prefix, &content[start..end])
            } else {
                content.chars().take(200).collect()
            };
            SearchResult { session_id, session_title, message_id, role, snippet }
        })
        .collect();

    Ok(results)
}

// ── MCP commands ─────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct McpServerStatus {
    pub config: McpServerConfig,
    pub running: bool,
    pub tool_count: usize,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn list_mcp_servers(mcp: State<'_, McpState>) -> Result<Vec<McpServerStatus>, String> {
    let configs = mcp.configs.lock().map_err(|e| e.to_string())?.clone();
    let clients = mcp.clients.lock().map_err(|e| e.to_string())?;

    let statuses = configs
        .into_iter()
        .map(|config| {
            let (running, tool_count, error) = match clients.get(&config.id) {
                Some(c) => (c.is_running(), c.tools.len(), c.error.clone()),
                None => (false, 0, None),
            };
            McpServerStatus { config, running, tool_count, error }
        })
        .collect();

    Ok(statuses)
}

#[tauri::command]
pub async fn add_mcp_server(
    config: McpServerConfig,
    mcp: State<'_, McpState>,
    app: AppHandle,
) -> Result<(), String> {
    // Add to configs
    {
        let mut configs = mcp.configs.lock().map_err(|e| e.to_string())?;
        // Remove existing with same ID if any
        configs.retain(|c| c.id != config.id);
        configs.push(config.clone());
        mcp::save_configs(&app, &configs);
    }

    // Start client if enabled
    if config.enabled {
        let clients_arc = mcp.clients.clone();
        let cfg = config.clone();
        tokio::task::spawn_blocking(move || {
            let mut clients = clients_arc.lock().unwrap();
            // Stop existing client if any
            if let Some(old) = clients.get_mut(&cfg.id) {
                old.stop();
            }
            let mut client = mcp::McpClient::new(cfg.clone());
            if let Err(e) = client.start() {
                log::warn!("MCP server '{}' failed to start: {e}", cfg.name);
            }
            clients.insert(cfg.id, client);
        })
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn remove_mcp_server(
    id: String,
    mcp: State<'_, McpState>,
    app: AppHandle,
) -> Result<(), String> {
    // Stop and remove client
    {
        let mut clients = mcp.clients.lock().map_err(|e| e.to_string())?;
        if let Some(mut c) = clients.remove(&id) {
            c.stop();
        }
    }

    // Remove from configs
    {
        let mut configs = mcp.configs.lock().map_err(|e| e.to_string())?;
        configs.retain(|c| c.id != id);
        mcp::save_configs(&app, &configs);
    }

    Ok(())
}

#[tauri::command]
pub async fn toggle_mcp_server(
    id: String,
    enabled: bool,
    mcp: State<'_, McpState>,
    app: AppHandle,
) -> Result<(), String> {
    // Update config
    let config = {
        let mut configs = mcp.configs.lock().map_err(|e| e.to_string())?;
        let cfg = configs.iter_mut().find(|c| c.id == id).ok_or("Server not found")?;
        cfg.enabled = enabled;
        let result = cfg.clone();
        mcp::save_configs(&app, &configs);
        result
    };

    let clients_arc = mcp.clients.clone();
    tokio::task::spawn_blocking(move || {
        let mut clients = clients_arc.lock().unwrap();
        if enabled {
            let mut client = mcp::McpClient::new(config);
            if let Err(e) = client.start() {
                log::warn!("MCP server toggle start failed: {e}");
            }
            clients.insert(id, client);
        } else {
            if let Some(c) = clients.get_mut(&id) {
                c.stop();
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn test_mcp_server(
    id: String,
    mcp: State<'_, McpState>,
) -> Result<Vec<String>, String> {
    let config = {
        let configs = mcp.configs.lock().map_err(|e| e.to_string())?;
        configs.iter().find(|c| c.id == id).cloned().ok_or("Server not found")?
    };

    let tool_names = tokio::task::spawn_blocking(move || {
        let mut client = mcp::McpClient::new(config);
        client.start()?;
        let names: Vec<String> = client.tools.iter().map(|t| t.name.clone()).collect();
        client.stop();
        Ok::<Vec<String>, String>(names)
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(tool_names)
}

#[derive(serde::Serialize)]
pub struct McpOAuthStart {
    pub authorize_url: String,
    pub redirect_uri: String,
}

#[tauri::command]
pub async fn start_mcp_oauth(
    id: String,
    mcp: State<'_, McpState>,
    app: AppHandle,
) -> Result<McpOAuthStart, String> {
    let mcp_state = (*mcp).clone_handle();
    let server_id = id.clone();
    let result = tokio::task::spawn_blocking(move || mcp::start_oauth(&mcp_state, &app, &server_id))
        .await
        .map_err(|e| e.to_string())??;
    Ok(McpOAuthStart {
        authorize_url: result.authorize_url,
        redirect_uri: result.redirect_uri,
    })
}

#[tauri::command]
pub async fn run_routine(
    routine_id: String,
    state: State<'_, DbState>,
    pending: State<'_, PendingApprovals>,
    always_allow: State<'_, AlwaysAllowState>,
    app: AppHandle,
) -> Result<String, String> {
    // Load routine
    let routine = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        routines::list_routines(&conn)
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|r| r.id == routine_id)
            .ok_or_else(|| format!("Routine '{}' not found", routine_id))?
    };

    // Resolve agent system prompt and model/provider
    let (system, model, provider) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(agent_id) = &routine.agent_id {
            let agents = sessions::list_agents(&conn).map_err(|e| e.to_string())?;
            if let Some(agent) = agents.iter().find(|a| &a.id == agent_id) {
                (
                    if agent.system.is_empty() { None } else { Some(agent.system.clone()) },
                    agent.model.clone(),
                    agent.provider.clone(),
                )
            } else {
                (None, "claude-sonnet-4-6".to_string(), "anthropic".to_string())
            }
        } else {
            (None, "claude-sonnet-4-6".to_string(), "anthropic".to_string())
        }
    };

    // Get API key — Ollama needs none
    let api_key = store::get_api_key(&app, &provider)
        .or_else(|| if provider == "anthropic" { std::env::var("ANTHROPIC_API_KEY").ok() } else { None })
        .unwrap_or_default();
    if api_key.is_empty() && provider != "ollama" {
        return Err(format!("No API key set for provider '{provider}'."));
    }

    // Create a session for this run
    let session = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        sessions::create_session(
            &conn,
            &format!("Routine: {}", routine.name),
            routine.agent_id.as_deref(),
            Some(&model),
            Some(&provider),
            None,
        )
        .map_err(|e| e.to_string())?
    };

    // Persist user message
    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        sessions::add_message(&conn, &session.id, "user", &routine.message, None, None)
            .map_err(|e| e.to_string())?;
    }

    // Build history
    let history = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        sessions::get_messages(&conn, &session.id).map_err(|e| e.to_string())?
    };

    let pending_ref: &PendingApprovals = &pending;
    let always_allow_ref: &AlwaysAllowState = &always_allow;
    let (full, in_tok, out_tok) = harness::run_agent_loop(
        &app,
        &session.id,
        &provider,
        &model,
        &api_key,
        system.as_deref(),
        history,
        pending_ref,
        always_allow_ref,
        None,
        None,
        None,
    )
    .await?;

    // Persist assistant response
    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        sessions::add_message(&conn, &session.id, "assistant", &full, in_tok, out_tok)
            .map_err(|e| e.to_string())?;
    }

    // Mark routine as run
    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        routines::mark_run(&conn, &routine_id).map_err(|e| e.to_string())?;
    }

    // Notify
    let body: String = full.chars().take(120).collect();
    app.notification().builder().title(&routine.name).body(&body).show().ok();

    Ok(full)
}

// ── Permission management ─────────────────────────────────────────────────────

#[tauri::command]
pub fn always_allow_tool(permission_key: String, state: State<'_, AlwaysAllowState>) -> Result<(), String> {
    let mut set = state.lock().map_err(|e| e.to_string())?;
    set.insert(permission_key);
    Ok(())
}

#[tauri::command]
pub fn revoke_tool_permission(permission_key: String, state: State<'_, AlwaysAllowState>) -> Result<(), String> {
    let mut set = state.lock().map_err(|e| e.to_string())?;
    set.remove(&permission_key);
    Ok(())
}

#[tauri::command]
pub fn list_always_allowed(state: State<'_, AlwaysAllowState>) -> Result<Vec<String>, String> {
    let set = state.lock().map_err(|e| e.to_string())?;
    Ok(set.iter().cloned().collect())
}

// ── Folder picker ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app
        .dialog()
        .file()
        .set_title("Open Project")
        .blocking_pick_folder();
    Ok(path.map(|p| p.to_string()))
}

// ── Claude OAuth ──────────────────────────────────────────────────────────────

const CLAUDE_AUTH_URL: &str = "https://claude.ai/oauth/authorize";
const CLAUDE_TOKEN_URL: &str = "https://console.anthropic.com/v1/oauth/token";
const CLAUDE_CLIENT_ID: &str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const CLAUDE_SCOPE: &str = "user:inference";

#[tauri::command]
pub async fn start_claude_oauth(app: AppHandle) -> Result<(), String> {
    use crate::mcp_oauth::{bind_redirect_listener, build_authorize_url, exchange_code, new_pkce_state, OAuthClientReg, OAuthMetadata};
    use tauri_plugin_opener::OpenerExt;

    let (port, listener) = bind_redirect_listener()?;
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let (verifier, challenge, state_val) = new_pkce_state();

    let metadata = OAuthMetadata {
        authorization_endpoint: CLAUDE_AUTH_URL.to_string(),
        token_endpoint: CLAUDE_TOKEN_URL.to_string(),
        registration_endpoint: None,
        scopes_supported: vec![CLAUDE_SCOPE.to_string()],
    };
    let client_reg = OAuthClientReg {
        client_id: CLAUDE_CLIENT_ID.to_string(),
        client_secret: None,
    };

    let auth_url = build_authorize_url(
        &metadata,
        &client_reg.client_id,
        &redirect_uri,
        &[CLAUDE_SCOPE.to_string()],
        &state_val,
        &challenge,
    );

    app.opener().open_url(&auth_url, None::<&str>).map_err(|e| format!("open browser: {e}"))?;

    let redirect_uri_clone = redirect_uri.clone();
    let verifier_clone = verifier.clone();
    let state_expected = state_val.clone();

    let tokens = tokio::task::spawn_blocking(move || {
        let result = crate::mcp_oauth::wait_for_redirect(listener)?;
        if result.state != state_expected {
            return Err("OAuth state mismatch".to_string());
        }
        let http = reqwest::blocking::Client::new();
        exchange_code(&http, CLAUDE_TOKEN_URL, &client_reg, &result.code, &verifier_clone, &redirect_uri_clone)
    })
    .await
    .map_err(|e| e.to_string())??;

    store::set_api_key(&app, "anthropic", &tokens.access_token)?;
    Ok(())
}
