import { useState, useEffect, useMemo, useCallback } from "react";
import { FileCode, FileText, Folder, ChevronRight, ChevronDown, Copy, FolderOpen, ExternalLink } from "lucide-react";
import ContextMenu, { type ContextMenuItem } from "../shared/ContextMenu.tsx";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileNode[];
  ext?: string;
}

const CODE_EXTS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "py", "go", "rs", "rb", "java",
  "c", "cpp", "h", "cs", "swift", "kt", "sh", "bash", "sql",
]);

function fileIcon(ext?: string) {
  if (ext && CODE_EXTS.has(ext)) return FileCode;
  return FileText;
}

function countFiles(nodes: FileNode[]): number {
  let count = 0;
  for (const n of nodes) {
    if (n.type === "file") count++;
    if (n.children) count += countFiles(n.children);
  }
  return count;
}

interface TreeRowProps {
  node: FileNode;
  depth: number;
  onFileSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
}

function TreeRow({ node, depth, onFileSelect, onContextMenu }: TreeRowProps) {
  const [open, setOpen] = useState(depth < 1);
  const isDir = node.type === "dir";
  const Icon = isDir ? Folder : fileIcon(node.ext);
  const Chevron = open ? ChevronDown : ChevronRight;

  const handleClick = () => {
    if (isDir) {
      setOpen((v) => !v);
    } else {
      onFileSelect(node.path);
    }
  };

  const sorted = useMemo(() => {
    if (!node.children) return [];
    return [...node.children].sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [node.children]);

  return (
    <>
      <div
        onClick={handleClick}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, node); }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          height: 22,
          paddingLeft: 8 + depth * 12,
          cursor: "pointer",
          userSelect: "none",
          fontSize: 12,
          fontFamily: "var(--font)",
          color: "var(--text-dim)",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = "var(--bg-3)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = "transparent";
        }}
      >
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
          }}
        >
          {node.name}
        </span>
      </div>
      {isDir &&
        open &&
        sorted.map((child) => (
          <TreeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            onFileSelect={onFileSelect}
            onContextMenu={onContextMenu}
          />
        ))}
    </>
  );
}

export default function FileTreeSidebar() {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null);

  useEffect(() => {
    fetch("/api/files/tree")
      .then((r) => r.json())
      .then((d: { tree?: FileNode[] }) => setTree(d.tree ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fileCount = useMemo(() => countFiles(tree), [tree]);

  const handleFileSelect = useCallback((path: string) => {
    window.dispatchEvent(
      new CustomEvent("studio:open-file", { detail: { path } })
    );
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const ctxMenuItems = useMemo((): ContextMenuItem[] => {
    if (!ctxMenu) return [];
    const { node } = ctxMenu;
    const isFile = node.type === "file";
    const items: ContextMenuItem[] = [];

    if (isFile) {
      items.push({
        label: "Open File",
        icon: <FolderOpen size={12} />,
        onClick: () => handleFileSelect(node.path),
      });
      items.push({ label: "", separator: true, onClick: () => {} });
    }

    items.push({
      label: "Copy Path",
      icon: <Copy size={12} />,
      onClick: () => { navigator.clipboard.writeText(node.path).catch(() => {}); },
    });
    items.push({
      label: "Copy Relative Path",
      icon: <Copy size={12} />,
      onClick: () => {
        // path from server is relative to project root already
        navigator.clipboard.writeText(node.path).catch(() => {});
      },
    });

    if (typeof window.studio?.showInFinder === "function") {
      items.push({ label: "", separator: true, onClick: () => {} });
      items.push({
        label: "Reveal in Finder",
        icon: <ExternalLink size={12} />,
        onClick: () => { void window.studio!.showInFinder(node.path); },
      });
    }

    return items;
  }, [ctxMenu, handleFileSelect]);

  const sorted = useMemo(
    () =>
      [...tree].sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [tree]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          fontSize: 10,
          fontFamily: "var(--font)",
          letterSpacing: "0.06em",
          color: "var(--text-dim)",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        <span>FILES</span>
        <span
          style={{
            fontSize: 10,
            color: "var(--text-dimmer)",
            background: "var(--bg-3)",
            borderRadius: 10,
            padding: "1px 6px",
          }}
        >
          {fileCount}
        </span>
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {loading ? (
          <div
            style={{
              padding: "12px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {[80, 60, 70, 50, 65].map((w, i) => (
              <div
                key={i}
                style={{
                  height: 12,
                  width: `${w}%`,
                  background: "var(--bg-4)",
                  borderRadius: "var(--radius-sm)",
                }}
              />
            ))}
          </div>
        ) : tree.length === 0 ? (
          <div
            style={{
              padding: "12px 16px",
              fontSize: 11,
              color: "var(--text-dimmer)",
              fontFamily: "var(--font)",
            }}
          >
            No files found.
          </div>
        ) : (
          sorted.map((node) => (
            <TreeRow
              key={node.path}
              node={node}
              depth={0}
              onFileSelect={handleFileSelect}
              onContextMenu={handleContextMenu}
            />
          ))
        )}
      </div>

      {/* Context menu */}
      <ContextMenu
        items={ctxMenuItems}
        position={ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : null}
        onClose={closeCtxMenu}
      />
    </div>
  );
}
