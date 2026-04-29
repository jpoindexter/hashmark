use crate::commands::DbState;
use crate::mcp::McpState;
use crate::sessions::Message;
use crate::tools;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;
use tokio::time::{timeout, Duration};

#[derive(serde::Serialize, Clone)]
struct FileDiff {
    path: String,
    before: Option<String>,
    after: String,
    tool: String,
}

pub type PendingApprovals = Arc<Mutex<HashMap<String, oneshot::Sender<bool>>>>;
pub type AlwaysAllowState = Arc<Mutex<HashSet<String>>>;

const MAX_ITERATIONS: usize = 20;
const APPROVAL_TIMEOUT_SECS: u64 = 300;

fn permission_key(tool_name: &str) -> String {
    tool_name.to_string()
}

// ── session context ───────────────────────────────────────────────────────────

fn get_session_context(app: &AppHandle, session_id: &str) -> Result<(String, String), String> {
    let db_state = app.state::<DbState>();
    let conn = db_state.0.lock().map_err(|e| e.to_string())?;
    let row: Option<(Option<String>, Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT worktree_path, project_path, trust_level FROM sessions WHERE id = ?1",
            rusqlite::params![session_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok();
    let dir = match &row {
        Some((Some(wt), _, _)) => wt.clone(),
        Some((None, Some(pp), _)) => pp.clone(),
        _ => dirs::home_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("/tmp"))
            .to_string_lossy()
            .to_string(),
    };
    let trust = row
        .as_ref()
        .and_then(|(_, _, t)| t.clone())
        .unwrap_or_else(|| "ask".to_string());
    Ok((dir, trust))
}

// ── spawn_agent tool schema ───────────────────────────────────────────────────

fn spawn_agent_schema() -> Value {
    json!({
        "name": "spawn_agent",
        "description": "Delegate a subtask to another named agent. The agent runs its full agentic loop with tools and returns its complete response. Use for multi-agent orchestration.",
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_name": {
                    "type": "string",
                    "description": "Exact name of the agent to invoke"
                },
                "task": {
                    "type": "string",
                    "description": "Task or question to send to the sub-agent"
                }
            },
            "required": ["agent_name", "task"]
        }
    })
}

// ── spawn_agent subtask ───────────────────────────────────────────────────────

async fn spawn_agent_subtask(
    app: &AppHandle,
    parent_session_id: &str,
    agent_name: &str,
    task: &str,
    pending_approvals: &PendingApprovals,
    always_allow: &AlwaysAllowState,
    temperature: Option<f64>,
) -> tools::ToolResult {
    // Look up agent by name
    let agent_row: Option<(String, String, String, Option<u32>)> = {
        let db_state = app.state::<DbState>();
        let conn = match db_state.0.lock() {
            Ok(c) => c,
            Err(e) => return tools::ToolResult { content: e.to_string(), is_error: true },
        };
        conn.query_row(
            "SELECT model, provider, system, max_tokens FROM agents WHERE name = ?1",
            rusqlite::params![agent_name],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .ok()
    };

    let (model, provider, system, max_tokens) = match agent_row {
        Some(row) => row,
        None => {
            return tools::ToolResult {
                content: format!("spawn_agent: no agent named '{agent_name}'"),
                is_error: true,
            }
        }
    };

    let api_key = crate::store::get_api_key(app, &provider).unwrap_or_default();

    let _ = app.emit(
        "spawn-agent",
        json!({ "agent_name": agent_name, "task": task }),
    );

    let history = vec![Message {
        id: "sub-0".to_string(),
        session_id: parent_session_id.to_string(),
        role: "user".to_string(),
        content: task.to_string(),
        tool_name: None,
        tool_input: None,
        input_tokens: None,
        output_tokens: None,
        checkpoint_sha: None,
        created_at: 0,
    }];

    let result = Box::pin(run_agent_loop(
        app,
        parent_session_id,
        &provider,
        &model,
        &api_key,
        Some(&system),
        history,
        pending_approvals,
        always_allow,
        temperature,
        max_tokens,
        None,
    ))
    .await;

    match result {
        Ok((text, _, _)) => tools::ToolResult { content: text, is_error: false },
        Err(e) => tools::ToolResult { content: e, is_error: true },
    }
}

// ── unified tool gate ─────────────────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
async fn execute_tool_with_gate(
    app: &AppHandle,
    session_id: &str,
    tool_name: &str,
    tool_input: &Value,
    tool_id: &str,
    project_dir: &str,
    trust_level: &str,
    pending_approvals: &PendingApprovals,
    always_allow: &AlwaysAllowState,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
) -> Result<tools::ToolResult, String> {
    // spawn_agent
    if tool_name == "spawn_agent" {
        let agent_name = tool_input["agent_name"].as_str().unwrap_or("");
        let task = tool_input["task"].as_str().unwrap_or("");
        let res = spawn_agent_subtask(
            app,
            session_id,
            agent_name,
            task,
            pending_approvals,
            always_allow,
            temperature,
        )
        .await;
        return Ok(res);
    }

    // MCP tool — no approval gate
    if tool_name.starts_with("mcp__") {
        let mcp_name = tool_name.to_string();
        let mcp_input = tool_input.clone();
        let mcp_state = app.try_state::<McpState>();
        let res = match mcp_state {
            Some(state) => {
                let clients_arc = state.clients.clone();
                let r = tokio::task::spawn_blocking(move || {
                    let mut clients = clients_arc.lock().unwrap();
                    crate::mcp::try_call_mcp_tool(&mut clients, &mcp_name, &mcp_input)
                })
                .await
                .map_err(|e| e.to_string())?;

                match r {
                    Some(Ok(text)) => tools::ToolResult { content: text, is_error: false },
                    Some(Err(e)) => tools::ToolResult { content: e, is_error: true },
                    None => tools::ToolResult {
                        content: format!("MCP tool not found: {tool_name}"),
                        is_error: true,
                    },
                }
            }
            None => tools::ToolResult {
                content: "MCP not initialized".to_string(),
                is_error: true,
            },
        };
        return Ok(res);
    }

    // Regular tool — approval gate
    let pkey = permission_key(tool_name);
    let danger = tools::analyze_tool_danger(tool_name, tool_input);
    let dangerous = danger.dangerous;
    let danger_reason = danger.reason;

    let always_allowed = {
        let set = always_allow.lock().map_err(|e| e.to_string())?;
        set.contains(&pkey)
    };

    let sensitive_read = tools::is_sensitive_read(tool_name, tool_input);
    let needs_gate = !always_allowed
        && match trust_level {
            "auto_all" => sensitive_read,
            "auto_shell" => {
                sensitive_read || (tools::requires_approval(tool_name) && tool_name != "bash")
            }
            _ => sensitive_read || tools::requires_approval(tool_name),
        };

    let result = if needs_gate {
        let input_json = tool_input.to_string();
        let _ = app.emit(
            "tool-pending",
            json!({
                "id": tool_id,
                "name": tool_name,
                "input_json": input_json,
                "permission_key": pkey,
                "dangerous": dangerous,
                "danger_reason": danger_reason,
            }),
        );

        let (tx, rx) = oneshot::channel::<bool>();
        {
            let mut map = pending_approvals.lock().map_err(|e| e.to_string())?;
            map.insert(tool_id.to_string(), tx);
        }

        let approved = match timeout(Duration::from_secs(APPROVAL_TIMEOUT_SECS), rx).await {
            Ok(Ok(v)) => v,
            Ok(Err(_)) => false,
            Err(_) => {
                let mut map = pending_approvals.lock().map_err(|e| e.to_string())?;
                map.remove(tool_id);
                false
            }
        };

        if !approved {
            tools::ToolResult {
                content: format!("Tool '{tool_name}' was denied by user"),
                is_error: true,
            }
        } else {
            let old_content = capture_file_content(tool_name, tool_input, project_dir).await;
            let r = tools::execute_tool(tool_name, tool_input, project_dir).await;
            emit_file_diff(app, tool_name, tool_input, project_dir, old_content, r.is_error).await;
            r
        }
    } else {
        let old_content = capture_file_content(tool_name, tool_input, project_dir).await;
        let r = tools::execute_tool(tool_name, tool_input, project_dir).await;
        emit_file_diff(app, tool_name, tool_input, project_dir, old_content, r.is_error).await;
        r
    };

    // Always emit the side-channel events
    let _ = app.emit(
        "tool-result",
        json!({
            "id": tool_id,
            "name": tool_name,
            "content": result.content,
            "is_error": result.is_error,
        }),
    );
    let _ = app.emit(
        "tool-executed",
        json!({ "session_id": session_id, "tool_name": tool_name }),
    );

    let _ = max_tokens; // unused here, passed through for spawn_agent
    Ok(result)
}

// ── Anthropic tool loop ───────────────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
async fn run_anthropic_tool_loop(
    app: &AppHandle,
    session_id: &str,
    model: &str,
    api_key: &str,
    system: Option<&str>,
    mut messages: Vec<Value>,
    mcp_tools: Vec<Value>,
    project_dir: &str,
    trust_level: &str,
    pending_approvals: &PendingApprovals,
    always_allow: &AlwaysAllowState,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
) -> Result<(String, Option<i64>, Option<i64>), String> {
    let mut all_tools = tools::tool_schemas();
    all_tools.push(spawn_agent_schema());
    all_tools.extend(mcp_tools);

    let mut final_text = String::new();
    let mut total_input_tokens: Option<i64> = None;
    let mut total_output_tokens: Option<i64> = None;
    let client = reqwest::Client::new();

    // OAuth detection: empty key or key not starting with "sk-" → Bearer auth
    let use_oauth = api_key.is_empty() || !api_key.starts_with("sk-");

    for _iteration in 0..MAX_ITERATIONS {
        let mut body = json!({
            "model": model,
            "max_tokens": max_tokens.unwrap_or(8096) as i64,
            "tools": all_tools,
            "messages": messages,
        });
        if let Some(sys) = system {
            body["system"] = json!(substitute_vars(sys, Some(project_dir)));
        }
        if let Some(t) = temperature {
            body["temperature"] = json!(t);
        }

        let mut req = client
            .post("https://api.anthropic.com/v1/messages")
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json");

        if use_oauth {
            req = req
                .bearer_auth(api_key)
                .header("anthropic-beta", "claude-code-20250219,oauth-2025-04-20");
        } else {
            req = req.header("x-api-key", api_key);
        }

        let response = req.json(&body).send().await.map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Anthropic API error {status}: {text}"));
        }

        let resp: Value = response.json().await.map_err(|e| e.to_string())?;

        if let Some(usage) = resp["usage"].as_object() {
            if let Some(n) = usage.get("input_tokens").and_then(|v| v.as_i64()) {
                total_input_tokens = Some(total_input_tokens.unwrap_or(0) + n);
            }
            if let Some(n) = usage.get("output_tokens").and_then(|v| v.as_i64()) {
                total_output_tokens = Some(total_output_tokens.unwrap_or(0) + n);
            }
        }

        let stop_reason = resp["stop_reason"].as_str().unwrap_or("end_turn");
        let content_blocks = resp["content"].as_array().cloned().unwrap_or_default();

        let mut text_this_turn = String::new();
        for block in &content_blocks {
            if block["type"] == "text" {
                if let Some(t) = block["text"].as_str() {
                    text_this_turn.push_str(t);
                    let _ = app.emit("ai-chunk", t);
                }
            }
        }
        if !text_this_turn.is_empty() {
            final_text = text_this_turn;
        }

        if stop_reason != "tool_use" {
            break;
        }

        let tool_uses: Vec<&Value> = content_blocks
            .iter()
            .filter(|b| b["type"] == "tool_use")
            .collect();

        if tool_uses.is_empty() {
            break;
        }

        messages.push(json!({ "role": "assistant", "content": content_blocks }));

        let mut tool_results: Vec<Value> = Vec::new();
        for tool_use in tool_uses {
            let tool_id = tool_use["id"].as_str().unwrap_or("").to_string();
            let tool_name = tool_use["name"].as_str().unwrap_or("").to_string();
            let tool_input = tool_use["input"].clone();

            let result = execute_tool_with_gate(
                app,
                session_id,
                &tool_name,
                &tool_input,
                &tool_id,
                project_dir,
                trust_level,
                pending_approvals,
                always_allow,
                temperature,
                max_tokens,
            )
            .await?;

            tool_results.push(json!({
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": result.content,
                "is_error": result.is_error,
            }));
        }

        messages.push(json!({ "role": "user", "content": tool_results }));
    }

    Ok((final_text, total_input_tokens, total_output_tokens))
}

// ── OpenAI-compat tool loop ───────────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
async fn run_openai_tool_loop(
    app: &AppHandle,
    session_id: &str,
    provider: &str,
    model: &str,
    api_key: &str,
    system: Option<&str>,
    history: &[Message],
    mcp_tools: Vec<Value>,
    project_dir: &str,
    trust_level: &str,
    pending_approvals: &PendingApprovals,
    always_allow: &AlwaysAllowState,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
) -> Result<(String, Option<i64>, Option<i64>), String> {
    let ollama_base_owned: String;
    let base: &str = if provider == "ollama" {
        ollama_base_owned = {
            let raw = crate::store::get_api_key(app, "ollama")
                .unwrap_or_default();
            let url = if raw.starts_with("http") { raw } else { "http://localhost:11434".to_string() };
            format!("{}/v1", url.trim_end_matches('/').trim_end_matches("/v1"))
        };
        &ollama_base_owned
    } else {
        crate::stream::provider_base_url(provider)
    };

    // Build initial messages in OpenAI format
    let mut messages: Vec<Value> = Vec::new();
    if let Some(sys) = system {
        messages.push(json!({ "role": "system", "content": substitute_vars(sys, Some(project_dir)) }));
    }
    for m in history.iter().filter(|m| m.role == "user" || m.role == "assistant") {
        messages.push(json!({ "role": m.role, "content": m.content }));
    }

    let mut anthropic_schemas = tools::tool_schemas();
    anthropic_schemas.push(spawn_agent_schema());
    anthropic_schemas.extend(mcp_tools);
    let openai_tools = tools::anthropic_to_openai_tools(&anthropic_schemas);

    let mut final_text = String::new();
    let client = reqwest::Client::new();

    for _iteration in 0..MAX_ITERATIONS {
        let mut body = json!({
            "model": model,
            "messages": messages,
            "tools": openai_tools,
        });
        if let Some(t) = temperature {
            body["temperature"] = json!(t);
        }
        if let Some(n) = max_tokens {
            body["max_tokens"] = json!(n);
        }

        let mut req = client
            .post(format!("{base}/chat/completions"))
            .header("content-type", "application/json");

        if !api_key.is_empty() {
            req = req.bearer_auth(api_key);
        }

        let response = req.json(&body).send().await.map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            if provider == "ollama" && status.as_u16() == 404 {
                let model_hint = serde_json::from_str::<Value>(&text)
                    .ok()
                    .and_then(|v| v["error"]["message"].as_str().map(|s| s.to_string()))
                    .unwrap_or_else(|| format!("model '{model}' not found"));
                return Err(format!("{model_hint}\n\nRun in terminal:  ollama pull {model}"));
            }
            return Err(format!("{provider} API error {status}: {text}"));
        }

        let resp: Value = response.json().await.map_err(|e| e.to_string())?;

        let choice = &resp["choices"][0];
        let finish_reason = choice["finish_reason"].as_str().unwrap_or("stop");
        let message = &choice["message"];

        // Emit text content
        if let Some(text) = message["content"].as_str() {
            if !text.is_empty() {
                final_text = text.to_string();
                let _ = app.emit("ai-chunk", text);
            }
        }

        if finish_reason != "tool_calls" {
            break;
        }

        let tool_calls = match message["tool_calls"].as_array() {
            Some(tc) if !tc.is_empty() => tc.clone(),
            _ => break,
        };

        // Push assistant message with tool_calls
        messages.push(json!({
            "role": "assistant",
            "content": message["content"],
            "tool_calls": tool_calls,
        }));

        for tc in &tool_calls {
            let tool_id = tc["id"].as_str().unwrap_or("").to_string();
            let tool_name = tc["function"]["name"].as_str().unwrap_or("").to_string();
            let args_str = tc["function"]["arguments"].as_str().unwrap_or("{}");
            let tool_input: Value =
                serde_json::from_str(args_str).unwrap_or_else(|_| json!({}));

            let result = execute_tool_with_gate(
                app,
                session_id,
                &tool_name,
                &tool_input,
                &tool_id,
                project_dir,
                trust_level,
                pending_approvals,
                always_allow,
                temperature,
                max_tokens,
            )
            .await?;

            messages.push(json!({
                "role": "tool",
                "tool_call_id": tool_id,
                "content": result.content,
            }));
        }
    }

    Ok((final_text, None, None))
}

// ── Gemini tool loop ──────────────────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
async fn run_gemini_tool_loop(
    app: &AppHandle,
    session_id: &str,
    model: &str,
    api_key: &str,
    system: Option<&str>,
    history: &[Message],
    mcp_tools: Vec<Value>,
    project_dir: &str,
    trust_level: &str,
    pending_approvals: &PendingApprovals,
    always_allow: &AlwaysAllowState,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
) -> Result<(String, Option<i64>, Option<i64>), String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    );

    let mut contents: Vec<Value> = history
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .map(|m| {
            json!({
                "role": if m.role == "assistant" { "model" } else { "user" },
                "parts": [{ "text": m.content }]
            })
        })
        .collect();

    let mut anthropic_schemas = tools::tool_schemas();
    anthropic_schemas.push(spawn_agent_schema());
    anthropic_schemas.extend(mcp_tools);
    let gemini_tools = tools::anthropic_to_gemini_tools(&anthropic_schemas);

    let mut final_text = String::new();
    let client = reqwest::Client::new();

    for _iteration in 0..MAX_ITERATIONS {
        let mut body = json!({ "contents": contents, "tools": gemini_tools });
        if let Some(sys) = system {
            body["systemInstruction"] = json!({
                "parts": [{ "text": substitute_vars(sys, Some(project_dir)) }]
            });
        }
        {
            let mut gen_config = serde_json::Map::new();
            if let Some(t) = temperature {
                gen_config.insert("temperature".to_string(), json!(t));
            }
            if let Some(n) = max_tokens {
                gen_config.insert("maxOutputTokens".to_string(), json!(n));
            }
            if !gen_config.is_empty() {
                body["generationConfig"] = Value::Object(gen_config);
            }
        }

        let response = client
            .post(&url)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Gemini API error {status}: {text}"));
        }

        let resp: Value = response.json().await.map_err(|e| e.to_string())?;

        let candidate = &resp["candidates"][0];
        let finish_reason = candidate["finishReason"].as_str().unwrap_or("STOP");
        let parts = candidate["content"]["parts"].as_array().cloned().unwrap_or_default();
        let role = candidate["content"]["role"].as_str().unwrap_or("model");

        // Emit text parts
        let mut text_this_turn = String::new();
        for part in &parts {
            if let Some(text) = part["text"].as_str() {
                if !text.is_empty() {
                    text_this_turn.push_str(text);
                    let _ = app.emit("ai-chunk", text);
                }
            }
        }
        if !text_this_turn.is_empty() {
            final_text = text_this_turn;
        }

        // Check for function calls
        let fn_calls: Vec<&Value> = parts
            .iter()
            .filter(|p| p.get("functionCall").is_some())
            .collect();

        if finish_reason != "FUNCTION_CALL" || fn_calls.is_empty() {
            break;
        }

        // Push model turn
        contents.push(json!({
            "role": role,
            "parts": parts,
        }));

        let mut function_responses: Vec<Value> = Vec::new();
        for fn_part in fn_calls {
            let fc = &fn_part["functionCall"];
            let tool_name = fc["name"].as_str().unwrap_or("").to_string();
            let tool_input = fc["args"].clone();
            let tool_id = format!("gemini-{tool_name}");

            let result = execute_tool_with_gate(
                app,
                session_id,
                &tool_name,
                &tool_input,
                &tool_id,
                project_dir,
                trust_level,
                pending_approvals,
                always_allow,
                temperature,
                max_tokens,
            )
            .await?;

            function_responses.push(json!({
                "functionResponse": {
                    "name": tool_name,
                    "response": { "output": result.content }
                }
            }));
        }

        contents.push(json!({
            "role": "user",
            "parts": function_responses,
        }));
    }

    Ok((final_text, None, None))
}

// ── public entry point ────────────────────────────────────────────────────────

/// Run the full agentic loop. Returns (response_text, input_tokens, output_tokens).
#[allow(clippy::too_many_arguments)]
pub async fn run_agent_loop(
    app: &AppHandle,
    session_id: &str,
    provider: &str,
    model: &str,
    api_key: &str,
    system: Option<&str>,
    history: Vec<Message>,
    pending_approvals: &PendingApprovals,
    always_allow: &AlwaysAllowState,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    global_system_prompt: Option<&str>,
) -> Result<(String, Option<i64>, Option<i64>), String> {
    // Merge global system prompt with agent system prompt
    let merged_system: Option<String> = match (global_system_prompt, system) {
        (Some(g), _) if g.trim().is_empty() => system.map(|s| s.to_string()),
        (Some(g), Some(s)) => Some(format!("{}\n\n{}", g, s)),
        (Some(g), None) => Some(g.to_string()),
        (None, s) => s.map(|s| s.to_string()),
    };
    let system = merged_system.as_deref();

    let (project_dir, trust_level) = get_session_context(app, session_id)?;

    // Collect MCP tool schemas
    let mcp_tools: Vec<Value> = {
        let mcp_state = app.try_state::<McpState>();
        match mcp_state {
            Some(state) => {
                let clients = state.clients.lock().unwrap_or_else(|e| e.into_inner());
                crate::mcp::collect_mcp_tool_schemas(&clients)
            }
            None => Vec::new(),
        }
    };

    match provider {
        "anthropic" => {
            let messages: Vec<Value> = history
                .iter()
                .filter(|m| m.role == "user" || m.role == "assistant")
                .map(|m| json!({ "role": m.role, "content": m.content }))
                .collect();

            run_anthropic_tool_loop(
                app,
                session_id,
                model,
                api_key,
                system,
                messages,
                mcp_tools,
                &project_dir,
                &trust_level,
                pending_approvals,
                always_allow,
                temperature,
                max_tokens,
            )
            .await
        }
        "gemini" => {
            run_gemini_tool_loop(
                app,
                session_id,
                model,
                api_key,
                system,
                &history,
                mcp_tools,
                &project_dir,
                &trust_level,
                pending_approvals,
                always_allow,
                temperature,
                max_tokens,
            )
            .await
        }
        _ => {
            // openai, groq, deepseek, openrouter, mistral, grok, ollama
            run_openai_tool_loop(
                app,
                session_id,
                provider,
                model,
                api_key,
                system,
                &history,
                mcp_tools,
                &project_dir,
                &trust_level,
                pending_approvals,
                always_allow,
                temperature,
                max_tokens,
            )
            .await
        }
    }
}

// ── file diff helpers ─────────────────────────────────────────────────────────

fn resolve_file_path(tool_input: &Value, project_dir: &str) -> Option<std::path::PathBuf> {
    let raw = tool_input["file_path"].as_str()?;
    let p = std::path::Path::new(raw);
    if p.is_absolute() {
        Some(p.to_path_buf())
    } else {
        Some(std::path::Path::new(project_dir).join(p))
    }
}

async fn capture_file_content(
    tool_name: &str,
    tool_input: &Value,
    project_dir: &str,
) -> Option<String> {
    if tool_name != "write" && tool_name != "edit" {
        return None;
    }
    let path = resolve_file_path(tool_input, project_dir)?;
    tokio::fs::read_to_string(&path).await.ok()
}

async fn emit_file_diff(
    app: &AppHandle,
    tool_name: &str,
    tool_input: &Value,
    project_dir: &str,
    before: Option<String>,
    is_error: bool,
) {
    if (tool_name != "write" && tool_name != "edit") || is_error {
        return;
    }
    let path = match resolve_file_path(tool_input, project_dir) {
        Some(p) => p,
        None => return,
    };
    let after = match tokio::fs::read_to_string(&path).await {
        Ok(c) => c,
        Err(_) => return,
    };
    let path_str = path.to_string_lossy().to_string();
    let _ = app.emit(
        "file-diff",
        FileDiff {
            path: path_str,
            before,
            after,
            tool: tool_name.to_string(),
        },
    );
}

fn substitute_vars(template: &str, cwd: Option<&str>) -> String {
    let now = chrono::Local::now();
    let date = now.format("%Y-%m-%d").to_string();
    let time = now.format("%H:%M").to_string();
    template
        .replace("{date}", &date)
        .replace("{time}", &time)
        .replace("{cwd}", cwd.unwrap_or("unknown"))
        .replace("{os}", std::env::consts::OS)
        .replace("{arch}", std::env::consts::ARCH)
}

/// Called by the `approve_tool` command to resolve a pending approval.
pub fn resolve_approval(
    pending_approvals: &PendingApprovals,
    tool_id: &str,
    approved: bool,
) -> Result<(), String> {
    let mut map = pending_approvals.lock().map_err(|e| e.to_string())?;
    match map.remove(tool_id) {
        Some(tx) => {
            let _ = tx.send(approved);
            Ok(())
        }
        None => Err(format!("No pending tool with id '{tool_id}'")),
    }
}
