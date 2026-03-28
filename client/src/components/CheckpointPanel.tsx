import { useState, useEffect, useCallback } from "react";
import { Clock, Plus, RotateCcw, X, GitBranch, Trash2, Eye, EyeOff } from "lucide-react";
import { DiffPanel } from "./DiffPanel";
import ConfirmDialog from "./shared/ConfirmDialog.tsx";
import { fetchApi } from "../lib/api";

interface Checkpoint {
  id: string;
  ref: string;
  hash: string;
  hashFull: string;
  timestamp: string;
  label: string;
  message: string;
  filesChanged: number;
  status: "active" | "merged" | "abandoned";
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontFamily: "var(--font)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--text-dimmer)",
  padding: "12px 12px 4px",
};

const iconBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--text-dimmer)",
  padding: "2px 4px",
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  transition: "color 0.1s",
};

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  } catch {
    return ts;
  }
}

const STATUS_DOT: Record<Checkpoint["status"], { color: string; title: string }> = {
  active:    { color: "var(--yellow)",  title: "active" },
  merged:    { color: "var(--accent)",  title: "merged" },
  abandoned: { color: "var(--text-dimmer)", title: "abandoned" },
};

export default function CheckpointPanel({ onClose }: { onClose: () => void }) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [diffFor, setDiffFor] = useState<{ id: string; label: string; diff: string } | null>(null);
  const [loadingDiffId, setLoadingDiffId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Checkpoint | null>(null);
  const [pruneConfirmOpen, setPruneConfirmOpen] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(() => {
    fetchApi("/api/checkpoints")
      .then((r) => r.json())
      .then((d: { checkpoints: Checkpoint[] }) => setCheckpoints(d.checkpoints ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const r = await fetchApi("/api/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      const data = await r.json() as { ok?: boolean; label?: string };
      if (data.ok) {
        showToast(`Checkpoint "${data.label}" saved`);
        setLabel("");
        load();
      }
    } catch {}
    setSaving(false);
  };

  const handleRestore = async (cp: Checkpoint) => {
    setRestoreTarget(cp);
  };

  const doRestore = async (cp: Checkpoint) => {
    setRestoringId(cp.id);
    try {
      const r = await fetchApi(`/api/checkpoints/${encodeURIComponent(cp.id)}/restore`, {
        method: "POST",
      });
      const data = await r.json() as { ok?: boolean; branch?: string; error?: string };
      if (data.ok && data.branch) {
        showToast(`Branch created: ${data.branch}`);
      } else {
        showToast(data.error ?? "Restore failed");
      }
    } catch {
      showToast("Restore failed");
    }
    setRestoringId(null);
  };

  const handleViewDiff = async (cp: Checkpoint) => {
    if (diffFor?.id === cp.id) {
      setDiffFor(null);
      return;
    }
    setLoadingDiffId(cp.id);
    try {
      const r = await fetchApi(`/api/checkpoints/${encodeURIComponent(cp.id)}/diff`);
      const data = await r.json() as { diff?: string };
      setDiffFor({ id: cp.id, label: cp.label, diff: data.diff ?? "" });
    } catch {
      setDiffFor({ id: cp.id, label: cp.label, diff: "" });
    }
    setLoadingDiffId(null);
  };

  const handleDelete = async (cp: Checkpoint) => {
    try {
      await fetchApi(`/api/checkpoints/${encodeURIComponent(cp.id)}`, { method: "DELETE" });
      if (diffFor?.id === cp.id) setDiffFor(null);
      load();
    } catch {}
  };

  const handlePrune = () => {
    setPruneConfirmOpen(true);
  };

  const doPrune = async () => {
    setPruning(true);
    try {
      const r = await fetchApi("/api/checkpoints/prune", { method: "DELETE" });
      const data = await r.json() as { pruned?: number };
      showToast(`Pruned ${data.pruned ?? 0} checkpoint(s)`);
      load();
    } catch {
      showToast("Prune failed");
    }
    setPruning(false);
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left pane: checkpoint list */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        width: diffFor ? 280 : "100%",
        minWidth: 220,
        height: "100%",
        overflow: "hidden",
        borderRight: diffFor ? "1px solid var(--border-dim)" : "none",
        transition: "width 0.15s ease",
        flexShrink: 0,
      }}>
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px 8px",
          borderBottom: "1px solid var(--border-dim)",
          flexShrink: 0,
        }}>
          <span style={{ ...sectionLabel, padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={12} />
            CHECKPOINTS
          </span>
          <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
            <button
              onClick={handlePrune}
              disabled={pruning}
              title="Prune old checkpoints"
              style={{
                ...iconBtn,
                opacity: pruning ? 0.4 : 1,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--red)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)"; }}
            >
              <Trash2 size={12} />
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                cursor: saving ? "wait" : "pointer",
                color: "var(--accent)",
                fontSize: 11,
                fontFamily: "var(--font)",
                padding: "2px 8px",
                display: "flex",
                alignItems: "center",
                gap: 4,
                opacity: saving ? 0.5 : 1,
                transition: "opacity 0.1s",
              }}
            >
              <Plus size={11} />
              Save
            </button>
            <button
              onClick={onClose}
              style={{ ...iconBtn, fontSize: 14, padding: "0 4px", lineHeight: 1 }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Label input */}
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-dim)", flexShrink: 0 }}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            placeholder="checkpoint label..."
            style={{
              width: "100%",
              background: "var(--bg)",
              border: "1px solid var(--border-dim)",
              borderRadius: "var(--radius)",
              color: "var(--text)",
              fontSize: 11,
              fontFamily: "var(--font)",
              padding: "5px 8px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Checkpoint list */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {checkpoints.length === 0 && (
            <div style={{
              padding: "20px 12px",
              fontSize: 11,
              color: "var(--text-dimmer)",
              fontFamily: "var(--font)",
              textAlign: "center",
            }}>
              No checkpoints yet.
            </div>
          )}
          {checkpoints.map((cp) => {
            const dot = STATUS_DOT[cp.status];
            const isActive = diffFor?.id === cp.id;
            const isRestoring = restoringId === cp.id;
            const isLoadingDiff = loadingDiffId === cp.id;

            return (
              <div
                key={cp.ref}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: "7px 12px",
                  borderBottom: "1px solid var(--border-dim)",
                  fontSize: 11,
                  fontFamily: "var(--font)",
                  background: isActive ? "var(--bg-2)" : "transparent",
                  transition: "background 0.1s",
                  opacity: cp.status === "abandoned" ? 0.55 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-2)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                }}
              >
                {/* Row 1: dot + hash + label + actions */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    title={dot.title}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: dot.color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: "var(--text-dimmer)", flexShrink: 0, fontFamily: "var(--font)", fontSize: 10 }}>
                    {cp.hash}
                  </span>
                  <span style={{
                    color: "var(--text)",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {cp.label}
                  </span>

                  {/* View diff */}
                  <button
                    onClick={() => handleViewDiff(cp)}
                    title={isActive ? "Hide diff" : "View diff"}
                    style={{ ...iconBtn, opacity: isLoadingDiff ? 0.5 : 1 }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--blue)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)"; }}
                  >
                    {isActive ? <EyeOff size={11} /> : <Eye size={11} />}
                  </button>

                  {/* Restore */}
                  <button
                    onClick={() => handleRestore(cp)}
                    disabled={isRestoring}
                    title="Restore (creates branch)"
                    style={{ ...iconBtn, opacity: isRestoring ? 0.4 : 1 }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)"; }}
                  >
                    {isRestoring ? <RotateCcw size={11} style={{ animation: "spin 0.8s linear infinite" }} /> : <RotateCcw size={11} />}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(cp)}
                    title="Delete checkpoint"
                    style={iconBtn}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--red)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)"; }}
                  >
                    <X size={11} />
                  </button>
                </div>

                {/* Row 2: timestamp + file count + status badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, paddingLeft: 12 }}>
                  <span style={{ color: "var(--text-dimmer)", fontSize: 10 }}>
                    {formatTime(cp.timestamp)}
                  </span>
                  {cp.filesChanged > 0 && (
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "0 5px",
                      borderRadius: 100,
                      fontSize: 10,
                      background: "var(--bg-4)",
                      color: "var(--text-dim)",
                      border: "1px solid var(--border-dim)",
                    }}>
                      <GitBranch size={9} />
                      {cp.filesChanged} file{cp.filesChanged !== 1 ? "s" : ""}
                    </span>
                  )}
                  <span style={{
                    fontSize: 10,
                    color: cp.status === "merged" ? "var(--accent)"
                      : cp.status === "abandoned" ? "var(--text-dimmer)"
                      : "var(--yellow)",
                  }}>
                    {cp.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right pane: inline diff */}
      {diffFor && (
        <DiffPanel
          diff={diffFor.diff}
          filename={`checkpoint: ${diffFor.label}`}
          onClose={() => setDiffFor(null)}
        />
      )}

      {/* Restore confirm */}
      <ConfirmDialog
        open={restoreTarget !== null}
        title={`Restore checkpoint?`}
        message={restoreTarget ? `Create a new branch from "${restoreTarget.label}"? Your working tree must not have uncommitted changes.` : undefined}
        confirmLabel="Restore"
        onConfirm={() => {
          const cp = restoreTarget;
          setRestoreTarget(null);
          if (cp) void doRestore(cp);
        }}
        onCancel={() => setRestoreTarget(null)}
      />

      {/* Prune confirm */}
      <ConfirmDialog
        open={pruneConfirmOpen}
        title="Prune old checkpoints?"
        message="Remove merged and abandoned checkpoints older than 7 days. This cannot be undone."
        confirmLabel="Prune"
        danger
        onConfirm={() => { setPruneConfirmOpen(false); void doPrune(); }}
        onCancel={() => setPruneConfirmOpen(false)}
      />

      {/* Toast */}
      {toast && (
        <div style={{
          position: "absolute",
          bottom: 12,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--bg-4)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "6px 14px",
          fontSize: 11,
          fontFamily: "var(--font-ui)",
          color: "var(--text)",
          whiteSpace: "nowrap",
          zIndex: 100,
          animation: "fadeIn 0.15s ease forwards",
          pointerEvents: "none",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
