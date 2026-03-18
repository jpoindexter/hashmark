import { useState, useEffect, useCallback } from "react";
import { CodeViewer } from "../components/CodeViewer";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileNode[];
  ext?: string;
}

const EXT_ICON: Record<string, string> = {
  ts: "TS", tsx: "TX", js: "JS", jsx: "JX", json: "{}",
  md: "MD", css: "CS", html: "HT", py: "PY", go: "GO",
  rs: "RS", sql: "SQ", sh: "SH", yml: "YM", yaml: "YM",
  toml: "TM", env: "EV", txt: "TT",
};

function FileIcon({ ext }: { ext?: string }) {
  const label = ext ? (EXT_ICON[ext] ?? ext.slice(0, 2).toUpperCase()) : "  ";
  const isCode = ext && ["ts", "tsx", "js", "jsx", "py", "go", "rs"].includes(ext);
  return (
    <span style={{
      fontSize: "9px", fontWeight: 700, color: isCode ? "var(--accent)" : "var(--text-dimmer)",
      width: 18, display: "inline-block", textAlign: "center", flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

function TreeNode({
  node, depth, selected, onSelect,
}: {
  node: FileNode;
  depth: number;
  selected: string | null;
  onSelect: (path: string, type: "file" | "dir") => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const isSelected = node.path === selected;

  return (
    <div>
      <div
        onClick={() => {
          if (node.type === "dir") setOpen((o) => !o);
          onSelect(node.path, node.type);
        }}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          paddingLeft: 8 + depth * 12, paddingTop: 2, paddingBottom: 2,
          cursor: "pointer", userSelect: "none",
          background: isSelected ? "var(--bg-3)" : "transparent",
          color: isSelected ? "var(--text)" : "var(--text-dim)",
          fontSize: 12, fontFamily: "var(--font)",
          borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
        }}
        onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-3)"; }}
        onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
      >
        {node.type === "dir" ? (
          <span style={{ width: 18, textAlign: "center", fontSize: 10, color: "var(--text-dimmer)" }}>
            {open ? "▾" : "▸"}
          </span>
        ) : (
          <FileIcon ext={node.ext} />
        )}
        <span style={{ color: node.type === "dir" ? "var(--text)" : "var(--text-dim)" }}>{node.name}</span>
      </div>
      {node.type === "dir" && open && node.children?.map((child) => (
        <TreeNode key={child.path} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}

export default function FilesPage() {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/files/tree").then(r => r.json()).then(d => setTree(d.tree ?? [])).catch(() => {});
  }, []);

  const onSelect = useCallback((path: string, type: "file" | "dir") => {
    setSelected(path);
    if (type === "file") {
      setLoading(true);
      setContent(null);
      fetch(`/api/files/read?path=${encodeURIComponent(path)}`)
        .then(r => r.json())
        .then(d => setContent(d.content ?? ""))
        .catch(() => setContent("Error loading file."))
        .finally(() => setLoading(false));
    }
  }, []);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "var(--bg)" }}>
      {/* Tree */}
      <div style={{
        width: 240, flexShrink: 0, borderRight: "1px solid var(--border-dim)",
        overflowY: "auto", paddingTop: 8,
      }}>
        <div style={{
          padding: "6px 12px 8px", fontSize: 10, fontFamily: "var(--font)",
          color: "var(--text-dimmer)", letterSpacing: 1, textTransform: "uppercase",
        }}>
          FILES
        </div>
        {tree.map(node => (
          <TreeNode key={node.path} node={node} depth={0} selected={selected} onSelect={onSelect} />
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {!selected && (
          <div style={{ padding: "16px 20px", color: "var(--text-dimmer)", fontFamily: "var(--font)", fontSize: 13 }}>
            Select a file to view its contents.
          </div>
        )}
        {loading && (
          <div style={{ padding: "16px 20px", color: "var(--text-dimmer)", fontFamily: "var(--font)", fontSize: 13 }}>Loading...</div>
        )}
        {content !== null && !loading && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{
              fontFamily: "var(--font)", fontSize: 11, color: "var(--text-dimmer)",
              marginBottom: 0, padding: "8px 20px", borderBottom: "1px solid var(--border-dim)",
              flexShrink: 0,
            }}>
              {selected}
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <CodeViewer
                content={content}
                ext={selected?.split(".").pop() ?? ""}
                path={selected ?? undefined}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
