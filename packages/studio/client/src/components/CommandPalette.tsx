import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  Home, FolderTree, GitBranch, Bot, Settings,
  Plus, TerminalSquare, FolderOpen, Sun,
  Play, FileText, Shield, Brain, Layout, RefreshCw, Columns,
  File, ChevronRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Command {
  id: string;
  section: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  keybind?: string;
  run: () => void;
}

interface FileItem {
  name: string;
  path: string;
  ext?: string;
}

type ResultItem =
  | { kind: "command"; cmd: Command }
  | { kind: "file"; file: FileItem };

interface Props {
  open: boolean;
  onClose: () => void;
}

// ── Recent files ──────────────────────────────────────────────────────────────

const RECENT_KEY = "studio:recentFiles";
const MAX_RECENT = 8;

function getRecentFiles(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

export function addRecentFile(path: string) {
  try {
    const prev = getRecentFiles().filter(p => p !== path);
    localStorage.setItem(RECENT_KEY, JSON.stringify([path, ...prev].slice(0, MAX_RECENT)));
  } catch {}
}

// ── Fuzzy scoring ─────────────────────────────────────────────────────────────

function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact substring in filename = highest score
  const name = target.split("/").pop() ?? target;
  if (name.toLowerCase().includes(q)) return 100 + (name.toLowerCase().startsWith(q) ? 50 : 0);

  // Fuzzy: all chars must appear in order
  let qi = 0;
  let consecutive = 0;
  let score = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      consecutive++;
      score += consecutive * 2;
      qi++;
    } else {
      consecutive = 0;
    }
  }
  if (qi < q.length) return -1; // not all chars matched
  return score;
}

// ── File type icon ─────────────────────────────────────────────────────────────

function extColor(ext?: string): string {
  switch (ext) {
    case "ts": case "tsx": return "var(--accent)";
    case "js": case "jsx": return "#f0db4f";
    case "py": return "#3572A5";
    case "md": return "var(--text-dim)";
    case "json": return "#cbcb41";
    case "css": return "#563d7c";
    case "html": return "#e34c26";
    case "sh": case "bash": return "var(--text-dimmer)";
    default: return "var(--text-dimmer)";
  }
}

// ── Keybind pill ──────────────────────────────────────────────────────────────

function KeyPill({ keybind }: { keybind: string }) {
  return (
    <span style={{
      fontFamily: "var(--font)",
      fontSize: 10,
      color: "var(--text-dimmer)",
      background: "rgba(255,255,255,0.05)",
      border: "1px solid var(--border-dim)",
      borderRadius: 3,
      padding: "1px 5px",
      flexShrink: 0,
      letterSpacing: "0.02em",
    }}>
      {keybind}
    </span>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      height: 24,
      padding: "0 12px",
      display: "flex",
      alignItems: "center",
      fontSize: 10,
      textTransform: "uppercase" as const,
      letterSpacing: "0.08em",
      color: "var(--text-dimmer)",
      userSelect: "none" as const,
      fontFamily: "var(--font-ui)",
    }}>
      {label}
    </div>
  );
}

// ── Result row ────────────────────────────────────────────────────────────────

function ResultRow({
  isActive,
  onClick,
  onMouseEnter,
  left,
  center,
  right,
}: {
  isActive: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  left: React.ReactNode;
  center: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div
      data-active={isActive}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        height: 40,
        padding: "0 12px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        background: isActive ? "var(--accent-bg)" : "transparent",
        borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
        transition: "background 0.05s",
      }}
    >
      {left}
      {center}
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

// ── CommandPalette ────────────────────────────────────────────────────────────

export default function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Mode detection: ">" prefix = commands-only, else file search
  const isCommandMode = query.startsWith(">");
  const filterQuery = isCommandMode ? query.slice(1).trim() : query.trim();

  const close = useCallback(() => {
    setQuery("");
    setActiveIdx(0);
    onClose();
  }, [onClose]);

  // Fetch file list on open
  useEffect(() => {
    if (!open) return;
    setRecentPaths(getRecentFiles());
    fetch("/api/files/list")
      .then(r => r.json())
      .then((d: { files?: FileItem[] }) => setFiles(d.files ?? []))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Build static commands list
  const COMMANDS: Command[] = [
    { id: "nav-home", section: "Navigation", label: "Home / Chat", description: "Go to chat", icon: <Home size={15} />, keybind: "⌘1", run: () => navigate("/") },
    { id: "nav-files", section: "Navigation", label: "File Explorer", description: "Browse project files", icon: <FolderTree size={15} />, keybind: "⌘2", run: () => navigate("/files") },
    { id: "nav-source-control", section: "Navigation", label: "Source Control", description: "View git changes", icon: <GitBranch size={15} />, keybind: "⌘3", run: () => navigate("/source-control") },
    { id: "nav-agents", section: "Navigation", label: "Agents", description: "Manage AI agents", icon: <Bot size={15} />, keybind: "⌘4", run: () => navigate("/agents") },
    { id: "nav-run", section: "Navigation", label: "Run", description: "Open run panel", icon: <Play size={15} />, run: () => navigate("/run") },
    { id: "nav-generate", section: "Navigation", label: "Generate", description: "Generate context files", icon: <FileText size={15} />, run: () => navigate("/generate") },
    { id: "nav-governance", section: "Navigation", label: "Governance", description: "View governance rules", icon: <Shield size={15} />, run: () => navigate("/governance") },
    { id: "nav-git", section: "Navigation", label: "Git", description: "View git history", icon: <GitBranch size={15} />, run: () => navigate("/git") },
    { id: "nav-settings", section: "Navigation", label: "Settings", description: "Open settings", icon: <Settings size={15} />, keybind: "⌘,", run: () => navigate("/settings") },
    { id: "action-new-session", section: "Actions", label: "New Chat Session", description: "Start a fresh chat", icon: <Plus size={15} />, run: () => window.dispatchEvent(new CustomEvent("studio:new-session")) },
    { id: "action-toggle-terminal", section: "Actions", label: "Toggle Terminal", description: "Show or hide the terminal", icon: <TerminalSquare size={15} />, keybind: "⌘`", run: () => window.dispatchEvent(new CustomEvent("studio:toggle-terminal")) },
    { id: "action-new-terminal", section: "Actions", label: "New Terminal", description: "Open a new terminal tab", icon: <Plus size={15} />, run: () => window.dispatchEvent(new CustomEvent("studio:new-terminal")) },
    { id: "action-open-project", section: "Actions", label: "Open Project...", description: "Pick a folder to open", icon: <FolderOpen size={15} />, run: async () => { const dir = await window.studio?.pickFolder(); if (dir) await window.studio?.setProjectDir(dir); } },
    { id: "action-toggle-thinking", section: "Actions", label: "Toggle Thinking", description: "Enable/disable extended thinking", icon: <Brain size={15} />, run: () => window.dispatchEvent(new CustomEvent("studio:toggle-thinking")) },
    { id: "action-toggle-plan", section: "Actions", label: "Toggle Plan Mode", description: "Plan before executing", icon: <Layout size={15} />, keybind: "⇧Tab", run: () => window.dispatchEvent(new CustomEvent("studio:toggle-plan")) },
    { id: "action-refresh-git", section: "Actions", label: "Refresh Git Status", description: "Refresh source control state", icon: <RefreshCw size={15} />, run: () => window.dispatchEvent(new CustomEvent("studio:refresh-git")) },
    { id: "action-open-diff", section: "Actions", label: "Open Diff Drawer", description: "Show file diff panel", icon: <Columns size={15} />, run: () => window.dispatchEvent(new CustomEvent("studio:open-diff")) },
    { id: "action-toggle-theme", section: "Actions", label: "Toggle Theme", description: "Switch between light and dark", icon: <Sun size={15} />, run: () => window.dispatchEvent(new CustomEvent("studio:toggle-theme")) },
  ];

  // Build result list
  const results: ResultItem[] = (() => {
    if (isCommandMode) {
      // Commands-only mode
      const matched = filterQuery
        ? COMMANDS.filter(c => c.label.toLowerCase().includes(filterQuery.toLowerCase()) || (c.description?.toLowerCase().includes(filterQuery.toLowerCase()) ?? false))
        : COMMANDS;
      return matched.map(cmd => ({ kind: "command" as const, cmd }));
    }

    if (!filterQuery) {
      // Empty query: show recent files first, then command hint
      const recent = recentPaths
        .map(p => files.find(f => f.path === p))
        .filter((f): f is FileItem => f !== undefined);
      return recent.map(file => ({ kind: "file" as const, file }));
    }

    // File search mode
    const scored = files
      .map(file => ({ file, score: fuzzyScore(filterQuery, file.path) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map(x => ({ kind: "file" as const, file: x.file }));
    return scored;
  })();

  useEffect(() => { setActiveIdx(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const item = results[activeIdx];
        if (!item) return;
        if (item.kind === "command") { item.cmd.run(); close(); }
        else { addRecentFile(item.file.path); navigate(`/files?path=${encodeURIComponent(item.file.path)}`); close(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, activeIdx, close, navigate]);

  useEffect(() => {
    const el = listRef.current?.querySelector("[data-active='true']") as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  if (!open) return null;

  // Group commands by section when in command mode
  const commandSections: Record<string, ResultItem[]> = {};
  if (isCommandMode || !filterQuery) {
    for (const item of results) {
      if (item.kind === "command") {
        const sec = item.cmd.section;
        if (!commandSections[sec]) commandSections[sec] = [];
        commandSections[sec].push(item);
      }
    }
  }

  const placeholder = isCommandMode
    ? "Run command..."
    : filterQuery
      ? "Search files..."
      : "Search files... (> for commands)";

  let globalIdx = 0;

  const renderCommandGroup = () =>
    Object.entries(commandSections).map(([section, items]) => (
      <div key={section}>
        <SectionHeader label={section} />
        {items.map(item => {
          if (item.kind !== "command") return null;
          const { cmd } = item;
          const idx = globalIdx++;
          const isActive = idx === activeIdx;
          return (
            <ResultRow
              key={cmd.id}
              isActive={isActive}
              onClick={() => { cmd.run(); close(); }}
              onMouseEnter={() => setActiveIdx(idx)}
              left={<span style={{ color: "var(--text-dimmer)", display: "flex", alignItems: "center", flexShrink: 0 }}>{cmd.icon}</span>}
              center={
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: "var(--text)", whiteSpace: "nowrap" }}>{cmd.label}</span>
                  {cmd.description && (
                    <span style={{ fontSize: 12, color: "var(--text-dimmer)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {cmd.description}
                    </span>
                  )}
                </span>
              }
              right={cmd.keybind ? <KeyPill keybind={cmd.keybind} /> : undefined}
            />
          );
        })}
      </div>
    ));

  const renderFileResults = () => {
    const fileItems = results.filter(r => r.kind === "file");
    if (!fileItems.length) return null;
    const label = !filterQuery && recentPaths.length ? "Recent Files" : "Files";
    return (
      <div>
        <SectionHeader label={label} />
        {fileItems.map(item => {
          if (item.kind !== "file") return null;
          const { file } = item;
          const idx = globalIdx++;
          const isActive = idx === activeIdx;
          const parts = file.path.split("/");
          const dir = parts.slice(0, -1).join("/");
          return (
            <ResultRow
              key={file.path}
              isActive={isActive}
              onClick={() => { addRecentFile(file.path); navigate(`/files?path=${encodeURIComponent(file.path)}`); close(); }}
              onMouseEnter={() => setActiveIdx(idx)}
              left={
                <File size={15} style={{ color: extColor(file.ext), flexShrink: 0 }} />
              }
              center={
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: "var(--text)", whiteSpace: "nowrap" }}>{file.name}</span>
                  {dir && (
                    <span style={{ fontSize: 11, color: "var(--text-dimmer)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {dir}
                    </span>
                  )}
                </span>
              }
            />
          );
        })}
      </div>
    );
  };

  const isEmpty = results.length === 0;

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        zIndex: 9000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "18%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 620,
          maxHeight: 500,
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Input row */}
        <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border-dim)" }}>
          {isCommandMode && (
            <span style={{
              padding: "0 0 0 14px",
              fontSize: 14,
              color: "var(--accent)",
              fontFamily: "var(--font-ui)",
              whiteSpace: "nowrap",
            }}>
              &gt;
            </span>
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={placeholder}
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              padding: isCommandMode ? "12px 14px 12px 6px" : "12px 14px",
              fontSize: 14,
              fontFamily: "var(--font-ui)",
              color: "var(--text)",
              outline: "none",
            }}
          />
          {!isCommandMode && (
            <span
              title="Command mode: type > to filter commands"
              style={{
                padding: "0 12px",
                fontSize: 11,
                color: "var(--text-dimmer)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
              onClick={() => { setQuery(">"); requestAnimationFrame(() => inputRef.current?.focus()); }}
            >
              <ChevronRight size={13} />
            </span>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
          {isEmpty ? (
            <div style={{
              padding: "24px 14px",
              fontSize: 13,
              color: "var(--text-dimmer)",
              textAlign: "center",
              fontFamily: "var(--font-ui)",
            }}>
              {filterQuery ? `No ${isCommandMode ? "commands" : "files"} match "${filterQuery}"` : "No recent files"}
            </div>
          ) : (
            isCommandMode ? renderCommandGroup() : renderFileResults()
          )}

          {/* Footer hint */}
          {!isEmpty && (
            <div style={{
              padding: "4px 12px 6px",
              fontSize: 10,
              color: "var(--text-dimmer)",
              borderTop: "1px solid var(--border-dim)",
              display: "flex",
              gap: 12,
              fontFamily: "var(--font-ui)",
              userSelect: "none",
            }}>
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>esc close</span>
              {!isCommandMode && <span style={{ marginLeft: "auto" }}>› for commands</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
