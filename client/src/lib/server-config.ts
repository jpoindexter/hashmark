/**
 * Server connection config.
 * Supports local (default) and remote servers.
 */

export interface ServerConfig {
  id: string;
  name: string;
  url: string;
  token?: string;
  isLocal: boolean;
}

const STORAGE_KEY = "studio_servers";
const ACTIVE_KEY = "studio_active_server";

const LOCAL_SERVER: ServerConfig = {
  id: "local",
  name: "Local",
  url: "",
  isLocal: true,
};

export function loadServers(): ServerConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const servers = raw ? JSON.parse(raw) as ServerConfig[] : [];
    return [LOCAL_SERVER, ...servers.filter(s => !s.isLocal)];
  } catch {
    return [LOCAL_SERVER];
  }
}

export function saveServers(servers: ServerConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers.filter(s => !s.isLocal)));
}

export function getActiveServer(): ServerConfig {
  const id = localStorage.getItem(ACTIVE_KEY) ?? "local";
  const servers = loadServers();
  return servers.find(s => s.id === id) ?? LOCAL_SERVER;
}

export function setActiveServer(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function addServer(name: string, url: string, token?: string): ServerConfig {
  const server: ServerConfig = {
    id: `remote-${Date.now()}`,
    name,
    url: url.replace(/\/$/, ""),
    token,
    isLocal: false,
  };
  const servers = loadServers();
  servers.push(server);
  saveServers(servers);
  return server;
}

export function removeServer(id: string) {
  const servers = loadServers().filter(s => s.id !== id);
  saveServers(servers);
  if (getActiveServer().id === id) setActiveServer("local");
}

/**
 * Build the base URL for API calls.
 * Local server: empty string (uses relative URLs via Vite proxy).
 * Remote server: full URL prefix.
 */
export function getServerBaseUrl(): string {
  const server = getActiveServer();
  return server.isLocal ? "" : server.url;
}
