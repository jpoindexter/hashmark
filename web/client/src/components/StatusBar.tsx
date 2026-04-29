import { TerminalIcon, SettingsIcon, SunIcon, MoonIcon, OxideIcon } from "./ShellIcons";
import type { Session } from "../types";
import type { ViewMode } from "./MessageBubble";

const VIEW_MODE_ICONS: Record<ViewMode, string> = {
  verbose: "≡≡",
  normal: "≡",
  summary: "—",
};
const VIEW_MODE_TITLES: Record<ViewMode, string> = {
  verbose: "Tool output: verbose",
  normal: "Tool output: normal",
  summary: "Tool output: summary (text only)",
};

interface StatusBarProps {
  projectDir: string;
  activeSession: Session | null;
  theme: "dark" | "light" | "oxide";
  terminalOpen: boolean;
  viewMode: ViewMode;
  previewOpen: boolean;
  filesOpen: boolean;
  onPickProject: () => void;
  onToggleTerminal: () => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenConnect: () => void;
  onToggleViewMode: () => void;
  onTogglePreview: () => void;
  onToggleFiles: () => void;
}

export function StatusBar({
  projectDir, activeSession, theme, terminalOpen, viewMode, previewOpen, filesOpen,
  onPickProject, onToggleTerminal, onToggleTheme, onOpenSettings, onOpenConnect, onToggleViewMode, onTogglePreview, onToggleFiles,
}: StatusBarProps) {
  const dirName = projectDir.split("/").filter(Boolean).pop() ?? "";
  const tokens = activeSession
    ? (activeSession.input_tokens ?? 0) + (activeSession.output_tokens ?? 0)
    : 0;

  return (
    <div className="status-bar">
      <div className="status-left">
        {dirName && (
          <button className="status-item status-item-btn" onClick={onPickProject} title="Switch project (current: …/{dirName})">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity=".5"/>
            </svg>
            /{dirName}
          </button>
        )}
        {activeSession?.status === "running" && (
          <span className="status-item" style={{ color: "var(--accent)", fontSize: 10 }}>
            <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", marginRight: 4, animation: "dot-pulse 1.4s ease-in-out infinite" }} />
            running
          </span>
        )}
      </div>
      <div className="status-right">
        {tokens > 0 && (
          <span className="status-item" style={{ fontFamily: "var(--font-mono)" }}>
            {Math.round(tokens / 1000)}k tok
          </span>
        )}
        <button
          className={`status-item status-item-btn${filesOpen ? " active" : ""}`}
          onClick={onToggleFiles}
          title="Toggle files tray (⌘E)"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="2" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.1"/>
            <path d="M7 2v8" stroke="currentColor" strokeWidth="1.1"/>
            <path d="M3 5h2.5M3 7h2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity=".6"/>
          </svg>
        </button>
        <button
          className="status-item status-item-btn"
          onClick={onToggleViewMode}
          title={VIEW_MODE_TITLES[viewMode]}
          style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "-0.05em" }}
        >
          {VIEW_MODE_ICONS[viewMode]}
        </button>
        <button
          className={`status-item status-item-btn${terminalOpen ? " active" : ""}`}
          onClick={onToggleTerminal}
          title="Toggle terminal"
        >
          <TerminalIcon />
        </button>
        <button className="status-item status-item-btn" onClick={onToggleTheme} title="Toggle theme">
          {theme === "dark" ? <SunIcon /> : theme === "light" ? <OxideIcon /> : <MoonIcon />}
        </button>
        <button className="status-item status-item-btn" onClick={onOpenConnect} title="Connect provider">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.1"/>
            <path d="M6.5 3.5v6M3.5 6.5h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </button>
        <button
          className={`status-item status-item-btn${false ? " active" : ""}`}
          onClick={onOpenSettings}
          title="Settings"
        >
          <SettingsIcon />
        </button>
      </div>
    </div>
  );
}
