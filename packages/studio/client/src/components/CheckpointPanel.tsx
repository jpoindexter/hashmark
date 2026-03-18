import { useState, useEffect } from "react";
import { Clock, Plus, RotateCcw, X } from "lucide-react";

interface Checkpoint {
  ref: string;
  hash: string;
  timestamp: string;
  label: string;
  message: string;
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontFamily: "var(--font)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--text-dimmer)",
  padding: "12px 12px 4px",
};

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

function slugFromRef(ref: string): string {
  const parts = ref.split("/");
  return parts[parts.length - 1];
}

export default function CheckpointPanel({ onClose }: { onClose: () => void }) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetch("/api/checkpoints")
      .then((r) => r.json())
      .then((d: { checkpoints: Checkpoint[] }) => setCheckpoints(d.checkpoints ?? []))
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await fetch("/api/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      setLabel("");
      load();
    } catch {}
    setSaving(false);
  };

  const handleRestore = async (cp: Checkpoint) => {
    if (!window.confirm(`Restore to checkpoint "${cp.label}"? This will overwrite working tree changes.`)) return;
    try {
      await fetch("/api/checkpoints/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: cp.ref }),
      });
    } catch {}
  };

  const handleDelete = async (cp: Checkpoint) => {
    const slug = slugFromRef(cp.ref);
    try {
      await fetch(`/api/checkpoints/${encodeURIComponent(slug)}`, { method: "DELETE" });
      load();
    } catch {}
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden",
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
        <span style={{
          ...sectionLabel,
          padding: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          <Clock size={12} />
          CHECKPOINTS
        </span>
        <div style={{ display: "flex", gap: 2 }}>
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
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-dimmer)",
              fontSize: 14,
              padding: "0 4px",
              lineHeight: 1,
            }}
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
        {checkpoints.map((cp) => (
          <div
            key={cp.ref}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderBottom: "1px solid var(--border-dim)",
              fontSize: 11,
              fontFamily: "var(--font)",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--bg-2)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
          >
            <span style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--accent)",
              flexShrink: 0,
            }} />
            <span style={{ color: "var(--text-dimmer)", flexShrink: 0, width: 56 }}>
              {formatTime(cp.timestamp)}
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
            <button
              onClick={() => handleRestore(cp)}
              title="Restore"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-dimmer)",
                padding: "2px 4px",
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
                transition: "color 0.1s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)"; }}
            >
              <RotateCcw size={12} />
            </button>
            <button
              onClick={() => handleDelete(cp)}
              title="Delete"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-dimmer)",
                padding: "2px 4px",
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
                transition: "color 0.1s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--red)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)"; }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
