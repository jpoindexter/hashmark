import { useState, useEffect, useCallback, useMemo } from "react";
import { CodeViewer } from "../components/CodeViewer";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileNode[];
  ext?: string;
  size?: number;
  mtime?: number;
}

interface FileComplexity {
  path: string;
  fileCyclomatic: number;
  avgMaintainability: number;
}

type SortKey = "name" | "size" | "mtime";

const COMMON_EXTS = ["ts", "tsx", "js", "py", "go", "rs", "md", "json", "css", "html", "sh", "yml"];

const EXT_ICONS: Record<string, string> = {
  tsx: "⚛", jsx: "⚛",
  ts: "📘", js: "📘", mjs: "📘",
  py: "🐍",
  rs: "🦀",
  go: "🐹",
  md: "📝", mdx: "📝",
  json: "⚙", toml: "⚙", yaml: "⚙", yml: "⚙", env: "⚙",
  css: "🎨", scss: "🎨",
  html: "🌐",
  sh: "💲", bash: "💲",
  sql: "🗄",
};

function fileIcon(ext?: string): string {
  if (!ext) return "📄";
  return EXT_ICONS[ext] ?? "📄";
}

function complexityDot(c: FileComplexity | undefined): JSX.Element | null {
  if (!c) return null;
  const mi = c.avgMaintainability;
  const color = mi >= 70 ? "var(--accent)" : mi >= 40 ? "var(--yellow)" : "var(--red)";
  const label = mi >= 70 ? "Good" : mi >= 40 ? "Fair" : "Poor";
  return (
    <span
      title={`MI: ${mi.toFixed(0)} · CC: ${c.fileCyclomatic} — ${label}`}
      style={{
        width: 7, height: 7, borderRadius: "50%", background: color,
        display: "inline-block", flexShrink: 0, marginLeft: 4,
      }}
    />
  );
}

function fuzzyMatch(name: string, query: string): boolean {
  if (!query) return true;
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function flattenTree(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = [];
  function walk(ns: FileNode[]) {
    for (const n of ns) {
      if (n.type === "file") result.push(n);
      if (n.children) walk(n.children);
    }
  }
  walk(nodes);
  return result;
}

function sortNodes(nodes: FileNode[], sortKey: SortKey): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    if (sortKey === "name") return a.name.localeCompare(b.name);
    if (sortKey === "size") return (b.size ?? 0) - (a.size ?? 0);
    if (sortKey === "mtime") return (b.mtime ?? 0) - (a.mtime ?? 0);
    return 0;
  });
}

function formatSize(bytes?: number): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// Filtered flat list matched into a virtual tree (dirs become collapsible parents)
function buildFilteredTree(
  nodes: FileNode[],
  query: string,
  extFilter: string | null,
): FileNode[] {
  if (!query && !extFilter) return nodes;
  // Return flat matched files (tree structure is skipped when filtering)
  return flattenTree(nodes).filter(f => {
    if (extFilter && f.ext !== extFilter) return false;
    if (query && !fuzzyMatch(f.name, query)) return false;
    return true;
  });
}

function TreeNode({
  node, depth, selected, onSelect, complexity, sortKey,
}: {
  node: FileNode;
  depth: number;
  selected: string | null;
  onSelect: (path: string, type: "file" | "dir") => void;
  complexity: Map<string, FileComplexity>;
  sortKey: SortKey;
}) {
  const [open, setOpen] = useState(depth < 1);
  const isSelected = node.path === selected;
  const cx = node.type === "file" ? complexity.get(node.path) : undefined;

  const sortedChildren = useMemo(
    () => node.children ? sortNodes(node.children, sortKey) : [],
    [node.children, sortKey],
  );

  return (
    <div>
      <div
        onClick={() => {
          if (node.type === "dir") setOpen(o => !o);
          onSelect(node.path, node.type);
        }}
        title={node.type === "file" ? `${node.path}${node.size ? " · " + formatSize(node.size) : ""}` : node.path}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          paddingLeft: 8 + depth * 12, paddingTop: 2, paddingBottom: 2,
          cursor: "pointer", userSelect: "none",
          background: isSelected ? "var(--bg-3)" : "transparent",
          color: isSelected ? "var(--text)" : "var(--text-dim)",
          fontSize: 12, fontFamily: "var(--font)",
          borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
        }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-3)"; }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
      >
        {node.type === "dir" ? (
          <span style={{ width: 18, textAlign: "center", fontSize: 10, color: "var(--text-dimmer)", flexShrink: 0 }}>
            {open ? "▾" : "▸"}
          </span>
        ) : (
          <span style={{ width: 18, textAlign: "center", fontSize: 13, flexShrink: 0 }}>
            {fileIcon(node.ext)}
          </span>
        )}
        <span style={{
          color: node.type === "dir" ? "var(--text)" : "var(--text-dim)",
          flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {node.name}
        </span>
        {cx && complexityDot(cx)}
      </div>
      {node.type === "dir" && open && sortedChildren.map(child => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
          complexity={complexity}
          sortKey={sortKey}
        />
      ))}
    </div>
  );
}

function FlatFileRow({
  node, selected, onSelect, complexity,
}: {
  node: FileNode;
  selected: string | null;
  onSelect: (path: string, type: "file" | "dir") => void;
  complexity: Map<string, FileComplexity>;
}) {
  const isSelected = node.path === selected;
  const cx = complexity.get(node.path);
  return (
    <div
      onClick={() => onSelect(node.path, "file")}
      title={node.path}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        paddingLeft: 8, paddingTop: 2, paddingBottom: 2,
        cursor: "pointer", userSelect: "none",
        background: isSelected ? "var(--bg-3)" : "transparent",
        color: isSelected ? "var(--text)" : "var(--text-dim)",
        fontSize: 12, fontFamily: "var(--font)",
        borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
      }}
      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-3)"; }}
      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      <span style={{ width: 18, textAlign: "center", fontSize: 13, flexShrink: 0 }}>
        {fileIcon(node.ext)}
      </span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {node.path}
      </span>
      {cx && complexityDot(cx)}
      {node.size !== undefined && (
        <span style={{ fontSize: 10, color: "var(--text-dimmer)", flexShrink: 0 }}>
          {formatSize(node.size)}
        </span>
      )}
    </div>
  );
}

export default function FilesPage() {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [extFilter, setExtFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [complexity, setComplexity] = useState<Map<string, FileComplexity>>(new Map());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/files/tree").then(r => r.json()).then(d => setTree(d.tree ?? [])).catch(() => {});
    fetch("/api/files/complexity").then(r => r.json()).then(d => {
      if (!d.data) return;
      // data may be an array of FileASTComplexity or a map by path
      const entries: FileComplexity[] = Array.isArray(d.data) ? d.data : Object.values(d.data);
      const map = new Map<string, FileComplexity>();
      for (const e of entries) map.set(e.path, e);
      setComplexity(map);
    }).catch(() => {});
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

  const onCopy = useCallback(() => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [content]);

  const isFiltering = !!(query || extFilter);

  const displayedNodes = useMemo(() => {
    if (isFiltering) return buildFilteredTree(tree, query, extFilter);
    return sortNodes(tree, sortKey);
  }, [tree, query, extFilter, sortKey, isFiltering]);

  const allFiles = useMemo(() => flattenTree(tree), [tree]);
  const matchedCount = useMemo(() => {
    if (!isFiltering) return allFiles.length;
    return allFiles.filter(f => {
      if (extFilter && f.ext !== extFilter) return false;
      if (query && !fuzzyMatch(f.name, query)) return false;
      return true;
    }).length;
  }, [allFiles, query, extFilter, isFiltering]);

  const selectedExt = selected?.split(".").pop() ?? "";

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "var(--bg)" }}>
      {/* Sidebar */}
      <div style={{
        width: 260, flexShrink: 0, borderRight: "1px solid var(--border-dim)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Search + filter toolbar */}
        <div style={{ padding: "8px 8px 4px", flexShrink: 0 }}>
          <input
            type="text"
            placeholder="Filter files..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ width: "100%", marginBottom: 6 }}
          />
          {/* Extension pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {COMMON_EXTS.map(ext => (
              <button
                key={ext}
                className="btn"
                onClick={() => setExtFilter(extFilter === ext ? null : ext)}
                style={{
                  padding: "1px 6px", fontSize: 10,
                  background: extFilter === ext ? "var(--accent)" : "var(--bg-4)",
                  color: extFilter === ext ? "#fff" : "var(--text-dimmer)",
                  borderColor: extFilter === ext ? "var(--accent)" : "var(--border-dim)",
                }}
              >
                .{ext}
              </button>
            ))}
          </div>
          {/* Sort + result count */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              style={{ fontSize: 10, padding: "2px 6px" }}
            >
              <option value="name">Name</option>
              <option value="size">Size</option>
              <option value="mtime">Modified</option>
            </select>
            <span style={{ fontSize: 10, color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
              {isFiltering
                ? `${matchedCount} / ${allFiles.length}`
                : `${allFiles.length} files`}
            </span>
          </div>
        </div>

        <div style={{
          padding: "4px 12px 6px", fontSize: 10, fontFamily: "var(--font)",
          color: "var(--text-dimmer)", letterSpacing: 1, textTransform: "uppercase",
          flexShrink: 0,
        }}>
          FILES
        </div>

        {/* Tree or flat filtered list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {isFiltering
            ? (displayedNodes as FileNode[]).map(node => (
                <FlatFileRow
                  key={node.path}
                  node={node}
                  selected={selected}
                  onSelect={onSelect}
                  complexity={complexity}
                />
              ))
            : displayedNodes.map(node => (
                <TreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  selected={selected}
                  onSelect={onSelect}
                  complexity={complexity}
                  sortKey={sortKey}
                />
              ))
          }
          {isFiltering && displayedNodes.length === 0 && (
            <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
              No files match.
            </div>
          )}
        </div>
      </div>

      {/* Content panel */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {!selected && (
          <div style={{ padding: "16px 20px", color: "var(--text-dimmer)", fontFamily: "var(--font)", fontSize: 13 }}>
            Select a file to view its contents.
          </div>
        )}
        {loading && (
          <div style={{ padding: "16px 20px", color: "var(--text-dimmer)", fontFamily: "var(--font)", fontSize: 13 }}>
            Loading...
          </div>
        )}
        {content !== null && !loading && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* File path breadcrumb + copy button */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "6px 16px 6px 20px", borderBottom: "1px solid var(--border-dim)",
              flexShrink: 0,
            }}>
              <div style={{ fontFamily: "var(--font)", fontSize: 11, color: "var(--text-dimmer)", overflow: "hidden" }}>
                {/* Breadcrumb segments */}
                {selected?.split("/").map((seg, i, arr) => (
                  <span key={i}>
                    {i > 0 && <span style={{ color: "var(--text-dimmer)", margin: "0 2px" }}>/</span>}
                    <span style={{ color: i === arr.length - 1 ? "var(--text)" : "var(--text-dimmer)" }}>
                      {seg}
                    </span>
                  </span>
                ))}
              </div>
              <button
                className="btn"
                onClick={onCopy}
                style={{ fontSize: 10, padding: "2px 8px", flexShrink: 0 }}
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <CodeViewer
                content={content}
                ext={selectedExt}
                path={selected ?? undefined}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
