import { useState, useEffect, useMemo, useCallback } from "react";
import {
  FileCode, FileText, Folder, ChevronRight, ChevronDown,
  Copy, FolderOpen, ExternalLink, FilePlus, FolderPlus, Pencil, Trash2,
} from "lucide-react";
import ContextMenu, { type ContextMenuItem } from "../shared/ContextMenu.tsx";
import ConfirmDialog from "../shared/ConfirmDialog.tsx";

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
  selectedPath: string | null;
  gitFiles: Record<string, string>;
  onFileSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
}

function TreeRow({ node, depth, selectedPath, gitFiles, onFileSelect, onContextMenu }: TreeRowProps) {
  const [open, setOpen] = useState(depth < 1);
  const [hovered, setHovered] = useState(false);
  const isDir = node.type === "dir";
  const isSelected = selectedPath === node.path;
  const Icon = isDir ? Folder : fileIcon(node.ext);
  const Chevron = open ? ChevronDown : ChevronRight;
  const status = gitFiles[node.path];

  const handleClick = () => {
    if (isDir) {
      setOpen((v) => !v);
    }
    onFileSelect(node.path);
  };

  const sorted = useMemo(() => {
    if (!node.children) return [];
    return [...node.children].sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [node.children]);

  // Color the filename based on git status
  const nameColor = status
    ? gitStatusColor(status)
    : "var(--text-dim)";

  return (
    <>
      <div
        onClick={handleClick}
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
            selectedPath={selectedPath}
            gitFiles={gitFiles}
            onFileSelect={onFileSelect}
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
  | { kind: "delete"; path: string; name: string; isDir: boolean };

export default function FileTreeSidebar() {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null);
  const [gitFiles, setGitFiles] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<DialogState>(null);

  const refreshTree = useCallback(() => {
    fetch("/api/files/tree")
      .then((r) => r.json())
      .then((d: { tree?: FileNode[] }) => setTree(d.tree ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/files/tree")
      .then((r) => r.json())
      .then((d: { tree?: FileNode[] }) => setTree(d.tree ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/files/git")
      .then((r) => r.json())
      .then((d: { files?: Array<{ path: string; status: string }> }) => {
        const map: Record<string, string> = {};
        for (const f of d.files ?? []) map[f.path] = f.status;
        setGitFiles(map);
      })
      .catch(() => {});
  }, []);

  const fileCount = useMemo(() => countFiles(tree), [tree]);

  const handleFileSelect = useCallback((path: string) => {
    setSelectedPath(path);
    window.dispatchEvent(
      new CustomEvent("studio:open-file", { detail: { path } })
    );
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  // ---- CRUD handlers ----

  const handleCreateFile = useCallback(async (name: string) => {
    if (!dialog || dialog.kind !== "new-file") return;
    const path = dialog.dir ? `${dialog.dir}/${name}` : name;
    try {
      const res = await fetch("/api/files/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, type: "file" }),
      });
      if (res.ok) {
        refreshTree();
        handleFileSelect(path);
      }
    } catch { /* ignore */ }
    setDialog(null);
  }, [dialog, refreshTree, handleFileSelect]);

  const handleCreateFolder = useCallback(async (name: string) => {
    if (!dialog || dialog.kind !== "new-folder") return;
    const path = dialog.dir ? `${dialog.dir}/${name}` : name;
    try {
      const res = await fetch("/api/files/create", {
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
      const res = await fetch("/api/files/rename", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPath: dialog.oldPath, newPath }),
      });
      if (res.ok) refreshTree();
    } catch { /* ignore */ }
    setDialog(null);
  }, [dialog, refreshTree]);

  const handleDelete = useCallback(async () => {
    if (!dialog || dialog.kind !== "delete") return;
    try {
      const res = await fetch(`/api/files/delete?path=${encodeURIComponent(dialog.path)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        refreshTree();
        if (selectedPath === dialog.path) setSelectedPath(null);
      }
    } catch { /* ignore */ }
    setDialog(null);
  }, [dialog, refreshTree, selectedPath]);

  // ---- Context menu items ----

  const ctxMenuItems = useMemo((): ContextMenuItem[] => {
    if (!ctxMenu) return [];
    const { node } = ctxMenu;
    const isFile = node.type === "file";
    const isDir = node.type === "dir";
    const items: ContextMenuItem[] = [];

    if (isFile) {
      items.push({
        label: "Open File",
        icon: <FolderOpen size={12} />,
        onClick: () => handleFileSelect(node.path),
      });
      items.push({ label: "", separator: true, onClick: () => {} });
    }

    // CRUD: New File / New Folder
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

    // Rename
    items.push({
      label: "Rename",
      icon: <Pencil size={12} />,
      onClick: () => setDialog({ kind: "rename", oldPath: node.path, oldName: node.name }),
    });

    // Delete
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

  // ---- Dialog helpers ----

  const dialogOpen = dialog !== null;
  const isInputDialog = dialog?.kind === "new-file" || dialog?.kind === "new-folder" || dialog?.kind === "rename";
  const isDeleteDialog = dialog?.kind === "delete";

  const dialogTitle = (() => {
    if (!dialog) return "";
    if (dialog.kind === "new-file") return "New File";
    if (dialog.kind === "new-folder") return "New Folder";
    if (dialog.kind === "rename") return "Rename";
    if (dialog.kind === "delete") return `Delete ${dialog.isDir ? "folder" : "file"}`;
    return "";
  })();

  const dialogMessage = (() => {
    if (!dialog) return undefined;
    if (dialog.kind === "delete") {
      return `Are you sure you want to delete "${dialog.name}"?${dialog.isDir ? " This will remove all contents." : ""}`;
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
              selectedPath={selectedPath}
              gitFiles={gitFiles}
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
