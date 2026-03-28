import { useState, useEffect, useRef, useCallback } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useNavigate } from "react-router-dom";
import { fetchApi } from "../lib/api";
import {
  Home, FolderTree, GitBranch, Bot, Settings,
  Plus, TerminalSquare, FolderOpen, Sun,
  Play, FileText, Shield, Brain, Layout, RefreshCw, Columns,
  File, ChevronRight, Clock, Hash, Code,
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

interface SymbolItem {
  name: string;
  kind: "function" | "class" | "const" | "interface" | "type" | "method" | "variable";
  line: number;
}

type PaletteMode = "commands" | "files";

type ResultItem =
  | { kind: "command"; cmd: Command }
  | { kind: "file"; file: FileItem; section: "recent" | "files" }
  | { kind: "symbol"; symbol: SymbolItem }
  | { kind: "goto-line" };

interface Props {
  open: boolean;
  onClose: () => void;
  mode?: PaletteMode;
}

// ── Recent files ──────────────────────────────────────────────────────────────

const RECENT_KEY = "studio:recent_files";
const MAX_RECENT = 10;

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
  } catch { /* noop */ }
}

// Listen for file opens from anywhere in the app to track recents
if (typeof window !== "undefined") {
  window.addEventListener("studio:open-file", ((e: CustomEvent) => {
    const path = typeof e.detail === "string" ? e.detail : e.detail?.path;
    if (path) addRecentFile(path);
  }) as EventListener);
}

// ── Fuzzy scoring + match indices ─────────────────────────────────────────────

interface FuzzyResult {
  score: number;
  indices: number[];
}

function fuzzyMatch(query: string, target: string): FuzzyResult {
  if (!query) return { score: 1, indices: [] };
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact substring in filename = highest score
  const name = target.split("/").pop() ?? target;
  const nameLower = name.toLowerCase();
  const nameStart = target.length - name.length;
  const subIdx = nameLower.indexOf(q);
  if (subIdx !== -1) {
    const indices = Array.from({ length: q.length }, (_, i) => nameStart + subIdx + i);
    return { score: 100 + (subIdx === 0 ? 50 : 0), indices };
  }

  // Fuzzy: all chars must appear in order
  let qi = 0;
  let consecutive = 0;
  let score = 0;
  const indices: number[] = [];
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      consecutive++;
      score += consecutive * 2;
      indices.push(ti);
      qi++;
    } else {
      consecutive = 0;
    }
  }
  if (qi < q.length) return { score: -1, indices: [] };
  return { score, indices };
}

// ── Highlighted text ──────────────────────────────────────────────────────────

function HighlightedText({
  text,
  indices,
  style,
}: {
  text: string;
  indices: number[];
  style?: React.CSSProperties;
}) {
  if (!indices.length) return <span style={style}>{text}</span>;

  const set = new Set(indices);
  const parts: React.ReactNode[] = [];
  let run = "";
  let runHighlighted = false;

  for (let i = 0; i <= text.length; i++) {
    const isMatch = set.has(i);
    if (i === text.length || isMatch !== runHighlighted) {
      if (run) {
        parts.push(
          runHighlighted
            ? <span key={i} style={{ fontWeight: 700, color: "var(--accent)" }}>{run}</span>
            : <span key={i}>{run}</span>,
        );
      }
      run = i < text.length ? text[i] : "";
      runHighlighted = isMatch;
    } else {
      run += text[i];
    }
  }
  if (run) {
    parts.push(
      runHighlighted
        ? <span key="end" style={{ fontWeight: 700, color: "var(--accent)" }}>{run}</span>
        : <span key="end">{run}</span>,
    );
  }

  return <span style={style}>{parts}</span>;
}

// ── File type icon color ──────────────────────────────────────────────────────

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
      background: "var(--surface-dim)",
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
        height: 36,
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

// ── File cache ────────────────────────────────────────────────────────────────
// Cache files for the browser session so reopening the palette is instant.

let fileCache: FileItem[] | null = null;
let fileFetchPromise: Promise<FileItem[]> | null = null;

function fetchFileList(): Promise<FileItem[]> {
  if (fileCache) return Promise.resolve(fileCache);
  if (fileFetchPromise) return fileFetchPromise;
  fileFetchPromise = fetchApi("/api/files/list")
    .then(r => r.json())
    .then((d: { files?: FileItem[] }) => {
      fileCache = d.files ?? [];
      fileFetchPromise = null;
      return fileCache;
    })
    .catch(() => {
      fileFetchPromise = null;
      return [] as FileItem[];
    });
  return fileFetchPromise;
}

// Invalidate on project change so we refetch
if (typeof window !== "undefined") {
  window.addEventListener("studio:project-changed", () => {
    fileCache = null;
    fileFetchPromise = null;
  });
}

// ── Symbol cache ──────────────────────────────────────────────────────────────

let symbolCache: Map<string, SymbolItem[]> = new Map();

function fetchSymbols(filepath: string): Promise<SymbolItem[]> {
  if (symbolCache.has(filepath)) return Promise.resolve(symbolCache.get(filepath)!);
  return fetchApi(`/api/files/symbols?path=${encodeURIComponent(filepath)}`)
    .then(r => r.json())
    .then((d: { symbols?: SymbolItem[] }) => {
      const syms = d.symbols ?? [];
      symbolCache.set(filepath, syms);
      return syms;
    })
    .catch(() => []);
}

// Invalidate symbol cache on project change
if (typeof window !== "undefined") {
  window.addEventListener("studio:project-changed", () => {
    symbolCache = new Map();
  });
}

// ── Detect current file from URL ─────────────────────────────────────────────

function getCurrentFilePath(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("path");
}

// ── CommandPalette ────────────────────────────────────────────────────────────

export default function CommandPalette({ open, onClose, mode = "files" }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [files, setFiles] = useState<FileItem[]>(fileCache ?? []);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [symbols, setSymbols] = useState<SymbolItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, true);

  // Detect special modes from prefix characters
  const isLineMode = !query.startsWith(">") && query.startsWith(":");
  const isSymbolMode = !query.startsWith(">") && query.startsWith("@");

  // Command mode = opened as commands OR user typed ">" prefix in file mode
  const effectiveCommandMode = mode === "commands" || query.startsWith(">");
  const filterQuery = effectiveCommandMode
    ? (query.startsWith(">") ? query.slice(1).trim() : query.trim())
    : isLineMode
    ? query.slice(1).trim()
    : isSymbolMode
    ? query.slice(1).trim()
    : query.trim();

  const close = useCallback(() => {
    setQuery("");
    setActiveIdx(0);
    onClose();
  }, [onClose]);

  // Fetch file list on open, using session cache
  useEffect(() => {
    if (!open) return;
    setRecentPaths(getRecentFiles());
    fetchFileList().then(setFiles);
  }, [open]);

  // Fetch symbols when entering symbol mode
  useEffect(() => {
    if (!open || !isSymbolMode) {
      setSymbols([]);
      return;
    }
    const currentFile = getCurrentFilePath();
    if (!currentFile) {
      setSymbols([]);
      return;
    }
    fetchSymbols(currentFile).then(setSymbols);
  }, [open, isSymbolMode]);

  // Reset query/index when opening, seed ">" for command mode
  useEffect(() => {
    if (!open) return;
    setQuery(mode === "commands" ? ">" : "");
    setActiveIdx(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      // Place cursor after ">" in command mode
      if (mode === "commands" && inputRef.current) {
        inputRef.current.setSelectionRange(1, 1);
      }
    });
  }, [open, mode]);

  const openFile = useCallback((path: string) => {
    addRecentFile(path);
    window.dispatchEvent(new CustomEvent("studio:open-file", { detail: { path } }));
    navigate(`/files?path=${encodeURIComponent(path)}`);
    close();
  }, [navigate, close]);

  const goToLine = useCallback((lineNum: number) => {
    window.dispatchEvent(new CustomEvent("studio:go-to-line", { detail: { line: lineNum } }));
    close();
  }, [close]);

  const goToSymbol = useCallback((symbol: SymbolItem) => {
    window.dispatchEvent(new CustomEvent("studio:go-to-line", { detail: { line: symbol.line } }));
    close();
  }, [close]);

  // Build static commands list
  const COMMANDS: Command[] = [
    { id: "nav-home", section: "Navigation", label: "Home / Chat", description: "Go to chat", icon: <Home size={15} />, keybind: "\u23181", run: () => navigate("/") },
    { id: "nav-files", section: "Navigation", label: "File Explorer", description: "Browse project files", icon: <FolderTree size={15} />, keybind: "\u2318\u21E7E", run: () => navigate("/files") },
    { id: "nav-source-control", section: "Navigation", label: "Source Control", description: "View git changes", icon: <GitBranch size={15} />, keybind: "\u2318\u21E7G", run: () => navigate("/source-control") },
    { id: "nav-agents", section: "Navigation", label: "Agents", description: "Manage AI agents", icon: <Bot size={15} />, keybind: "\u2318\u21E7A", run: () => navigate("/agents") },
    { id: "nav-run", section: "Navigation", label: "Run", description: "Open run panel", icon: <Play size={15} />, run: () => navigate("/run") },
    { id: "nav-generate", section: "Navigation", label: "Generate", description: "Generate context files", icon: <FileText size={15} />, run: () => navigate("/generate") },
    { id: "nav-governance", section: "Navigation", label: "Governance", description: "View governance rules", icon: <Shield size={15} />, run: () => navigate("/governance") },
    { id: "nav-git", section: "Navigation", label: "Git", description: "View git history", icon: <GitBranch size={15} />, run: () => navigate("/git") },
    { id: "nav-settings", section: "Navigation", label: "Settings", description: "Open settings", icon: <Settings size={15} />, keybind: "\u2318,", run: () => navigate("/settings") },
    { id: "action-new-session", section: "Actions", label: "New Chat Session", description: "Start a fresh chat", icon: <Plus size={15} />, run: () => window.dispatchEvent(new CustomEvent("studio:new-session")) },
    { id: "action-toggle-terminal", section: "Actions", label: "Toggle Terminal", description: "Show or hide the terminal", icon: <TerminalSquare size={15} />, keybind: "\u2318`", run: () => window.dispatchEvent(new CustomEvent("studio:toggle-terminal")) },
    { id: "action-new-terminal", section: "Actions", label: "New Terminal", description: "Open a new terminal tab", icon: <Plus size={15} />, run: () => window.dispatchEvent(new CustomEvent("studio:new-terminal")) },
    { id: "action-open-project", section: "Actions", label: "Open Project...", description: "Pick a folder to open", icon: <FolderOpen size={15} />, run: async () => { const dir = await window.studio?.pickFolder(); if (dir) await window.studio?.setProjectDir(dir); } },
    { id: "action-toggle-thinking", section: "Actions", label: "Toggle Thinking", description: "Enable/disable extended thinking", icon: <Brain size={15} />, run: () => window.dispatchEvent(new CustomEvent("studio:toggle-thinking")) },
    { id: "action-toggle-plan", section: "Actions", label: "Toggle Plan Mode", description: "Plan before executing", icon: <Layout size={15} />, keybind: "\u21E7Tab", run: () => window.dispatchEvent(new CustomEvent("studio:toggle-plan")) },
    { id: "action-refresh-git", section: "Actions", label: "Refresh Git Status", description: "Refresh source control state", icon: <RefreshCw size={15} />, run: () => window.dispatchEvent(new CustomEvent("studio:refresh-git")) },
    { id: "action-open-diff", section: "Actions", label: "Open Diff Drawer", description: "Show file diff panel", icon: <Columns size={15} />, run: () => window.dispatchEvent(new CustomEvent("studio:open-diff")) },
    { id: "action-toggle-theme", section: "Actions", label: "Toggle Theme", description: "Switch between light and dark", icon: <Sun size={15} />, run: () => window.dispatchEvent(new CustomEvent("studio:toggle-theme")) },
  ];

  // Build result list
  const results: ResultItem[] = isLineMode
    ? [{ kind: "goto-line" as const }]
    : isSymbolMode
    ? buildSymbolResults(filterQuery, symbols)
    : buildResults(effectiveCommandMode, filterQuery, files, recentPaths, COMMANDS);

  useEffect(() => { setActiveIdx(0); }, [query]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        if (isLineMode) {
          const num = parseInt(filterQuery, 10);
          if (num > 0) goToLine(num);
          return;
        }
        const item = results[activeIdx];
        if (!item) return;
        if (item.kind === "command") { item.cmd.run(); close(); }
        else if (item.kind === "file") { openFile(item.file.path); }
        else if (item.kind === "symbol") { goToSymbol(item.symbol); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, activeIdx, close, openFile, goToLine, goToSymbol, isLineMode, filterQuery]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector("[data-active='true']") as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  if (!open) return null;

  const placeholder = effectiveCommandMode
    ? "Type a command..."
    : isLineMode
    ? "Go to Line..."
    : isSymbolMode
    ? "Go to Symbol..."
    : "Search files by name...";

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay-bg)",
        backdropFilter: "blur(4px)",
        zIndex: 9000,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "18%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 600,
          maxHeight: "calc(24px + 36px + 20 * 36px)",
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <PaletteInput
          inputRef={inputRef}
          query={query}
          onQueryChange={setQuery}
          isCommandMode={effectiveCommandMode}
          isLineMode={isLineMode}
          isSymbolMode={isSymbolMode}
          placeholder={placeholder}
        />

        <PaletteResults
          listRef={listRef}
          results={results}
          activeIdx={activeIdx}
          onActiveIdxChange={setActiveIdx}
          isCommandMode={effectiveCommandMode}
          isLineMode={isLineMode}
          isSymbolMode={isSymbolMode}
          filterQuery={filterQuery}
          recentPaths={recentPaths}
          onSelectCommand={(cmd) => { cmd.run(); close(); }}
          onSelectFile={openFile}
          onSelectSymbol={goToSymbol}
          onGoToLine={goToLine}
        />
      </div>
    </div>
  );
}

// ── Build results ─────────────────────────────────────────────────────────────

function buildResults(
  isCommandMode: boolean,
  filterQuery: string,
  files: FileItem[],
  recentPaths: string[],
  commands: Command[],
): ResultItem[] {
  if (isCommandMode) {
    const matched = filterQuery
      ? commands.filter(c =>
          c.label.toLowerCase().includes(filterQuery.toLowerCase()) ||
          (c.description?.toLowerCase().includes(filterQuery.toLowerCase()) ?? false),
        )
      : commands;
    return matched.map(cmd => ({ kind: "command" as const, cmd }));
  }

  // File mode with no query: show recent files
  if (!filterQuery) {
    const recent = recentPaths
      .map(p => files.find(f => f.path === p))
      .filter((f): f is FileItem => f !== undefined)
      .slice(0, MAX_RECENT);
    return recent.map(file => ({ kind: "file" as const, file, section: "recent" as const }));
  }

  // File mode with query: fuzzy search, but boost recent files
  const recentSet = new Set(recentPaths);
  return files
    .map(file => ({ file, match: fuzzyMatch(filterQuery, file.path) }))
    .filter(x => x.match.score > 0)
    .sort((a, b) => {
      // Recent files that match get a boost
      const aRecent = recentSet.has(a.file.path) ? 1000 : 0;
      const bRecent = recentSet.has(b.file.path) ? 1000 : 0;
      return (b.match.score + bRecent) - (a.match.score + aRecent);
    })
    .slice(0, 20)
    .map(x => ({
      kind: "file" as const,
      file: x.file,
      section: recentSet.has(x.file.path) ? "recent" as const : "files" as const,
    }));
}

// ── Build symbol results ──────────────────────────────────────────────────────

function buildSymbolResults(filterQuery: string, symbols: SymbolItem[]): ResultItem[] {
  if (!filterQuery) {
    return symbols.map(symbol => ({ kind: "symbol" as const, symbol }));
  }
  return symbols
    .filter(s => s.name.toLowerCase().includes(filterQuery.toLowerCase()))
    .map(symbol => ({ kind: "symbol" as const, symbol }));
}

// ── Input row ─────────────────────────────────────────────────────────────────

function PaletteInput({
  inputRef,
  query,
  onQueryChange,
  isCommandMode,
  isLineMode,
  isSymbolMode,
  placeholder,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (q: string) => void;
  isCommandMode: boolean;
  isLineMode: boolean;
  isSymbolMode: boolean;
  placeholder: string;
}) {
  const hasPrefix = isCommandMode || isLineMode || isSymbolMode;
  const prefixChar = isCommandMode ? ">" : isLineMode ? ":" : isSymbolMode ? "@" : "";
  const prefixColor = isCommandMode ? "var(--accent)" : "var(--text-dimmer)";

  // Strip the prefix char from the displayed value
  const displayValue = hasPrefix && query.length > 0 ? query.slice(1) : query;

  return (
    <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border-dim)" }}>
      {hasPrefix && (
        <span style={{
          padding: "0 0 0 14px",
          fontSize: 14,
          color: prefixColor,
          fontFamily: "var(--font-ui)",
          whiteSpace: "nowrap",
        }}>
          {prefixChar}
        </span>
      )}
      <input
        ref={inputRef}
        value={displayValue}
        onChange={e => {
          if (hasPrefix) {
            onQueryChange(prefixChar + e.target.value);
          } else {
            onQueryChange(e.target.value);
          }
        }}
        placeholder={placeholder}
        style={{
          flex: 1,
          border: "none",
          background: "transparent",
          padding: hasPrefix ? "12px 14px 12px 6px" : "12px 14px",
          fontSize: 14,
          fontFamily: "var(--font-ui)",
          color: "var(--text)",
          outline: "none",
        }}
      />
      {!hasPrefix && (
        <span
          title="Switch to command mode"
          style={{
            padding: "0 12px",
            fontSize: 11,
            color: "var(--text-dimmer)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 3,
          }}
          onClick={() => {
            onQueryChange(">");
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <ChevronRight size={13} />
        </span>
      )}
    </div>
  );
}

// ── Symbol kind icon ──────────────────────────────────────────────────────────

function symbolKindIcon(kind: SymbolItem["kind"]): React.ReactNode {
  switch (kind) {
    case "function": case "method":
      return <Code size={15} style={{ color: "var(--accent)" }} />;
    case "class": case "interface": case "type":
      return <Hash size={15} style={{ color: "#c586c0" }} />;
    case "const": case "variable":
      return <Hash size={15} style={{ color: "#4fc1ff" }} />;
    default:
      return <Code size={15} style={{ color: "var(--text-dimmer)" }} />;
  }
}

// ── Results panel ─────────────────────────────────────────────────────────────

function PaletteResults({
  listRef,
  results,
  activeIdx,
  onActiveIdxChange,
  isCommandMode,
  isLineMode,
  isSymbolMode,
  filterQuery,
  recentPaths,
  onSelectCommand,
  onSelectFile,
  onSelectSymbol,
  onGoToLine,
}: {
  listRef: React.RefObject<HTMLDivElement | null>;
  results: ResultItem[];
  activeIdx: number;
  onActiveIdxChange: (idx: number) => void;
  isCommandMode: boolean;
  isLineMode: boolean;
  isSymbolMode: boolean;
  filterQuery: string;
  recentPaths: string[];
  onSelectCommand: (cmd: Command) => void;
  onSelectFile: (path: string) => void;
  onSelectSymbol: (symbol: SymbolItem) => void;
  onGoToLine: (line: number) => void;
}) {
  const isEmpty = results.length === 0;

  // Group commands by section
  const commandSections: Record<string, Command[]> = {};
  if (isCommandMode) {
    for (const item of results) {
      if (item.kind === "command") {
        const sec = item.cmd.section;
        if (!commandSections[sec]) commandSections[sec] = [];
        commandSections[sec].push(item.cmd);
      }
    }
  }

  let globalIdx = 0;

  // Line mode rendering
  if (isLineMode) {
    const lineNum = parseInt(filterQuery, 10);
    const isValid = lineNum > 0;
    return (
      <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
        <SectionHeader label="Go to Line" />
        <ResultRow
          isActive={true}
          onClick={() => { if (isValid) onGoToLine(lineNum); }}
          onMouseEnter={() => {}}
          left={<Hash size={15} style={{ color: "var(--text-dimmer)", flexShrink: 0 }} />}
          center={
            <span style={{ fontSize: 13, color: isValid ? "var(--text)" : "var(--text-dimmer)" }}>
              {isValid ? `Go to line ${lineNum}` : "Type a line number..."}
            </span>
          }
          right={isValid ? <KeyPill keybind="Enter" /> : undefined}
        />
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
          <span>Enter to go</span>
          <span>Esc to close</span>
          <span style={{ marginLeft: "auto" }}>Backspace for files</span>
        </div>
      </div>
    );
  }

  // Symbol mode rendering
  if (isSymbolMode) {
    const currentFile = getCurrentFilePath();
    if (!currentFile) {
      return (
        <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
          <div style={{
            padding: "24px 14px",
            fontSize: 13,
            color: "var(--text-dimmer)",
            textAlign: "center",
            fontFamily: "var(--font-ui)",
          }}>
            No file is currently open
          </div>
        </div>
      );
    }

    const symbolItems = results.filter((r): r is ResultItem & { kind: "symbol" } => r.kind === "symbol");

    return (
      <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
        {symbolItems.length === 0 ? (
          <div style={{
            padding: "24px 14px",
            fontSize: 13,
            color: "var(--text-dimmer)",
            textAlign: "center",
            fontFamily: "var(--font-ui)",
          }}>
            {filterQuery ? `No symbols match "${filterQuery}"` : "No symbols found in this file"}
          </div>
        ) : (
          <>
            <SectionHeader label="Symbols" />
            {symbolItems.map((item, i) => (
              <ResultRow
                key={`${item.symbol.name}-${item.symbol.line}`}
                isActive={i === activeIdx}
                onClick={() => onSelectSymbol(item.symbol)}
                onMouseEnter={() => onActiveIdxChange(i)}
                left={symbolKindIcon(item.symbol.kind)}
                center={
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: "var(--text)", whiteSpace: "nowrap" }}>{item.symbol.name}</span>
                    <span style={{ fontSize: 11, color: "var(--text-dimmer)" }}>{item.symbol.kind}</span>
                  </span>
                }
                right={
                  <span style={{ fontSize: 11, color: "var(--text-dimmer)", flexShrink: 0 }}>
                    :{item.symbol.line}
                  </span>
                }
              />
            ))}
          </>
        )}
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
          <span>Enter to go</span>
          <span>Esc to close</span>
          <span style={{ marginLeft: "auto" }}>Backspace for files</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
      {isEmpty ? (
        <div style={{
          padding: "24px 14px",
          fontSize: 13,
          color: "var(--text-dimmer)",
          textAlign: "center",
          fontFamily: "var(--font-ui)",
        }}>
          {filterQuery
            ? `No ${isCommandMode ? "commands" : "files"} match "${filterQuery}"`
            : isCommandMode ? "No commands available" : "No recent files"}
        </div>
      ) : isCommandMode ? (
        Object.entries(commandSections).map(([section, cmds]) => (
          <div key={section}>
            <SectionHeader label={section} />
            {cmds.map(cmd => {
              const idx = globalIdx++;
              return (
                <ResultRow
                  key={cmd.id}
                  isActive={idx === activeIdx}
                  onClick={() => onSelectCommand(cmd)}
                  onMouseEnter={() => onActiveIdxChange(idx)}
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
        ))
      ) : (
        <FileResultsList
          results={results as Array<ResultItem & { kind: "file" }>}
          activeIdx={activeIdx}
          onActiveIdxChange={onActiveIdxChange}
          onSelectFile={onSelectFile}
          filterQuery={filterQuery}
          hasRecent={recentPaths.length > 0}
          globalIdxStart={0}
        />
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
          <span>Enter to select</span>
          <span>Esc to close</span>
          {!isCommandMode && <span style={{ marginLeft: "auto" }}>&gt; commands &nbsp; : line &nbsp; @ symbol</span>}
          {isCommandMode && <span style={{ marginLeft: "auto" }}>Backspace for files</span>}
        </div>
      )}
    </div>
  );
}

// ── File results list ─────────────────────────────────────────────────────────

function FileResultsList({
  results,
  activeIdx,
  onActiveIdxChange,
  onSelectFile,
  filterQuery,
  hasRecent,
  globalIdxStart,
}: {
  results: Array<ResultItem & { kind: "file" }>;
  activeIdx: number;
  onActiveIdxChange: (idx: number) => void;
  onSelectFile: (path: string) => void;
  filterQuery: string;
  hasRecent: boolean;
  globalIdxStart: number;
}) {
  // Split results into recent and non-recent groups
  const recentItems = results.filter(r => r.section === "recent");
  const fileItems = results.filter(r => r.section === "files");
  const showRecentHeader = recentItems.length > 0;
  const showFilesHeader = fileItems.length > 0 && (showRecentHeader || !filterQuery);

  let runningIdx = globalIdxStart;

  return (
    <div>
      {showRecentHeader && <SectionHeader label="Recent" />}
      {!showRecentHeader && filterQuery && <SectionHeader label="Files" />}
      {!showRecentHeader && !filterQuery && !showFilesHeader && <SectionHeader label="Recent" />}

      {recentItems.map((item) => {
        const { file } = item;
        const idx = runningIdx++;
        const isActive = idx === activeIdx;
        const parts = file.path.split("/");
        const dir = parts.slice(0, -1).join("/");
        const match = filterQuery ? fuzzyMatch(filterQuery, file.path) : null;
        const nameStart = file.path.length - file.name.length;
        const nameIndices = match
          ? match.indices.filter(j => j >= nameStart).map(j => j - nameStart)
          : [];

        return (
          <ResultRow
            key={file.path}
            isActive={isActive}
            onClick={() => onSelectFile(file.path)}
            onMouseEnter={() => onActiveIdxChange(idx)}
            left={<Clock size={15} style={{ color: "var(--text-dimmer)", flexShrink: 0 }} />}
            center={
              <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <HighlightedText
                  text={file.name}
                  indices={nameIndices}
                  style={{ fontSize: 13, color: "var(--text)", whiteSpace: "nowrap" }}
                />
                {dir && (
                  <span style={{ fontSize: 11, color: "var(--text-dimmer)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {dir}
                  </span>
                )}
              </span>
            }
            right={
              <span style={{
                fontSize: 10,
                color: "var(--text-dimmer)",
                fontFamily: "var(--font-ui)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}>
                recent
              </span>
            }
          />
        );
      })}

      {showFilesHeader && <SectionHeader label="Files" />}

      {fileItems.map((item) => {
        const { file } = item;
        const idx = runningIdx++;
        const isActive = idx === activeIdx;
        const parts = file.path.split("/");
        const dir = parts.slice(0, -1).join("/");
        const match = filterQuery ? fuzzyMatch(filterQuery, file.path) : null;
        const nameStart = file.path.length - file.name.length;
        const nameIndices = match
          ? match.indices.filter(j => j >= nameStart).map(j => j - nameStart)
          : [];

        return (
          <ResultRow
            key={file.path}
            isActive={isActive}
            onClick={() => onSelectFile(file.path)}
            onMouseEnter={() => onActiveIdxChange(idx)}
            left={<File size={15} style={{ color: extColor(file.ext), flexShrink: 0 }} />}
            center={
              <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <HighlightedText
                  text={file.name}
                  indices={nameIndices}
                  style={{ fontSize: 13, color: "var(--text)", whiteSpace: "nowrap" }}
                />
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
}
