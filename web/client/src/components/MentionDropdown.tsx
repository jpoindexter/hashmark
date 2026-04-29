import type React from "react";

export interface MentionEntry {
  name: string;
  path: string;
  relative: string;
  isArtifact?: boolean;
}

export function MentionDropdown({
  atQuery,
  atResults,
  atIdx,
  atDropdownPos,
  onSelect,
  onClose,
  onHover,
}: {
  atQuery: string;
  atResults: MentionEntry[];
  atIdx: number;
  atDropdownPos: { left: number; bottom: number } | null;
  onSelect: (entry: MentionEntry) => void;
  onClose: () => void;
  onHover?: (idx: number) => void;
}) {
  const pos = {
    left: atDropdownPos?.left ?? 24,
    bottom: atDropdownPos?.bottom ?? 80,
  };

  const shared: React.CSSProperties = {
    position: "absolute", zIndex: 50,
    left: pos.left, bottom: pos.bottom,
    width: 260,
    background: "var(--bg-panel)", border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)", overflow: "hidden",
    boxShadow: "0 -4px 16px rgba(0,0,0,0.3)",
  };

  if (atResults.length === 0) {
    return (
      <div style={shared}>
        <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
          No files match "{atQuery}"
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...shared, maxHeight: 200, overflowY: "auto" }}>
      {atResults.map((f, i) => (
        <div
          key={f.path}
          onMouseDown={e => { e.preventDefault(); onSelect(f); }}
          style={{
            padding: "6px 12px", fontSize: 12, cursor: "pointer",
            display: "flex", gap: 8, alignItems: "center",
            background: i === atIdx ? "var(--bg-active)" : "transparent",
            color: i === atIdx ? "var(--text)" : "var(--text-dim)",
          }}
          onMouseEnter={() => onHover?.(i)}
        >
          <span style={{ fontSize: 10, color: "var(--text-muted)", width: 28, flexShrink: 0, textAlign: "right" }}>
            {f.isArtifact ? "art" : `.${f.name.split(".").pop() ?? ""}`}
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {f.isArtifact ? f.name : f.relative}
          </span>
        </div>
      ))}
    </div>
  );
}
