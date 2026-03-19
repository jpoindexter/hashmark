import { useState, useEffect, useRef, useCallback } from "react";
import { GitBranch, ChevronDown } from "lucide-react";

export default function BranchPicker({ currentBranch }: { currentBranch: string }) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  const filtered = search
    ? branches.filter(b => b.toLowerCase().includes(search.toLowerCase()))
    : branches;

  // Reset highlight when search changes
  useEffect(() => { setHighlightedIndex(0); }, [search]);

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
    } else {
      setSearch("");
      setHighlightedIndex(0);
    }
  }, [open]);

  // Scroll highlighted item into view
  useEffect(() => {
    const el = listRef.current?.querySelector("[data-highlighted='true']") as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const switchBranch = useCallback(async (branch: string) => {
    if (branch === currentBranch) { setOpen(false); return; }
    setSwitching(true);
    try {
      await fetch("/api/files/git/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch }),
      });
      setOpen(false);
      window.dispatchEvent(new CustomEvent("studio:branch-changed"));
    } finally {
      setSwitching(false);
    }
  }, [currentBranch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length > 0) void switchBranch(filtered[highlightedIndex]);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }, [filtered, highlightedIndex, switchBranch]);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => { setOpen(v => !v); if (!open) void loadBranches(); }}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          background: "none", border: "none", cursor: "pointer",
          color: "var(--text-dim)", fontSize: 12,
          fontFamily: "var(--font-ui)", padding: "2px 4px",
          borderRadius: "var(--radius)",
        }}
      >
        <GitBranch size={12} />
        <span>{currentBranch || "no branch"}</span>
        <ChevronDown size={10} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
          <div
            className="dropdown-animate"
            onKeyDown={handleKeyDown}
            style={{
              position: "absolute", top: "100%", left: 0, zIndex: 100,
              background: "var(--bg-2)", border: "1px solid var(--border-dim)",
              borderRadius: "var(--radius-lg)", minWidth: 200, maxHeight: 280,
              overflow: "hidden", marginTop: 4,
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Search input */}
            <div style={{ padding: "6px 8px 4px", flexShrink: 0 }}>
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter branches..."
                style={{
                  width: "100%",
                  height: 26,
                  padding: "4px 8px",
                  background: "var(--bg-3)",
                  border: "1px solid var(--border-dim)",
                  borderRadius: "var(--radius)",
                  fontSize: 12,
                  fontFamily: "var(--font)",
                  color: "var(--text)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Branch list */}
            <div ref={listRef} style={{ overflow: "auto", flex: 1 }}>
              {loading && (
                <div style={{ padding: "8px 12px", color: "var(--text-dimmer)", fontSize: 11 }}>Loading...</div>
              )}
              {!loading && filtered.length === 0 && branches.length > 0 && (
                <div style={{ padding: "8px 12px", color: "var(--text-dimmer)", fontSize: 11 }}>No matches</div>
              )}
              {filtered.map((branch, idx) => (
                <button
                  key={branch}
                  data-highlighted={idx === highlightedIndex}
                  onClick={() => void switchBranch(branch)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  disabled={switching}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "7px 12px",
                    background: idx === highlightedIndex ? "rgba(255,255,255,0.05)" : "none",
                    border: "none",
                    color: branch === currentBranch ? "var(--accent)" : "var(--text-dim)",
                    fontSize: 12, fontFamily: "var(--font)", cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.05s",
                  }}
                >
                  <GitBranch size={11} style={{ opacity: 0.5, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{branch}</span>
                  {branch === currentBranch && <span style={{ fontSize: 10, opacity: 0.5 }}>current</span>}
                </button>
              ))}
            </div>

            {/* Footer */}
            <div style={{
              padding: "4px 12px 6px",
              fontSize: 10,
              color: "var(--text-dimmer)",
              borderTop: "1px solid var(--border-dim)",
              display: "flex",
              gap: 10,
              fontFamily: "var(--font-ui)",
              flexShrink: 0,
            }}>
              <span>↑↓ navigate</span>
              <span>↵ select</span>
              <span>Esc close</span>
              {filtered.length !== branches.length && (
                <span style={{ marginLeft: "auto" }}>{filtered.length}/{branches.length}</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
