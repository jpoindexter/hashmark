import { useState, useEffect } from "react";
import { GitBranch, GitCommit, RefreshCw, X } from "lucide-react";

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

const STATUS_COLORS: Record<string, string> = {
  M:  "#f59e0b",
  A:  "#10b981",
  D:  "#ef4444",
  R:  "#3b82f6",
  "?": "#52525b",
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
            <span style={{ color: "#10b981" }}>+{file.added}</span>
          )}
          {file.removed > 0 && (
            <span style={{ color: "#ef4444" }}>-{file.removed}</span>
          )}
        </div>
      )}
    </div>
  );
}
