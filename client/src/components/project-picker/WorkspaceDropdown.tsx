import { useState, useEffect, useRef, useCallback } from "react";
import { fetchApi } from "../../lib/api";
import { FolderIcon, ChevronDownIcon } from "./ActionCard";
import type { Workspace } from "./types";
import { truncatePath } from "./types";
import DropdownWorkspaceRow from "./DropdownWorkspaceRow";

export default function WorkspaceDropdown({ currentName, currentPath }: { currentName: string | null; currentPath?: string | null }) {
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [addingPath, setAddingPath] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [focusIdx, setFocusIdx] = useState(-1);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const loadWorkspaces = useCallback(() => {
    fetchApi("/api/workspaces")
      .then((r) => r.json())
      .then((d: { workspaces: Workspace[] }) => setWorkspaces(d.workspaces ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) { loadWorkspaces(); setFocusIdx(-1); }
  }, [open, loadWorkspaces]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setAddingPath(false);
        setPathInput("");
        setError(null);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (addingPath) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setAddingPath(false);
      setError(null);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(focusIdx + 1, workspaces.length - 1);
      setFocusIdx(next);
      itemRefs.current[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(focusIdx - 1, 0);
      setFocusIdx(prev);
      itemRefs.current[prev]?.focus();
    }
  };

  const switchWorkspace = async (id: string) => {
    setSwitching(id);
    setError(null);
    try {
      const res = await fetchApi(`/api/workspaces/${id}/activate`, { method: "POST" });
      const d = await res.json() as { ok?: boolean; path?: string; error?: string };
      if (!res.ok) {
        setError(d.error ?? "Failed to switch");
        setSwitching(null);
        return;
      }
      if (typeof window.studio?.setProjectDir === "function" && d.path) {
        await window.studio.setProjectDir(d.path);
        return;
      }
      window.location.reload();
    } catch {
      setError("Network error");
      setSwitching(null);
    }
  };

  const addWorkspace = async () => {
    const p = pathInput.trim();
    if (!p) return;
    setError(null);
    try {
      const res = await fetchApi("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p }),
      });
      const data = await res.json() as { workspace?: Workspace; error?: string };
      if (!res.ok) { setError(data.error ?? "Invalid path"); return; }
      await switchWorkspace(data.workspace!.id);
    } catch {
      setError("Network error");
    }
  };

  const removeWorkspace = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await fetchApi(`/api/workspaces/${id}`, { method: "DELETE" });
    setWorkspaces((ws) => ws.filter((w) => w.id !== id));
  };

  return (
    <div ref={ref} style={{ position: "relative" }} onKeyDown={handleKeyDown}>
      <button
        onClick={() => { setOpen((v) => !v); setAddingPath(false); setError(null); }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "8px 12px",
          background: open ? "var(--accent-bg)" : "transparent",
          border: "none",
          borderBottom: "1px solid var(--border-dim)",
          cursor: "pointer",
          textAlign: "left",
          transition: "background 0.1s",
        }}
        className={open ? "" : "hoverable"}
      >
        <div style={{ color: "var(--accent)", flexShrink: 0 }}>
          <FolderIcon size={12} color="var(--accent)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: "var(--text)",
            fontFamily: "var(--font)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {currentName ?? "…"}
          </div>
          {currentPath && (
            <div style={{
              fontSize: 10, color: "var(--text-dimmer)",
              fontFamily: "var(--font)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {truncatePath(currentPath)}
            </div>
          )}
        </div>
        <ChevronDownIcon open={open} />
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          zIndex: 200,
          background: "var(--bg-2)",
          borderBottom: "1px solid var(--border)",
          boxShadow: "var(--shadow-md)",
          animation: "fadeIn 0.1s ease forwards",
        }}>
          {workspaces.length > 0 && (
            <div>
              <div style={{
                fontSize: 9, color: "var(--text-dimmer)", letterSpacing: "0.1em",
                padding: "6px 12px 3px", textTransform: "uppercase",
              }}>
                Workspaces
              </div>
              {workspaces.map((ws, i) => {
                const isActive = ws.is_active === 1;
                return (
                  <DropdownWorkspaceRow
                    key={ws.id}
                    ws={ws}
                    isActive={isActive}
                    switching={switching === ws.id}
                    focused={focusIdx === i}
                    itemRef={(el) => { itemRefs.current[i] = el; }}
                    onSwitch={() => { if (!isActive) void switchWorkspace(ws.id); }}
                    onRemove={(e) => void removeWorkspace(e, ws.id)}
                  />
                );
              })}
            </div>
          )}

          {error && (
            <div style={{ padding: "5px 12px", fontSize: 11, color: "var(--red)", fontFamily: "var(--font)" }}>
              {error}
            </div>
          )}

          {addingPath ? (
            <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border-dim)" }}>
              <input
                ref={inputRef}
                autoFocus
                type="text"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addWorkspace();
                  if (e.key === "Escape") { setAddingPath(false); setPathInput(""); setError(null); }
                }}
                placeholder="/path/to/project"
                style={{
                  width: "100%",
                  background: "var(--bg-3)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  fontFamily: "var(--font)",
                  fontSize: 11,
                  padding: "6px 8px",
                  outline: "none",
                  borderRadius: "var(--radius)",
                  boxSizing: "border-box",
                  marginBottom: 6,
                }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, justifyContent: "center", fontSize: 11 }}
                  onClick={() => void addWorkspace()}
                >
                  Open
                </button>
                <button
                  className="btn"
                  style={{ flex: 1, justifyContent: "center", fontSize: 11 }}
                  onClick={() => { setAddingPath(false); setPathInput(""); setError(null); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setAddingPath(true); setTimeout(() => inputRef.current?.focus(), 20); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                width: "100%",
                padding: "8px 12px",
                background: "transparent",
                border: "none",
                borderTop: workspaces.length > 0 ? "1px solid var(--border-dim)" : "none",
                fontSize: 11,
                color: "var(--accent)",
                fontFamily: "var(--font)",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.1s",
              }}
              className="hoverable"
            >
              <span style={{ fontSize: 14, lineHeight: 1, marginTop: -1 }}>+</span>
              Add workspace
            </button>
          )}
        </div>
      )}
    </div>
  );
}

