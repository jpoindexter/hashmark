use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const CLIENT_NAME: &str = "hashmark";
const REDIRECT_BIND: &str = "127.0.0.1:0";
const AUTH_FLOW_TIMEOUT_SECS: u64 = 300;

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct OAuthTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>,
    pub token_type: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct OAuthMetadata {
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub registration_endpoint: Option<String>,
    pub scopes_supported: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct OAuthClientReg {
    pub client_id: String,
    pub client_secret: Option<String>,
}

/// State carried between `start_auth` and the redirect listener.
pub struct PendingAuth {
    pub code_verifier: String,
    pub state: String,
    pub redirect_uri: String,
    pub metadata: OAuthMetadata,
    pub client: OAuthClientReg,
}

pub type PendingAuthMap = Arc<Mutex<std::collections::HashMap<String, PendingAuth>>>;

fn rand_url_safe(len_bytes: usize) -> String {
    let mut buf = vec![0u8; len_bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&buf)
}

fn pkce_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let digest = hasher.finalize();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Parse a bearer challenge header like:
///   Bearer resource_metadata="https://example.com/.well-known/..."
pub fn parse_resource_metadata_url(www_authenticate: &str) -> Option<String> {
    let lower = www_authenticate.to_lowercase();
    if !lower.starts_with("bearer") {
        return None;
    }
    let start = lower.find("resource_metadata")?;
    let after = &www_authenticate[start..];
    let eq = after.find('=')?;
    let rest = &after[eq + 1..].trim_start();
    let quote_char = rest.chars().next()?;
    if quote_char != '"' && quote_char != '\'' {
        return None;
    }
    let rest = &rest[1..];
    let end = rest.find(quote_char)?;
    Some(rest[..end].to_string())
}

/// Fetch RFC 9728 resource metadata, returning the first authorization_server URL.
pub fn fetch_resource_metadata(client: &reqwest::blocking::Client, url: &str) -> Result<String, String> {
    let resp = client
        .get(url)
        .header("Accept", "application/json")
        .send()
        .map_err(|e| format!("resource metadata fetch failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("resource metadata HTTP {}", resp.status()));
    }
    let body: Value = resp.json().map_err(|e| format!("resource metadata parse: {e}"))?;
    body["authorization_servers"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "resource metadata has no authorization_servers".to_string())
}

/// Fetch OAuth authorization server metadata (RFC 8414).
pub fn fetch_auth_server_metadata(
    client: &reqwest::blocking::Client,
    issuer: &str,
) -> Result<OAuthMetadata, String> {
    let issuer = issuer.trim_end_matches('/');
    let candidates = [
        format!("{issuer}/.well-known/oauth-authorization-server"),
        format!("{issuer}/.well-known/openid-configuration"),
    ];
    let mut last_err = String::new();
    for url in &candidates {
        let resp = match client.get(url).header("Accept", "application/json").send() {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("{url}: {e}");
                continue;
            }
        };
        if !resp.status().is_success() {
            last_err = format!("{url}: HTTP {}", resp.status());
            continue;
        }
        let body: Value = match resp.json() {
            Ok(b) => b,
            Err(e) => {
                last_err = format!("{url}: parse {e}");
                continue;
            }
        };
        let authorization_endpoint = body["authorization_endpoint"]
            .as_str()
            .ok_or_else(|| format!("{url}: missing authorization_endpoint"))?
            .to_string();
        let token_endpoint = body["token_endpoint"]
            .as_str()
            .ok_or_else(|| format!("{url}: missing token_endpoint"))?
            .to_string();
        let registration_endpoint = body["registration_endpoint"].as_str().map(|s| s.to_string());
        let scopes_supported = body["scopes_supported"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();
        return Ok(OAuthMetadata {
            authorization_endpoint,
            token_endpoint,
            registration_endpoint,
            scopes_supported,
        });
    }
    Err(format!("no auth server metadata found: {last_err}"))
}

/// Dynamic client registration (RFC 7591).
pub fn register_client(
    client: &reqwest::blocking::Client,
    registration_endpoint: &str,
    redirect_uri: &str,
) -> Result<OAuthClientReg, String> {
    let body = json!({
        "client_name": CLIENT_NAME,
        "redirect_uris": [redirect_uri],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
    });
    let resp = client
        .post(registration_endpoint)
        .json(&body)
        .send()
        .map_err(|e| format!("client registration failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        return Err(format!("client registration HTTP {status}: {text}"));
    }
    let parsed: Value = resp.json().map_err(|e| format!("registration parse: {e}"))?;
    let client_id = parsed["client_id"]
        .as_str()
        .ok_or("registration: missing client_id")?
        .to_string();
    let client_secret = parsed["client_secret"].as_str().map(String::from);
    Ok(OAuthClientReg { client_id, client_secret })
}

/// Bind a localhost listener and return (port, listener).
pub fn bind_redirect_listener() -> Result<(u16, TcpListener), String> {
    let listener = TcpListener::bind(REDIRECT_BIND).map_err(|e| format!("bind redirect: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    Ok((port, listener))
}

pub struct AuthRedirectResult {
    pub code: String,
    pub state: String,
}

/// Wait for a single HTTP GET request on the listener, parse ?code=...&state=... from the URL,
/// and return a 200 response to the browser.
pub fn wait_for_redirect(listener: TcpListener) -> Result<AuthRedirectResult, String> {
    listener
        .set_nonblocking(false)
        .map_err(|e| format!("listener config: {e}"))?;

    let deadline = Instant::now() + Duration::from_secs(AUTH_FLOW_TIMEOUT_SECS);
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("listener nonblocking: {e}"))?;

    loop {
        if Instant::now() > deadline {
            return Err("OAuth redirect timed out after 5 minutes".to_string());
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .ok();

                let mut buf = [0u8; 4096];
                let n = stream
                    .read(&mut buf)
                    .map_err(|e| format!("read redirect: {e}"))?;
                let raw = String::from_utf8_lossy(&buf[..n]);
                let first_line = raw.lines().next().unwrap_or("");
                let parts: Vec<&str> = first_line.split_whitespace().collect();
                if parts.len() < 2 {
                    return Err("malformed redirect request".to_string());
                }
                let path = parts[1];
                let query_start = path.find('?').ok_or("no query string in redirect")?;
                let query = &path[query_start + 1..];
                let mut code: Option<String> = None;
                let mut state: Option<String> = None;
                let mut error: Option<String> = None;
                for pair in query.split('&') {
                    let mut it = pair.splitn(2, '=');
                    let k = it.next().unwrap_or("");
                    let v = it.next().unwrap_or("");
                    let decoded = urlencoding::decode(v).map(|s| s.into_owned()).unwrap_or_else(|_| v.to_string());
                    match k {
                        "code" => code = Some(decoded),
                        "state" => state = Some(decoded),
                        "error" => error = Some(decoded),
                        _ => {}
                    }
                }

                let body = if error.is_some() {
                    "<html><body><h2>Authorization failed</h2><p>You can close this window.</p></body></html>"
                } else {
                    "<html><body><h2>Authorization complete</h2><p>You can close this window and return to hashmark.</p></body></html>"
                };
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();

                if let Some(err) = error {
                    return Err(format!("authorization error: {err}"));
                }
                let code = code.ok_or("redirect missing code")?;
                let state = state.ok_or("redirect missing state")?;
                return Ok(AuthRedirectResult { code, state });
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            Err(e) => return Err(format!("accept redirect: {e}")),
        }
    }
}

/// Exchange the authorization code for tokens.
pub fn exchange_code(
    client: &reqwest::blocking::Client,
    token_endpoint: &str,
    client_reg: &OAuthClientReg,
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<OAuthTokens, String> {
    let mut form = vec![
        ("grant_type", "authorization_code".to_string()),
        ("code", code.to_string()),
        ("redirect_uri", redirect_uri.to_string()),
        ("client_id", client_reg.client_id.clone()),
        ("code_verifier", code_verifier.to_string()),
    ];
    if let Some(secret) = &client_reg.client_secret {
        form.push(("client_secret", secret.clone()));
    }
    let resp = client
        .post(token_endpoint)
        .form(&form)
        .send()
        .map_err(|e| format!("token exchange failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        return Err(format!("token exchange HTTP {status}: {text}"));
    }
    let parsed: Value = resp.json().map_err(|e| format!("token parse: {e}"))?;
    Ok(parse_token_response(&parsed))
}

/// Refresh an access token using the refresh_token grant.
pub fn refresh_token(
    client: &reqwest::blocking::Client,
    token_endpoint: &str,
    client_reg: &OAuthClientReg,
    refresh_token: &str,
) -> Result<OAuthTokens, String> {
    let mut form = vec![
        ("grant_type", "refresh_token".to_string()),
        ("refresh_token", refresh_token.to_string()),
        ("client_id", client_reg.client_id.clone()),
    ];
    if let Some(secret) = &client_reg.client_secret {
        form.push(("client_secret", secret.clone()));
    }
    let resp = client
        .post(token_endpoint)
        .form(&form)
        .send()
        .map_err(|e| format!("refresh failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        return Err(format!("refresh HTTP {status}: {text}"));
    }
    let parsed: Value = resp.json().map_err(|e| format!("refresh parse: {e}"))?;
    let mut tokens = parse_token_response(&parsed);
    if tokens.refresh_token.is_none() {
        tokens.refresh_token = Some(refresh_token.to_string());
    }
    Ok(tokens)
}

fn parse_token_response(parsed: &Value) -> OAuthTokens {
    let access_token = parsed["access_token"].as_str().unwrap_or("").to_string();
    let refresh_token = parsed["refresh_token"].as_str().map(String::from);
    let expires_in = parsed["expires_in"].as_i64();
    let token_type = parsed["token_type"].as_str().unwrap_or("Bearer").to_string();
    let expires_at = expires_in.map(|s| now_unix() + s);
    OAuthTokens {
        access_token,
        refresh_token,
        expires_at,
        token_type,
    }
}

/// Build the authorization URL with PKCE.
pub fn build_authorize_url(
    metadata: &OAuthMetadata,
    client_id: &str,
    redirect_uri: &str,
    scopes: &[String],
    state: &str,
    code_challenge: &str,
) -> String {
    let mut params = vec![
        ("response_type".to_string(), "code".to_string()),
        ("client_id".to_string(), client_id.to_string()),
        ("redirect_uri".to_string(), redirect_uri.to_string()),
        ("state".to_string(), state.to_string()),
        ("code_challenge".to_string(), code_challenge.to_string()),
        ("code_challenge_method".to_string(), "S256".to_string()),
    ];
    if !scopes.is_empty() {
        params.push(("scope".to_string(), scopes.join(" ")));
    }
    let query = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&");
    let sep = if metadata.authorization_endpoint.contains('?') { '&' } else { '?' };
    format!("{}{}{}", metadata.authorization_endpoint, sep, query)
}

/// Generate a fresh PKCE verifier + challenge + state.
pub fn new_pkce_state() -> (String, String, String) {
    let verifier = rand_url_safe(48);
    let challenge = pkce_challenge(&verifier);
    let state = rand_url_safe(16);
    (verifier, challenge, state)
}

