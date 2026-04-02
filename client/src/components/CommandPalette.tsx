import { useState, useEffect, useRef, useCallback } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useNavigate } from "react-router-dom";
import {
  Home, FolderTree, GitBranch, Bot, Settings,
  Plus, TerminalSquare, FolderOpen, Sun,
  Play, FileText, Shield, Brain, Layout, RefreshCw, Columns,
} from "lucide-react";
import type { PaletteProps, Command, FileItem, SymbolItem, ResultItem } from "./command-palette/types";
import {
  getRecentFiles, addRecentFile, fetchFileList, fetchSymbols,
  getCurrentFilePath, buildResults, buildSymbolResults,
} from "./command-palette/types";
import PaletteInput from "./command-palette/PaletteInput";
import PaletteResults from "./command-palette/PaletteResults";

export { addRecentFile };

export default function CommandPalette({ open, onClose, mode = "files" }: PaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [symbols, setSymbols] = useState<SymbolItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, true);

  const isLineMode = !query.startsWith(">") && query.startsWith(":");
  const isSymbolMode = !query.startsWith(">") && query.startsWith("@");

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

  useEffect(() => {
    if (!open) return;
    setRecentPaths(getRecentFiles());
    fetchFileList().then(setFiles);
  }, [open]);

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

  useEffect(() => {
    if (!open) return;
    setQuery(mode === "commands" ? ">" : "");
    setActiveIdx(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
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

  const results: ResultItem[] = isLineMode
    ? [{ kind: "goto-line" as const }]
    : isSymbolMode
    ? buildSymbolResults(filterQuery, symbols)
    : buildResults(effectiveCommandMode, filterQuery, files, recentPaths, COMMANDS);

  useEffect(() => { setActiveIdx(0); }, [query]);

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
        zIndex: 3000,
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
          boxShadow: "var(--shadow-lg)",
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
