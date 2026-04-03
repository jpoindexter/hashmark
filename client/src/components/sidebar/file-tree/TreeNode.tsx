import { useState, useMemo } from "react";
import { Folder, ChevronRight, ChevronDown } from "lucide-react";
import { type FileNode, fileIcon, gitStatusColor } from "./types";

export interface TreeRowProps {
  node: FileNode;
  depth: number;
  selectedPaths: Set<string>;
  gitFiles: Record<string, string>;
  onSelect: (path: string, e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
}

export function TreeRow({ node, depth, selectedPaths, gitFiles, onSelect, onContextMenu }: TreeRowProps) {
  const [open, setOpen] = useState(depth < 1);
  const isDir = node.type === "dir";
  const isSelected = selectedPaths.has(node.path);
  const Icon = isDir ? Folder : fileIcon(node.ext);
  const Chevron = open ? ChevronDown : ChevronRight;
  const status = gitFiles[node.path];

  const handleClick = (e: React.MouseEvent) => {
    // Dirs toggle open/close on regular click, but support multi-select modifiers
    if (isDir && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      setOpen((v) => !v);
    } else {
      onSelect(node.path, e);
    }
  };

  const sorted = useMemo(() => {
    if (!node.children) return [];
    return [...node.children].sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [node.children]);

  const nameColor = status
    ? gitStatusColor(status)
    : "var(--text-dim)";

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={node.name}
        onClick={handleClick}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); } }}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, node); }}
        className={isSelected ? undefined : "hoverable"}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 4,
          height: 22,
          paddingLeft: 8 + depth * 16,
          paddingRight: 8,
          cursor: "pointer",
          userSelect: "none",
          fontSize: 12,
          fontFamily: "var(--font)",
          color: "var(--text-dim)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          background: isSelected ? "var(--active-bg)" : "transparent",
          borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
        }}
      >
        {/* Indent guide lines */}
        {Array.from({ length: depth }).map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            left: 20 + i * 16,
            top: 0,
            bottom: 0,
            width: 1,
            background: "var(--border-dim)",
            pointerEvents: "none",
          }} />
        ))}

        {isDir && (
          <Chevron
            size={12}
            style={{ flexShrink: 0, color: "var(--text-dimmer)" }}
          />
        )}
        {!isDir && <span style={{ width: 12, flexShrink: 0 }} />}
        <Icon
          size={14}
          style={{
            flexShrink: 0,
            color: isDir ? "var(--text-dim)" : "var(--text-dimmer)",
          }}
        />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: nameColor,
            textDecoration: status === "D" ? "line-through" : undefined,
          }}
        >
          {node.name}
        </span>

        {/* Git status badge */}
        {status && (
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            marginLeft: "auto",
            flexShrink: 0,
            color: gitStatusColor(status),
          }}>
            {status}
          </span>
        )}
      </div>
      {isDir &&
        open &&
        sorted.map((child) => (
          <TreeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPaths={selectedPaths}
            gitFiles={gitFiles}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
          />
        ))}
    </>
  );
}
