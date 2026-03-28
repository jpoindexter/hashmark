import { useState, useEffect, useMemo, useCallback } from "react";
import {
  FileCode, FileText, Folder, ChevronRight, ChevronDown,
  Copy, FolderOpen, ExternalLink, FilePlus, FolderPlus, Pencil, Trash2,
  GitBranch,
} from "lucide-react";
import ContextMenu, { type ContextMenuItem } from "../shared/ContextMenu.tsx";
import ConfirmDialog from "../shared/ConfirmDialog.tsx";
import { Skeleton } from "../shared/Skeleton.tsx";
import { fetchApi } from "../../lib/api";

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

/** Flatten a sorted tree into a path-ordered list for shift-click range selection */
function flattenTree(nodes: FileNode[]): string[] {
  const result: string[] = [];
  for (const n of nodes) {
    result.push(n.path);
    if (n.children) {
      const sorted = [...n.children].sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      result.push(...flattenTree(sorted));
    }
  }
  return result;
}

type GitStatus = "M" | "A" | "D" | "?" | string;

function gitStatusColor(status: GitStatus): string {
  if (status === "M") return "var(--yellow)";
  if (status === "A" || status === "?") return "var(--accent)";
  if (status === "D") return "var(--red)";
  return "var(--text-dimmer)";
}

interface TreeRowProps {
  node: FileNode;
  depth: number;
  selectedPaths: Set<string>;
  gitFiles: Record<string, string>;
  onSelect: (path: string, e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
}

function TreeRow({ node, depth, selectedPaths, gitFiles, onSelect, onContextMenu }: TreeRowProps) {
  const [open, setOpen] = useState(depth < 1);
  const [hovered, setHovered] = useState(false);
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
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
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
          background: isSelected ? "var(--active-bg)" : hovered ? "var(--hover-bg)" : "transparent",
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

type DialogState =
  | null
  | { kind: "new-file"; dir: string }
  | { kind: "new-folder"; dir: string }
  | { kind: "rename"; oldPath: string; oldName: string }
  | { kind: "delete"; path: string; name: string; isDir: boolean }
  | { kind: "delete-bulk"; paths: string[] };

export default function FileTreeSidebar() {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [treeRoot, setTreeRoot] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null);
  const [gitFiles, setGitFiles] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<DialogState>(null);

  // Flattened path list for shift-click range selection
  const flatPaths = useMemo(() => {
    const sorted = [...tree].sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return flattenTree(sorted);
  }, [tree]);

  const refreshTree = useCallback(() => {
    fetchApi("/api/files/tree")
      .then((r) => r.json())
      .then((d: { tree?: FileNode[]; root?: string }) => {
        setTree(d.tree ?? []);
        if (d.root) setTreeRoot(d.root);
      })
      .catch(() => {
        window.dispatchEvent(new CustomEvent("studio:toast", { detail: { message: "Failed to refresh file tree", type: "error" } }));
      });
  }, []);

  useEffect(() => {
    fetchApi("/api/files/tree")
      .then((r) => r.json())
      .then((d: { tree?: FileNode[]; root?: string }) => {
        setTree(d.tree ?? []);
        if (d.root) setTreeRoot(d.root);
      })
      .catch(() => {
        window.dispatchEvent(new CustomEvent("studio:toast", { detail: { message: "Failed to load file tree", type: "error" } }));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchApi("/api/files/git")
      .then((r) => r.json())
      .then((d: { files?: Array<{ path: string; status: string }> }) => {
        const map: Record<string, string> = {};
        for (const f of d.files ?? []) map[f.path] = f.status;
        setGitFiles(map);
      })
      .catch(() => {
        window.dispatchEvent(new CustomEvent("studio:toast", { detail: { message: "Failed to load git status", type: "error" } }));
      });
  }, []);

  const fileCount = useMemo(() => countFiles(tree), [tree]);

  const handleSelect = useCallback((path: string, e: React.MouseEvent) => {
    const isMetaOrCtrl = e.metaKey || e.ctrlKey;
    const isShift = e.shiftKey;

    if (isShift && lastSelectedPath) {
      // Shift+click: range select from last selected to clicked
      const startIdx = flatPaths.indexOf(lastSelectedPath);
      const endIdx = flatPaths.indexOf(path);
      if (startIdx !== -1 && endIdx !== -1) {
        const lo = Math.min(startIdx, endIdx);
        const hi = Math.max(startIdx, endIdx);
        const range = flatPaths.slice(lo, hi + 1);
        setSelectedPaths((prev) => {
          const next = new Set(prev);
          for (const p of range) next.add(p);
          return next;
        });
      }
      // Don't update lastSelectedPath on shift-click so range can be extended
    } else if (isMetaOrCtrl) {
      // Cmd/Ctrl+click: toggle individual item in/out of selection
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
      setLastSelectedPath(path);
    } else {
      // Regular click: select only this item, open if file
      setSelectedPaths(new Set([path]));
      setLastSelectedPath(path);
      window.dispatchEvent(
        new CustomEvent("studio:open-file", { detail: { path } })
      );
    }
  }, [lastSelectedPath, flatPaths]);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    // If right-clicking on a non-selected item, select just that item
    if (!selectedPaths.has(node.path)) {
      setSelectedPaths(new Set([node.path]));
      setLastSelectedPath(node.path);
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, node });
  }, [selectedPaths]);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  // ---- CRUD handlers ----

  const handleCreateFile = useCallback(async (name: string) => {
    if (!dialog || dialog.kind !== "new-file") return;
    const path = dialog.dir ? `${dialog.dir}/${name}` : name;
    try {
      const res = await fetchApi("/api/files/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, type: "file" }),
      });
      if (res.ok) {
        refreshTree();
        setSelectedPaths(new Set([path]));
        setLastSelectedPath(path);
        window.dispatchEvent(
          new CustomEvent("studio:open-file", { detail: { path } })
        );
      }
    } catch { /* ignore */ }
    setDialog(null);
  }, [dialog, refreshTree]);

  const handleCreateFolder = useCallback(async (name: string) => {
    if (!dialog || dialog.kind !== "new-folder") return;
    const path = dialog.dir ? `${dialog.dir}/${name}` : name;
    try {
      const res = await fetchApi("/api/files/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, type: "dir" }),
      });
      if (res.ok) refreshTree();
    } catch { /* ignore */ }
    setDialog(null);
  }, [dialog, refreshTree]);

  const handleRename = useCallback(async (newName: string) => {
    if (!dialog || dialog.kind !== "rename") return;
    const parts = dialog.oldPath.split("/");
    parts[parts.length - 1] = newName;
    const newPath = parts.join("/");
    try {
      const res = await fetchApi("/api/files/rename", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPath: dialog.oldPath, newPath }),
      });
      if (res.ok) refreshTree();
    } catch { /* ignore */ }
    setDialog(null);
  }, [dialog, refreshTree]);

  const handleDelete = useCallback(async () => {
    if (!dialog) return;
    if (dialog.kind === "delete") {
      try {
        const res = await fetchApi(`/api/files/delete?path=${encodeURIComponent(dialog.path)}`, {
          method: "DELETE",
        });
        if (res.ok) {
          refreshTree();
          setSelectedPaths((prev) => {
            const next = new Set(prev);
            next.delete(dialog.path);
            return next;
          });
        }
      } catch { /* ignore */ }
    } else if (dialog.kind === "delete-bulk") {
      for (const p of dialog.paths) {
        try {
          await fetchApi(`/api/files/delete?path=${encodeURIComponent(p)}`, {
            method: "DELETE",
          });
        } catch { /* ignore */ }
      }
      refreshTree();
      setSelectedPaths(new Set());
      setLastSelectedPath(null);
    }
    setDialog(null);
  }, [dialog, refreshTree]);

  const handleBulkStage = useCallback(async (paths: string[]) => {
    try {
      await fetchApi("/api/git/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: paths }),
      });
    } catch { /* ignore */ }
  }, []);

  // ---- Context menu items ----

  const ctxMenuItems = useMemo((): ContextMenuItem[] => {
    if (!ctxMenu) return [];
    const { node } = ctxMenu;
    const multiSelected = selectedPaths.size > 1;

    // Bulk actions when multiple items are selected
    if (multiSelected) {
      const count = selectedPaths.size;
      const paths = Array.from(selectedPaths);
      const items: ContextMenuItem[] = [];

      items.push({
        label: `Delete ${count} items`,
        icon: <Trash2 size={12} />,
        danger: true,
        onClick: () => setDialog({ kind: "delete-bulk", paths }),
      });

      items.push({
        label: `Stage ${count} items`,
        icon: <GitBranch size={12} />,
        onClick: () => { void handleBulkStage(paths); },
      });

      items.push({ label: "", separator: true, onClick: () => {} });

      items.push({
        label: "Copy paths",
        icon: <Copy size={12} />,
        onClick: () => { navigator.clipboard.writeText(paths.join("\n")).catch(() => {}); },
      });

      return items;
    }

    // Single-item context menu
    const isFile = node.type === "file";
    const isDir = node.type === "dir";
    const items: ContextMenuItem[] = [];

    if (isFile) {
      items.push({
        label: "Open File",
        icon: <FolderOpen size={12} />,
        onClick: () => {
          setSelectedPaths(new Set([node.path]));
          setLastSelectedPath(node.path);
          window.dispatchEvent(
            new CustomEvent("studio:open-file", { detail: { path: node.path } })
          );
        },
      });
      items.push({ label: "", separator: true, onClick: () => {} });
    }

    const targetDir = isDir ? node.path : node.path.split("/").slice(0, -1).join("/");

    items.push({
      label: "New File",
      icon: <FilePlus size={12} />,
      onClick: () => setDialog({ kind: "new-file", dir: targetDir }),
    });
    items.push({
      label: "New Folder",
      icon: <FolderPlus size={12} />,
      onClick: () => setDialog({ kind: "new-folder", dir: targetDir }),
    });

    items.push({ label: "", separator: true, onClick: () => {} });

    items.push({
      label: "Rename",
      icon: <Pencil size={12} />,
      onClick: () => setDialog({ kind: "rename", oldPath: node.path, oldName: node.name }),
    });

    items.push({
      label: "Delete",
      icon: <Trash2 size={12} />,
      danger: true,
      onClick: () => setDialog({ kind: "delete", path: node.path, name: node.name, isDir }),
    });

    items.push({ label: "", separator: true, onClick: () => {} });

    items.push({
      label: "Copy Path",
      icon: <Copy size={12} />,
      onClick: () => { navigator.clipboard.writeText(node.path).catch(() => {}); },
    });
    items.push({
      label: "Copy Relative Path",
      icon: <Copy size={12} />,
      onClick: () => {
        const prefix = treeRoot.endsWith("/") ? treeRoot : treeRoot + "/";
        const relative = node.path.startsWith(prefix)
          ? node.path.slice(prefix.length)
          : node.path;
        navigator.clipboard.writeText(relative).catch(() => {});
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
  }, [ctxMenu, selectedPaths, handleBulkStage, treeRoot]);

  const sorted = useMemo(
    () =>
      [...tree].sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [tree]
  );

  // ---- Dialog helpers ----

  const dialogOpen = dialog !== null;
  const isInputDialog = dialog?.kind === "new-file" || dialog?.kind === "new-folder" || dialog?.kind === "rename";
  const isDeleteDialog = dialog?.kind === "delete" || dialog?.kind === "delete-bulk";

  const dialogTitle = (() => {
    if (!dialog) return "";
    if (dialog.kind === "new-file") return "New File";
    if (dialog.kind === "new-folder") return "New Folder";
    if (dialog.kind === "rename") return "Rename";
    if (dialog.kind === "delete") return `Delete ${dialog.isDir ? "folder" : "file"}`;
    if (dialog.kind === "delete-bulk") return `Delete ${dialog.paths.length} items`;
    return "";
  })();

  const dialogMessage = (() => {
    if (!dialog) return undefined;
    if (dialog.kind === "delete") {
      return `Are you sure you want to delete "${dialog.name}"?${dialog.isDir ? " This will remove all contents." : ""}`;
    }
    if (dialog.kind === "delete-bulk") {
      return `Are you sure you want to delete ${dialog.paths.length} items? This cannot be undone.`;
    }
    if (dialog.kind === "new-file") {
      return dialog.dir ? `Create file in ${dialog.dir}/` : "Create file in project root";
    }
    if (dialog.kind === "new-folder") {
      return dialog.dir ? `Create folder in ${dialog.dir}/` : "Create folder in project root";
    }
    return undefined;
  })();

  const dialogPlaceholder = (() => {
    if (!dialog) return "";
    if (dialog.kind === "new-file") return "filename.ts";
    if (dialog.kind === "new-folder") return "folder-name";
    if (dialog.kind === "rename") return "new name";
    return "";
  })();

  const dialogDefault = dialog?.kind === "rename" ? dialog.oldName : "";

  // Clear selection when clicking empty space in the tree container
  const handleTreeBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSelectedPaths(new Set());
      setLastSelectedPath(null);
    }
  }, []);

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
        <span>
          FILES
          {selectedPaths.size > 1 && (
            <span style={{ color: "var(--accent)", marginLeft: 6 }}>
              {selectedPaths.size} selected
            </span>
          )}
        </span>
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
      <div
        style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}
        onClick={handleTreeBackgroundClick}
      >
        {loading ? (
          <div
            style={{
              padding: "12px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <Skeleton width="60%" />
            <Skeleton width="50%" style={{ marginLeft: 16 }} />
            <Skeleton width="45%" style={{ marginLeft: 16 }} />
            <Skeleton width="55%" style={{ marginLeft: 32 }} />
            <Skeleton width="40%" style={{ marginLeft: 16 }} />
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
              selectedPaths={selectedPaths}
              gitFiles={gitFiles}
              onSelect={handleSelect}
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

      {/* CRUD dialogs */}
      {isInputDialog && (
        <ConfirmDialog
          open={dialogOpen}
          title={dialogTitle}
          message={dialogMessage}
          confirmLabel={dialog?.kind === "rename" ? "Rename" : "Create"}
          inputMode
          inputPlaceholder={dialogPlaceholder}
          inputDefaultValue={dialogDefault}
          onConfirm={() => {}}
          onConfirmWithValue={(val) => {
            const trimmed = val.trim();
            if (!trimmed) return;
            if (dialog?.kind === "new-file") handleCreateFile(trimmed);
            else if (dialog?.kind === "new-folder") handleCreateFolder(trimmed);
            else if (dialog?.kind === "rename") handleRename(trimmed);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {isDeleteDialog && (
        <ConfirmDialog
          open={dialogOpen}
          title={dialogTitle}
          message={dialogMessage}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}
