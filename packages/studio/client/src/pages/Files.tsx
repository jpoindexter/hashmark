import { useState, useEffect, useCallback } from "react";

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
      fontSize: "9px", fontWeight: 700, color: isCode ? "#10b981" : "#52525b",
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
          background: isSelected ? "#18181b" : "transparent",
          color: isSelected ? "#f4f4f5" : "#a1a1aa",
          fontSize: 12, fontFamily: "monospace",
          borderLeft: isSelected ? "1px solid #10b981" : "1px solid transparent",
        }}
        onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "#111113"; }}
        onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
      >
        {node.type === "dir" ? (
          <span style={{ width: 18, textAlign: "center", fontSize: 10, color: "#52525b" }}>
            {open ? "▾" : "▸"}
          </span>
        ) : (
          <FileIcon ext={node.ext} />
        )}
        <span style={{ color: node.type === "dir" ? "#d4d4d8" : "#a1a1aa" }}>{node.name}</span>
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
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "#09090b" }}>
      {/* Tree */}
      <div style={{
        width: 240, flexShrink: 0, borderRight: "1px solid #18181b",
        overflowY: "auto", paddingTop: 8,
      }}>
        <div style={{
          padding: "6px 12px 8px", fontSize: 10, fontFamily: "monospace",
          color: "#52525b", letterSpacing: 1, textTransform: "uppercase",
        }}>
          FILES
        </div>
        {tree.map(node => (
          <TreeNode key={node.path} node={node} depth={0} selected={selected} onSelect={onSelect} />
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {!selected && (
          <div style={{ color: "#3f3f46", fontFamily: "monospace", fontSize: 13 }}>
            Select a file to view its contents.
          </div>
        )}
        {loading && (
          <div style={{ color: "#52525b", fontFamily: "monospace", fontSize: 13 }}>Loading...</div>
        )}
        {content !== null && !loading && (
          <>
            <div style={{
              fontFamily: "monospace", fontSize: 11, color: "#52525b",
              marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #18181b",
            }}>
              {selected}
            </div>
            <pre style={{
              fontFamily: "monospace", fontSize: 12, color: "#d4d4d8",
              whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0,
              lineHeight: 1.6,
            }}>
              {content}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}
