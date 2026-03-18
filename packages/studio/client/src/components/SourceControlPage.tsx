import { useState, useEffect, useRef } from "react";
import { DiffViewer } from "./DiffViewer.tsx";

interface GitFile {
  status: string;
  file: string;
  added?: number;
  removed?: number;
}

interface GitData {
  branch: string;
  files: GitFile[];
  commits: { hash: string; message: string }[];
  error?: string;
}

const STATUS_COLOR: Record<string, string> = {
  M: "var(--yellow)",
  A: "var(--accent)",
  D: "var(--red)",
  "?": "var(--blue)",
  R: "#8b5cf6",
  C: "#06b6d4",
  U: "#f97316",
};

function FileBadge({ status }: { status: string }) {
  const char = status[0] ?? "?";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 16, height: 16, fontSize: 10, fontWeight: 700,
      color: STATUS_COLOR[char] ?? "var(--text-dimmer)",
      background: "var(--bg-3)", borderRadius: "var(--radius-sm)", flexShrink: 0,
      fontFamily: "var(--font)",
    }}>
      {char}
    </span>
  );
}

function FileActionBtn({
  label, title, color, onClick,
}: {
  label: string;
  title: string;
  color?: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? "var(--bg-4)" : "transparent",
        border: "none",
        cursor: "pointer",
        color: color ?? "var(--text-dimmer)",
        fontFamily: "var(--font)",
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1,
        width: 18,
        height: 18,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius-sm)",
        flexShrink: 0,
        padding: 0,
        transition: "background 0.1s",
      }}
    >
      {label}
    </button>
  );
}

// Truncate path from the left: "...ents/foo/bar.ts"
function truncatePath(path: string, maxLen = 24): string {
  if (path.length <= maxLen) return path;
  return "..." + path.slice(path.length - (maxLen - 3));
}

export default function SourceControlPage() {
  const [data, setData] = useState<GitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [staging, setStaging] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState<string | null>(null);
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);

  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(220);
  const [panelWidth, setPanelWidth] = useState(240);

  const load = () => {
    setLoading(true);
    fetch("/api/files/git")
      .then(r => r.json())
      .then((d: GitData) => {
        setData(d);
        setLoading(false);
        if (d.files.length > 0 && !selectedFile) {
          setSelectedFile(d.files[0].file);
        }
      })
      .catch(() => {
        setData({ branch: "unknown", files: [], commits: [], error: "Failed to fetch git status" });
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - dragStartX.current;
      setPanelWidth(Math.max(180, Math.min(420, dragStartW.current + delta)));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onDragStart = (e: React.MouseEvent) => {
    dragging.current = true;
    dragStartX.current = e.clientX;
    dragStartW.current = panelWidth;
    e.preventDefault();
  };

  const showStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const stageAll = async () => {
    setStaging(true);
    setStatusMsg(null);
    try {
      const r = await fetch("/api/files/stage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (d.ok) { showStatus("Staged all changes."); load(); }
      else showStatus(d.error ?? "Stage failed.");
    } catch {
      showStatus("Stage failed.");
    } finally {
      setStaging(false);
    }
  };

  const stageFile = async (e: React.MouseEvent, file: string) => {
    e.stopPropagation();
    setFileLoading(file);
    try {
      const r = await fetch("/api/files/stage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: [file] }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!d.ok) showStatus(d.error ?? "Stage failed.");
      load();
    } catch {
      showStatus("Stage failed.");
    } finally {
      setFileLoading(null);
    }
  };

  const unstageFile = async (e: React.MouseEvent, file: string) => {
    e.stopPropagation();
    setFileLoading(file);
    try {
      const r = await fetch("/api/files/unstage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: [file] }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!d.ok) showStatus(d.error ?? "Unstage failed.");
      load();
    } catch {
      showStatus("Unstage failed.");
    } finally {
      setFileLoading(null);
    }
  };

  const discardFile = async (e: React.MouseEvent, file: string, isUntracked: boolean) => {
    e.stopPropagation();
    const verb = isUntracked ? "Delete" : "Discard changes to";
    if (!window.confirm(`${verb} ${file}?`)) return;
    setFileLoading(file);
    try {
      const r = await fetch("/api/files/discard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: [file] }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (d.ok) {
        if (selectedFile === file) setSelectedFile(null);
        load();
      } else {
        showStatus(d.error ?? "Discard failed.");
      }
    } catch {
      showStatus("Discard failed.");
    } finally {
      setFileLoading(null);
    }
  };

  const commit = async () => {
    if (!commitMsg.trim()) return;
    setCommitting(true);
    setStatusMsg(null);
    try {
      const r = await fetch("/api/files/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: commitMsg.trim() }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (d.ok) {
        showStatus("Committed.");
        setCommitMsg("");
        setSelectedFile(null);
        load();
      } else {
        showStatus(d.error ?? "Commit failed.");
      }
    } catch {
      showStatus("Commit failed.");
    } finally {
      setCommitting(false);
    }
  };

  const push = async () => {
    setPushing(true);
    setStatusMsg(null);
    try {
      const r = await fetch("/api/files/push", { method: "POST" });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (d.ok) showStatus("Pushed!");
      else showStatus(d.error ?? "Push failed.");
    } catch {
      showStatus("Push failed.");
    } finally {
      setPushing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 24, color: "var(--text-dimmer)", fontFamily: "var(--font)", fontSize: 12 }}>
        Loading git status...
      </div>
    );
  }

  const files = data?.files ?? [];
  const isErr = statusMsg
    ? statusMsg.toLowerCase().includes("fail") || statusMsg.toLowerCase().includes("error")
    : false;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "var(--bg)" }}>

      {/* Left: file list + actions */}
      <div style={{
        width: panelWidth, minWidth: 180, flexShrink: 0,
        display: "flex", flexDirection: "column",
        background: "var(--bg-2)", borderRight: "1px solid var(--border-dim)",
        overflow: "hidden",
      }}>
        {/* Section header */}
        <div style={{
          padding: "10px 12px 6px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid var(--border-dim)", flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, color: "var(--text-dimmer)", fontFamily: "var(--font)", letterSpacing: "0.08em" }}>
            CHANGES {files.length > 0 ? `(${files.length})` : ""}
          </span>
          <button
            onClick={load}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-dimmer)", fontSize: 13, lineHeight: 1, padding: "0 2px",
            }}
            title="Refresh"
          >
            ↻
          </button>
        </div>

        {/* Branch pill */}
        {data?.branch && (
          <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--border-dim)", flexShrink: 0 }}>
            <span style={{
              fontSize: 11, fontFamily: "var(--font)",
              color: "var(--accent)", background: "var(--accent-bg)",
              padding: "2px 6px", borderRadius: "var(--radius-sm)",
            }}>
              {data.branch}
            </span>
          </div>
        )}

        {/* File list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {files.length === 0 ? (
            <div style={{ padding: "16px 12px", color: "var(--text-dimmer)", fontFamily: "var(--font)", fontSize: 11 }}>
              Working tree clean.
            </div>
          ) : (
            files.map(f => {
              const isSelected = selectedFile === f.file;
              const isUntracked = f.status === "??" || f.status === "?";
              const isStaged = f.status.length >= 1 && f.status[0] !== " " && f.status[0] !== "?" && f.status[1] === " ";
              const isBusy = fileLoading === f.file;
              const isHovered = hoveredFile === f.file;

              return (
                <div
                  key={f.file}
                  onClick={() => setSelectedFile(f.file)}
                  onMouseEnter={() => setHoveredFile(f.file)}
                  onMouseLeave={() => setHoveredFile(null)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "4px 8px 4px 12px", cursor: "pointer",
                    background: isSelected ? "var(--accent-bg)" : "transparent",
                    borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                    transition: "background 0.1s",
                    opacity: isBusy ? 0.5 : 1,
                  }}
                >
                  <FileBadge status={f.status} />

                  {/* Path + diff stats */}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                    <span
                      title={f.file}
                      style={{
                        fontFamily: "var(--font)", fontSize: 11,
                        color: isSelected ? "var(--text)" : "var(--text-dim)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        direction: "rtl", textAlign: "left",
                      }}
                    >
                      {truncatePath(f.file)}
                    </span>
                    {(f.added || f.removed) ? (
                      <span style={{ fontFamily: "var(--font)", fontSize: 10, display: "flex", gap: 4 }}>
                        {f.added ? <span style={{ color: "var(--accent)" }}>+{f.added}</span> : null}
                        {f.removed ? <span style={{ color: "var(--red)" }}>-{f.removed}</span> : null}
                      </span>
                    ) : null}
                  </div>

                  {/* Per-file action buttons — visible on hover */}
                  <div style={{
                    display: "flex", gap: 2, flexShrink: 0,
                    opacity: isHovered || isBusy ? 1 : 0,
                    transition: "opacity 0.1s",
                  }}>
                    {/* Stage: + */}
                    <FileActionBtn
                      label="+"
                      title="Stage file"
                      color="var(--accent)"
                      onClick={(e) => stageFile(e, f.file)}
                    />
                    {/* Unstage: − (only for staged files) */}
                    {isStaged && (
                      <FileActionBtn
                        label="−"
                        title="Unstage file"
                        color="var(--text-dim)"
                        onClick={(e) => unstageFile(e, f.file)}
                      />
                    )}
                    {/* Discard/Delete: × */}
                    <FileActionBtn
                      label="×"
                      title={isUntracked ? "Delete file" : "Discard changes"}
                      color="var(--red)"
                      onClick={(e) => discardFile(e, f.file, isUntracked)}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Actions */}
        <div style={{
          padding: "10px 12px", borderTop: "1px solid var(--border-dim)",
          display: "flex", flexDirection: "column", gap: 8, flexShrink: 0,
        }}>
          {statusMsg && (
            <div style={{
              fontSize: 10, fontFamily: "var(--font)",
              color: isErr ? "var(--red)" : "var(--accent)",
              padding: "3px 0",
            }}>
              {statusMsg}
            </div>
          )}
          <button
            className="btn"
            onClick={stageAll}
            disabled={staging || files.length === 0}
          >
            {staging ? "Staging..." : "Stage All"}
          </button>
          <input
            type="text"
            placeholder="Commit message..."
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") commit(); }}
            style={{ width: "100%", boxSizing: "border-box" }}
          />
          <button
            className="btn btn-primary"
            onClick={commit}
            disabled={committing || !commitMsg.trim()}
          >
            {committing ? "Committing..." : "> Commit"}
          </button>
          <button
            className="btn"
            onClick={push}
            disabled={pushing}
          >
            {pushing ? "Pushing..." : "> Push"}
          </button>
        </div>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onDragStart}
        style={{
          width: 4, background: "var(--border-dim)",
          cursor: "ew-resize", flexShrink: 0, transition: "background 0.1s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--accent)")}
        onMouseLeave={e => (e.currentTarget.style.background = "var(--border-dim)")}
      />

      {/* Right: diff viewer */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {selectedFile ? (
          <DiffViewer
            path={selectedFile}
            onClose={() => setSelectedFile(null)}
          />
        ) : (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-dimmer)", fontFamily: "var(--font)", fontSize: 12,
          }}>
            {files.length === 0 ? "No changes to show." : "Select a file to view its diff."}
          </div>
        )}
      </div>
    </div>
  );
}
