import { useState, useEffect, useRef } from "react";

export interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  group: string;
  icon?: string;
  action: () => void;
}

interface Props {
  items: PaletteItem[];
  onClose: () => void;
}

export function CommandPalette({ items, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = query.trim()
    ? items.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.sublabel?.toLowerCase().includes(query.toLowerCase()) ||
        item.group.toLowerCase().includes(query.toLowerCase())
      )
    : items;

  // Reset index when results change
  useEffect(() => { setIdx(0); }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${idx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const select = (item: PaletteItem) => {
    onClose();
    item.action();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { if (filtered[idx]) select(filtered[idx]); }
    else if (e.key === "Escape") onClose();
  };

  // Group items
  const groups = filtered.reduce<Record<string, PaletteItem[]>>((acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  }, {});

  let globalIdx = 0;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "var(--overlay-bg)", display: "flex",
        alignItems: "flex-start", justifyContent: "center",
        paddingTop: "14vh",
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          width: 520, background: "var(--bg-panel)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--border)", gap: 8 }}>
          <span style={{ fontSize: 14, color: "var(--text-muted)", flexShrink: 0 }}>⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command or search..."
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              fontSize: 14, color: "var(--text)", fontFamily: "var(--font-mono)",
            }}
          />
          {query && (
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 12 }}>
              esc
            </button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: 380, overflowY: "auto" }}>
          {Object.keys(groups).length === 0 && (
            <div style={{ padding: "24px 14px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
              No results
            </div>
          )}
          {Object.entries(groups).map(([group, groupItems]) => (
            <div key={group}>
              <div style={{
                padding: "8px 14px 4px", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
                textTransform: "uppercase", color: "var(--text-muted)",
              }}>
                {group}
              </div>
              {groupItems.map(item => {
                const itemIdx = globalIdx++;
                const isActive = itemIdx === idx;
                return (
                  <div
                    key={item.id}
                    data-idx={itemIdx}
                    onClick={() => select(item)}
                    onMouseEnter={() => setIdx(itemIdx)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 14px", cursor: "pointer",
                      background: isActive ? "var(--bg-active)" : "transparent",
                      borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                    }}
                  >
                    {item.icon && (
                      <span style={{ fontSize: 13, width: 18, flexShrink: 0, textAlign: "center", color: "var(--text-muted)" }}>
                        {item.icon}
                      </span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: isActive ? "var(--text)" : "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.label}
                      </div>
                      {item.sublabel && (
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.sublabel}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "6px 14px", borderTop: "1px solid var(--border)", display: "flex", gap: 12, alignItems: "center" }}>
          <Hint keys={["↑", "↓"]} label="navigate" />
          <Hint keys={["↵"]} label="select" />
          <Hint keys={["esc"]} label="close" />
        </div>
      </div>
    </div>
  );
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {keys.map(k => (
        <kbd key={k} style={{
          fontSize: 10, padding: "1px 5px", background: "var(--bg-elevated)",
          border: "1px solid var(--border)", borderRadius: 3, color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
        }}>{k}</kbd>
      ))}
      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}
