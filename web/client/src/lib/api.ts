declare global {
  interface Window { __STUDIO_TOKEN__?: string; __PROJECT_DIR__?: string; }
}

let _token: string | null = null;

export async function getToken(): Promise<string> {
  if (_token) return _token;
  if (window.__STUDIO_TOKEN__) { _token = window.__STUDIO_TOKEN__; return _token; }
  // Dev mode: Vite serves its own HTML without token injection — fetch it
  try {
    const res = await fetch("/api/token");
    const data = await res.json() as { token: string };
    _token = data.token;
  } catch { _token = ""; }
  return _token ?? "";
}

// For EventSource URLs that need ?token= (can't set headers)
export async function apiUrl(path: string): Promise<string> {
  const token = await getToken();
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${token ? `${sep}token=${token}` : ""}`;
}

export async function fetchApi<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
