/**
 * Authenticated fetch wrapper for studio API calls.
 * Token fetched from /api/health (unauthenticated) on first use.
 */

let _token: string | null = null;
let _tokenPromise: Promise<string> | null = null;

async function fetchToken(): Promise<string> {
  const r = await fetch("/api/health");
  const d = await r.json() as { token?: string };
  return d.token ?? "";
}

function ensureToken(): Promise<string> {
  if (_token) return Promise.resolve(_token);
  if (!_tokenPromise) {
    _tokenPromise = fetchToken().then(t => { _token = t; return t; }).catch(() => { _tokenPromise = null; return ""; });
  }
  return _tokenPromise;
}

/**
 * Drop-in replacement for fetch() that adds the Authorization header.
 */
export async function fetchApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = await ensureToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    // Token stale (server restarted) -- clear and re-fetch
    _token = null;
    _tokenPromise = null;
    const fresh = await ensureToken();
    if (fresh) {
      const h2 = new Headers(init?.headers);
      h2.set("Authorization", `Bearer ${fresh}`);
      return fetch(input, { ...init, headers: h2 });
    }
  }

  return res;
}

/**
 * Build a URL with the auth token as a query param (for EventSource/WebSocket).
 */
export function apiUrl(path: string): string {
  const token = _token ?? "";
  const sep = path.includes("?") ? "&" : "?";
  return token ? `${path}${sep}token=${token}` : path;
}

/**
 * Pre-fetch the token so it's available synchronously for WebSocket URLs.
 * Call once at app startup before React renders.
 */
export function prefetchToken(): Promise<string> {
  return ensureToken();
}
