use crate::mcp_oauth::{self, OAuthClientReg, OAuthMetadata, OAuthTokens, PendingAuth, PendingAuthMap};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum McpTransportKind {
    Stdio,
    Http,
}

impl Default for McpTransportKind {
    fn default() -> Self {
        Self::Stdio
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum McpAuthConfig {
    None,
    Bearer {
        token: String,
    },
    OAuth {
        #[serde(default)]
        scopes: Vec<String>,
        #[serde(default)]
        metadata: Option<OAuthMetadata>,
        #[serde(default)]
        client: Option<OAuthClientReg>,
        #[serde(default)]
        tokens: Option<OAuthTokens>,
    },
}

impl Default for McpAuthConfig {
    fn default() -> Self {
        Self::None
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub transport: McpTransportKind,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub auth: McpAuthConfig,
    pub enabled: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct McpToolInfo {
    pub server_id: String,
    pub server_name: String,
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

struct StdioState {
    child: Option<Child>,
    stdin: Option<std::process::ChildStdin>,
    stdout_reader: Option<BufReader<std::process::ChildStdout>>,
}

struct HttpState {
    client: reqwest::blocking::Client,
    url: String,
    session_id: Option<String>,
}

enum TransportState {
    Stdio(StdioState),
    Http(HttpState),
}

pub struct McpClient {
    pub config: McpServerConfig,
    transport: Option<TransportState>,
    next_id: u64,
    pub tools: Vec<McpToolInfo>,
    pub error: Option<String>,
}

impl McpClient {
    pub fn new(config: McpServerConfig) -> Self {
        Self {
            config,
            transport: None,
            next_id: 1,
            tools: Vec::new(),
            error: None,
        }
    }

    pub fn start(&mut self) -> Result<(), String> {
        self.stop();
        self.error = None;

        match self.config.transport {
            McpTransportKind::Stdio => self.start_stdio()?,
            McpTransportKind::Http => self.start_http()?,
        }

        // Initialize
        let init_result = self.send_request(
            "initialize",
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "hashmark", "version": "1.0" }
            }),
        );
        if let Err(e) = init_result {
            self.error = Some(format!("Initialize failed: {e}"));
            self.stop();
            return Err(self.error.clone().unwrap());
        }

        self.send_notification("notifications/initialized", json!({}));

        match self.send_request("tools/list", json!({})) {
            Ok(resp) => {
                let tools_arr = resp["tools"].as_array().cloned().unwrap_or_default();
                self.tools = tools_arr
                    .into_iter()
                    .filter_map(|t| {
                        let name = t["name"].as_str()?.to_string();
                        let description = t["description"].as_str().unwrap_or("").to_string();
                        let input_schema = t["inputSchema"].clone();
                        Some(McpToolInfo {
                            server_id: self.config.id.clone(),
                            server_name: self.config.name.clone(),
                            name,
                            description,
                            input_schema,
                        })
                    })
                    .collect();
            }
            Err(e) => {
                self.error = Some(format!("tools/list failed: {e}"));
                self.stop();
                return Err(self.error.clone().unwrap());
            }
        }

        Ok(())
    }

    fn start_stdio(&mut self) -> Result<(), String> {
        if self.config.command.is_empty() {
            return Err("stdio transport requires 'command'".to_string());
        }
        let mut cmd = Command::new(&self.config.command);
        cmd.args(&self.config.args)
            .envs(&self.config.env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        let mut child = cmd.spawn().map_err(|e| {
            let msg = format!("Failed to spawn '{}': {e}", self.config.command);
            self.error = Some(msg.clone());
            msg
        })?;

        let stdin = child.stdin.take().ok_or_else(|| "Failed to capture stdin".to_string())?;
        let stdout = child.stdout.take().ok_or_else(|| "Failed to capture stdout".to_string())?;

        self.transport = Some(TransportState::Stdio(StdioState {
            child: Some(child),
            stdin: Some(stdin),
            stdout_reader: Some(BufReader::new(stdout)),
        }));
        Ok(())
    }

    fn start_http(&mut self) -> Result<(), String> {
        if self.config.url.is_empty() {
            return Err("http transport requires 'url'".to_string());
        }
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| format!("build http client: {e}"))?;
        self.transport = Some(TransportState::Http(HttpState {
            client,
            url: self.config.url.clone(),
            session_id: None,
        }));
        Ok(())
    }

    pub fn call_tool(&mut self, name: &str, arguments: Value) -> Result<String, String> {
        let resp = self.send_request(
            "tools/call",
            json!({ "name": name, "arguments": arguments }),
        )?;

        let content = resp["content"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|c| {
                        if c["type"] == "text" {
                            c["text"].as_str().map(|s| s.to_string())
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default();

        let is_error = resp["isError"].as_bool().unwrap_or(false);
        if is_error {
            Err(content)
        } else {
            Ok(content)
        }
    }

    fn send_request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;

        let request = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });

        match self.transport.as_mut() {
            Some(TransportState::Stdio(_)) => self.stdio_request(id, &request),
            Some(TransportState::Http(_)) => self.http_request(id, &request, method),
            None => Err("MCP client not started".to_string()),
        }
    }

    fn stdio_request(&mut self, id: u64, request: &Value) -> Result<Value, String> {
        {
            let state = match self.transport.as_mut() {
                Some(TransportState::Stdio(s)) => s,
                _ => return Err("stdio transport not active".to_string()),
            };
            let stdin = state.stdin.as_mut().ok_or("stdio not running")?;
            let serialized = serde_json::to_string(request).map_err(|e| e.to_string())?;
            stdin.write_all(serialized.as_bytes()).map_err(|e| e.to_string())?;
            stdin.write_all(b"\n").map_err(|e| e.to_string())?;
            stdin.flush().map_err(|e| e.to_string())?;
        }

        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if Instant::now() > deadline {
                return Err("Request timed out after 10s".to_string());
            }
            let line = {
                let state = match self.transport.as_mut() {
                    Some(TransportState::Stdio(s)) => s,
                    _ => return Err("stdio transport not active".to_string()),
                };
                let reader = state.stdout_reader.as_mut().ok_or("stdio not running")?;
                let mut line = String::new();
                reader.read_line(&mut line).map_err(|e| e.to_string())?;
                if line.is_empty() {
                    return Err("MCP server closed connection".to_string());
                }
                line
            };
            if line.trim().is_empty() {
                continue;
            }
            let parsed: Value = serde_json::from_str(&line)
                .map_err(|e| format!("Invalid JSON from MCP server: {e}"))?;
            if parsed.get("id").is_none() {
                continue;
            }
            if parsed["id"].as_u64() == Some(id) {
                if let Some(err) = parsed.get("error") {
                    let msg = err["message"].as_str().unwrap_or("Unknown error");
                    return Err(msg.to_string());
                }
                return Ok(parsed["result"].clone());
            }
        }
    }

    fn http_request(&mut self, id: u64, request: &Value, method: &str) -> Result<Value, String> {
        let is_initialize = method == "initialize";
        let resp = self.http_post(request, false)?;

        // Initialize may return Mcp-Session-Id header
        if is_initialize {
            if let Some(sid) = resp.session_id {
                if let Some(TransportState::Http(s)) = self.transport.as_mut() {
                    s.session_id = Some(sid);
                }
            }
        }

        // Response body: JSON directly, or SSE stream containing a JSON-RPC response
        let body = resp.body;
        let is_sse = resp.content_type.starts_with("text/event-stream");
        let parsed: Value = if is_sse {
            parse_sse_response(&body, id)?
        } else {
            serde_json::from_str(&body).map_err(|e| format!("parse response: {e}"))?
        };

        // Single or batch? We send single requests only.
        let parsed = if parsed.is_array() {
            parsed
                .as_array()
                .unwrap()
                .iter()
                .find(|v| v["id"].as_u64() == Some(id))
                .cloned()
                .ok_or_else(|| "no matching response id in batch".to_string())?
        } else {
            parsed
        };

        if parsed.get("id").is_some() && parsed["id"].as_u64() != Some(id) {
            return Err("response id mismatch".to_string());
        }
        if let Some(err) = parsed.get("error") {
            let msg = err["message"].as_str().unwrap_or("Unknown error");
            return Err(msg.to_string());
        }
        Ok(parsed["result"].clone())
    }

    fn http_post(&mut self, request: &Value, is_notification: bool) -> Result<HttpResponseMeta, String> {
        // Snapshot what we need from transport without borrow conflict
        let (client, url, session_id) = {
            let state = match self.transport.as_ref() {
                Some(TransportState::Http(s)) => s,
                _ => return Err("http transport not active".to_string()),
            };
            (state.client.clone(), state.url.clone(), state.session_id.clone())
        };

        let mut attempt = 0;
        loop {
            attempt += 1;
            let mut req = client
                .post(&url)
                .header("Accept", "application/json, text/event-stream")
                .header("Content-Type", "application/json")
                .json(request);
            if let Some(sid) = &session_id {
                req = req.header("Mcp-Session-Id", sid);
            }
            if let Some(header) = self.auth_header()? {
                req = req.header("Authorization", header);
            }

            let resp = req
                .send()
                .map_err(|e| format!("http request failed: {e}"))?;
            let status = resp.status();

            if status.as_u16() == 401 && attempt <= 2 {
                let www_authenticate = resp
                    .headers()
                    .get("www-authenticate")
                    .and_then(|v| v.to_str().ok())
                    .map(String::from);
                match self.refresh_auth(www_authenticate.as_deref()) {
                    Ok(true) => continue,
                    Ok(false) => {
                        let text = resp.text().unwrap_or_default();
                        return Err(format!(
                            "MCP server requires authentication (401). {text}"
                        ));
                    }
                    Err(e) => return Err(format!("auth refresh failed: {e}")),
                }
            }

            if !status.is_success() {
                if is_notification && status.as_u16() == 202 {
                    return Ok(HttpResponseMeta::empty());
                }
                let text = resp.text().unwrap_or_default();
                return Err(format!("MCP HTTP {status}: {text}"));
            }

            if status.as_u16() == 202 {
                // Notification accepted, no body expected
                return Ok(HttpResponseMeta::empty());
            }

            let content_type = resp
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            let session_id = resp
                .headers()
                .get("mcp-session-id")
                .and_then(|v| v.to_str().ok())
                .map(String::from);
            let body = resp.text().map_err(|e| format!("read body: {e}"))?;
            return Ok(HttpResponseMeta {
                body,
                content_type,
                session_id,
            });
        }
    }

    fn auth_header(&self) -> Result<Option<String>, String> {
        match &self.config.auth {
            McpAuthConfig::None => Ok(None),
            McpAuthConfig::Bearer { token } => {
                if token.is_empty() {
                    Ok(None)
                } else {
                    Ok(Some(format!("Bearer {token}")))
                }
            }
            McpAuthConfig::OAuth { tokens: Some(t), .. } if !t.access_token.is_empty() => {
                let token_type = if t.token_type.is_empty() { "Bearer" } else { &t.token_type };
                Ok(Some(format!("{token_type} {}", t.access_token)))
            }
            McpAuthConfig::OAuth { .. } => Ok(None),
        }
    }

    /// Try to refresh OAuth tokens. Returns Ok(true) if retry should happen,
    /// Ok(false) if user action is needed, Err for hard failures.
    fn refresh_auth(&mut self, _www_authenticate: Option<&str>) -> Result<bool, String> {
        let (refresh_token, metadata, client_reg) = match &self.config.auth {
            McpAuthConfig::OAuth { tokens: Some(t), metadata: Some(m), client: Some(c), .. } => {
                match &t.refresh_token {
                    Some(rt) => (rt.clone(), m.clone(), c.clone()),
                    None => return Ok(false),
                }
            }
            _ => return Ok(false),
        };
        let http = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| format!("build client: {e}"))?;
        let new_tokens = mcp_oauth::refresh_token(&http, &metadata.token_endpoint, &client_reg, &refresh_token)?;
        if let McpAuthConfig::OAuth { tokens, .. } = &mut self.config.auth {
            *tokens = Some(new_tokens);
        }
        Ok(true)
    }

    fn send_notification(&mut self, method: &str, params: Value) {
        let msg = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        });
        match self.transport.as_mut() {
            Some(TransportState::Stdio(state)) => {
                if let Some(stdin) = state.stdin.as_mut() {
                    let serialized = serde_json::to_string(&msg).unwrap_or_default();
                    let _ = stdin.write_all(serialized.as_bytes());
                    let _ = stdin.write_all(b"\n");
                    let _ = stdin.flush();
                }
            }
            Some(TransportState::Http(_)) => {
                let _ = self.http_post(&msg, true);
            }
            None => {}
        }
    }

    pub fn stop(&mut self) {
        match self.transport.take() {
            Some(TransportState::Stdio(mut state)) => {
                state.stdin.take();
                state.stdout_reader.take();
                if let Some(mut child) = state.child.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
            Some(TransportState::Http(state)) => {
                if let Some(sid) = &state.session_id {
                    let _ = state
                        .client
                        .delete(&state.url)
                        .header("Mcp-Session-Id", sid)
                        .send();
                }
            }
            None => {}
        }
    }

    pub fn is_running(&self) -> bool {
        self.transport.is_some()
    }
}

impl Drop for McpClient {
    fn drop(&mut self) {
        self.stop();
    }
}

struct HttpResponseMeta {
    body: String,
    content_type: String,
    session_id: Option<String>,
}

impl HttpResponseMeta {
    fn empty() -> Self {
        Self {
            body: String::new(),
            content_type: String::new(),
            session_id: None,
        }
    }
}

/// Parse an SSE-encoded body and extract the first JSON-RPC message matching the id.
fn parse_sse_response(body: &str, id: u64) -> Result<Value, String> {
    let mut data_buf = String::new();
    for line in body.lines() {
        if line.starts_with("data:") {
            let payload = line.trim_start_matches("data:").trim_start();
            if !data_buf.is_empty() {
                data_buf.push('\n');
            }
            data_buf.push_str(payload);
        } else if line.is_empty() && !data_buf.is_empty() {
            if let Ok(v) = serde_json::from_str::<Value>(&data_buf) {
                if v["id"].as_u64() == Some(id) {
                    return Ok(v);
                }
                if let Some(arr) = v.as_array() {
                    if arr.iter().any(|e| e["id"].as_u64() == Some(id)) {
                        return Ok(v);
                    }
                }
            }
            data_buf.clear();
        }
    }
    // Last event (no trailing blank line)
    if !data_buf.is_empty() {
        if let Ok(v) = serde_json::from_str::<Value>(&data_buf) {
            return Ok(v);
        }
    }
    Err("no matching SSE event found".to_string())
}

// ── Global state ─────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct McpState {
    pub configs: Arc<Mutex<Vec<McpServerConfig>>>,
    pub clients: Arc<Mutex<HashMap<String, McpClient>>>,
    pub pending_auth: PendingAuthMap,
}

impl McpState {
    pub fn clone_handle(&self) -> Self {
        self.clone()
    }
}

impl Default for McpState {
    fn default() -> Self {
        Self {
            configs: Arc::new(Mutex::new(Vec::new())),
            clients: Arc::new(Mutex::new(HashMap::new())),
            pending_auth: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

const MCP_STORE_KEY: &str = "mcp_servers";

pub fn init_mcp(app: &tauri::AppHandle) -> McpState {
    use tauri_plugin_store::StoreExt;

    let state = McpState::default();

    let configs: Vec<McpServerConfig> = app
        .store("settings.json")
        .ok()
        .and_then(|s| s.get(MCP_STORE_KEY))
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    {
        let mut cfg_lock = state.configs.lock().unwrap();
        *cfg_lock = configs.clone();
    }

    let clients_arc = state.clients.clone();
    std::thread::spawn(move || {
        let mut clients = clients_arc.lock().unwrap();
        for config in configs {
            if config.enabled {
                let mut client = McpClient::new(config.clone());
                if let Err(e) = client.start() {
                    log::warn!("MCP server '{}' failed to start: {e}", config.name);
                }
                clients.insert(config.id, client);
            }
        }
    });

    state
}

pub fn save_configs(app: &tauri::AppHandle, configs: &[McpServerConfig]) {
    use tauri_plugin_store::StoreExt;

    if let Ok(store) = app.store("settings.json") {
        let val = serde_json::to_value(configs).unwrap_or(json!([]));
        store.set(MCP_STORE_KEY, val);
        let _ = store.save();
    }
}

pub fn collect_mcp_tool_schemas(clients: &HashMap<String, McpClient>) -> Vec<Value> {
    clients
        .values()
        .flat_map(|c| &c.tools)
        .map(|tool| {
            json!({
                "name": format!("mcp__{}__{}", tool.server_id.replace('-', "_"), tool.name),
                "description": format!("[MCP: {}] {}", tool.server_name, tool.description),
                "input_schema": tool.input_schema,
            })
        })
        .collect()
}

pub fn try_call_mcp_tool(
    clients: &mut HashMap<String, McpClient>,
    tool_name: &str,
    input: &Value,
) -> Option<Result<String, String>> {
    if !tool_name.starts_with("mcp__") {
        return None;
    }
    let rest = &tool_name[5..];
    let parts: Vec<&str> = rest.splitn(2, "__").collect();
    if parts.len() != 2 {
        return Some(Err(format!("Malformed MCP tool name: {tool_name}")));
    }
    let server_id_underscored = parts[0];
    let actual_tool_name = parts[1];
    let client = clients
        .values_mut()
        .find(|c| c.config.id.replace('-', "_") == server_id_underscored);
    match client {
        Some(c) => Some(c.call_tool(actual_tool_name, input.clone())),
        None => Some(Err(format!("MCP server not found for tool: {tool_name}"))),
    }
}

// ── OAuth bootstrap API (called from commands) ───────────────────────────────

pub struct AuthStartResult {
    pub authorize_url: String,
    pub redirect_uri: String,
}

/// Phase 1 of OAuth: discover endpoints, register client, build auth URL,
/// bind a redirect listener in a background thread and return the URL for the UI
/// to open. The listener thread stores the resulting tokens in the config on success.
pub fn start_oauth(
    state: &McpState,
    app: &tauri::AppHandle,
    server_id: &str,
) -> Result<AuthStartResult, String> {
    // Lock only briefly to snapshot config data we need
    let (mut config, idx) = {
        let configs = state.configs.lock().map_err(|e| e.to_string())?;
        let idx = configs
            .iter()
            .position(|c| c.id == server_id)
            .ok_or_else(|| format!("server not found: {server_id}"))?;
        (configs[idx].clone(), idx)
    };
    if config.transport != McpTransportKind::Http {
        return Err("OAuth is only supported for HTTP transport".to_string());
    }
    let scopes = match &config.auth {
        McpAuthConfig::OAuth { scopes, .. } => scopes.clone(),
        _ => Vec::new(),
    };

    let http = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("build client: {e}"))?;

    // Discover metadata. Probe the MCP URL first to extract resource_metadata.
    let metadata = if let Some(existing) = match &config.auth {
        McpAuthConfig::OAuth { metadata: Some(m), .. } => Some(m.clone()),
        _ => None,
    } {
        existing
    } else {
        let probe = http.post(&config.url).json(&json!({})).send().ok();
        let resource_metadata_url = probe
            .as_ref()
            .and_then(|r| r.headers().get("www-authenticate"))
            .and_then(|v| v.to_str().ok())
            .and_then(mcp_oauth::parse_resource_metadata_url);
        let issuer = if let Some(rm_url) = resource_metadata_url {
            mcp_oauth::fetch_resource_metadata(&http, &rm_url)?
        } else {
            // Fall back to guessing the issuer from the MCP URL's origin
            let parsed_url = reqwest::Url::parse(&config.url).map_err(|e| format!("bad url: {e}"))?;
            format!(
                "{}://{}",
                parsed_url.scheme(),
                parsed_url
                    .host_str()
                    .ok_or_else(|| "url has no host".to_string())?
            )
        };
        mcp_oauth::fetch_auth_server_metadata(&http, &issuer)?
    };

    // Bind redirect listener early to know the port for DCR + authorize URL
    let (port, listener) = mcp_oauth::bind_redirect_listener()?;
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");

    let client_reg = match &config.auth {
        McpAuthConfig::OAuth { client: Some(c), .. } => c.clone(),
        _ => {
            let reg_ep = metadata
                .registration_endpoint
                .as_deref()
                .ok_or_else(|| "server does not support DCR and no client_id is configured".to_string())?;
            mcp_oauth::register_client(&http, reg_ep, &redirect_uri)?
        }
    };

    let (verifier, challenge, oauth_state) = mcp_oauth::new_pkce_state();
    let authorize_url = mcp_oauth::build_authorize_url(
        &metadata,
        &client_reg.client_id,
        &redirect_uri,
        &scopes,
        &oauth_state,
        &challenge,
    );

    // Persist the discovered metadata + client registration back to config for reuse
    if let McpAuthConfig::OAuth { metadata: m, client: c, .. } = &mut config.auth {
        *m = Some(metadata.clone());
        *c = Some(client_reg.clone());
    }
    {
        let mut configs = state.configs.lock().map_err(|e| e.to_string())?;
        configs[idx] = config.clone();
        save_configs(app, &configs);
    }

    // Store pending auth for the listener thread to pick up
    let pending = PendingAuth {
        code_verifier: verifier,
        state: oauth_state,
        redirect_uri: redirect_uri.clone(),
        metadata: metadata.clone(),
        client: client_reg.clone(),
    };
    {
        let mut pa = state.pending_auth.lock().map_err(|e| e.to_string())?;
        pa.insert(server_id.to_string(), pending);
    }

    // Spawn listener — it blocks on accept and completes the flow
    let configs_arc = state.configs.clone();
    let pending_arc = state.pending_auth.clone();
    let clients_arc = state.clients.clone();
    let app_handle = app.clone();
    let server_id_owned = server_id.to_string();
    std::thread::spawn(move || {
        match mcp_oauth::wait_for_redirect(listener) {
            Ok(result) => {
                let pending_opt = {
                    let mut pa = pending_arc.lock().unwrap_or_else(|e| e.into_inner());
                    pa.remove(&server_id_owned)
                };
                let pending = match pending_opt {
                    Some(p) => p,
                    None => {
                        log::warn!("oauth: no pending auth for {server_id_owned}");
                        return;
                    }
                };
                if result.state != pending.state {
                    log::warn!("oauth: state mismatch for {server_id_owned}");
                    return;
                }
                let http = match reqwest::blocking::Client::builder()
                    .timeout(Duration::from_secs(15))
                    .build()
                {
                    Ok(c) => c,
                    Err(e) => {
                        log::warn!("oauth: build http: {e}");
                        return;
                    }
                };
                let tokens = match mcp_oauth::exchange_code(
                    &http,
                    &pending.metadata.token_endpoint,
                    &pending.client,
                    &result.code,
                    &pending.code_verifier,
                    &pending.redirect_uri,
                ) {
                    Ok(t) => t,
                    Err(e) => {
                        log::warn!("oauth: exchange_code: {e}");
                        return;
                    }
                };

                // Persist tokens and restart the client
                {
                    let mut configs = configs_arc.lock().unwrap_or_else(|e| e.into_inner());
                    if let Some(cfg) = configs.iter_mut().find(|c| c.id == server_id_owned) {
                        if let McpAuthConfig::OAuth { tokens: t, metadata: m, client: c, .. } = &mut cfg.auth {
                            *t = Some(tokens);
                            *m = Some(pending.metadata);
                            *c = Some(pending.client);
                        }
                        save_configs(&app_handle, &configs);
                    }
                }
                // Restart the client so the new tokens take effect
                let cfg = {
                    let configs = configs_arc.lock().unwrap_or_else(|e| e.into_inner());
                    configs.iter().find(|c| c.id == server_id_owned).cloned()
                };
                if let Some(cfg) = cfg {
                    let mut clients = clients_arc.lock().unwrap_or_else(|e| e.into_inner());
                    let mut client = McpClient::new(cfg);
                    if let Err(e) = client.start() {
                        log::warn!("oauth: restart after auth: {e}");
                    }
                    clients.insert(server_id_owned.clone(), client);
                }
                let _ = tauri::Emitter::emit(&app_handle, "mcp-oauth-complete", &server_id_owned);
            }
            Err(e) => {
                log::warn!("oauth: wait_for_redirect: {e}");
                let mut pa = pending_arc.lock().unwrap_or_else(|e| e.into_inner());
                pa.remove(&server_id_owned);
            }
        }
    });

    Ok(AuthStartResult {
        authorize_url,
        redirect_uri,
    })
}
