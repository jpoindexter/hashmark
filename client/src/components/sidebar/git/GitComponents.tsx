import { useState, useRef } from "react";
import type { GitFile, OutgoingCommit } from "./types";
import { STATUS_COLOR } from "./types";

// --- FileTypeIcon ---

export function FileTypeIcon({ filename }: { filename: string }) {
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".") + 1).toLowerCase() : "";
  const base = filename.toLowerCase();

  const isConfig = base.endsWith(".config.ts") || base.endsWith(".config.js") || base.endsWith(".config.mjs") ||
    base.startsWith(".env") || base === "tsconfig.json" || base === "vite.config.ts" ||
    base === "tailwind.config.ts" || base === "next.config.ts" || base === "next.config.js";

  if (isConfig) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, flexShrink: 0 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-dimmer)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </span>
    );
  }

  const EXT_COLORS: Record<string, string> = {
    ts: "#3178c6", tsx: "#3178c6", js: "#f7df1e", jsx: "#f7df1e",
    css: "#264de4", scss: "#c6538c", html: "#e44d26",
    json: "#5b5b5b", md: "#5b5b5b", yaml: "#5b5b5b", yml: "#5b5b5b",
    py: "#3572A5", rs: "#dea584", go: "#00ADD8",
    sh: "#89e051", bash: "#89e051", zsh: "#89e051",
    sql: "#e38c00", prisma: "#2D3748",
    svg: "#ffb13b", png: "#a259ff", jpg: "#a259ff", gif: "#a259ff",
    lock: "#5b5b5b", toml: "#5b5b5b",
  };

  const color = EXT_COLORS[ext] ?? "var(--text-dimmer)";
  const label = ext ? ext.slice(0, 3).toUpperCase() : "";

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 16, height: 16, flexShrink: 0,
      fontSize: 8, fontWeight: 600, fontFamily: "var(--font)",
      color, letterSpacing: "0.02em",
    }}>
      {label}
    </span>
  );
}

// --- StatusBadge ---

export function StatusBadge({ status }: { status: string }) {
  const char = status === "?" ? "U" : status[0] ?? "?";
  const displayChar = char === "?" ? "U" : char;
  const colorKey = char === "?" ? "U" : char;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 16, height: 16, fontSize: 11, fontWeight: 600,
      color: STATUS_COLOR[colorKey] ?? "var(--text-dimmer)",
      flexShrink: 0, fontFamily: "var(--font)", textAlign: "center",
    }}>
      {displayChar}
    </span>
  );
}

// --- HeaderIconBtn ---

export function HeaderIconBtn({ title, onClick, children }: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button title={title} aria-label={title} onClick={onClick} className="btn-icon"
      style={{ background: "transparent", border: "none", color: "var(--text-dimmer)", width: 20, height: 20, borderRadius: "var(--radius-sm)", padding: 0, flexShrink: 0 }}>
      {children}
    </button>
  );
}

// --- ActionBtn ---

export function ActionBtn({ label, title, color, onClick }: {
  label: string; title: string; color?: string; onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button title={title} onClick={onClick} className="btn-icon"
      style={{ background: "transparent", border: "none", color: color ?? "var(--text-dimmer)", fontFamily: "var(--font)", fontSize: 12, fontWeight: 600, lineHeight: 1, width: 16, height: 16, borderRadius: "var(--radius-sm)", flexShrink: 0, padding: 0 }}>
      {label}
    </button>
  );
}

// --- SectionHeader ---

export function SectionHeader({ label, count, expanded, onToggle, actions }: {
  label: string; count: number; expanded: boolean; onToggle: () => void; actions?: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onToggle} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className="hoverable"
      style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px 4px 6px", background: "transparent", userSelect: "none", flexShrink: 0 }}>
      <span style={{ fontSize: 8, color: "var(--text-dimmer)", fontFamily: "var(--font)", display: "inline-block", transition: "transform 0.1s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>
        {"\u25B6"}
      </span>
      <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font)", letterSpacing: "0.06em", flex: 1 }}>
        {label}
      </span>
      <span style={{ fontSize: 9, color: "var(--text-dimmer)", fontFamily: "var(--font)", background: "var(--bg-3)", borderRadius: 10, padding: "0px 5px", flexShrink: 0 }}>
        {count}
      </span>
      {hover && actions && (
        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 1, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}

// --- ChangedFileRow ---

export function ChangedFileRow({ f, isSelected, isStaged, busy, onClick, onStage, onUnstage, onDiscard }: {
  f: GitFile; isSelected: boolean; isStaged: boolean; busy: boolean;
  onClick: (e: React.MouseEvent) => void; onStage: (e: React.MouseEvent) => void; onUnstage: (e: React.MouseEvent) => void; onDiscard?: (e: React.MouseEvent) => void;
}) {
  const actionsRef = useRef<HTMLDivElement>(null);
  const displayStatus = isStaged ? f.x : f.isUntracked ? "?" : f.y;
  const filename = f.file.split("/").pop() ?? f.file;
  const dir = f.file.includes("/") ? f.file.slice(0, f.file.lastIndexOf("/")) : "";
  const isDeleted = displayStatus === "D";

  return (
    <div onClick={onClick} className={isSelected ? undefined : "hoverable"}
      onMouseEnter={() => { if (actionsRef.current) actionsRef.current.style.opacity = "1"; }}
      onMouseLeave={() => { if (actionsRef.current) actionsRef.current.style.opacity = "0"; }}
      style={{
        display: "flex", alignItems: "center", gap: 4, height: 22, paddingLeft: 16, paddingRight: 6,
        cursor: "pointer", fontSize: 12, fontFamily: "var(--font)", color: "var(--text-dim)",
        whiteSpace: "nowrap", overflow: "hidden",
        background: isSelected ? "var(--active-bg)" : "transparent",
        borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
        opacity: busy ? 0.5 : 1, transition: "background 0.1s",
      }}>
      <FileTypeIcon filename={filename} />
      <span title={f.file} style={{ overflow: "hidden", textOverflow: "ellipsis", textDecoration: isDeleted ? "line-through" : "none", color: isDeleted ? "var(--text-dimmer)" : undefined, opacity: isDeleted ? 0.6 : 1 }}>
        {filename}
      </span>
      {dir && <span style={{ fontSize: 10, color: "var(--text-dimmer)", overflow: "hidden", textOverflow: "ellipsis", flex: 1, opacity: 0.7 }}>{dir}</span>}
      {!dir && <span style={{ flex: 1 }} />}
      {(f.added || f.removed) ? (
        <span style={{ fontSize: 10, display: "flex", gap: 3, flexShrink: 0 }}>
          {f.added ? <span style={{ color: "var(--green)" }}>+{f.added}</span> : null}
          {f.removed ? <span style={{ color: "var(--red)" }}>-{f.removed}</span> : null}
        </span>
      ) : null}
      <div ref={actionsRef} style={{ display: "flex", gap: 1, flexShrink: 0, opacity: 0, transition: "opacity 0.1s" }}>
        {!isStaged && onDiscard && <ActionBtn label={"\u21A9"} title="Discard changes" color="var(--text-dimmer)" onClick={onDiscard} />}
        {isStaged
          ? <ActionBtn label={"\u2212"} title="Unstage file" color="var(--text-dim)" onClick={onUnstage} />
          : <ActionBtn label="+" title="Stage file" color="var(--green)" onClick={onStage} />}
      </div>
      <StatusBadge status={displayStatus} />
    </div>
  );
}

// --- OutgoingCommitRow ---

export function OutgoingCommitRow({ commit }: { commit: OutgoingCommit }) {
  function relativeDate(dateStr: string): string {
    const d = new Date(dateStr);
    const now = Date.now();
    const diffSec = Math.floor((now - d.getTime()) / 1000);
    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return (
    <div className="hoverable" style={{
      display: "flex", alignItems: "center", gap: 6, height: 22, paddingLeft: 16, paddingRight: 8,
      fontSize: 11, fontFamily: "var(--font)", color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", background: "transparent",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--yellow)", flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: "var(--text-dimmer)", fontFamily: "var(--font)", flexShrink: 0 }}>{commit.hash}</span>
      <span title={commit.message} style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{commit.message}</span>
      <span style={{ fontSize: 10, color: "var(--text-dimmer)", flexShrink: 0 }}>{relativeDate(commit.date)}</span>
    </div>
  );
}

// --- SVG Icons ---

export function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export function UndoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
