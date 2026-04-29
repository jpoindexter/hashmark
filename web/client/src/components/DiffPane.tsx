import { useState } from "react";

export interface FileEdit {
  path: string;
  type: "write" | "edit";
  content?: string;
  oldString?: string;
  newString?: string;
  timestamp: number;
}

interface DiffPaneProps {
  edits: FileEdit[];
  onClose: () => void;
}

export function DiffPane({ edits, onClose }: DiffPaneProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const byFile = edits.reduce<Record<string, FileEdit[]>>((acc, e) => {
    (acc[e.path] ??= []).push(e);
    return acc;
  }, {});

  const toggle = (path: string) => setCollapsed(prev => {
    const next = new Set(prev);
    next.has(path) ? next.delete(path) : next.add(path);
    return next;
  });

  if (edits.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
        No file edits yet in this run.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{
        padding: "8px 12px", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: "var(--text-dim)",
          textTransform: "uppercase", letterSpacing: "0.06em",
        }}>
          Edits ({Object.keys(byFile).length} file{Object.keys(byFile).length !== 1 ? "s" : ""})
        </span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
        >
          ×
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {Object.entries(byFile).map(([path, fileEdits]) => (
          <div key={path} style={{ borderBottom: "1px solid var(--border)" }}>
            <button
              onClick={() => toggle(path)}
              style={{
                width: "100%", textAlign: "left", padding: "6px 12px",
                background: "none", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <span style={{ color: "var(--text-muted)", fontSize: 9 }}>
                {collapsed.has(path) ? "▶" : "▼"}
              </span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {path}
              </span>
              <span style={{
                fontSize: 9, color: "var(--text-muted)", background: "var(--bg-elevated)",
                padding: "1px 5px", borderRadius: 3, flexShrink: 0,
              }}>
                {fileEdits.length} edit{fileEdits.length > 1 ? "s" : ""}
              </span>
            </button>
            {!collapsed.has(path) && (
              <div style={{ padding: "0 12px 8px" }}>
                {fileEdits.map((edit, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    {edit.type === "write" ? (
                      <div style={{
                        fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)",
                        background: "var(--bg)", border: "1px solid var(--border)",
                        borderRadius: 3, padding: "4px 8px", maxHeight: 120, overflowY: "auto",
                        whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>
                        {(edit.content ?? "").slice(0, 500)}
                        {(edit.content ?? "").length > 500 ? "\n…" : ""}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}>
                        <div style={{
                          background: "var(--bg-error)", color: "var(--red)",
                          padding: "2px 8px", borderRadius: "3px 3px 0 0",
                          whiteSpace: "pre-wrap", wordBreak: "break-word",
                          maxHeight: 80, overflowY: "auto",
                        }}>
                          {(edit.oldString ?? "").split("\n").map((l, j) => (
                            <div key={j}>- {l}</div>
                          ))}
                        </div>
                        <div style={{
                          background: "var(--bg-success)", color: "var(--green)",
                          padding: "2px 8px", borderRadius: "0 0 3px 3px",
                          whiteSpace: "pre-wrap", wordBreak: "break-word",
                          maxHeight: 80, overflowY: "auto",
                        }}>
                          {(edit.newString ?? "").split("\n").map((l, j) => (
                            <div key={j}>+ {l}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
