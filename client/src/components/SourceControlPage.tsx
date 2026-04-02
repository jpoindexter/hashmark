import { useState, useEffect, useRef } from "react";
import { GitBranch, CheckCircle } from "lucide-react";
import { DiffViewer } from "./DiffViewer.tsx";
import { Skeleton } from "./shared/Skeleton.tsx";
import ConfirmDialog from "./shared/ConfirmDialog.tsx";
import { fetchApi } from "../lib/api";

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
  commits: { hash: string; message: string }[];
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
  return (
    <button
      title={title}
      onClick={onClick}
      className="btn-icon"
      style={{
        color: color ?? "var(--text-dimmer)",
        fontFamily: "var(--font)", fontSize: 12, fontWeight: 700, lineHeight: 1,
        width: 18, height: 18,
      }}
    >
      {label}
    </button>
  );
}

function SectionHeader({
  label, count, expanded, onToggle, onAction, actionLabel, actionTitle,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onAction?: () => void;
  actionLabel?: string;
  actionTitle?: string;
}) {
  return (
    <div
      onClick={onToggle}
      className="hoverable"
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "5px 8px 5px 12px",
        background: "transparent",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      <span style={{
        fontSize: 10, color: "var(--text-dimmer)", fontFamily: "var(--font)",
        transition: "transform 0.1s", display: "inline-block",
        transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
      }}>
        ▶
      </span>
      <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font)", letterSpacing: "0.06em", flex: 1 }}>
        {label}
      </span>
      <span style={{
        fontSize: 10, color: "var(--text-dimmer)", fontFamily: "var(--font)",
        background: "var(--bg-3)", borderRadius: 10, padding: "1px 6px", flexShrink: 0,
      }}>
        {count}
      </span>
      {onAction && actionLabel && (
        <button
          title={actionTitle}
          onClick={e => { e.stopPropagation(); onAction(); }}
          className="hoverable"
          style={{
            background: "none", border: "none",
            color: "var(--text-dimmer)", fontFamily: "var(--font)", fontSize: 11,
            padding: "0 2px", lineHeight: 1, flexShrink: 0,
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function FileRow({
  f, selected, busy, isStaged,
  onClick,
  onStage, onUnstage, onDiscard,
}: {
  f: GitFile;
  selected: boolean;
  busy: boolean;
  isStaged: boolean;
  onClick: () => void;
  onStage: (e: React.MouseEvent) => void;
  onUnstage: (e: React.MouseEvent) => void;
  onDiscard: (e: React.MouseEvent) => void;
}) {
  const actionsRef = useRef<HTMLDivElement>(null);
  const displayStatus = isStaged ? f.x : (f.isUntracked ? "?" : f.y);
  return (
    <div
      onClick={onClick}
      className={selected ? "" : "hoverable"}
      onMouseEnter={() => {
        if (actionsRef.current) actionsRef.current.style.opacity = "1";
      }}
      onMouseLeave={() => {
        if (actionsRef.current) actionsRef.current.style.opacity = "0";
      }}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "3px 8px 3px 24px", cursor: "pointer",
        background: selected ? "var(--accent-bg)" : "transparent",
        borderLeft: selected ? "2px solid var(--accent)" : "2px solid transparent",
        transition: "background 0.1s",
        opacity: busy ? 0.5 : 1,
      }}
    >
      <FileBadge status={displayStatus} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        <span
          title={f.file}
          style={{
            fontFamily: "var(--font)", fontSize: 11,
            color: selected ? "var(--text)" : "var(--text-dim)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {f.file.split("/").pop() ?? f.file}
        </span>
        <span style={{
          fontFamily: "var(--font)", fontSize: 10, color: "var(--text-dimmer)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {f.file.includes("/") ? f.file.slice(0, f.file.lastIndexOf("/")) : ""}
        </span>
      </div>
      {(f.added || f.removed) ? (
        <span style={{ fontFamily: "var(--font)", fontSize: 10, display: "flex", gap: 3, flexShrink: 0 }}>
          {f.added ? <span style={{ color: "var(--accent)" }}>+{f.added}</span> : null}
          {f.removed ? <span style={{ color: "var(--red)" }}>-{f.removed}</span> : null}
        </span>
      ) : null}
      <div ref={actionsRef} style={{
        display: "flex", gap: 2, flexShrink: 0,
        opacity: busy ? 1 : 0, transition: "opacity 0.1s",
      }}>
        {!isStaged && !f.isUntracked && (
          <FileActionBtn label="+" title="Stage file" color="var(--accent)" onClick={onStage} />
        )}
        {isStaged && (
          <FileActionBtn label="−" title="Unstage file" color="var(--text-dim)" onClick={onUnstage} />
        )}
        <FileActionBtn
          label="×"
          title={f.isUntracked ? "Delete file" : "Discard changes"}
          color="var(--red)"
          onClick={onDiscard}
        />
      </div>
    </div>
  );
}

export default function SourceControlPage() {
  const [data, setData] = useState<GitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedStaged, setSelectedStaged] = useState<boolean>(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [staging, setStaging] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState<string | null>(null);
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [unstagedExpanded, setUnstagedExpanded] = useState(true);
  const [untrackedExpanded, setUntrackedExpanded] = useState(true);
  const [discardTarget, setDiscardTarget] = useState<{ file: string; isUntracked: boolean } | null>(null);

  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(220);
  const [panelWidth, setPanelWidth] = useState(240);

  const load = () => {
    setLoading(true);
    fetchApi("/api/files/git")
      .then(r => r.json())
      .then((d: GitData) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setData({ branch: "unknown", ahead: 0, behind: 0, files: [], commits: [], error: "Failed to fetch git status" });
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - dragStartX.current;
      setPanelWidth(Math.max(180, Math.min(480, dragStartW.current + delta)));
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
      const r = await fetchApi("/api/files/stage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
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
      const r = await fetchApi("/api/files/stage", {
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
      const r = await fetchApi("/api/files/unstage", {
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

  const discardFile = (e: React.MouseEvent, file: string, isUntracked: boolean) => {
    e.stopPropagation();
    setDiscardTarget({ file, isUntracked });
  };

  const doDiscard = async (file: string, isUntracked: boolean) => {
    setFileLoading(file);
    try {
      const r = await fetchApi("/api/files/discard", {
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
      const r = await fetchApi("/api/files/commit", {
        method: "POST", headers: { "Content-Type": "application/json" },
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
      const r = await fetchApi("/api/files/push", { method: "POST" });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (d.ok) { showStatus("Pushed!"); load(); }
      else showStatus(d.error ?? "Push failed.");
    } catch {
      showStatus("Push failed.");
    } finally {
      setPushing(false);
    }
  };

  const pull = async () => {
    setPulling(true);
    setStatusMsg(null);
    try {
      const r = await fetchApi("/api/files/pull", { method: "POST" });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (d.ok) { showStatus("Pulled!"); load(); }
      else showStatus(d.error ?? "Pull failed.");
    } catch {
      showStatus("Pull failed.");
    } finally {
      setPulling(false);
    }
  };

  const fetchRemote = async () => {
    setFetching(true);
    setStatusMsg(null);
    try {
      const r = await fetchApi("/api/files/fetch", { method: "POST" });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (d.ok) { showStatus("Fetched."); load(); }
      else showStatus(d.error ?? "Fetch failed.");
    } catch {
      showStatus("Fetch failed.");
    } finally {
      setFetching(false);
    }
  };

  const selectFile = (file: string, staged: boolean) => {
    setSelectedFile(file);
    setSelectedStaged(staged);
  };

  const files = data?.files ?? [];
  const stagedFiles = files.filter(f => f.isStaged);
  const unstagedFiles = files.filter(f => !f.isStaged && !f.isUntracked);
  const untrackedFiles = files.filter(f => f.isUntracked);

  const isErr = statusMsg
    ? statusMsg.toLowerCase().includes("fail") || statusMsg.toLowerCase().includes("error")
    : false;

  const discardVerb = discardTarget?.isUntracked ? "Delete" : "Discard changes to";

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "var(--bg)", position: "relative" }}>
      <ConfirmDialog
        open={discardTarget !== null}
        title={discardTarget ? `${discardVerb} ${discardTarget.file.split("/").pop()}?` : ""}
        message={discardTarget && !discardTarget.isUntracked ? "This will permanently discard all local changes to this file." : undefined}
        confirmLabel={discardTarget?.isUntracked ? "Delete" : "Discard"}
        danger
        onConfirm={() => {
          const target = discardTarget;
          setDiscardTarget(null);
          if (target) void doDiscard(target.file, target.isUntracked);
        }}
        onCancel={() => setDiscardTarget(null)}
      />

      {/* Left: file list + actions */}
      <div style={{
        width: panelWidth, minWidth: 180, flexShrink: 0,
        display: "flex", flexDirection: "column",
        background: "var(--bg-2)", borderRight: "1px solid var(--border-dim)",
        overflow: "hidden",
      }}>
        {/* Header: branch + ahead/behind + refresh */}
        <div style={{
          padding: "8px 12px 6px",
          borderBottom: "1px solid var(--border-dim)", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: "var(--text-dimmer)", fontFamily: "var(--font)", letterSpacing: "0.08em" }}>
              SOURCE CONTROL
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

          {/* Branch pill + ahead/behind */}
          {loading ? (
            <Skeleton width="60%" height={18} />
          ) : data?.branch && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 11, fontFamily: "var(--font)",
                color: "var(--accent)", background: "var(--accent-bg)",
                padding: "2px 6px", borderRadius: "var(--radius-sm)",
              }}>
                {data.branch}
              </span>
              {(data.ahead > 0 || data.behind > 0) && (
                <span style={{ fontSize: 10, fontFamily: "var(--font)", color: "var(--text-dimmer)", display: "flex", gap: 4 }}>
                  {data.ahead > 0 && <span title="Commits ahead of remote">↑{data.ahead}</span>}
                  {data.behind > 0 && <span title="Commits behind remote">↓{data.behind}</span>}
                </span>
              )}
            </div>
          )}
        </div>

        {/* File list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: "12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
              <Skeleton width="80%" height={12} />
              <Skeleton width="65%" height={12} />
              <Skeleton width="72%" height={12} />
            </div>
          ) : files.length === 0 ? (
            <div style={{ padding: "16px 12px", color: "var(--text-dimmer)", fontFamily: "var(--font)", fontSize: 11 }}>
              Working tree clean.
            </div>
          ) : (
            <>
              {/* Staged */}
              {stagedFiles.length > 0 && (
                <div>
                  <SectionHeader
                    label="STAGED"
                    count={stagedFiles.length}
                    expanded={stagedExpanded}
                    onToggle={() => setStagedExpanded(v => !v)}
                    onAction={async () => {
                      try {
                        await fetchApi("/api/files/unstage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
                        load();
                      } catch { /* noop */ }
                    }}
                    actionLabel="−"
                    actionTitle="Unstage all"
                  />
                  {stagedExpanded && stagedFiles.map(f => (
                    <FileRow
                      key={`staged-${f.file}`}
                      f={f}
                      isStaged
                      selected={selectedFile === f.file && selectedStaged}
                      busy={fileLoading === f.file}
                      onClick={() => selectFile(f.file, true)}
                      onStage={e => stageFile(e, f.file)}
                      onUnstage={e => unstageFile(e, f.file)}
                      onDiscard={e => discardFile(e, f.file, f.isUntracked)}
                    />
                  ))}
                </div>
              )}

              {/* Unstaged */}
              {unstagedFiles.length > 0 && (
                <div>
                  <SectionHeader
                    label="UNSTAGED"
                    count={unstagedFiles.length}
                    expanded={unstagedExpanded}
                    onToggle={() => setUnstagedExpanded(v => !v)}
                    onAction={() => stageAll()}
                    actionLabel="+"
                    actionTitle="Stage all"
                  />
                  {unstagedExpanded && unstagedFiles.map(f => (
                    <FileRow
                      key={`unstaged-${f.file}`}
                      f={f}
                      isStaged={false}
                      selected={selectedFile === f.file && !selectedStaged}
                      busy={fileLoading === f.file}
                      onClick={() => selectFile(f.file, false)}
                      onStage={e => stageFile(e, f.file)}
                      onUnstage={e => unstageFile(e, f.file)}
                      onDiscard={e => discardFile(e, f.file, f.isUntracked)}
                    />
                  ))}
                </div>
              )}

              {/* Untracked */}
              {untrackedFiles.length > 0 && (
                <div>
                  <SectionHeader
                    label="UNTRACKED"
                    count={untrackedFiles.length}
                    expanded={untrackedExpanded}
                    onToggle={() => setUntrackedExpanded(v => !v)}
                    onAction={() => {
                      fetchApi("/api/files/stage", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ paths: untrackedFiles.map(f => f.file) }),
                      }).then(() => load()).catch(() => {});
                    }}
                    actionLabel="+"
                    actionTitle="Stage all untracked"
                  />
                  {untrackedExpanded && untrackedFiles.map(f => (
                    <FileRow
                      key={`untracked-${f.file}`}
                      f={f}
                      isStaged={false}
                      selected={selectedFile === f.file && !selectedStaged}
                      busy={fileLoading === f.file}
                      onClick={() => selectFile(f.file, false)}
                      onStage={e => stageFile(e, f.file)}
                      onUnstage={e => unstageFile(e, f.file)}
                      onDiscard={e => discardFile(e, f.file, f.isUntracked)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Commit form */}
        <div style={{
          padding: "10px 12px", borderTop: "1px solid var(--border-dim)",
          display: "flex", flexDirection: "column", gap: 8, flexShrink: 0,
        }}>
          {statusMsg && (
            <div style={{
              fontSize: 10, fontFamily: "var(--font)",
              color: isErr ? "var(--red)" : "var(--accent)", padding: "3px 0",
            }}>
              {statusMsg}
            </div>
          )}
          <textarea
            placeholder="Commit message..."
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit(); }}
            rows={2}
            style={{ width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 40 }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="btn"
              onClick={stageAll}
              disabled={staging || files.length === 0}
              style={{ flex: 1 }}
            >
              {staging ? "Staging..." : "+ Stage All"}
            </button>
            <button
              className="btn btn-primary"
              onClick={commit}
              disabled={committing || !commitMsg.trim() || stagedFiles.length === 0}
              style={{ flex: 1 }}
            >
              {committing ? "Committing..." : "Commit"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="btn"
              onClick={push}
              disabled={pushing}
              style={{ flex: 1 }}
              title="Push to remote"
            >
              {pushing ? "Pushing..." : `\u2191 Push${data?.ahead ? ` (${data.ahead})` : ""}`}
            </button>
            <button
              className="btn"
              onClick={pull}
              disabled={pulling}
              style={{ flex: 1 }}
              title="Pull from remote"
            >
              {pulling ? "Pulling..." : `\u2193 Pull${data?.behind ? ` (${data.behind})` : ""}`}
            </button>
            <button
              className="btn"
              onClick={fetchRemote}
              disabled={fetching}
              style={{ flex: 1 }}
              title="Fetch all remotes"
            >
              {fetching ? "Fetching..." : "\u21BB Fetch"}
            </button>
          </div>
        </div>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onDragStart}
        className="hoverable"
        style={{
          width: 4, background: "var(--border-dim)",
          cursor: "ew-resize", flexShrink: 0,
        }}
      />

      {/* Right: diff viewer */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {selectedFile ? (
          <DiffViewer
            path={selectedFile}
            staged={selectedStaged}
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
