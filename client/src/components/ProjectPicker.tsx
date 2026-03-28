import { useState, useEffect, useRef, useCallback } from "react";
import { basename } from "../lib/path.js";
import { fetchApi } from "../lib/api";

declare global {
  interface Window {
    studio?: {
      pickFolder: () => Promise<string | null>;
      setProjectDir: (dir: string) => Promise<boolean>;
      getRecentProjects: () => Promise<Array<{ name: string; dir: string; lastOpened: number }>>;
    };
  }
}

interface RecentProject {
  name: string;
  dir: string;
  lastOpened: number;
}

interface Workspace {
  id: string;
  name: string;
  path: string;
  last_opened: number;
  is_active: number;
}

interface ProjectPickerProps {
  currentName?: string;
  onClose?: () => void;
  mode?: "dropdown";
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function truncatePath(p: string, max = 38): string {
  return p.length <= max ? p : "…" + p.slice(-(max - 1));
}

function FolderIcon({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke={color} strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      width="11" height="11" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      style={{
        flexShrink: 0,
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.15s",
        color: "var(--text-dimmer)",
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// SVG icons to avoid lucide dependency
function ClockIcon({ size = 28, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function TerminalIcon({ size = 28, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

const cardBase: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "space-between",
  width: 152,
  height: 110,
  background: "var(--bg-2)",
  border: "1px solid var(--border-dim)",
  borderRadius: "var(--radius-lg)",
  padding: 18,
  cursor: "pointer",
  transition: "background 0.12s, border-color 0.12s",
  textAlign: "left",
  boxSizing: "border-box",
};

function ActionCard({
  icon,
  label,
  sub,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...cardBase,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : "pointer",
        background: hovered && !disabled ? "var(--bg-3)" : "var(--bg-2)",
        borderColor: hovered && !disabled ? "var(--border)" : "var(--border-dim)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ color: "var(--text-dim)" }}>{icon}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>
          {label}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-dimmer)", lineHeight: 1.4 }}>
          {sub}
        </div>
      </div>
    </button>
  );
}

function loadLocalRecent(): RecentProject[] {
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

async function openWorkspace(dir: string): Promise<void> {
  // In Electron, use IPC to persist the project dir in the main process config.
  // The main process set-project-dir handler writes to ~/.hashmark/studio-config.json,
  // updates HASHMARK_PROJECT_DIR, and triggers a webContents reload.
  if (typeof window.studio?.setProjectDir === "function") {
    // Register the workspace in the server DB first so the activate flow works
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

    // Persist in Electron config and trigger reload from main process
    await window.studio.setProjectDir(dir);
    return;
  }

  // Web mode: register, activate, and reload
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

/** Full-page splash shown when no project is configured */
export default function ProjectPicker(_props: ProjectPickerProps = {}) {
  const isElectron = typeof window !== "undefined" && typeof window.studio !== "undefined";
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [showPathInput, setShowPathInput] = useState(false);
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [newWsInput, setNewWsInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newWsError, setNewWsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openingDir, setOpeningDir] = useState<string | null>(null);
  const recentRef = useRef<HTMLDivElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const newWsInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const local = loadLocalRecent();
    if (isElectron) {
      window.studio?.getRecentProjects()
        .then((r) => {
          const merged = [...r, ...local].reduce<RecentProject[]>((acc, item) => {
            if (!acc.find((a) => a.dir === item.dir)) acc.push(item);
            return acc;
          }, []);
          merged.sort((a, b) => b.lastOpened - a.lastOpened);
          setRecent(merged);
        })
        .catch(() => setRecent(local));
    } else {
      setRecent(local);
    }
  }, [isElectron]);

  useEffect(() => {
    if (showPathInput) setTimeout(() => pathInputRef.current?.focus(), 20);
  }, [showPathInput]);

  useEffect(() => {
    if (showNewWorkspace) setTimeout(() => newWsInputRef.current?.focus(), 20);
  }, [showNewWorkspace]);

  const handleOpenProject = async () => {
    if (isElectron) {
      setLoading(true);
      setError(null);
      try {
        const dir = await window.studio!.pickFolder();
        if (!dir) { setLoading(false); return; }
        await openWorkspace(dir);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to open project");
        setLoading(false);
      }
    } else {
      setShowPathInput((v) => !v);
      setShowNewWorkspace(false);
      setError(null);
    }
  };

  const handleSubmitPath = async () => {
    const dir = pathInput.trim();
    if (!dir) return;
    setLoading(true);
    setError(null);
    try {
      await openWorkspace(dir);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open project");
      setLoading(false);
    }
  };

  const handleNewWorkspace = async () => {
    const dir = newWsInput.trim();
    if (!dir) return;
    setLoading(true);
    setNewWsError(null);
    try {
      await openWorkspace(dir);
    } catch (e) {
      setNewWsError(e instanceof Error ? e.message : "Failed to create workspace");
      setLoading(false);
    }
  };

  const handleRecentClick = async (proj: RecentProject) => {
    setOpeningDir(proj.dir);
    setError(null);
    try {
      await openWorkspace(proj.dir);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open project");
      setOpeningDir(null);
    }
  };

  const handleRecentCardClick = () => {
    if (recent.length === 0) return;
    recentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const items = Array.from(e.dataTransfer.items);
    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          // In Electron, file.path is available
          const filePath = (file as File & { path?: string }).path;
          if (filePath) {
            setPathInput(filePath);
            setShowPathInput(true);
          }
        }
        break;
      }
    }
  };

  const noInteract: React.CSSProperties = {
    WebkitAppRegion: "no-drag" as React.CSSProperties["WebkitAppRegion"],
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        background: "var(--bg)",
        fontFamily: "var(--font-ui)",
        WebkitAppRegion: "drag" as React.CSSProperties["WebkitAppRegion"],
        overflowY: "auto",
        padding: "40px 0",
        boxSizing: "border-box",
      }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Logo */}
      <div style={{ textAlign: "center", userSelect: "none" }}>
        <div style={{
          fontSize: 44,
          fontWeight: 900,
          color: "var(--accent)",
          letterSpacing: "-0.04em",
          lineHeight: 1,
          marginBottom: 10,
        }}>
          #
        </div>
        <div style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 4,
        }}>
          HASHMARK STUDIO
        </div>
        <div style={{ fontSize: 10, color: "var(--text-dimmer)", letterSpacing: "0.04em" }}>
          v0.1.0
        </div>
      </div>

      {/* Action cards */}
      <div style={{ ...noInteract, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <ActionCard
          icon={<FolderIcon size={28} color="var(--text-dim)" />}
          label="Open Project"
          sub={loading && !showNewWorkspace ? "Opening..." : "Select a folder"}
          onClick={() => void handleOpenProject()}
          disabled={loading}
        />
        <ActionCard
          icon={<ClockIcon size={28} color="var(--text-dim)" />}
          label="Recent"
          sub={recent.length > 0 ? recent[0].name : "No recent projects"}
          onClick={handleRecentCardClick}
          disabled={recent.length === 0}
        />
        <ActionCard
          icon={<TerminalIcon size={28} color="var(--text-dim)" />}
          label="New Workspace"
          sub="Configure from path"
          onClick={() => {
            setShowNewWorkspace((v) => !v);
            setShowPathInput(false);
            setNewWsError(null);
          }}
          disabled={loading}
        />
      </div>

      {/* Inline path input for web "Open Project" */}
      {showPathInput && (
        <div style={{ ...noInteract, width: "100%", maxWidth: 480, padding: "0 20px", boxSizing: "border-box" }}>
          <div
            style={{
              background: "var(--bg-2)",
              border: dragOver ? "1px solid var(--accent)" : "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              padding: 16,
              transition: "border-color 0.12s",
            }}
          >
            <input
              ref={pathInputRef}
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSubmitPath();
                if (e.key === "Escape") { setShowPathInput(false); setPathInput(""); setError(null); }
              }}
              placeholder="/path/to/your/project"
              style={{
                width: "100%",
                background: "var(--bg-3)",
                border: "1px solid var(--border-dim)",
                color: "var(--text)",
                fontFamily: "var(--font)",
                fontSize: 12,
                padding: "8px 10px",
                outline: "none",
                borderRadius: "var(--radius)",
                boxSizing: "border-box",
                marginBottom: 8,
              }}
            />
            <div style={{
              fontSize: 10,
              color: "var(--text-dimmer)",
              marginBottom: 10,
              textAlign: "center",
            }}>
              or drag a folder here
            </div>
            {error && (
              <div style={{ fontSize: 11, color: "var(--red)", marginBottom: 8 }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => void handleSubmitPath()}
                disabled={loading || !pathInput.trim()}
                style={{
                  flex: 1,
                  padding: "7px 12px",
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: "var(--radius)",
                  color: "var(--bg)",
                  fontFamily: "var(--font)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  cursor: loading || !pathInput.trim() ? "default" : "pointer",
                  opacity: loading || !pathInput.trim() ? 0.5 : 1,
                  transition: "opacity 0.12s",
                }}
              >
                {loading ? "Opening..." : "Open"}
              </button>
              <button
                onClick={() => { setShowPathInput(false); setPathInput(""); setError(null); }}
                style={{
                  padding: "7px 14px",
                  background: "var(--bg-3)",
                  border: "1px solid var(--border-dim)",
                  borderRadius: "var(--radius)",
                  color: "var(--text-dim)",
                  fontFamily: "var(--font)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline path input for New Workspace */}
      {showNewWorkspace && (
        <div style={{ ...noInteract, width: "100%", maxWidth: 480, padding: "0 20px", boxSizing: "border-box" }}>
          <div style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: 16,
          }}>
            <div style={{ fontSize: 10, color: "var(--text-dimmer)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
              New Workspace
            </div>
            <input
              ref={newWsInputRef}
              type="text"
              value={newWsInput}
              onChange={(e) => setNewWsInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleNewWorkspace();
                if (e.key === "Escape") { setShowNewWorkspace(false); setNewWsInput(""); setNewWsError(null); }
              }}
              placeholder="/path/to/your/project"
              style={{
                width: "100%",
                background: "var(--bg-3)",
                border: "1px solid var(--border-dim)",
                color: "var(--text)",
                fontFamily: "var(--font)",
                fontSize: 12,
                padding: "8px 10px",
                outline: "none",
                borderRadius: "var(--radius)",
                boxSizing: "border-box",
                marginBottom: 8,
              }}
            />
            {newWsError && (
              <div style={{ fontSize: 11, color: "var(--red)", marginBottom: 8 }}>
                {newWsError}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => void handleNewWorkspace()}
                disabled={loading || !newWsInput.trim()}
                style={{
                  flex: 1,
                  padding: "7px 12px",
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: "var(--radius)",
                  color: "var(--bg)",
                  fontFamily: "var(--font)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  cursor: loading || !newWsInput.trim() ? "default" : "pointer",
                  opacity: loading || !newWsInput.trim() ? 0.5 : 1,
                  transition: "opacity 0.12s",
                }}
              >
                {loading ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => { setShowNewWorkspace(false); setNewWsInput(""); setNewWsError(null); }}
                style={{
                  padding: "7px 14px",
                  background: "var(--bg-3)",
                  border: "1px solid var(--border-dim)",
                  borderRadius: "var(--radius)",
                  color: "var(--text-dim)",
                  fontFamily: "var(--font)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent projects list */}
      {recent.length > 0 && (
        <div
          ref={recentRef}
          style={{ ...noInteract, width: "100%", maxWidth: 480, padding: "0 20px", boxSizing: "border-box" }}
        >
          <div style={{
            fontSize: 10,
            color: "var(--text-dimmer)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 8,
            paddingLeft: 2,
          }}>
            RECENT
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {recent.map((proj) => (
              <RecentProjectRow
                key={proj.dir}
                proj={proj}
                opening={openingDir === proj.dir}
                onOpen={() => void handleRecentClick(proj)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Global error (not tied to a specific panel) */}
      {error && !showPathInput && !showNewWorkspace && (
        <div style={{
          ...noInteract,
          fontSize: 11,
          color: "var(--red)",
          textAlign: "center",
          maxWidth: 400,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

function RecentProjectRow({
  proj,
  opening,
  onOpen,
}: {
  proj: RecentProject;
  opening: boolean;
  onOpen: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onOpen}
      disabled={opening}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        height: 36,
        padding: "0 12px",
        background: hovered ? "var(--bg-3)" : "transparent",
        border: "1px solid transparent",
        borderRadius: "var(--radius)",
        cursor: opening ? "default" : "pointer",
        textAlign: "left",
        width: "100%",
        opacity: opening ? 0.5 : 1,
        transition: "background 0.1s",
        boxSizing: "border-box",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <FolderIcon size={14} color="var(--text-dimmer)" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-dim)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {proj.name || basename(proj.dir)}
        </div>
        <div style={{
          fontSize: 10,
          color: "var(--text-dimmer)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          marginTop: 1,
        }}>
          {truncatePath(proj.dir, 48)}
        </div>
      </div>
      <div style={{ fontSize: 10, color: "var(--text-dimmer)", flexShrink: 0 }}>
        {opening ? "opening..." : relativeTime(proj.lastOpened)}
      </div>
    </button>
  );
}

/** Sidebar workspace switcher dropdown */
export function WorkspaceDropdown({ currentName, currentPath }: { currentName: string | null; currentPath?: string | null }) {
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [addingPath, setAddingPath] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [focusIdx, setFocusIdx] = useState(-1);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const loadWorkspaces = useCallback(() => {
    fetchApi("/api/workspaces")
      .then((r) => r.json())
      .then((d: { workspaces: Workspace[] }) => setWorkspaces(d.workspaces ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) { loadWorkspaces(); setFocusIdx(-1); }
  }, [open, loadWorkspaces]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setAddingPath(false);
        setPathInput("");
        setError(null);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (addingPath) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setAddingPath(false);
      setError(null);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(focusIdx + 1, workspaces.length - 1);
      setFocusIdx(next);
      itemRefs.current[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(focusIdx - 1, 0);
      setFocusIdx(prev);
      itemRefs.current[prev]?.focus();
    }
  };

  const switchWorkspace = async (id: string) => {
    setSwitching(id);
    setError(null);
    try {
      const res = await fetchApi(`/api/workspaces/${id}/activate`, { method: "POST" });
      const d = await res.json() as { ok?: boolean; path?: string; error?: string };
      if (!res.ok) {
        setError(d.error ?? "Failed to switch");
        setSwitching(null);
        return;
      }
      // Persist in Electron main process so restarts remember the workspace
      if (typeof window.studio?.setProjectDir === "function" && d.path) {
        await window.studio.setProjectDir(d.path);
        return;
      }
      window.location.reload();
    } catch {
      setError("Network error");
      setSwitching(null);
    }
  };

  const addWorkspace = async () => {
    const p = pathInput.trim();
    if (!p) return;
    setError(null);
    try {
      const res = await fetchApi("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p }),
      });
      const data = await res.json() as { workspace?: Workspace; error?: string };
      if (!res.ok) { setError(data.error ?? "Invalid path"); return; }
      await switchWorkspace(data.workspace!.id);
    } catch {
      setError("Network error");
    }
  };

  const removeWorkspace = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await fetchApi(`/api/workspaces/${id}`, { method: "DELETE" });
    setWorkspaces((ws) => ws.filter((w) => w.id !== id));
  };

  return (
    <div ref={ref} style={{ position: "relative" }} onKeyDown={handleKeyDown}>
      <button
        onClick={() => { setOpen((v) => !v); setAddingPath(false); setError(null); }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "8px 12px",
          background: open ? "var(--accent-bg)" : "transparent",
          border: "none",
          borderBottom: "1px solid var(--border-dim)",
          cursor: "pointer",
          textAlign: "left",
          transition: "background 0.1s",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "var(--accent-bg)"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ color: "var(--accent)", flexShrink: 0 }}>
          <FolderIcon size={12} color="var(--accent)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: "var(--text)",
            fontFamily: "var(--font)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {currentName ?? "…"}
          </div>
          {currentPath && (
            <div style={{
              fontSize: 10, color: "var(--text-dimmer)",
              fontFamily: "var(--font)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {truncatePath(currentPath)}
            </div>
          )}
        </div>
        <ChevronDown open={open} />
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          zIndex: 200,
          background: "var(--bg-2)",
          borderBottom: "1px solid var(--border)",
          boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
          animation: "fadeIn 0.1s ease forwards",
        }}>
          {workspaces.length > 0 && (
            <div>
              <div style={{
                fontSize: 9, color: "var(--text-dimmer)", letterSpacing: "0.1em",
                padding: "6px 12px 3px", textTransform: "uppercase",
              }}>
                Workspaces
              </div>
              {workspaces.map((ws, i) => {
                const isActive = ws.is_active === 1;
                return (
                  <DropdownWorkspaceRow
                    key={ws.id}
                    ws={ws}
                    isActive={isActive}
                    switching={switching === ws.id}
                    focused={focusIdx === i}
                    itemRef={(el) => { itemRefs.current[i] = el; }}
                    onSwitch={() => { if (!isActive) void switchWorkspace(ws.id); }}
                    onRemove={(e) => void removeWorkspace(e, ws.id)}
                  />
                );
              })}
            </div>
          )}

          {error && (
            <div style={{ padding: "5px 12px", fontSize: 11, color: "var(--red)", fontFamily: "var(--font)" }}>
              {error}
            </div>
          )}

          {addingPath ? (
            <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border-dim)" }}>
              <input
                ref={inputRef}
                autoFocus
                type="text"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addWorkspace();
                  if (e.key === "Escape") { setAddingPath(false); setPathInput(""); setError(null); }
                }}
                placeholder="/path/to/project"
                style={{
                  width: "100%",
                  background: "var(--bg-3)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  fontFamily: "var(--font)",
                  fontSize: 11,
                  padding: "6px 8px",
                  outline: "none",
                  borderRadius: "var(--radius)",
                  boxSizing: "border-box",
                  marginBottom: 6,
                }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, justifyContent: "center", fontSize: 11 }}
                  onClick={() => void addWorkspace()}
                >
                  Open
                </button>
                <button
                  className="btn"
                  style={{ flex: 1, justifyContent: "center", fontSize: 11 }}
                  onClick={() => { setAddingPath(false); setPathInput(""); setError(null); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setAddingPath(true); setTimeout(() => inputRef.current?.focus(), 20); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                width: "100%",
                padding: "8px 12px",
                background: "transparent",
                border: "none",
                borderTop: workspaces.length > 0 ? "1px solid var(--border-dim)" : "none",
                fontSize: 11,
                color: "var(--accent)",
                fontFamily: "var(--font)",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: 14, lineHeight: 1, marginTop: -1 }}>+</span>
              Add workspace
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DropdownWorkspaceRow({
  ws,
  isActive,
  switching,
  focused,
  itemRef,
  onSwitch,
  onRemove,
}: {
  ws: Workspace;
  isActive: boolean;
  switching: boolean;
  focused: boolean;
  itemRef: (el: HTMLButtonElement | null) => void;
  onSwitch: () => void;
  onRemove: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        background: hovered || focused ? "var(--accent-bg)" : "transparent",
        borderBottom: "1px solid var(--border-dim)",
        transition: "background 0.1s",
        cursor: isActive ? "default" : "pointer",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ color: isActive ? "var(--accent)" : "var(--text-dimmer)", flexShrink: 0 }}>
        <FolderIcon size={12} color={isActive ? "var(--accent)" : "var(--text-dimmer)"} />
      </div>

      <button
        ref={itemRef}
        onClick={onSwitch}
        disabled={isActive || switching}
        tabIndex={0}
        style={{
          flex: 1,
          minWidth: 0,
          background: "none",
          border: "none",
          padding: 0,
          cursor: isActive ? "default" : "pointer",
          textAlign: "left",
          outline: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 11,
            fontWeight: isActive ? 700 : 500,
            color: isActive ? "var(--accent)" : "var(--text)",
            fontFamily: "var(--font)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {ws.name}
          </span>
          {isActive && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
              color: "var(--accent)", opacity: 0.7,
            }}>
              ACTIVE
            </span>
          )}
        </div>
        <div style={{
          fontSize: 10,
          color: "var(--text-dimmer)",
          fontFamily: "var(--font)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {truncatePath(ws.path, 32)}
        </div>
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {ws.last_opened > 0 && (
          <span style={{ fontSize: 9, color: "var(--text-dimmer)", whiteSpace: "nowrap" }}>
            {relativeTime(ws.last_opened)}
          </span>
        )}

        {!isActive && (hovered || focused) && (
          <button
            onClick={(e) => { e.stopPropagation(); onSwitch(); }}
            disabled={switching}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              color: switching ? "var(--text-dimmer)" : "var(--accent)",
              fontFamily: "var(--font)",
              fontSize: 10,
              padding: "2px 7px",
              cursor: switching ? "default" : "pointer",
              borderRadius: "var(--radius)",
              whiteSpace: "nowrap",
              letterSpacing: "0.04em",
              transition: "border-color 0.1s, color 0.1s",
            }}
          >
            {switching ? "…" : "Switch"}
          </button>
        )}

        <button
          onClick={onRemove}
          title="Remove from list"
          style={{
            background: "none",
            border: "none",
            color: "var(--text-dimmer)",
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: "0 2px",
            opacity: hovered || focused ? 0.7 : 0,
            transition: "opacity 0.1s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dimmer)")}
        >
          ×
        </button>
      </div>
    </div>
  );
}
