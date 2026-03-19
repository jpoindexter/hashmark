import { useState, useEffect, useCallback } from "react";

interface GitFile {
  status: string;
  file: string;
  x: string;
  y: string;
  isStaged: boolean;
  isUnstaged: boolean;
  isUntracked: boolean;
  added?: number;
  removed?: number;
}

interface GitData {
  branch: string;
  ahead: number;
  behind: number;
  files: GitFile[];
  error?: string;
}

const STATUS_COLOR: Record<string, string> = {
  M: "var(--yellow)",
  A: "var(--accent)",
  D: "var(--red)",
  "?": "var(--blue)",
  R: "#8b5cf6",
  C: "var(--cyan)",
  U: "#f97316",
};

function StatusBadge({ status }: { status: string }) {
  const char = status[0] ?? "?";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 14,
        height: 14,
        fontSize: 9,
        fontWeight: 700,
        color: STATUS_COLOR[char] ?? "var(--text-dimmer)",
        background: "var(--bg-3)",
        borderRadius: "var(--radius-sm)",
        flexShrink: 0,
        fontFamily: "var(--font)",
      }}
    >
      {char}
    </span>
  );
}

function ChangedFileRow({
  f,
  onClick,
}: {
  f: GitFile;
  onClick: () => void;
}) {
  const displayStatus = f.isStaged
    ? f.x
    : f.isUntracked
      ? "?"
      : f.y;
  const filename = f.file.split("/").pop() ?? f.file;

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 22,
        paddingLeft: 12,
        paddingRight: 8,
        cursor: "pointer",
        fontSize: 12,
        fontFamily: "var(--font)",
        color: "var(--text-dim)",
        whiteSpace: "nowrap",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "var(--bg-3)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      <StatusBadge status={displayStatus} />
      <span
        title={f.file}
        style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {filename}
      </span>
      {(f.added || f.removed) && (
        <span
          style={{
            fontSize: 10,
            display: "flex",
            gap: 3,
            flexShrink: 0,
          }}
        >
          {f.added ? (
            <span style={{ color: "var(--accent)" }}>+{f.added}</span>
          ) : null}
          {f.removed ? (
            <span style={{ color: "var(--red)" }}>-{f.removed}</span>
          ) : null}
        </span>
      )}
    </div>
  );
}

export default function GitSidebar() {
  const [data, setData] = useState<GitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/files/git")
      .then((r) => r.json())
      .then((d: GitData) => setData(d))
      .catch(() => {
        setData({
          branch: "unknown",
          ahead: 0,
          behind: 0,
          files: [],
          error: "Failed to fetch",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleFileClick = useCallback((path: string) => {
    window.dispatchEvent(
      new CustomEvent("studio:open-diff", { detail: { path } })
    );
  }, []);

  const toast = (message: string, type: "info" | "error") => {
    window.dispatchEvent(new CustomEvent("studio:toast", { detail: { message, type } }));
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
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) {
        setStatusMsg("Committed.");
        setCommitMsg("");
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

  const push = async () => {
    setPushing(true);
    try {
      const r = await fetch("/api/files/push", { method: "POST" });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) { toast("Pushed to remote.", "info"); load(); }
      else toast(d.error ?? "Push failed.", "error");
    } catch {
      toast("Push failed.", "error");
    } finally {
      setPushing(false);
    }
  };

  const pull = async () => {
    setPulling(true);
    try {
      const r = await fetch("/api/files/pull", { method: "POST" });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) { toast("Pulled from remote.", "info"); load(); }
      else toast(d.error ?? "Pull failed.", "error");
    } catch {
      toast("Pull failed.", "error");
    } finally {
      setPulling(false);
    }
  };

  const files = data?.files ?? [];
  const changeCount = files.length;

  const isErr = statusMsg
    ? statusMsg.toLowerCase().includes("fail") ||
      statusMsg.toLowerCase().includes("error")
    : false;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          fontSize: 10,
          fontFamily: "var(--font)",
          letterSpacing: "0.06em",
          color: "var(--text-dim)",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        <span>CHANGES</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              color: "var(--text-dimmer)",
              background: "var(--bg-3)",
              borderRadius: 10,
              padding: "1px 6px",
            }}
          >
            {changeCount}
          </span>
          <button
            onClick={load}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-dimmer)",
              fontSize: 13,
              lineHeight: 1,
              padding: 0,
            }}
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {loading ? (
          <div
            style={{
              padding: "12px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {[70, 55, 65].map((w, i) => (
              <div
                key={i}
                style={{
                  height: 12,
                  width: `${w}%`,
                  background: "var(--bg-4)",
                  borderRadius: "var(--radius-sm)",
                }}
              />
            ))}
          </div>
        ) : data?.error ? (
          <div
            style={{
              padding: "12px 16px",
              fontSize: 11,
              color: "var(--red)",
              fontFamily: "var(--font)",
            }}
          >
            {data.error}
          </div>
        ) : changeCount === 0 ? (
          <div
            style={{
              padding: "12px 16px",
              fontSize: 11,
              color: "var(--text-dimmer)",
              fontFamily: "var(--font)",
            }}
          >
            Working tree clean.
          </div>
        ) : (
          files.map((f) => (
            <ChangedFileRow
              key={f.file}
              f={f}
              onClick={() => handleFileClick(f.file)}
            />
          ))
        )}
      </div>

      {/* Commit form */}
      <div
        style={{
          padding: "8px 10px",
          borderTop: "1px solid var(--border-dim)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          flexShrink: 0,
        }}
      >
        {statusMsg && (
          <div
            style={{
              fontSize: 10,
              fontFamily: "var(--font)",
              color: isErr ? "var(--red)" : "var(--accent)",
              padding: "2px 0",
            }}
          >
            {statusMsg}
          </div>
        )}
        <textarea
          placeholder="Commit message..."
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              void commit();
            }
          }}
          rows={3}
          style={{
            width: "100%",
            boxSizing: "border-box",
            resize: "vertical",
            minHeight: 40,
            fontFamily: "var(--font)",
            fontSize: 11,
            background: "var(--bg-3)",
            border: "1px solid var(--border-dim)",
            color: "var(--text)",
            padding: "6px 8px",
            borderRadius: "var(--radius)",
            outline: "none",
          }}
        />
        <button
          className="btn btn-primary"
          onClick={() => void commit()}
          disabled={committing || !commitMsg.trim()}
          style={{ width: "100%", fontSize: 11, justifyContent: "center" }}
        >
          {committing ? "Committing..." : "> Commit"}
        </button>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="btn"
            onClick={() => void push()}
            disabled={pushing}
            style={{ flex: 1, fontSize: 11, justifyContent: "center" }}
            title="Push to remote"
          >
            {pushing ? "Pushing..." : "\u2191 Push"}
          </button>
          <button
            className="btn"
            onClick={() => void pull()}
            disabled={pulling}
            style={{ flex: 1, fontSize: 11, justifyContent: "center" }}
            title="Pull from remote"
          >
            {pulling ? "Pulling..." : "\u2193 Pull"}
          </button>
        </div>
      </div>
    </div>
  );
}
