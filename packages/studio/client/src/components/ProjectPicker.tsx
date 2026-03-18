import { useState, useEffect, useRef, useCallback } from "react";
import { basename } from "../lib/path.js";

interface Workspace {
  id: string;
  name: string;
  path: string;
  last_opened: number;
  is_active: number;
}

interface ProjectPickerProps {
  /** When used as an inline dropdown inside a sidebar, pass the current project name */
  currentName?: string;
  /** When used as an inline dropdown, call this to close */
  onClose?: () => void;
  /** Dropdown anchor mode: renders just the trigger+dropdown, not the full splash */
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

/** Full-page splash shown when no project is configured */
export default function ProjectPicker(_props: ProjectPickerProps = {}) {
  const isElectron = typeof window.studio !== "undefined";
  const [loading, setLoading] = useState(false);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (!isElectron) return;
    window.studio?.getRecentProjects?.().then(r => setRecent(r ?? [])).catch(() => {});
  }, [isElectron]);

  const handlePick = async () => {
    setLoading(true);
    setError(null);
    try {
      const dir = await window.studio?.pickFolder();
      if (!dir) { setLoading(false); return; }
      await window.studio?.setProjectDir(dir);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open project");
      setLoading(false);
    }
  };

  const handleOpenRecent = async (path: string) => {
    setOpeningPath(path);
    setError(null);
    try {
      await window.studio?.setProjectDir(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open project");
      setOpeningPath(null);
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      background: "var(--bg)",
      fontFamily: "var(--font-ui)",
      WebkitAppRegion: "drag" as React.CSSProperties["WebkitAppRegion"],
    }}>

      {/* Logo */}
      <div style={{ marginBottom: 48, textAlign: "center", userSelect: "none" }}>
        <div style={{ fontSize: 42, fontWeight: 900, color: "var(--accent)", letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 10 }}>
          #
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          hashmark studio
        </div>
      </div>

      {isElectron ? (
        <div style={{ WebkitAppRegion: "no-drag" as React.CSSProperties["WebkitAppRegion"] }}>
          {/* Open button */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: recent.length > 0 ? 40 : 0 }}>
            <button
              onClick={() => void handlePick()}
              disabled={loading}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                width: 160,
                height: 110,
                background: "var(--bg-2)",
                border: "1px solid var(--border-dim)",
                borderRadius: "var(--radius-lg)",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                transition: "background 0.15s, border-color 0.15s",
              }}
              onMouseEnter={e => {
                if (!loading) {
                  e.currentTarget.style.background = "var(--bg-3)";
                  e.currentTarget.style.borderColor = "var(--border)";
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "var(--bg-2)";
                e.currentTarget.style.borderColor = "var(--border-dim)";
              }}
            >
              <div style={{ color: loading ? "var(--accent)" : "var(--text-dim)" }}>
                <FolderIcon size={24} color="currentColor" />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>
                  {loading ? "Opening..." : "Open project"}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-dimmer)" }}>Select a folder</div>
              </div>
            </button>
          </div>

          {/* Recent projects */}
          {recent.length > 0 && (
            <div style={{ width: 400, maxWidth: "90vw" }}>
              <div style={{
                fontSize: 10, color: "var(--text-dimmer)", letterSpacing: "0.1em",
                textTransform: "uppercase", marginBottom: 10, textAlign: "center",
              }}>
                Recent
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {recent.map(path => (
                  <RecentRow
                    key={path}
                    path={path}
                    opening={openingPath === path}
                    onOpen={() => void handleOpenRecent(path)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-dimmer)", textAlign: "center", letterSpacing: "0.03em" }}>
          Start studio from the CLI:<br />
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>hashmark studio</span>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 20, fontSize: 11, color: "var(--red)", textAlign: "center",
          WebkitAppRegion: "no-drag" as React.CSSProperties["WebkitAppRegion"],
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

function RecentRow({ path, opening, onOpen }: { path: string; opening: boolean; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      disabled={opening}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 14px",
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: "var(--radius)",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        opacity: opening ? 0.5 : 1,
        transition: "background 0.1s, border-color 0.1s",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = "var(--bg-3)";
        e.currentTarget.style.borderColor = "var(--border-dim)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderColor = "transparent";
      }}
    >
      <FolderIcon size={14} color="var(--text-dimmer)" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {basename(path)}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-dimmer)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
          {path}
        </div>
      </div>
      {opening && <div style={{ fontSize: 10, color: "var(--text-dimmer)", flexShrink: 0 }}>opening...</div>}
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
    fetch("/api/workspaces")
      .then(r => r.json())
      .then((d: { workspaces: Workspace[] }) => setWorkspaces(d.workspaces ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) { loadWorkspaces(); setFocusIdx(-1); }
  }, [open, loadWorkspaces]);

  // Close on outside click
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

  // Focus trap + keyboard nav
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (addingPath) return; // let input handle its own keys

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
      const res = await fetch(`/api/workspaces/${id}/activate`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Failed to switch");
        setSwitching(null);
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
      const res = await fetch("/api/workspaces", {
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
    await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
    setWorkspaces(ws => ws.filter(w => w.id !== id));
  };

  return (
    <div ref={ref} style={{ position: "relative" }} onKeyDown={handleKeyDown}>

      {/* Trigger */}
      <button
        onClick={() => { setOpen(v => !v); setAddingPath(false); setError(null); }}
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
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = "var(--accent-bg)"; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = "transparent"; }}
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

      {/* Dropdown */}
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

          {/* Workspace list */}
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
                    itemRef={el => { itemRefs.current[i] = el; }}
                    onSwitch={() => { if (!isActive) void switchWorkspace(ws.id); }}
                    onRemove={e => void removeWorkspace(e, ws.id)}
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

          {/* Add workspace */}
          {addingPath ? (
            <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border-dim)" }}>
              <input
                ref={inputRef}
                autoFocus
                type="text"
                value={pathInput}
                onChange={e => setPathInput(e.target.value)}
                onKeyDown={e => {
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
              onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-bg)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
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

      {/* Main content */}
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

      {/* Right side: time + switch + remove */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {ws.last_opened > 0 && (
          <span style={{ fontSize: 9, color: "var(--text-dimmer)", whiteSpace: "nowrap" }}>
            {relativeTime(ws.last_opened)}
          </span>
        )}

        {!isActive && (hovered || focused) && (
          <button
            onClick={e => { e.stopPropagation(); onSwitch(); }}
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
          onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dimmer)")}
        >
          ×
        </button>
      </div>
    </div>
  );
}
