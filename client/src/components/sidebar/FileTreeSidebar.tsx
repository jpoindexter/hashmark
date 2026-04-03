import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Copy, FolderOpen, ExternalLink, FilePlus, FolderPlus, Pencil, Trash2,
  GitBranch,
} from "lucide-react";
import ContextMenu, { type ContextMenuItem } from "../shared/ContextMenu.tsx";
import { Skeleton } from "../shared/Skeleton.tsx";
import { fetchApi } from "../../lib/api";
import { toast } from "../../hooks/useToast";
import { type FileNode, type DialogState, countFiles, flattenTree } from "./file-tree/types";
import { TreeRow } from "./file-tree/TreeNode";
import { FileActions } from "./file-tree/FileActions";

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
        toast.error("Failed to refresh file tree");
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
        toast.error("Failed to load file tree");
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
        toast.error("Failed to load git status");
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
      <FileActions
        dialog={dialog}
        onClose={() => setDialog(null)}
        onCreateFile={handleCreateFile}
        onCreateFolder={handleCreateFolder}
        onRename={handleRename}
        onDelete={handleDelete}
      />
    </div>
  );
}
