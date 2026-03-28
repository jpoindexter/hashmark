/**
 * hashmark auth
 *
 * Manages credentials for the hashmark cloud integration.
 * Handles the OAuth callback flow (localhost redirect), secure credential
 * storage in ~/.hashmark/credentials, and token reads for cloud sync.
 *
 * @module auth
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execFile } from "child_process";
import { randomBytes } from "crypto";
import pc from "picocolors";

export interface Credentials {
  token: string;
  userId: string;
  email: string;
  connectedAt: string;
}

const HASHMARK_DIR = join(homedir(), ".hashmark");
const CREDENTIALS_PATH = join(HASHMARK_DIR, "credentials");
const CLOUD_BASE_URL = "https://hashmark.md";
const AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Path where credentials are stored */
export function getCredentialsPath(): string {
  return CREDENTIALS_PATH;
}

/** Read stored credentials, or null if not logged in */
export function readCredentials(): Credentials | null {
  if (!existsSync(CREDENTIALS_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8")) as Credentials;
  } catch {
    return null;
  }
}

/** Save credentials to disk with restricted permissions */
export function saveCredentials(creds: Credentials): void {
  if (!existsSync(HASHMARK_DIR)) {
    mkdirSync(HASHMARK_DIR, { recursive: true });
  }
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), "utf-8");
  // Restrict to owner read/write only (0600)
  try {
    chmodSync(CREDENTIALS_PATH, 0o600);
  } catch {
    // chmod not available on all platforms — ignore
  }
}

/** Remove stored credentials */
export function clearCredentials(): void {
  if (existsSync(CREDENTIALS_PATH)) {
    unlinkSync(CREDENTIALS_PATH);
  }
}

/** Open a URL in the default browser using execFile to avoid shell injection */
function openBrowser(url: string): void {
  const platform = process.platform;
  if (platform === "darwin") {
    execFile("open", [url], () => undefined);
  } else if (platform === "win32") {
    execFile("cmd", ["/c", "start", "", url], () => undefined);
  } else {
    execFile("xdg-open", [url], () => undefined);
  }
}

/** Find an available port in range 8100–8199 */
async function findAvailablePort(): Promise<number> {
  for (let port = 8100; port <= 8199; port++) {
    const available = await new Promise<boolean>((resolve) => {
      const server = createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close();
        resolve(true);
      });
      server.listen(port, "127.0.0.1");
    });
    if (available) return port;
  }
  throw new Error("No available port found in range 8100–8199. Try again in a moment.");
}

/** Parse query string from a URL path */
function parseQuery(url: string): Record<string, string> {
  const parts = url.split("?");
  if (parts.length < 2) return {};
  return Object.fromEntries(new URLSearchParams(parts[1]));
}

/**
 * Run the OAuth callback flow:
 * 1. Start a local HTTP server on a random port
 * 2. Open the browser to the hashmark auth page
 * 3. Wait for the callback with token + user info
 * 4. Store credentials and close the server
 */
export async function login(): Promise<Credentials> {
  const port = await findAvailablePort();
  const state = randomBytes(16).toString("hex");
  const callbackUrl = `http://127.0.0.1:${port}/callback`;
  const authUrl = `${CLOUD_BASE_URL}/cli/auth?port=${port}&state=${encodeURIComponent(state)}&callback=${encodeURIComponent(callbackUrl)}`;

  return new Promise<Credentials>((resolve, reject) => {
    let resolved = false;

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (!req.url?.startsWith("/callback")) {
        res.writeHead(404).end("Not found");
        return;
      }

      const params = parseQuery(req.url);

      if (params.state !== state) {
        res.writeHead(400).end("Invalid state — possible CSRF. Close this tab and try again.");
        return;
      }

      if (params.error) {
        res.writeHead(400).end(`Auth error: ${params.error}`);
        server.close();
        if (!resolved) {
          resolved = true;
          reject(new Error(params.error));
        }
        return;
      }

      const token = params.token;
      const userId = params.userId ?? "";
      const email = params.email ?? "";

      if (!token) {
        res.writeHead(400).end("Missing token in callback");
        return;
      }

      const creds: Credentials = {
        token,
        userId,
        email,
        connectedAt: new Date().toISOString(),
      };

      saveCredentials(creds);

      res.writeHead(200, { "Content-Type": "text/html" }).end(
        `<!DOCTYPE html><html><body style="font-family:monospace;padding:2rem;background:#0a0a0a;color:#e5e5e5">
<h2 style="color:#10b981">hashmark connected</h2>
<p>You are now logged in as <strong>${email}</strong>.</p>
<p>Return to your terminal — you can close this tab.</p>
</body></html>`
      );

      server.close();
      if (!resolved) {
        resolved = true;
        resolve(creds);
      }
    });

    server.listen(port, "127.0.0.1", () => {
      console.log(pc.cyan("\n  # hashmark login\n"));
      console.log(pc.dim("  hashmark syncs project metadata (file names, structure, dependencies) to your account. No source code is stored. See https://hashmark.md/privacy\n"));
      console.log(`  Opening browser to complete authentication...`);
      console.log(pc.dim(`\n  If the browser didn't open, visit:\n  ${authUrl}\n`));
      openBrowser(authUrl);
    });

    // Timeout after 5 minutes
    const timer = setTimeout(() => {
      server.close();
      if (!resolved) {
        resolved = true;
        reject(new Error("Authentication timed out after 5 minutes."));
      }
    }, AUTH_TIMEOUT_MS);

    server.once("close", () => clearTimeout(timer));
  });
}

export interface CloudSyncResult {
  ok: boolean;
  scanId?: string;
  url?: string;
  error?: string;
}

export interface CloudSyncPayload {
  projectRoot: string;
  generatedAt: string;
  files: Array<{ path: string; content: string; tool: string }>;
  meta?: Record<string, unknown>;
}

/**
 * Push scan results to the hashmark cloud dashboard.
 * Requires a stored token from `hashmark login`.
 */
export async function pushToCloud(payload: CloudSyncPayload): Promise<CloudSyncResult> {
  const creds = readCredentials();
  if (!creds) {
    return { ok: false, error: "Not logged in. Run `hashmark login` first." };
  }

  const response = await fetch(`${CLOUD_BASE_URL}/api/v1/scans`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    return { ok: false, error: `Cloud sync failed (${response.status}): ${text}` };
  }

  const data = (await response.json()) as { scanId?: string; url?: string };
  return {
    ok: true,
    scanId: data.scanId,
    url: data.url,
  };
}
