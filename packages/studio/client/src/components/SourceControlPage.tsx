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
  M: "#f59e0b", A: "#10b981", D: "#ef4444",
  "?": "#6366f1", R: "#8b5cf6", C: "#06b6d4", U: "#f97316",
};

function FileBadge({ status }: { status: string }) {
  const char = status[0] ?? "?";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 16, height: 16, fontSize: 10, fontWeight: 700,
      color: STATUS_COLOR[char] ?? "var(--text-dimmer)",
      background: "var(--bg-3)", borderRadius: 2, flexShrink: 0,
      fontFamily: "var(--font)",
    }}>
      {char}
    </span>
  );
}

export default function SourceControlPage() {
  const [data, setData] = useState<GitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [staging, setStaging] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const listWidth = 220;
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(listWidth);
  const [panelWidth, setPanelWidth] = useState(220);

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
      setPanelWidth(Math.max(160, Math.min(400, dragStartW.current + delta)));
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

  const stageAll = async () => {
    setStaging(true);
    setStatusMsg(null);
    try {
      const r = await fetch("/api/files/stage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (d.ok) { setStatusMsg("Staged all changes."); load(); }
      else setStatusMsg(d.error ?? "Stage failed.");
    } catch {
      setStatusMsg("Stage failed.");
    } finally {
      setStaging(false);
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
        setStatusMsg("Committed.");
        setCommitMsg("");
        setSelectedFile(null);
        load();
      } else {
        setStatusMsg(d.error ?? "Commit failed.");
      }
    } catch {
      setStatusMsg("Commit failed.");
    } finally {
      setCommitting(false);
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

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "var(--bg)" }}>

      {/* Left: file list + actions */}
      <div style={{
        width: panelWidth, minWidth: 160, flexShrink: 0,
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
              color: "var(--accent)", background: "rgba(16,185,129,0.08)",
              padding: "2px 6px", borderRadius: 2,
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
            files.map(f => (
              <div
                key={f.file}
                onClick={() => setSelectedFile(f.file)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 12px", cursor: "pointer",
                  background: selectedFile === f.file ? "var(--accent-bg)" : "transparent",
                  borderLeft: selectedFile === f.file ? "2px solid var(--accent)" : "2px solid transparent",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => {
                  if (selectedFile !== f.file)
                    (e.currentTarget as HTMLDivElement).style.background = "var(--bg-3)";
                }}
                onMouseLeave={e => {
                  if (selectedFile !== f.file)
                    (e.currentTarget as HTMLDivElement).style.background = "transparent";
                }}
              >
                <FileBadge status={f.status} />
                <span style={{
                  fontFamily: "var(--font)", fontSize: 11,
                  color: selectedFile === f.file ? "var(--text)" : "var(--text-dim)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  flex: 1, minWidth: 0,
                }}>
                  {f.file.split("/").pop()}
                </span>
              </div>
            ))
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
              color: statusMsg.includes("fail") || statusMsg.includes("Failed") ? "var(--red)" : "var(--accent)",
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
