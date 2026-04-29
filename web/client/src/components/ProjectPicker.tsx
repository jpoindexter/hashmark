import { useState } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";

export function ProjectPicker({ current, onSwitch, onClose }: {
  current: string;
  onSwitch: (dir: string) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState(current);
  const [switching, setSwitching] = useState(false);
  const [browsing, setBrowsing] = useState(false);

  const browse = async () => {
    setBrowsing(true);
    try {
      const data = await fetchApi<{ dir: string }>("/api/pick-folder");
      setPath(data.dir);
    } catch {
      // user cancelled
    } finally {
      setBrowsing(false);
    }
  };

  const doSwitch = async () => {
    if (!path.trim()) return;
    setSwitching(true);
    try {
      await fetchApi("/api/switch", { method: "POST", body: JSON.stringify({ projectDir: path.trim() }) });
      onSwitch(path.trim());
      toast.success(`Switched to ${path.trim().split("/").pop()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to switch");
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "var(--overlay-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", width: 480, display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: "14px 16px", display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => void browse()}
            disabled={browsing}
            style={{ padding: "6px 12px", background: "var(--bg-elevated)", color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, cursor: browsing ? "wait" : "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
          >
            {browsing ? "..." : "Browse..."}
          </button>
          <input
            value={path}
            onChange={e => setPath(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void doSwitch(); if (e.key === "Escape") onClose(); }}
            placeholder="/path/to/project"
            autoFocus
            style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border-focus)", borderRadius: "var(--radius-sm)", padding: "6px 10px", fontSize: 12, color: "var(--text)", outline: "none", fontFamily: "var(--font-mono)" }}
          />
          <button
            className="btn btn-primary btn-md"
            onClick={() => void doSwitch()}
            disabled={switching || !path.trim()}
            style={{ opacity: switching ? 0.7 : 1 }}
          >
            {switching ? "Opening..." : "Open"}
          </button>
        </div>
      </div>
    </div>
  );
}
