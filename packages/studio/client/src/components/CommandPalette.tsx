import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Home, FolderTree, GitBranch, Bot, Settings,
  Plus, TerminalSquare, FolderOpen, Sun,
} from "lucide-react";

interface Command {
  id: string;
  section: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  keybind?: string;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setQuery("");
    setActiveIdx(0);
    onClose();
  }, [onClose]);

  const run = useCallback((cmd: Command) => {
    cmd.run();
    close();
  }, [close]);

  const COMMANDS: Command[] = [
    {
      id: "nav-home",
      section: "Navigation",
      label: "Home / Chat",
      description: "Go to chat",
      icon: <Home size={16} />,
      keybind: "⌘1",
      run: () => navigate("/"),
    },
    {
      id: "nav-files",
      section: "Navigation",
      label: "File Explorer",
      description: "Browse project files",
      icon: <FolderTree size={16} />,
      keybind: "⌘2",
      run: () => navigate("/files"),
    },
    {
      id: "nav-source-control",
      section: "Navigation",
      label: "Source Control",
      description: "View git changes",
      icon: <GitBranch size={16} />,
      keybind: "⌘3",
      run: () => navigate("/source-control"),
    },
    {
      id: "nav-agents",
      section: "Navigation",
      label: "Agents",
      description: "Manage AI agents",
      icon: <Bot size={16} />,
      keybind: "⌘4",
      run: () => navigate("/agents"),
    },
    {
      id: "nav-settings",
      section: "Navigation",
      label: "Settings",
      description: "Open settings",
      icon: <Settings size={16} />,
      keybind: "⌘,",
      run: () => navigate("/settings"),
    },
    {
      id: "action-new-session",
      section: "Actions",
      label: "New Chat Session",
      description: "Start a fresh chat",
      icon: <Plus size={16} />,
      run: () => window.dispatchEvent(new CustomEvent("studio:new-session")),
    },
    {
      id: "action-toggle-terminal",
      section: "Actions",
      label: "Toggle Terminal",
      description: "Show or hide the terminal panel",
      icon: <TerminalSquare size={16} />,
      keybind: "⌘`",
      run: () => window.dispatchEvent(new CustomEvent("studio:toggle-terminal")),
    },
    {
      id: "action-open-project",
      section: "Actions",
      label: "Open Project...",
      description: "Pick a folder to open",
      icon: <FolderOpen size={16} />,
      run: async () => {
        const dir = await window.studio?.pickFolder();
        if (dir) await window.studio?.setProjectDir(dir);
      },
    },
    {
      id: "action-toggle-theme",
      section: "Actions",
      label: "Toggle Theme",
      description: "Switch between light and dark",
      icon: <Sun size={16} />,
      run: () => window.dispatchEvent(new CustomEvent("studio:toggle-theme")),
    },
  ];

  const filtered = query.trim()
    ? COMMANDS.filter(cmd => {
        const q = query.toLowerCase();
        return (
          cmd.label.toLowerCase().includes(q) ||
          (cmd.description?.toLowerCase().includes(q) ?? false)
        );
      })
    : COMMANDS;

  const sections = filtered.reduce<Record<string, Command[]>>((acc, cmd) => {
    if (!acc[cmd.section]) acc[cmd.section] = [];
    acc[cmd.section].push(cmd);
    return acc;
  }, {});

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[activeIdx];
        if (cmd) run(cmd);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, activeIdx, close, run]);

  // Scroll active row into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector("[data-active='true']") as HTMLElement | null;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  if (!open) return null;

  let globalIdx = 0;

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        zIndex: 9000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 600,
          maxHeight: 480,
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Type a command or search..."
          style={{
            width: "100%",
            border: "none",
            borderBottom: "1px solid var(--border-dim)",
            background: "transparent",
            padding: "12px 14px",
            fontSize: 14,
            fontFamily: "var(--font-ui)",
            color: "var(--text)",
            outline: "none",
            boxSizing: "border-box",
          }}
        />

        <div
          ref={listRef}
          style={{ overflowY: "auto", flex: 1 }}
        >
          {filtered.length === 0 ? (
            <div style={{
              padding: "20px 14px",
              fontSize: 13,
              color: "var(--text-dimmer)",
              textAlign: "center",
            }}>
              No commands match "{query}"
            </div>
          ) : (
            Object.entries(sections).map(([section, cmds]) => (
              <div key={section}>
                <div style={{
                  height: 24,
                  padding: "0 12px",
                  display: "flex",
                  alignItems: "center",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-dimmer)",
                  userSelect: "none",
                }}>
                  {section}
                </div>
                {cmds.map(cmd => {
                  const idx = globalIdx++;
                  const isActive = idx === activeIdx;
                  return (
                    <div
                      key={cmd.id}
                      data-active={isActive}
                      onClick={() => run(cmd)}
                      onMouseEnter={() => setActiveIdx(idx)}
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
                      <span style={{ color: "var(--text-dimmer)", display: "flex", alignItems: "center", flexShrink: 0 }}>
                        {cmd.icon}
                      </span>
                      <span style={{ fontSize: 13, color: "var(--text)", flexShrink: 0 }}>
                        {cmd.label}
                      </span>
                      {cmd.description && (
                        <span style={{ fontSize: 12, color: "var(--text-dimmer)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {cmd.description}
                        </span>
                      )}
                      <div style={{ flex: 1 }} />
                      {cmd.keybind && (
                        <span style={{
                          fontFamily: "var(--font)",
                          fontSize: 10,
                          color: "var(--text-dimmer)",
                          background: "var(--bg-4)",
                          border: "1px solid var(--border-dim)",
                          borderRadius: 3,
                          padding: "1px 5px",
                          flexShrink: 0,
                        }}>
                          {cmd.keybind}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
