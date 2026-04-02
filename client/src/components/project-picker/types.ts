import { fetchApi } from "../../lib/api";

declare global {
  interface Window {
    studio?: {
      pickFolder: () => Promise<string | null>;
      setProjectDir: (dir: string) => Promise<boolean>;
      getRecentProjects: () => Promise<Array<{ name: string; dir: string; lastOpened: number }>>;
    };
  }
}

export interface RecentProject {
  name: string;
  dir: string;
  lastOpened: number;
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  last_opened: number;
  is_active: number;
}

export interface ProjectPickerProps {
  currentName?: string;
  onClose?: () => void;
  mode?: "dropdown";
}

export function truncatePath(p: string, max = 38): string {
  return p.length <= max ? p : "…" + p.slice(-(max - 1));
}

export function loadLocalRecent(): RecentProject[] {
  try {
    const raw = localStorage.getItem("studio:recent_projects");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as RecentProject[]).filter(
      (r) => typeof r.name === "string" && typeof r.dir === "string" && typeof r.lastOpened === "number"
    );
  } catch {
    return [];
  }
}

export async function openWorkspace(dir: string): Promise<void> {
  if (typeof window.studio?.setProjectDir === "function") {
    const res = await fetchApi("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: dir }),
    });
    const data = await res.json() as { workspace?: { id: string }; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Failed to open workspace");
    const id = data.workspace!.id;
    const activateRes = await fetchApi(`/api/workspaces/${id}/activate`, { method: "POST" });
    if (!activateRes.ok) throw new Error("Failed to activate workspace");
    await window.studio.setProjectDir(dir);
    return;
  }

  const res = await fetchApi("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: dir }),
  });
  const data = await res.json() as { workspace?: { id: string }; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to open workspace");
  const id = data.workspace!.id;
  const activateRes = await fetchApi(`/api/workspaces/${id}/activate`, { method: "POST" });
  if (!activateRes.ok) throw new Error("Failed to activate workspace");
  window.location.reload();
}
