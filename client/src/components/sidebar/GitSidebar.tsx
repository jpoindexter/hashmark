import { useState, useEffect, useCallback } from "react";
import { fetchApi } from "../../lib/api";
import { toast } from "../../hooks/useToast";
import type { GitData, OutgoingCommit } from "./git/types";
import { HeaderIconBtn, SectionHeader, ChangedFileRow, OutgoingCommitRow, RefreshIcon, UndoIcon, PlusIcon } from "./git/GitComponents";
import CreatePrDialog from "./git/CreatePrDialog";

export default function GitSidebar() {
  const [data, setData] = useState<GitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState<string | null>(null);
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [unstagedExpanded, setUnstagedExpanded] = useState(true);
  const [untrackedExpanded, setUntrackedExpanded] = useState(true);
  const [outgoingExpanded, setOutgoingExpanded] = useState(true);
  const [ghAvailable, setGhAvailable] = useState(false);
  const [prDialogOpen, setPrDialogOpen] = useState(false);
  const [outgoing, setOutgoing] = useState<OutgoingCommit[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    fetchApi("/api/files/git")
      .then((r) => r.json())
      .then((d: GitData) => setData(d))
      .catch(() => {
        setData({ branch: "unknown", ahead: 0, behind: 0, files: [], error: "Failed to fetch" });
      })
      .finally(() => setLoading(false));
  }, []);

  const loadOutgoing = useCallback(() => {
    fetchApi("/api/files/git/outgoing")
      .then((r) => r.json())
      .then((d: { commits: OutgoingCommit[]; count: number }) => setOutgoing(d.commits ?? []))
      .catch(() => setOutgoing([]));
  }, []);

  const refresh = useCallback(() => { load(); loadOutgoing(); }, [load, loadOutgoing]);

  useEffect(() => { load(); loadOutgoing(); }, [load, loadOutgoing]);

  useEffect(() => {
    fetchApi("/api/files/git/gh-available")
      .then((r) => r.json())
      .then((d: { available?: boolean }) => setGhAvailable(d.available === true))
      .catch(() => setGhAvailable(false));
  }, []);

  const handleFileClick = useCallback((path: string) => {
    setSelectedPath(path);
    window.dispatchEvent(new CustomEvent("studio:open-diff", { detail: { path } }));
  }, []);

  const showStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const stageFile = async (e: React.MouseEvent, file: string) => {
    e.stopPropagation();
    setFileLoading(file);
    try {
      const r = await fetchApi("/api/files/stage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: [file] }) });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!d.ok) showStatus(d.error ?? "Stage failed.");
      load();
    } catch { showStatus("Stage failed."); } finally { setFileLoading(null); }
  };

  const unstageFile = async (e: React.MouseEvent, file: string) => {
    e.stopPropagation();
    setFileLoading(file);
    try {
      const r = await fetchApi("/api/files/unstage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: [file] }) });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!d.ok) showStatus(d.error ?? "Unstage failed.");
      load();
    } catch { showStatus("Unstage failed."); } finally { setFileLoading(null); }
  };

  const discardFile = async (e: React.MouseEvent, file: string) => {
    e.stopPropagation();
    setFileLoading(file);
    try {
      const r = await fetchApi("/api/files/discard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: [file] }) });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) load(); else showStatus(d.error ?? "Discard failed.");
    } catch { showStatus("Discard failed."); } finally { setFileLoading(null); }
  };

  const stageAll = async () => {
    try {
      const r = await fetchApi("/api/files/stage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) load(); else showStatus(d.error ?? "Stage failed.");
    } catch { showStatus("Stage failed."); }
  };

  const unstageAll = async () => {
    try {
      const r = await fetchApi("/api/files/unstage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) load(); else showStatus(d.error ?? "Unstage failed.");
    } catch { showStatus("Unstage failed."); }
  };

  const discardAll = async () => {
    const unstaged = files.filter((f) => !f.isStaged && !f.isUntracked);
    if (unstaged.length === 0) return;
    try {
      const r = await fetchApi("/api/files/discard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: unstaged.map((f) => f.file) }) });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) load(); else showStatus(d.error ?? "Discard failed.");
    } catch { showStatus("Discard failed."); }
  };

  const commit = async () => {
    if (!commitMsg.trim()) return;
    setCommitting(true);
    setStatusMsg(null);
    try {
      const r = await fetchApi("/api/files/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: commitMsg.trim() }) });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) { showStatus("Committed."); setCommitMsg(""); refresh(); }
      else showStatus(d.error ?? "Commit failed.");
    } catch { showStatus("Commit failed."); } finally { setCommitting(false); }
  };

  const push = async () => {
    setPushing(true);
    try {
      const r = await fetchApi("/api/files/push", { method: "POST" });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) { toast.success("Pushed to remote."); refresh(); }
      else toast.error(d.error ?? "Push failed.");
    } catch { toast.error("Push failed."); } finally { setPushing(false); }
  };

  const pull = async () => {
    setPulling(true);
    try {
      const r = await fetchApi("/api/files/pull", { method: "POST" });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) { toast.success("Pulled from remote."); refresh(); }
      else toast.error(d.error ?? "Pull failed.");
    } catch { toast.error("Pull failed."); } finally { setPulling(false); }
  };

  const files = data?.files ?? [];
  const stagedFiles = files.filter((f) => f.isStaged);
  const unstagedFiles = files.filter((f) => !f.isStaged && !f.isUntracked);
  const untrackedFiles = files.filter((f) => f.isUntracked);
  const totalChanges = files.length;
  const isErr = statusMsg ? statusMsg.toLowerCase().includes("fail") || statusMsg.toLowerCase().includes("error") : false;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <CreatePrDialog open={prDialogOpen} onClose={() => setPrDialogOpen(false)} currentBranch={data?.branch ?? ""} />

      {/* Top header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px 6px 12px", fontSize: 10, fontFamily: "var(--font)", letterSpacing: "0.06em", color: "var(--text-dim)", userSelect: "none", flexShrink: 0 }}>
        <span>SOURCE CONTROL</span>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <span style={{ fontSize: 10, color: "var(--text-dimmer)", background: "var(--bg-3)", borderRadius: 10, padding: "1px 6px", marginRight: 2 }}>{totalChanges}</span>
          <HeaderIconBtn title="Stage all" onClick={() => void stageAll()}><PlusIcon /></HeaderIconBtn>
          <HeaderIconBtn title="Discard all changes" onClick={() => void discardAll()}><UndoIcon /></HeaderIconBtn>
          <HeaderIconBtn title="Refresh" onClick={refresh}><RefreshIcon /></HeaderIconBtn>
        </div>
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {loading ? (
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            {[70, 55, 65].map((w, i) => (<div key={i} style={{ height: 12, width: `${w}%`, background: "var(--bg-4)", borderRadius: "var(--radius-sm)" }} />))}
          </div>
        ) : data?.error ? (
          <div style={{ padding: "12px 16px", fontSize: 11, color: "var(--red)", fontFamily: "var(--font)" }}>{data.error}</div>
        ) : totalChanges === 0 && outgoing.length === 0 ? (
          <div style={{ padding: "12px 16px", fontSize: 11, color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>Working tree clean.</div>
        ) : (
          <>
            {stagedFiles.length > 0 && (
              <div>
                <SectionHeader label="STAGED CHANGES" count={stagedFiles.length} expanded={stagedExpanded} onToggle={() => setStagedExpanded((v) => !v)}
                  actions={<HeaderIconBtn title="Unstage all" onClick={() => void unstageAll()}><span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1 }}>{"\u2212"}</span></HeaderIconBtn>} />
                {stagedExpanded && stagedFiles.map((f) => (
                  <ChangedFileRow key={`staged-${f.file}`} f={f} isStaged isSelected={selectedPath === f.file} busy={fileLoading === f.file}
                    onClick={() => handleFileClick(f.file)} onStage={(e) => void stageFile(e, f.file)} onUnstage={(e) => void unstageFile(e, f.file)} />
                ))}
              </div>
            )}
            {unstagedFiles.length > 0 && (
              <div>
                <SectionHeader label="CHANGES" count={unstagedFiles.length} expanded={unstagedExpanded} onToggle={() => setUnstagedExpanded((v) => !v)}
                  actions={<><HeaderIconBtn title="Discard all" onClick={() => void discardAll()}><UndoIcon /></HeaderIconBtn><HeaderIconBtn title="Stage all" onClick={() => void stageAll()}><PlusIcon /></HeaderIconBtn></>} />
                {unstagedExpanded && unstagedFiles.map((f) => (
                  <ChangedFileRow key={`unstaged-${f.file}`} f={f} isStaged={false} isSelected={selectedPath === f.file} busy={fileLoading === f.file}
                    onClick={() => handleFileClick(f.file)} onStage={(e) => void stageFile(e, f.file)} onUnstage={(e) => void unstageFile(e, f.file)} onDiscard={(e) => void discardFile(e, f.file)} />
                ))}
              </div>
            )}
            {untrackedFiles.length > 0 && (
              <div>
                <SectionHeader label="UNTRACKED" count={untrackedFiles.length} expanded={untrackedExpanded} onToggle={() => setUntrackedExpanded((v) => !v)}
                  actions={<HeaderIconBtn title="Stage all untracked" onClick={() => { fetchApi("/api/files/stage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: untrackedFiles.map((f) => f.file) }) }).then(() => load()).catch(() => {}); }}><PlusIcon /></HeaderIconBtn>} />
                {untrackedExpanded && untrackedFiles.map((f) => (
                  <ChangedFileRow key={`untracked-${f.file}`} f={f} isStaged={false} isSelected={selectedPath === f.file} busy={fileLoading === f.file}
                    onClick={() => handleFileClick(f.file)} onStage={(e) => void stageFile(e, f.file)} onUnstage={(e) => void unstageFile(e, f.file)} />
                ))}
              </div>
            )}
            {outgoing.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <SectionHeader label="OUTGOING" count={outgoing.length} expanded={outgoingExpanded} onToggle={() => setOutgoingExpanded((v) => !v)} />
                {outgoingExpanded && outgoing.map((c) => (<OutgoingCommitRow key={c.hash} commit={c} />))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Commit form + actions */}
      <div style={{ padding: "8px 10px", borderTop: "1px solid var(--border-dim)", display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        {statusMsg && <div style={{ fontSize: 10, fontFamily: "var(--font)", color: isErr ? "var(--red)" : "var(--accent)", padding: "2px 0" }}>{statusMsg}</div>}
        <textarea placeholder="Commit message..." value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void commit(); }}
          rows={3} style={{ width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 40, fontFamily: "var(--font)", fontSize: 11, background: "var(--bg-3)", border: "1px solid var(--border-dim)", color: "var(--text)", padding: "6px 8px", borderRadius: "var(--radius)", outline: "none" }} />
        <button className="btn btn-primary" onClick={() => void commit()} disabled={committing || !commitMsg.trim() || stagedFiles.length === 0}
          style={{ width: "100%", fontSize: 11, justifyContent: "center" }} title={stagedFiles.length === 0 ? "Stage changes before committing" : undefined}>
          {committing ? "Committing..." : stagedFiles.length === 0 ? "Commit (nothing staged)" : "Commit"}
        </button>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn" onClick={() => void push()} disabled={pushing} style={{ flex: 1, fontSize: 11, justifyContent: "center" }} title="Push to remote">
            {pushing ? "Pushing..." : `\u2191 Push${data?.ahead ? ` (${data.ahead})` : ""}`}
          </button>
          <button className="btn" onClick={() => void pull()} disabled={pulling} style={{ flex: 1, fontSize: 11, justifyContent: "center" }} title="Pull from remote">
            {pulling ? "Pulling..." : `\u2193 Pull${data?.behind ? ` (${data.behind})` : ""}`}
          </button>
        </div>
        {ghAvailable && (
          <button className="btn" onClick={() => setPrDialogOpen(true)} style={{ width: "100%", fontSize: 11, justifyContent: "center", gap: 6, display: "flex", alignItems: "center" }} title="Create a pull request on GitHub">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
              <path fillRule="evenodd" d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z" />
            </svg>
            Create PR
          </button>
        )}
      </div>
    </div>
  );
}
