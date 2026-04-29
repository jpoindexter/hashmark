import { useState, useCallback, useEffect, useRef } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";

interface Entry {
  name: string;
  path: string;
  isDir: boolean;
  ext: string;
}

interface DirListing {
  dir: string;
  relative: string;
  entries: Entry[];
}

interface ContextMenu {
  x: number;
  y: number;
  entry: Entry;
}

interface Props {
  onSendToChat?: (text: string) => void;
}

export function FileExplorer({ onSendToChat }: Props) {
  const [root, setRoot] = useState<DirListing | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [children, setChildren] = useState<Map<string, DirListing>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<{ path: string; relative: string; content: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchApi<DirListing>("/api/files")
      .then(d => { setRoot(d); setLoading(false); })
      .catch(() => { toast.error("Failed to load files"); setLoading(false); });
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleDir = useCallback(async (entry: Entry) => {
    const path = entry.path;
    if (expanded.has(path)) {
      setExpanded(prev => { const s = new Set(prev); s.delete(path); return s; });
      return;
    }
    setExpanded(prev => new Set(prev).add(path));
    if (!children.has(path)) {
      try {
        const d = await fetchApi<DirListing>(`/api/files?dir=${encodeURIComponent(path)}`);
        setChildren(prev => new Map(prev).set(path, d));
      } catch { toast.error("Failed to open folder"); }
    }
  }, [expanded, children]);

  const openFile = useCallback(async (entry: Entry) => {
    setSelected(entry.path);
    try {
      const d = await fetchApi<{ path: string; relative: string; content: string }>(
        `/api/files/content?path=${encodeURIComponent(entry.path)}`
      );
      setFileContent(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cannot read file");
    }
  }, []);

  const onRightClick = (e: React.MouseEvent, entry: Entry) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const sendPathToChat = (entry: Entry) => {
    onSendToChat?.(`@${entry.path}`);
    setCtxMenu(null);
  };

  const sendContentToChat = async (entry: Entry) => {
    setCtxMenu(null);
    try {
      const d = await fetchApi<{ path: string; relative: string; content: string }>(
        `/api/files/content?path=${encodeURIComponent(entry.path)}`
      );
      onSendToChat?.(`Here is \`${d.relative}\`:\n\`\`\`\n${d.content.slice(0, 8000)}\n\`\`\``);
    } catch { toast.error("Cannot read file"); }
  };

  if (loading) {
    return <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12 }}>Loading...</div>;
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Tree */}
      <div style={{ width: fileContent ? 220 : "100%", flexShrink: 0, overflow: "auto", borderRight: fileContent ? "1px solid var(--border)" : "none" }}>
        <div style={{ padding: "6px 0" }}>
          {root?.entries.map(e => (
            <TreeNode
              key={e.path}
              entry={e}
              depth={0}
              expanded={expanded}
              children={children}
              selected={selected}
              onToggleDir={toggleDir}
              onOpenFile={openFile}
              onRightClick={onRightClick}
            />
          ))}
        </div>
      </div>

      {/* File viewer */}
      {fileContent && (
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{
            height: 32, display: "flex", alignItems: "center", padding: "0 12px", gap: 8,
            borderBottom: "1px solid var(--border)", flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {fileContent.relative}
            </span>
            {onSendToChat && (
              <button
                onClick={() => onSendToChat(`Here is \`${fileContent.relative}\`:\n\`\`\`\n${fileContent.content.slice(0, 8000)}\n\`\`\``)}
                style={{
                  fontSize: 10, padding: "2px 8px", background: "var(--accent-dim)", color: "var(--accent-text)",
                  border: "none", borderRadius: 3, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
                }}
              >
                Send to chat
              </button>
            )}
            <button
              onClick={() => setFileContent(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, flexShrink: 0 }}
            >
              ×
            </button>
          </div>
          <pre style={{
            flex: 1, overflow: "auto", margin: 0, padding: "12px 16px",
            fontSize: 11, lineHeight: 1.6, color: "var(--text)",
            fontFamily: "var(--font-mono)", whiteSpace: "pre", background: "var(--bg)",
          }}>
            {fileContent.content}
          </pre>
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          style={{
            position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 1000,
            background: "var(--bg-panel)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)", padding: "4px 0", minWidth: 180,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {!ctxMenu.entry.isDir && onSendToChat && (
            <>
              <CtxItem label="Send path to chat" onClick={() => sendPathToChat(ctxMenu.entry)} />
              <CtxItem label="Send content to chat" onClick={() => void sendContentToChat(ctxMenu.entry)} />
              <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
            </>
          )}
          {ctxMenu.entry.isDir && onSendToChat && (
            <CtxItem label="Send path to chat" onClick={() => sendPathToChat(ctxMenu.entry)} />
          )}
          <CtxItem label="Copy path" onClick={() => { void navigator.clipboard.writeText(ctxMenu.entry.path); setCtxMenu(null); }} />
        </div>
      )}
    </div>
  );
}

function TreeNode({
  entry, depth, expanded, children, selected,
  onToggleDir, onOpenFile, onRightClick,
}: {
  entry: Entry;
  depth: number;
  expanded: Set<string>;
  children: Map<string, DirListing>;
  selected: string | null;
  onToggleDir: (e: Entry) => void;
  onOpenFile: (e: Entry) => void;
  onRightClick: (ev: React.MouseEvent, e: Entry) => void;
}) {
  const isOpen = expanded.has(entry.path);
  const isSelected = selected === entry.path;
  const sub = children.get(entry.path);

  return (
    <>
      <div
        onClick={() => entry.isDir ? onToggleDir(entry) : onOpenFile(entry)}
        onContextMenu={e => onRightClick(e, entry)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: `3px 10px 3px ${10 + depth * 14}px`,
          cursor: "pointer", fontSize: 12,
          color: isSelected ? "var(--text)" : "var(--text-dim)",
          background: isSelected ? "var(--bg-active)" : "transparent",
          userSelect: "none",
        }}
        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)"; }}
        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
      >
        <span style={{ fontSize: 10, color: "var(--text-muted)", width: 10, flexShrink: 0, textAlign: "center" }}>
          {entry.isDir ? (isOpen ? "▼" : "▶") : ""}
        </span>
        <FileIcon entry={entry} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {entry.name}
        </span>
      </div>

      {entry.isDir && isOpen && sub?.entries.map(child => (
        <TreeNode
          key={child.path}
          entry={child}
          depth={depth + 1}
          expanded={expanded}
          children={children}
          selected={selected}
          onToggleDir={onToggleDir}
          onOpenFile={onOpenFile}
          onRightClick={onRightClick}
        />
      ))}
    </>
  );
}

function FileIcon({ entry }: { entry: Entry }) {
  if (entry.isDir) {
    return <span style={{ fontSize: 13 }}>📁</span>;
  }
  const colors: Record<string, string> = {
    ts: "var(--blue)", tsx: "var(--blue)", js: "var(--yellow)", jsx: "var(--yellow)",
    json: "var(--yellow)", md: "var(--text-dim)", css: "var(--accent)",
    html: "var(--orange)", py: "var(--green)", rs: "var(--orange)",
    go: "var(--blue)", sql: "var(--accent)", sh: "var(--green)",
  };
  const color = colors[entry.ext] ?? "var(--text-muted)";
  return <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, color, width: 36, flexShrink: 0, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>.{entry.ext || "?"}</span>;
}

function CtxItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "6px 14px", fontSize: 12, cursor: "pointer", color: "var(--text-dim)",
        transition: "background var(--transition)",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {label}
    </div>
  );
}
