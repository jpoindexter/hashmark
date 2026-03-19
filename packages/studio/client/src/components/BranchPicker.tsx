import { useState } from "react";
import { GitBranch, ChevronDown } from "lucide-react";

export default function BranchPicker({ currentBranch }: { currentBranch: string }) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  const loadBranches = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/files/git/branches");
      const d = await r.json() as { branches?: string[] };
      setBranches(d.branches ?? []);
    } finally {
      setLoading(false);
    }
  };

  const switchBranch = async (branch: string) => {
    if (branch === currentBranch) { setOpen(false); return; }
    setSwitching(true);
    try {
      await fetch("/api/files/git/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch }),
      });
      setOpen(false);
      window.location.reload();
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => { setOpen(v => !v); if (!open) loadBranches(); }}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          background: "none", border: "none", cursor: "pointer",
          color: "var(--text-dim)", fontSize: 12,
          fontFamily: "var(--font-ui)", padding: "2px 4px",
          borderRadius: 4,
        }}
      >
        <GitBranch size={12} />
        <span>{currentBranch || "no branch"}</span>
        <ChevronDown size={10} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
          <div style={{
            position: "absolute", top: "100%", left: 0, zIndex: 100,
            background: "var(--bg-2)", border: "1px solid var(--border-dim)",
            borderRadius: 6, minWidth: 200, maxHeight: 280,
            overflow: "auto", marginTop: 4,
          }}>
            {loading && (
              <div style={{ padding: "8px 12px", color: "var(--text-dimmer)", fontSize: 11 }}>Loading...</div>
            )}
            {branches.map(branch => (
              <button
                key={branch}
                onClick={() => void switchBranch(branch)}
                disabled={switching}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "7px 12px", background: "none", border: "none",
                  color: branch === currentBranch ? "var(--accent)" : "var(--text-dim)",
                  fontSize: 12, fontFamily: "var(--font)", cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <GitBranch size={11} style={{ opacity: 0.5, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{branch}</span>
                {branch === currentBranch && <span style={{ fontSize: 10, opacity: 0.5 }}>current</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
