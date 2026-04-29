import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { refreshAnthropicToken, anthropicOAuthProvider } from "@mariozechner/pi-ai/oauth";
import type { OAuthCredentials } from "@mariozechner/pi-ai/oauth";

interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
}

// Claude Code stores credentials in macOS Keychain (newer) or .credentials.json (older)
const CREDS_FILE = join(process.env.HOME ?? "", ".claude", ".credentials.json");
const KEYCHAIN_SERVICE = "Claude Code-credentials";

function readCredentials(): ClaudeCredentials | null {
  // Try Keychain first (Claude Code v2+)
  try {
    const raw = execSync(`security find-generic-password -s "${KEYCHAIN_SERVICE}" -w 2>/dev/null`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (raw) return JSON.parse(raw) as ClaudeCredentials;
  } catch {}

  // Fall back to file
  if (existsSync(CREDS_FILE)) {
    try { return JSON.parse(readFileSync(CREDS_FILE, "utf-8")) as ClaudeCredentials; } catch {}
  }

  return null;
}

let _cachedKey: string | null = null;
let _cachedExpiry = 0;

export async function getOAuthApiKey(): Promise<string | null> {
  if (_cachedKey && Date.now() < _cachedExpiry - 60_000) return _cachedKey;

  const creds = readCredentials();
  const oauth = creds?.claudeAiOauth;
  if (!oauth?.refreshToken) return null;

  try {
    let resolved: OAuthCredentials = { access: oauth.accessToken, refresh: oauth.refreshToken, expires: oauth.expiresAt };
    if (Date.now() >= oauth.expiresAt) resolved = await refreshAnthropicToken(oauth.refreshToken);
    const key = anthropicOAuthProvider.getApiKey(resolved);
    if (key) { _cachedKey = key; _cachedExpiry = resolved.expires; }
    return key || null;
  } catch { return null; }
}

export function hasOAuthCredentials(): boolean {
  return !!(readCredentials()?.claudeAiOauth?.refreshToken);
}
