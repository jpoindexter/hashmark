import { useState, useEffect, useRef } from "react";
import { GitBranch, GitCommit, RefreshCw, X, FolderOpen, ChevronDown } from "lucide-react";

interface GitFile {
  status: string;
  file: string;
  added: number;
  removed: number;
}

interface GitData {
  branch: string;
  files: GitFile[];
  commits: Array<{ hash: string; message: string }>;
}

interface ProjectInfo {
  projectName: string;
  projectDir: string;
}

interface Workspace {
  id: string;
  name: string;
  path: string;
  last_opened: number;
  is_active: number;
}

const STATUS_COLORS: Record<string, string> = {
  M:   "var(--yellow)",
  A:   "var(--accent)",
  D:   "var(--red)",
  R:   "var(--blue)",
  "?": "var(--text-dimmer)",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontFamily: "var(--font)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--text-dimmer)",
  padding: "12px 12px 4px",
};

export default function WorkspaceSidebar({ onClose }: { onClose: () => void }) {
  const [git, setGit]   = useState<GitData | null>(null);
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/files/git").then(r => r.json()),
      fetch("/api/info").then(r => r.json()),
    ]).then(([g, i]) => {
      setGit(g as GitData);
      setInfo(i as ProjectInfo);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--bg-2)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        height: 38,
        minHeight: 38,
        display: "flex",
        alignItems: "center",
        padding: "0 8px 0 12px",
        borderBottom: "1px solid var(--border-dim)",
        flexShrink: 0,
        gap: 8,
      }}>
        <span style={{
          flex: 1,
          fontSize: 10,
          fontFamily: "var(--font)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-dimmer)",
        }}>
          Workspace
        </span>
        <button
          onClick={load}
          title="Refresh"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: loading ? "var(--accent)" : "var(--text-dimmer)",
            display: "flex",
            alignItems: "center",
            padding: 4,
            transition: "color 0.1s",
          }}
        >
          <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
        </button>
        <button
          onClick={onClose}
          title="Close"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-dimmer)",
            display: "flex",
            alignItems: "center",
            padding: 4,
            transition: "color 0.1s",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dimmer)")}
        >
          <X size={12} />
        </button>
      </div>

      {/* Workspace switcher */}
      <WorkspaceSwitcher currentInfo={info} />

      {/* Branch + project */}
      <div style={{ padding: "10px 12px 8px", borderBottom: "1px solid var(--border-dim)", flexShrink: 0 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontFamily: "var(--font)",
          color: "var(--text)",
          marginBottom: 4,
        }}>
          <GitBranch size={12} style={{ color: "var(--accent)", flexShrink: 0 }} />
          <span style={{ fontWeight: 600 }}>{git?.branch ?? "—"}</span>
        </div>
        <div style={{
          fontSize: 11,
          fontFamily: "var(--font)",
          color: "var(--text-dimmer)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {info?.projectName ?? "…"}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {/* Changed files */}
        <div style={sectionLabel}>Changed Files</div>
        {(git?.files?.length ?? 0) === 0 ? (
          <div style={{
            padding: "4px 12px 8px",
            fontSize: 11,
            fontFamily: "var(--font)",
            color: "var(--text-dimmer)",
          }}>
            No changes
          </div>
        ) : (
          git!.files.map((f, i) => (
            <FileRow key={i} file={f} />
          ))
        )}

        {/* Recent commits */}
        <div style={{ ...sectionLabel, marginTop: 4 }}>Recent Commits</div>
        {(git?.commits?.length ?? 0) === 0 ? (
          <div style={{
            padding: "4px 12px 8px",
            fontSize: 11,
            fontFamily: "var(--font)",
            color: "var(--text-dimmer)",
          }}>
            No commits
          </div>
        ) : (
          git!.commits.map((c) => (
            <div key={c.hash} style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
              padding: "4px 12px",
              fontSize: 11,
              fontFamily: "var(--font)",
            }}>
              <GitCommit size={12} style={{ color: "var(--text-dimmer)", flexShrink: 0, marginTop: 1 }} />
              <div style={{ minWidth: 0 }}>
                <span style={{
                  color: "var(--accent)",
                  marginRight: 6,
                  fontSize: 10,
                  fontWeight: 600,
                }}>
                  {c.hash.slice(0, 7)}
                </span>
                <span style={{
                  color: "var(--text-dim)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  display: "block",
                }}>
                  {c.message}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer actions */}
      <div style={{
        padding: "8px 12px",
        borderTop: "1px solid var(--border-dim)",
        display: "flex",
        gap: 6,
        flexShrink: 0,
      }}>
        <button
          className="btn"
          style={{ flex: 1, justifyContent: "center" }}
          onClick={() => { /* TODO: Stage all */ }}
        >
          Stage All
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 1, justifyContent: "center" }}
          onClick={() => { /* TODO: Open commit dialog */ }}
        >
          Commit…
        </button>
      </div>
    </div>
  );
}

function WorkspaceSwitcher({ currentInfo }: { currentInfo: ProjectInfo | null }) {
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [addingPath, setAddingPath] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const loadWorkspaces = () => {
    fetch("/api/workspaces")
      .then(r => r.json())
      .then((d: { workspaces: Workspace[] }) => setWorkspaces(d.workspaces ?? []))
      .catch(() => {});
  };

  useEffect(() => {
    if (open) loadWorkspaces();
  }, [open]);

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

  const removeWorkspace = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
    setWorkspaces(ws => ws.filter(w => w.id !== id));
  };

  const addWorkspace = async () => {
    const p = pathInput.trim();
    if (!p) return;
    setError(null);
    try {
      const addRes = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p }),
      });
      const addData = await addRes.json() as { workspace?: Workspace; error?: string };
      if (!addRes.ok) { setError(addData.error ?? "Invalid path"); return; }
      const ws = addData.workspace!;
      await switchWorkspace(ws.id);
    } catch {
      setError("Network error");
    }
  };

  const truncatePath = (p: string, max = 32) =>
    p.length <= max ? p : "…" + p.slice(-(max - 1));

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      {/* Trigger row */}
      <div
        onClick={() => { setOpen(v => !v); setAddingPath(false); setError(null); }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--border-dim)",
          cursor: "pointer",
          background: open ? "var(--accent-bg)" : "transparent",
          transition: "background 0.1s",
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLDivElement).style.background = "var(--accent-bg)"; }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
      >
        <FolderOpen size={12} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text)",
            fontFamily: "var(--font)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {currentInfo?.projectName ?? "…"}
          </div>
          <div style={{
            fontSize: 10,
            color: "var(--text-dimmer)",
            fontFamily: "var(--font)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {currentInfo ? truncatePath(currentInfo.projectDir) : ""}
          </div>
        </div>
        <ChevronDown
          size={11}
          style={{
            color: "var(--text-dimmer)",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          zIndex: 100,
          background: "var(--bg-2)",
          borderBottom: "1px solid var(--border)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}>
          {/* Workspace list */}
          {workspaces.length > 0 && (
            <div>
              <div style={{
                fontSize: 9,
                color: "var(--text-dimmer)",
                letterSpacing: "0.1em",
                padding: "6px 12px 4px",
                textTransform: "uppercase",
              }}>
                Recent
              </div>
              {workspaces.map(ws => (
                <WorkspaceRow
                  key={ws.id}
                  ws={ws}
                  switching={switching === ws.id}
                  onSwitch={() => void switchWorkspace(ws.id)}
                  onRemove={e => void removeWorkspace(e, ws.id)}
                  truncatePath={truncatePath}
                />
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              padding: "6px 12px",
              fontSize: 11,
              color: "var(--red)",
              fontFamily: "var(--font)",
            }}>
              {error}
            </div>
          )}

          {/* Add path input */}
          {addingPath ? (
            <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border-dim)" }}>
              <input
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
                  boxSizing: "border-box",
                  borderRadius: "var(--radius)",
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
            <div
              onClick={() => setAddingPath(true)}
              style={{
                padding: "8px 12px",
                fontSize: 11,
                color: "var(--accent)",
                fontFamily: "var(--font)",
                cursor: "pointer",
                borderTop: workspaces.length > 0 ? "1px solid var(--border-dim)" : "none",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--accent-bg)"}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
            >
              <FolderOpen size={11} />
              Open folder...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WorkspaceRow({
  ws,
  switching,
  onSwitch,
  onRemove,
  truncatePath,
}: {
  ws: Workspace;
  switching: boolean;
  onSwitch: () => void;
  onRemove: (e: React.MouseEvent) => void;
  truncatePath: (p: string, max?: number) => string;
}) {
  const [hovered, setHovered] = useState(false);
  const isActive = ws.is_active === 1;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        background: hovered ? "var(--accent-bg)" : "transparent",
        transition: "background 0.1s",
        cursor: isActive ? "default" : "pointer",
        borderBottom: "1px solid var(--border-dim)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ flex: 1, minWidth: 0 }} onClick={isActive ? undefined : onSwitch}>
        <div style={{
          fontSize: 11,
          fontWeight: isActive ? 700 : 400,
          color: isActive ? "var(--accent)" : "var(--text)",
          fontFamily: "var(--font)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {ws.name}
          {isActive && (
            <span style={{ marginLeft: 6, fontSize: 9, color: "var(--accent)", opacity: 0.7 }}>
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
          {truncatePath(ws.path)}
        </div>
      </div>

      {!isActive && (
        <button
          onClick={onSwitch}
          disabled={switching}
          title="Switch to this workspace"
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
            flexShrink: 0,
            letterSpacing: "0.04em",
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
          flexShrink: 0,
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.1s",
        }}
      >
        ×
      </button>
    </div>
  );
}

function FileRow({ file }: { file: GitFile }) {
  const statusChar = file.status.replace("?", "?")[0] ?? "?";
  const dotColor = STATUS_COLORS[statusChar] ?? "var(--text-dimmer)";
  const shortName = file.file.split("/").pop() ?? file.file;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      padding: "3px 12px",
      gap: 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: dotColor,
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: 11,
          fontFamily: "var(--font)",
          color: "var(--text-dim)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          minWidth: 0,
        }} title={file.file}>
          {shortName}
        </span>
        <span style={{
          fontSize: 9,
          fontFamily: "var(--font)",
          color: "var(--text-dimmer)",
          flexShrink: 0,
        }}>
          {file.status}
        </span>
      </div>
      {(file.added > 0 || file.removed > 0) && (
        <div style={{
          display: "flex",
          gap: 6,
          paddingLeft: 12,
          fontSize: 10,
          fontFamily: "var(--font)",
        }}>
          {file.added > 0 && (
            <span style={{ color: "var(--accent)" }}>+{file.added}</span>
          )}
          {file.removed > 0 && (
            <span style={{ color: "var(--red)" }}>-{file.removed}</span>
          )}
        </div>
      )}
    </div>
  );
}
