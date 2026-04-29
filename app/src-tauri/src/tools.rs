use serde_json::{json, Value};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

pub struct ToolResult {
    pub content: String,
    pub is_error: bool,
}

impl ToolResult {
    fn ok(content: impl Into<String>) -> Self {
        Self { content: content.into(), is_error: false }
    }
    fn err(content: impl Into<String>) -> Self {
        Self { content: content.into(), is_error: true }
    }
}

/// Returns the Anthropic tool schemas array for all 6 tools.
pub fn tool_schemas() -> Vec<Value> {
    vec![
        json!({
            "name": "bash",
            "description": "Run a shell command. Captures stdout + stderr. Times out after 30s.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "Shell command to execute"
                    },
                    "timeout_ms": {
                        "type": "integer",
                        "description": "Timeout in milliseconds (default 30000)"
                    }
                },
                "required": ["command"]
            }
        }),
        json!({
            "name": "read",
            "description": "Read a file and return line-numbered content.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Absolute or relative path to the file"
                    },
                    "offset": {
                        "type": "integer",
                        "description": "0-based line number to start reading from (default 0)"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max lines to return (default 2000)"
                    }
                },
                "required": ["file_path"]
            }
        }),
        json!({
            "name": "write",
            "description": "Write content to a file path, creating parent directories as needed.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Absolute or relative path to write to"
                    },
                    "content": {
                        "type": "string",
                        "description": "Content to write"
                    }
                },
                "required": ["file_path", "content"]
            }
        }),
        json!({
            "name": "edit",
            "description": "Find exact old_string in file and replace with new_string. Errors if not found or not unique.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Absolute or relative path to the file"
                    },
                    "old_string": {
                        "type": "string",
                        "description": "Exact string to find (must be unique in the file)"
                    },
                    "new_string": {
                        "type": "string",
                        "description": "Replacement string"
                    }
                },
                "required": ["file_path", "old_string", "new_string"]
            }
        }),
        json!({
            "name": "glob",
            "description": "Find files matching a glob pattern. Skips node_modules, .git, dist, target.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Glob pattern (e.g. '**/*.rs', 'src/**/*.ts')"
                    },
                    "path": {
                        "type": "string",
                        "description": "Directory to search in (default: project dir)"
                    }
                },
                "required": ["pattern"]
            }
        }),
        json!({
            "name": "grep",
            "description": "Search file contents using ripgrep. Returns matching lines.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Regex pattern to search for"
                    },
                    "path": {
                        "type": "string",
                        "description": "File or directory to search in (default: project dir)"
                    },
                    "glob": {
                        "type": "string",
                        "description": "Glob pattern to filter files (e.g. '*.rs')"
                    },
                    "-i": {
                        "type": "boolean",
                        "description": "Case insensitive search"
                    }
                },
                "required": ["pattern"]
            }
        }),
        json!({
            "name": "fetch_url",
            "description": "Fetch the content of a URL and return the readable text. Strips HTML tags. Useful for reading documentation, GitHub issues, API references, or any web page. Truncated to 15000 characters.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to fetch"
                    }
                },
                "required": ["url"]
            }
        }),
        json!({
            "name": "web_search",
            "description": "Search the web using DuckDuckGo. Returns top 5 results with titles, URLs, and snippets. Use this to find current information, documentation, or answers to questions that require up-to-date knowledge.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query"
                    }
                },
                "required": ["query"]
            }
        }),
    ]
}

/// Returns true if this tool requires user approval before execution.
pub fn requires_approval(tool_name: &str) -> bool {
    matches!(tool_name, "bash" | "write" | "edit")
}

pub struct DangerAnalysis {
    pub dangerous: bool,
    pub reason: Option<String>,
}

/// Analyse a tool call for danger signals. Returns a structured assessment.
pub fn analyze_tool_danger(tool_name: &str, input: &Value) -> DangerAnalysis {
    match tool_name {
        "bash" => analyze_bash(input["command"].as_str().unwrap_or("")),
        "delete_path" => analyze_delete(input["path"].as_str().unwrap_or(""), input["recursive"].as_bool().unwrap_or(false)),
        "write" | "edit" => analyze_path_write(input["file_path"].as_str().unwrap_or("")),
        _ => DangerAnalysis { dangerous: false, reason: None },
    }
}

fn analyze_bash(cmd: &str) -> DangerAnalysis {
    // Tokenize on shell separators to get individual command+arg lists
    let segments: Vec<&str> = cmd
        .split(|c: char| matches!(c, ';' | '\n'))
        .flat_map(|s| s.split("&&"))
        .flat_map(|s| s.split("||"))
        .flat_map(|s| s.split('|'))
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();

    for seg in &segments {
        let tokens: Vec<&str> = seg.split_whitespace().collect();
        let cmd_name = tokens.first().copied().unwrap_or("");

        // Strip sudo prefix to get the real command
        let (effective_cmd, args) = if cmd_name == "sudo" {
            (tokens.get(1).copied().unwrap_or(""), &tokens[2..])
        } else {
            (cmd_name, if tokens.len() > 1 { &tokens[1..] } else { &tokens[0..0] })
        };

        if cmd_name == "sudo" {
            return DangerAnalysis {
                dangerous: true,
                reason: Some("uses sudo (elevated privileges)".to_string()),
            };
        }

        match effective_cmd {
            "rm" | "rmdir" => {
                let flags: String = args.iter().filter(|a| a.starts_with('-')).cloned().collect::<Vec<_>>().join("");
                let has_r = flags.contains('r') || flags.contains('R');
                let has_f = flags.contains('f');
                let targets = args.iter().filter(|a| !a.starts_with('-')).cloned().collect::<Vec<_>>();
                let hits_sys = targets.iter().any(|t| is_system_path(t));
                let hits_wildcard = targets.iter().any(|t| t.contains('*'));
                if hits_sys || hits_wildcard || (has_r && has_f) {
                    return DangerAnalysis {
                        dangerous: true,
                        reason: Some(if hits_sys {
                            format!("deletes from system path: {}", targets.join(" "))
                        } else if hits_wildcard {
                            format!("rm with wildcard: {}", targets.join(" "))
                        } else {
                            "rm -rf (recursive force delete)".to_string()
                        }),
                    };
                }
            }
            "dd" | "shred" | "mkfs" | "fdisk" | "parted" | "wipefs" => {
                return DangerAnalysis {
                    dangerous: true,
                    reason: Some(format!("{effective_cmd} can destroy disk data")),
                };
            }
            "kill" | "pkill" | "killall" => {
                let force = args.iter().any(|a| *a == "-9" || *a == "-KILL");
                if force {
                    return DangerAnalysis {
                        dangerous: true,
                        reason: Some(format!("{effective_cmd} -9 (force kill)")),
                    };
                }
            }
            "chmod" | "chown" => {
                let targets = args.iter().filter(|a| !a.starts_with('-')).cloned().collect::<Vec<_>>();
                let hits_sys = targets.iter().any(|t| is_system_path(t));
                if hits_sys {
                    return DangerAnalysis {
                        dangerous: true,
                        reason: Some(format!("{effective_cmd} on system path")),
                    };
                }
            }
            "mv" | "cp" => {
                let targets = args.iter().filter(|a| !a.starts_with('-')).cloned().collect::<Vec<_>>();
                if targets.iter().any(|t| is_system_path(t)) {
                    return DangerAnalysis {
                        dangerous: true,
                        reason: Some(format!("{effective_cmd} involving system path")),
                    };
                }
            }
            _ => {}
        }

        // Pipe-to-shell pattern: curl ... | bash
        if matches!(effective_cmd, "bash" | "sh" | "zsh" | "fish") && cmd_name != effective_cmd {
            return DangerAnalysis {
                dangerous: true,
                reason: Some("pipe to shell (remote code execution risk)".to_string()),
            };
        }

        // Overwrite redirect to system path: > /etc/...
        if let Some(pos) = seg.find('>') {
            if !seg[pos..].starts_with(">>") {
                let after: &str = seg[pos + 1..].trim_start();
                if is_system_path(after.split_whitespace().next().unwrap_or("")) {
                    return DangerAnalysis {
                        dangerous: true,
                        reason: Some("redirect overwrites a system path".to_string()),
                    };
                }
            }
        }
    }

    // curl/wget piped to a shell (multi-segment check)
    if segments.len() >= 2 {
        let first = segments[0].split_whitespace().next().unwrap_or("");
        let last = segments[segments.len() - 1].split_whitespace().next().unwrap_or("");
        if matches!(first, "curl" | "wget") && matches!(last, "bash" | "sh" | "zsh") {
            return DangerAnalysis {
                dangerous: true,
                reason: Some("curl/wget piped to shell".to_string()),
            };
        }
    }

    DangerAnalysis { dangerous: false, reason: None }
}

fn analyze_delete(path: &str, recursive: bool) -> DangerAnalysis {
    if is_system_path(path) {
        return DangerAnalysis {
            dangerous: true,
            reason: Some(format!("deletes system path: {path}")),
        };
    }
    if recursive {
        return DangerAnalysis {
            dangerous: true,
            reason: Some("recursive delete".to_string()),
        };
    }
    DangerAnalysis { dangerous: false, reason: None }
}

fn analyze_path_write(path: &str) -> DangerAnalysis {
    if is_sensitive_path(path) {
        DangerAnalysis {
            dangerous: true,
            reason: Some(format!("writes to sensitive file: {path}")),
        }
    } else {
        DangerAnalysis { dangerous: false, reason: None }
    }
}

fn is_system_path(path: &str) -> bool {
    let p = path.trim_end_matches('/');
    matches!(p, "/" | "/etc" | "/usr" | "/bin" | "/sbin" | "/boot" | "/dev" | "/sys" | "/proc" | "/lib" | "/lib64")
        || p.starts_with("/etc/")
        || p.starts_with("/usr/")
        || p.starts_with("/bin/")
        || p.starts_with("/sbin/")
        || p.starts_with("/boot/")
        || p.starts_with("/dev/")
}

/// Returns true if the given bytes look like binary (null byte in first 8KB).
fn is_binary_content(bytes: &[u8]) -> bool {
    bytes[..bytes.len().min(8192)].contains(&0u8)
}

/// Returns true if reading this file should require explicit approval.
pub fn is_sensitive_read(tool_name: &str, input: &Value) -> bool {
    if tool_name != "read" {
        return false;
    }
    let path = input["file_path"].as_str().unwrap_or("");
    is_sensitive_path(path)
}

fn is_sensitive_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".env")
        || lower.ends_with(".pem")
        || lower.ends_with(".key")
        || lower.ends_with(".p12")
        || lower.ends_with(".pfx")
        || lower.contains("/.ssh/")
        || lower.contains("/secrets/")
        || lower.contains("/.aws/credentials")
}

pub async fn execute_tool(name: &str, input: &Value, project_dir: &str) -> ToolResult {
    match name {
        "bash" => tool_bash(input, project_dir).await,
        "read" => tool_read(input, project_dir).await,
        "write" => tool_write(input, project_dir).await,
        "edit" => tool_edit(input, project_dir).await,
        "glob" => tool_glob(input, project_dir).await,
        "grep" => tool_grep(input, project_dir).await,
        "fetch_url" => {
            let url = input["url"].as_str().unwrap_or("");
            match fetch_url(url).await {
                Ok(text) => ToolResult::ok(text),
                Err(e) => ToolResult::err(e),
            }
        }
        "web_search" => {
            let query = input["query"].as_str().unwrap_or("");
            match web_search(query).await {
                Ok(text) => ToolResult::ok(text),
                Err(e) => ToolResult::err(e),
            }
        }
        _ => ToolResult::err(format!("Unknown tool: {name}")),
    }
}

// ── bash ──────────────────────────────────────────────────────────────────────

async fn tool_bash(input: &Value, project_dir: &str) -> ToolResult {
    let command = match input["command"].as_str() {
        Some(c) => c,
        None => return ToolResult::err("bash: 'command' is required"),
    };

    let timeout_ms = input["timeout_ms"].as_u64().unwrap_or(30_000);

    let fut = Command::new("sh")
        .arg("-c")
        .arg(command)
        .current_dir(project_dir)
        .output();

    match timeout(Duration::from_millis(timeout_ms), fut).await {
        Err(_) => ToolResult::err(format!("bash: command timed out after {timeout_ms}ms")),
        Ok(Err(e)) => ToolResult::err(format!("bash: failed to spawn process: {e}")),
        Ok(Ok(output)) => {
            let mut result = String::new();
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            if !stdout.is_empty() {
                result.push_str(&stdout);
            }
            if !stderr.is_empty() {
                if !result.is_empty() {
                    result.push('\n');
                }
                result.push_str(&stderr);
            }
            if result.is_empty() {
                result = format!("(exit {})", output.status.code().unwrap_or(-1));
            }
            let is_error = !output.status.success();
            ToolResult { content: result, is_error }
        }
    }
}

// ── read ──────────────────────────────────────────────────────────────────────

async fn tool_read(input: &Value, project_dir: &str) -> ToolResult {
    let raw_path = match input["file_path"].as_str() {
        Some(p) => p,
        None => return ToolResult::err("read: 'file_path' is required"),
    };

    let path = resolve_path(raw_path, project_dir);
    let offset = input["offset"].as_u64().unwrap_or(0) as usize;
    let limit = input["limit"].as_u64().unwrap_or(2000) as usize;

    let bytes = match tokio::fs::read(&path).await {
        Ok(b) => b,
        Err(e) => return ToolResult::err(format!("read: {e}: {}", path.display())),
    };
    if is_binary_content(&bytes) {
        return ToolResult::err(format!(
            "read: {} appears to be a binary file — use bash with xxd/strings if you need to inspect it",
            path.display()
        ));
    }
    let text = String::from_utf8_lossy(&bytes).into_owned();

    let lines: Vec<&str> = text.lines().collect();
    let start = offset.min(lines.len());
    let end = (start + limit).min(lines.len());

    let mut result = String::new();
    for (i, line) in lines[start..end].iter().enumerate() {
        result.push_str(&format!("{}\t{}\n", start + i + 1, line));
    }

    if result.len() > 50_000 {
        result.truncate(50_000);
        result.push_str("\n[truncated at 50000 chars]");
    }

    ToolResult::ok(result)
}

// ── write ─────────────────────────────────────────────────────────────────────

async fn tool_write(input: &Value, project_dir: &str) -> ToolResult {
    let raw_path = match input["file_path"].as_str() {
        Some(p) => p,
        None => return ToolResult::err("write: 'file_path' is required"),
    };
    let content = match input["content"].as_str() {
        Some(c) => c,
        None => return ToolResult::err("write: 'content' is required"),
    };

    let path = resolve_path(raw_path, project_dir);

    if let Some(parent) = path.parent() {
        if let Err(e) = tokio::fs::create_dir_all(parent).await {
            return ToolResult::err(format!("write: failed to create directories: {e}"));
        }
    }

    match tokio::fs::write(&path, content).await {
        Ok(_) => ToolResult::ok(format!("Written {} bytes to {}", content.len(), path.display())),
        Err(e) => ToolResult::err(format!("write: {e}: {}", path.display())),
    }
}

// ── edit ──────────────────────────────────────────────────────────────────────

async fn tool_edit(input: &Value, project_dir: &str) -> ToolResult {
    let raw_path = match input["file_path"].as_str() {
        Some(p) => p,
        None => return ToolResult::err("edit: 'file_path' is required"),
    };
    let old_string = match input["old_string"].as_str() {
        Some(s) => s,
        None => return ToolResult::err("edit: 'old_string' is required"),
    };
    let new_string = match input["new_string"].as_str() {
        Some(s) => s,
        None => return ToolResult::err("edit: 'new_string' is required"),
    };

    let path = resolve_path(raw_path, project_dir);

    let text = match tokio::fs::read_to_string(&path).await {
        Ok(t) => t,
        Err(e) => return ToolResult::err(format!("edit: {e}: {}", path.display())),
    };

    let count = text.matches(old_string).count();
    if count == 0 {
        // Exact match failed — try whitespace-tolerant fuzzy match
        if let Some((start, end)) = fuzzy_find_byte_range(&text, old_string) {
            let new_text = format!("{}{}{}", &text[..start], new_string, &text[end..]);
            return match tokio::fs::write(&path, &new_text).await {
                Ok(_) => ToolResult::ok(format!("Edited {} (fuzzy indent match)", path.display())),
                Err(e) => ToolResult::err(format!("edit: {e}: {}", path.display())),
            };
        }
        return ToolResult::err(format!(
            "edit: old_string not found in {}",
            path.display()
        ));
    }
    if count > 1 {
        return ToolResult::err(format!(
            "edit: old_string found {count} times in {} — must be unique",
            path.display()
        ));
    }

    let new_text = text.replacen(old_string, new_string, 1);
    match tokio::fs::write(&path, &new_text).await {
        Ok(_) => ToolResult::ok(format!("Edited {}", path.display())),
        Err(e) => ToolResult::err(format!("edit: {e}: {}", path.display())),
    }
}

/// Find a byte range [start, end) in `text` matching `old_string` after stripping
/// leading/trailing whitespace from each line. Returns Some only when exactly one
/// location matches (ambiguous matches are rejected to avoid silent corruption).
fn fuzzy_find_byte_range(text: &str, old_string: &str) -> Option<(usize, usize)> {
    let needle_lines: Vec<&str> = old_string.lines().collect();
    if needle_lines.is_empty() {
        return None;
    }
    let needle_trimmed: Vec<&str> = needle_lines.iter().map(|l| l.trim()).collect();
    // All-whitespace needle is too ambiguous
    if needle_trimmed.iter().all(|l| l.is_empty()) {
        return None;
    }
    let n = needle_lines.len();

    // Build (byte_start, line_str) pairs so we can map positions back
    let mut file_spans: Vec<(usize, &str)> = Vec::new();
    let mut pos = 0;
    for line in text.lines() {
        file_spans.push((pos, line));
        pos += line.len();
        if text[pos..].starts_with("\r\n") {
            pos += 2;
        } else if pos < text.len() && text.as_bytes()[pos] == b'\n' {
            pos += 1;
        }
    }

    if n > file_spans.len() {
        return None;
    }

    let mut found: Vec<(usize, usize)> = Vec::new();
    for i in 0..=(file_spans.len() - n) {
        let window = &file_spans[i..i + n];
        if window.iter().zip(needle_trimmed.iter()).all(|((_, fl), nl)| fl.trim() == *nl) {
            let start = window[0].0;
            let end = if i + n < file_spans.len() {
                file_spans[i + n].0
            } else {
                text.len()
            };
            found.push((start, end));
        }
    }

    if found.len() == 1 { Some(found[0]) } else { None }
}

// ── glob ──────────────────────────────────────────────────────────────────────

async fn tool_glob(input: &Value, project_dir: &str) -> ToolResult {
    let pattern = match input["pattern"].as_str() {
        Some(p) => p,
        None => return ToolResult::err("glob: 'pattern' is required"),
    };

    let search_dir = input["path"]
        .as_str()
        .map(|p| resolve_path(p, project_dir))
        .unwrap_or_else(|| std::path::PathBuf::from(project_dir));

    // Use rg --files with glob filter — fastest approach, no extra dep
    let mut args = vec![
        "--files".to_string(),
        "--glob".to_string(),
        pattern.to_string(),
        "--glob".to_string(),
        "!node_modules/**".to_string(),
        "--glob".to_string(),
        "!.git/**".to_string(),
        "--glob".to_string(),
        "!dist/**".to_string(),
        "--glob".to_string(),
        "!target/**".to_string(),
    ];
    args.push(search_dir.to_string_lossy().to_string());

    let output = match Command::new("rg").args(&args).output().await {
        Ok(o) => o,
        Err(e) => return ToolResult::err(format!("glob: failed to run rg: {e}")),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut lines: Vec<&str> = stdout.lines().collect();
    lines.sort_unstable();

    if lines.len() > 200 {
        let total = lines.len();
        lines.truncate(200);
        let mut result = lines.join("\n");
        result.push_str(&format!("\n[showing 200 of {total} matches]"));
        ToolResult::ok(result)
    } else if lines.is_empty() {
        ToolResult::ok("No files found")
    } else {
        ToolResult::ok(lines.join("\n"))
    }
}

// ── grep ──────────────────────────────────────────────────────────────────────

async fn tool_grep(input: &Value, project_dir: &str) -> ToolResult {
    let pattern = match input["pattern"].as_str() {
        Some(p) => p,
        None => return ToolResult::err("grep: 'pattern' is required"),
    };

    let search_path = input["path"]
        .as_str()
        .map(|p| resolve_path(p, project_dir).to_string_lossy().to_string())
        .unwrap_or_else(|| project_dir.to_string());

    let mut args: Vec<String> = vec![
        "--line-number".to_string(),
        "--color=never".to_string(),
    ];

    if input["-i"].as_bool().unwrap_or(false) {
        args.push("--ignore-case".to_string());
    }

    if let Some(glob) = input["glob"].as_str() {
        args.push("--glob".to_string());
        args.push(glob.to_string());
    }

    args.push(pattern.to_string());
    args.push(search_path);

    let output = match Command::new("rg").args(&args).output().await {
        Ok(o) => o,
        Err(e) => return ToolResult::err(format!("grep: failed to run rg: {e}")),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !stderr.is_empty() && output.stdout.is_empty() {
        return ToolResult::err(format!("grep: {stderr}"));
    }

    if stdout.is_empty() {
        return ToolResult::ok("No matches found");
    }

    let mut result = stdout.to_string();
    if result.len() > 20_000 {
        result.truncate(20_000);
        result.push_str("\n[truncated at 20000 chars]");
    }

    ToolResult::ok(result)
}

// ── fetch_url ─────────────────────────────────────────────────────────────────

pub async fn fetch_url(url: &str) -> Result<String, String> {
    if url.is_empty() {
        return Err("fetch_url: 'url' is required".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("fetch_url: failed to build client: {e}"))?;

    let response = client
        .get(url)
        .header("User-Agent", "Mozilla/5.0 (compatible; hashmark/1.0)")
        .send()
        .await
        .map_err(|e| format!("fetch_url: request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("fetch_url: HTTP {}", response.status()));
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("fetch_url: failed to read response: {e}"))?;

    // Strip <script>...</script> and <style>...</style> blocks entirely
    let without_script = strip_block(&html, "script");
    let without_style = strip_block(&without_script, "style");

    // Strip remaining HTML tags via state machine
    let mut output = String::with_capacity(without_style.len());
    let mut in_tag = false;
    for ch in without_style.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => output.push(ch),
            _ => {}
        }
    }

    // Decode common HTML entities
    let decoded = output
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#x27;", "'")
        .replace("&nbsp;", " ");

    // Collapse runs of whitespace/newlines into single newlines
    let mut collapsed = String::with_capacity(decoded.len());
    let mut last_was_newline = false;
    for line in decoded.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !last_was_newline {
                collapsed.push('\n');
                last_was_newline = true;
            }
        } else {
            collapsed.push_str(trimmed);
            collapsed.push('\n');
            last_was_newline = false;
        }
    }

    let result = collapsed.trim().to_string();

    if result.len() > 15_000 {
        let mut truncated = result[..15_000].to_string();
        truncated.push_str("\n[truncated at 15000 chars]");
        Ok(truncated)
    } else {
        Ok(result)
    }
}

/// Removes all `<tag>...</tag>` blocks (case-insensitive, handles attributes).
fn strip_block(html: &str, tag: &str) -> String {
    let open = format!("<{}", tag);
    let close = format!("</{}>", tag);
    let mut result = String::with_capacity(html.len());
    let lower = html.to_lowercase();
    let mut pos = 0;
    loop {
        match lower[pos..].find(&open) {
            None => {
                result.push_str(&html[pos..]);
                break;
            }
            Some(start) => {
                result.push_str(&html[pos..pos + start]);
                match lower[pos + start..].find(&close) {
                    None => break,
                    Some(end_rel) => {
                        pos = pos + start + end_rel + close.len();
                    }
                }
            }
        }
    }
    result
}

// ── web_search ────────────────────────────────────────────────────────────────

pub async fn web_search(query: &str) -> Result<String, String> {
    if query.is_empty() {
        return Err("web_search: 'query' is required".to_string());
    }

    let encoded = urlencoding::encode(query);
    let url = format!("https://html.duckduckgo.com/html/?q={encoded}");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("web_search: failed to build client: {e}"))?;

    let response = client
        .get(&url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .header("Accept", "text/html,application/xhtml+xml")
        .send()
        .await
        .map_err(|e| format!("web_search: request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("web_search: HTTP {}", response.status()));
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("web_search: failed to read response: {e}"))?;

    let results = parse_ddg_results(&html);

    if results.is_empty() {
        return Ok(format!("Search returned no parseable results for: {query}"));
    }

    let mut output = String::new();
    for (i, (title, url, snippet)) in results.into_iter().enumerate() {
        output.push_str(&format!("{}. {}\n   URL: {}\n   {}\n\n", i + 1, title, url, snippet));
    }

    Ok(output.trim_end().to_string())
}

fn parse_ddg_results(html: &str) -> Vec<(String, String, String)> {
    let mut results = Vec::new();

    // Split on result blocks — each result starts with class="result "
    for chunk in html.split("class=\"result ") {
        if results.len() >= 5 {
            break;
        }

        // Extract title from <a class="result__a" ...>TITLE</a>
        let title = extract_tag_content(chunk, "result__a");
        // Extract URL from <a class="result__url" ...>URL</a>
        let url = extract_tag_content(chunk, "result__url");
        // Extract snippet from <a class="result__snippet" ...>SNIPPET</a>
        // or <div class="result__snippet">SNIPPET</div>
        let snippet = extract_tag_content(chunk, "result__snippet");

        if title.is_empty() && url.is_empty() {
            continue;
        }

        let clean_title = strip_html_tags(&title);
        let clean_url = strip_html_tags(&url).trim().to_string();
        let clean_snippet = strip_html_tags(&snippet);

        if clean_title.is_empty() && clean_url.is_empty() {
            continue;
        }

        results.push((
            if clean_title.is_empty() { "(no title)".to_string() } else { clean_title },
            if clean_url.is_empty() { "(no url)".to_string() } else { clean_url },
            if clean_snippet.is_empty() { "(no snippet)".to_string() } else { clean_snippet },
        ));
    }

    results
}

/// Find the inner HTML of the first element with the given class name substring.
fn extract_tag_content(html: &str, class_name: &str) -> String {
    let needle = format!("class=\"{}\"", class_name);
    let alt_needle = format!("class=\"{}\"", class_name);
    let _ = alt_needle;

    let start = match html.find(&needle) {
        Some(pos) => pos,
        None => return String::new(),
    };

    // Find the closing > of the opening tag
    let tag_close = match html[start..].find('>') {
        Some(pos) => start + pos + 1,
        None => return String::new(),
    };

    // Find the next closing tag
    let end = html[tag_close..].find('<').map(|p| tag_close + p).unwrap_or(html.len());

    html[tag_close..end].to_string()
}

fn strip_html_tags(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut in_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => output.push(ch),
            _ => {}
        }
    }
    // Decode common HTML entities
    output
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#x27;", "'")
        .replace("&nbsp;", " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Convert Anthropic-format schemas → OpenAI function-calling format.
pub fn anthropic_to_openai_tools(tools: &[Value]) -> Vec<Value> {
    tools.iter().map(|t| json!({
        "type": "function",
        "function": {
            "name": t["name"],
            "description": t["description"],
            "parameters": t["input_schema"],
        }
    })).collect()
}

/// Convert Anthropic-format schemas → Gemini functionDeclarations format.
pub fn anthropic_to_gemini_tools(tools: &[Value]) -> Vec<Value> {
    let decls: Vec<Value> = tools.iter().map(|t| {
        let mut params = t["input_schema"].clone();
        if let Some(obj) = params.as_object_mut() {
            obj.remove("additionalProperties");
        }
        json!({
            "name": t["name"],
            "description": t["description"],
            "parameters": params,
        })
    }).collect();
    vec![json!({"functionDeclarations": decls})]
}

// ── helpers ───────────────────────────────────────────────────────────────────

fn resolve_path(raw: &str, project_dir: &str) -> std::path::PathBuf {
    let p = std::path::Path::new(raw);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        std::path::Path::new(project_dir).join(p)
    }
}
