/**
 * Authenticated fetch wrapper for studio API calls.
 * Reads the token injected by the server into window.__STUDIO_TOKEN__.
 */

function getToken(): string {
  return (window as Window).__STUDIO_TOKEN__ ?? "";
}

/**
 * Drop-in replacement for fetch() that adds the Authorization header.
 */
export function fetchApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}

/**
 * Build a URL with the auth token as a query param.
 * Use for EventSource or other APIs that don't support custom headers.
 */
export function apiUrl(path: string): string {
  const token = getToken();
  const sep = path.includes("?") ? "&" : "?";
  return token ? `${path}${sep}token=${token}` : path;
}
