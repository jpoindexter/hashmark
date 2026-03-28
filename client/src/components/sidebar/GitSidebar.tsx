import { useState, useEffect, useCallback, useRef } from "react";
import { fetchApi } from "../../lib/api";

interface GitFile {
  status: string;
  file: string;
  x: string;
  y: string;
  isStaged: boolean;
  isUnstaged: boolean;
  isUntracked: boolean;
  added?: number;
  removed?: number;
}

interface GitData {
  branch: string;
  ahead: number;
  behind: number;
  files: GitFile[];
  error?: string;
}

interface OutgoingCommit {
  hash: string;
  message: string;
  date: string;
}

// --- Status colors ---

const STATUS_COLOR: Record<string, string> = {
  M: "var(--yellow)",
  A: "var(--green)",
  D: "var(--red)",
  "?": "var(--green)",
  U: "var(--green)",
  R: "var(--blue)",
  C: "var(--cyan)",
};

// --- FileTypeIcon ---

function FileTypeIcon({ filename }: { filename: string }) {
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".") + 1).toLowerCase() : "";
  const base = filename.toLowerCase();

  // Config/env files
  if (base.endsWith(".config.ts") || base.endsWith(".config.js") || base.endsWith(".config.mjs") ||
      base.startsWith(".env") || base === "tsconfig.json" || base === "vite.config.ts" ||
      base === "tailwind.config.ts" || base === "next.config.ts" || base === "next.config.js") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 16, height: 16, flexShrink: 0,
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-dimmer)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </span>
    );
  }

  // TS/TSX
  if (ext === "ts" || ext === "tsx") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 16, height: 16, fontSize: 8, fontWeight: 700, flexShrink: 0,
        color: "#3178c6", fontFamily: "var(--font)",
      }}>
        TS
      </span>
    );
  }

  // JS/JSX
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 16, height: 16, fontSize: 8, fontWeight: 700, flexShrink: 0,
        color: "#e8d44d", fontFamily: "var(--font)",
      }}>
        JS
      </span>
    );
  }

  // JSON
  if (ext === "json" || ext === "jsonc") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 16, height: 16, fontSize: 9, fontWeight: 700, flexShrink: 0,
        color: "#cca700", fontFamily: "var(--font)",
      }}>
        {"{}"}
      </span>
    );
  }

  // Markdown
  if (ext === "md" || ext === "mdx") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 16, height: 16, fontSize: 8, fontWeight: 700, flexShrink: 0,
        color: "#8b5cf6", fontFamily: "var(--font)",
      }}>
        MD
      </span>
    );
  }

  // CSS/SCSS/LESS
  if (ext === "css" || ext === "scss" || ext === "less" || ext === "sass") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 16, height: 16, fontSize: 10, fontWeight: 700, flexShrink: 0,
        color: "#56b6c2", fontFamily: "var(--font)",
      }}>
        #
      </span>
    );
  }

  // HTML
  if (ext === "html" || ext === "htm") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 16, height: 16, fontSize: 7, fontWeight: 700, flexShrink: 0,
        color: "#e34c26", fontFamily: "var(--font)",
      }}>
        {"<>"}
      </span>
    );
  }

  // Python
  if (ext === "py") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 16, height: 16, fontSize: 8, fontWeight: 700, flexShrink: 0,
        color: "#3572a5", fontFamily: "var(--font)",
      }}>
        PY
      </span>
    );
  }

  // Default: FileText icon
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 16, height: 16, flexShrink: 0,
    }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-dimmer)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    </span>
  );
}

// --- StatusBadge (VS Code style single letter) ---

function StatusBadge({ status }: { status: string }) {
  const char = status === "?" ? "U" : status[0] ?? "?";
  const displayChar = char === "?" ? "U" : char;
  const colorKey = char === "?" ? "U" : char;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 16,
        height: 16,
        fontSize: 11,
        fontWeight: 600,
        color: STATUS_COLOR[colorKey] ?? "var(--text-dimmer)",
        flexShrink: 0,
        fontFamily: "var(--font)",
        textAlign: "center",
      }}
    >
      {displayChar}
    </span>
  );
}

// --- Inline icon buttons for header actions ---

function HeaderIconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? "var(--bg-4)" : "transparent",
        border: "none",
        cursor: "pointer",
        color: hover ? "var(--text)" : "var(--text-dimmer)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 20,
        borderRadius: "var(--radius-sm)",
        padding: 0,
        flexShrink: 0,
        transition: "background 0.1s, color 0.1s",
      }}
    >
      {children}
    </button>
  );
}

// --- Small action button for file rows ---

function ActionBtn({
  label,
  title,
  color,
  onClick,
}: {
  label: string;
  title: string;
  color?: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? "var(--bg-4)" : "transparent",
        border: "none",
        cursor: "pointer",
        color: color ?? "var(--text-dimmer)",
        fontFamily: "var(--font)",
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1,
        width: 16,
        height: 16,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius-sm)",
        flexShrink: 0,
        padding: 0,
        transition: "background 0.1s",
      }}
    >
      {label}
    </button>
  );
}

// --- Section header (collapsible) ---

function SectionHeader({
  label,
  count,
  expanded,
  onToggle,
  actions,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px 4px 6px",
        cursor: "pointer",
        background: hover ? "var(--surface-subtle)" : "transparent",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 8,
          color: "var(--text-dimmer)",
          fontFamily: "var(--font)",
          display: "inline-block",
          transition: "transform 0.1s",
          transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
        }}
      >
        {"\u25B6"}
      </span>
      <span
        style={{
          fontSize: 10,
          color: "var(--text-dim)",
          fontFamily: "var(--font)",
          letterSpacing: "0.06em",
          flex: 1,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 9,
          color: "var(--text-dimmer)",
          fontFamily: "var(--font)",
          background: "var(--bg-3)",
          borderRadius: 10,
          padding: "0px 5px",
          flexShrink: 0,
        }}
      >
        {count}
      </span>
      {hover && actions && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ display: "flex", gap: 1, flexShrink: 0 }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

// --- Changed file row ---

function ChangedFileRow({
  f,
  isSelected,
  isStaged,
  busy,
  onClick,
  onStage,
  onUnstage,
  onDiscard,
}: {
  f: GitFile;
  isSelected: boolean;
  isStaged: boolean;
  busy: boolean;
  onClick: () => void;
  onStage: (e: React.MouseEvent) => void;
  onUnstage: (e: React.MouseEvent) => void;
  onDiscard?: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const displayStatus = isStaged
    ? f.x
    : f.isUntracked
      ? "?"
      : f.y;
  const filename = f.file.split("/").pop() ?? f.file;
  const dir = f.file.includes("/") ? f.file.slice(0, f.file.lastIndexOf("/")) : "";
  const isDeleted = displayStatus === "D";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        height: 22,
        paddingLeft: 16,
        paddingRight: 6,
        cursor: "pointer",
        fontSize: 12,
        fontFamily: "var(--font)",
        color: "var(--text-dim)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        background: isSelected
          ? "var(--active-bg)"
          : hovered
            ? "var(--hover-bg)"
            : "transparent",
        borderLeft: isSelected
          ? "2px solid var(--accent)"
          : "2px solid transparent",
        opacity: busy ? 0.5 : 1,
        transition: "background 0.1s",
      }}
    >
      <FileTypeIcon filename={filename} />
      <span
        title={f.file}
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          textDecoration: isDeleted ? "line-through" : "none",
          color: isDeleted ? "var(--text-dimmer)" : undefined,
          opacity: isDeleted ? 0.6 : 1,
        }}
      >
        {filename}
      </span>
      {dir && (
        <span
          style={{
            fontSize: 10,
            color: "var(--text-dimmer)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
            opacity: 0.7,
          }}
        >
          {dir}
        </span>
      )}
      {!dir && <span style={{ flex: 1 }} />}
      {(f.added || f.removed) ? (
        <span
          style={{
            fontSize: 10,
            display: "flex",
            gap: 3,
            flexShrink: 0,
          }}
        >
          {f.added ? (
            <span style={{ color: "var(--green)" }}>+{f.added}</span>
          ) : null}
          {f.removed ? (
            <span style={{ color: "var(--red)" }}>-{f.removed}</span>
          ) : null}
        </span>
      ) : null}
      <div
        style={{
          display: "flex",
          gap: 1,
          flexShrink: 0,
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.1s",
        }}
      >
        {!isStaged && onDiscard && (
          <ActionBtn label={"\u21A9"} title="Discard changes" color="var(--text-dimmer)" onClick={onDiscard} />
        )}
        {isStaged ? (
          <ActionBtn label={"\u2212"} title="Unstage file" color="var(--text-dim)" onClick={onUnstage} />
        ) : (
          <ActionBtn label="+" title="Stage file" color="var(--green)" onClick={onStage} />
        )}
      </div>
      <StatusBadge status={displayStatus} />
    </div>
  );
}

// --- Outgoing commit row ---

function OutgoingCommitRow({ commit }: { commit: OutgoingCommit }) {
  const [hovered, setHovered] = useState(false);

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
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 22,
        paddingLeft: 16,
        paddingRight: 8,
        fontSize: 11,
        fontFamily: "var(--font)",
        color: "var(--text-dim)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        background: hovered ? "var(--hover-bg)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      {/* Yellow dot = outgoing/unpushed */}
      <span style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "var(--yellow)",
        flexShrink: 0,
      }} />
      <span
        style={{
          fontSize: 10,
          color: "var(--text-dimmer)",
          fontFamily: "var(--font)",
          flexShrink: 0,
        }}
      >
        {commit.hash}
      </span>
      <span
        title={commit.message}
        style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {commit.message}
      </span>
      <span
        style={{
          fontSize: 10,
          color: "var(--text-dimmer)",
          flexShrink: 0,
        }}
      >
        {relativeDate(commit.date)}
      </span>
    </div>
  );
}

// --- SVG icon helpers (inline, no dependencies) ---

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// --- Create PR Dialog ---

function CreatePrDialog({
  open,
  onClose,
  currentBranch,
}: {
  open: boolean;
  onClose: () => void;
  currentBranch: string;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [base, setBase] = useState("main");
  const [branches, setBranches] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setError("");
    setCreating(false);
    fetchApi("/api/files/git/branches")
      .then((r) => r.json())
      .then((d: { branches?: string[] }) => {
        const all = d.branches ?? [];
        setBranches(all);
        if (all.includes("main")) setBase("main");
        else if (all.includes("master")) setBase("master");
        else if (all.length > 0) setBase(all[0]);
      })
      .catch(() => setBranches([]));
    requestAnimationFrame(() => titleRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const toast = (message: string, type: "info" | "error") => {
    window.dispatchEvent(
      new CustomEvent("studio:toast", { detail: { message, type } })
    );
  };

  const submit = async () => {
    if (!title.trim()) return;
    setCreating(true);
    setError("");
    try {
      const r = await fetchApi("/api/files/git/create-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim() || undefined,
          base: base || undefined,
        }),
      });
      const d = (await r.json()) as { ok?: boolean; url?: string; error?: string };
      if (d.ok && d.url) {
        toast(`PR created: ${d.url}`, "info");
        onClose();
      } else {
        setError(d.error ?? "Failed to create PR.");
      }
    } catch {
      setError("Failed to create PR.");
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  const baseOptions = branches.filter((b) => b !== currentBranch);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(2px)",
        animation: "fadeIn 0.1s ease",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "20px 24px",
          width: 380,
          maxWidth: "90vw",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          fontFamily: "var(--font-ui)",
          animation: "dropdownIn 0.15s ease-out",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", fontFamily: "var(--font-ui)" }}>
          Create Pull Request
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dimmer)", fontFamily: "var(--font)" }}>
          {currentBranch} {"\u2192"} {base}
        </div>
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          }}
          placeholder="PR title"
          style={{
            width: "100%", padding: "7px 10px", fontSize: 12, fontFamily: "var(--font)",
            background: "var(--bg-3)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", color: "var(--text)", outline: "none", boxSizing: "border-box",
          }}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          }}
          placeholder="Description (optional)"
          rows={4}
          style={{
            width: "100%", padding: "7px 10px", fontSize: 12, fontFamily: "var(--font)",
            background: "var(--bg-3)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", color: "var(--text)", outline: "none",
            boxSizing: "border-box", resize: "vertical", minHeight: 60,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font)", flexShrink: 0 }}>
            Base:
          </label>
          <select
            value={base}
            onChange={(e) => setBase(e.target.value)}
            style={{
              flex: 1, padding: "5px 8px", fontSize: 12, fontFamily: "var(--font)",
              background: "var(--bg-3)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", color: "var(--text)", outline: "none", cursor: "pointer",
            }}
          >
            {baseOptions.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        {error && (
          <div style={{ fontSize: 11, color: "var(--red)", fontFamily: "var(--font)", lineHeight: 1.4, padding: "4px 0" }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: "6px 16px", fontSize: 12, fontFamily: "var(--font-ui)", fontWeight: 500,
              background: "var(--bg-3)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", color: "var(--text-dim)", cursor: "pointer", transition: "background 0.1s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-4)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-3)"; }}
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={creating || !title.trim()}
            style={{
              padding: "6px 16px", fontSize: 12, fontFamily: "var(--font-ui)", fontWeight: 600,
              background: title.trim() ? "var(--accent)" : "var(--bg-3)", border: "none",
              borderRadius: "var(--radius)", color: title.trim() ? "var(--bg)" : "var(--text-dimmer)",
              cursor: title.trim() ? "pointer" : "default", transition: "opacity 0.1s",
              opacity: creating ? 0.6 : 1,
            }}
            onMouseEnter={(e) => { if (title.trim()) e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = creating ? "0.6" : "1"; }}
          >
            {creating ? "Creating..." : "Create PR"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Main GitSidebar ---

export default function GitSidebar() {
  const [data, setData] = useState<GitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState<string | null>(null);
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [unstagedExpanded, setUnstagedExpanded] = useState(true);
  const [untrackedExpanded, setUntrackedExpanded] = useState(true);
  const [outgoingExpanded, setOutgoingExpanded] = useState(true);
  const [ghAvailable, setGhAvailable] = useState(false);
  const [prDialogOpen, setPrDialogOpen] = useState(false);
  const [outgoing, setOutgoing] = useState<OutgoingCommit[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    fetchApi("/api/files/git")
      .then((r) => r.json())
      .then((d: GitData) => setData(d))
      .catch(() => {
        setData({
          branch: "unknown",
          ahead: 0,
          behind: 0,
          files: [],
          error: "Failed to fetch",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const loadOutgoing = useCallback(() => {
    fetchApi("/api/files/git/outgoing")
      .then((r) => r.json())
      .then((d: { commits: OutgoingCommit[]; count: number }) => {
        setOutgoing(d.commits ?? []);
      })
      .catch(() => setOutgoing([]));
  }, []);

  const refresh = useCallback(() => {
    load();
    loadOutgoing();
  }, [load, loadOutgoing]);

  useEffect(() => {
    load();
    loadOutgoing();
  }, [load, loadOutgoing]);

  useEffect(() => {
    fetchApi("/api/files/git/gh-available")
      .then((r) => r.json())
      .then((d: { available?: boolean }) => {
        setGhAvailable(d.available === true);
      })
      .catch(() => setGhAvailable(false));
  }, []);

  const handleFileClick = useCallback((path: string) => {
    setSelectedPath(path);
    window.dispatchEvent(
      new CustomEvent("studio:open-diff", { detail: { path } })
    );
  }, []);

  const toast = (message: string, type: "info" | "error") => {
    window.dispatchEvent(
      new CustomEvent("studio:toast", { detail: { message, type } })
    );
  };

  const showStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const stageFile = async (e: React.MouseEvent, file: string) => {
    e.stopPropagation();
    setFileLoading(file);
    try {
      const r = await fetchApi("/api/files/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: [file] }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!d.ok) showStatus(d.error ?? "Stage failed.");
      load();
    } catch {
      showStatus("Stage failed.");
    } finally {
      setFileLoading(null);
    }
  };

  const unstageFile = async (e: React.MouseEvent, file: string) => {
    e.stopPropagation();
    setFileLoading(file);
    try {
      const r = await fetchApi("/api/files/unstage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: [file] }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!d.ok) showStatus(d.error ?? "Unstage failed.");
      load();
    } catch {
      showStatus("Unstage failed.");
    } finally {
      setFileLoading(null);
    }
  };

  const discardFile = async (e: React.MouseEvent, file: string) => {
    e.stopPropagation();
    setFileLoading(file);
    try {
      const r = await fetchApi("/api/files/discard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: [file] }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) {
        load();
      } else {
        showStatus(d.error ?? "Discard failed.");
      }
    } catch {
      showStatus("Discard failed.");
    } finally {
      setFileLoading(null);
    }
  };

  const stageAll = async () => {
    try {
      const r = await fetchApi("/api/files/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) load();
      else showStatus(d.error ?? "Stage failed.");
    } catch {
      showStatus("Stage failed.");
    }
  };

  const unstageAll = async () => {
    try {
      const r = await fetchApi("/api/files/unstage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) load();
      else showStatus(d.error ?? "Unstage failed.");
    } catch {
      showStatus("Unstage failed.");
    }
  };

  const discardAll = async () => {
    const unstaged = files.filter((f) => !f.isStaged && !f.isUntracked);
    if (unstaged.length === 0) return;
    try {
      const r = await fetchApi("/api/files/discard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: unstaged.map((f) => f.file) }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) load();
      else showStatus(d.error ?? "Discard failed.");
    } catch {
      showStatus("Discard failed.");
    }
  };

  const commit = async () => {
    if (!commitMsg.trim()) return;
    setCommitting(true);
    setStatusMsg(null);
    try {
      const r = await fetchApi("/api/files/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: commitMsg.trim() }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) {
        showStatus("Committed.");
        setCommitMsg("");
        refresh();
      } else {
        showStatus(d.error ?? "Commit failed.");
      }
    } catch {
      showStatus("Commit failed.");
    } finally {
      setCommitting(false);
    }
  };

  const push = async () => {
    setPushing(true);
    try {
      const r = await fetchApi("/api/files/push", { method: "POST" });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) {
        toast("Pushed to remote.", "info");
        refresh();
      } else {
        toast(d.error ?? "Push failed.", "error");
      }
    } catch {
      toast("Push failed.", "error");
    } finally {
      setPushing(false);
    }
  };

  const pull = async () => {
    setPulling(true);
    try {
      const r = await fetchApi("/api/files/pull", { method: "POST" });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) {
        toast("Pulled from remote.", "info");
        refresh();
      } else {
        toast(d.error ?? "Pull failed.", "error");
      }
    } catch {
      toast("Pull failed.", "error");
    } finally {
      setPulling(false);
    }
  };

  const files = data?.files ?? [];
  const stagedFiles = files.filter((f) => f.isStaged);
  const unstagedFiles = files.filter((f) => !f.isStaged && !f.isUntracked);
  const untrackedFiles = files.filter((f) => f.isUntracked);
  const totalChanges = files.length;

  const isErr = statusMsg
    ? statusMsg.toLowerCase().includes("fail") ||
      statusMsg.toLowerCase().includes("error")
    : false;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      <CreatePrDialog
        open={prDialogOpen}
        onClose={() => setPrDialogOpen(false)}
        currentBranch={data?.branch ?? ""}
      />

      {/* Top header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 8px 6px 12px",
          fontSize: 10,
          fontFamily: "var(--font)",
          letterSpacing: "0.06em",
          color: "var(--text-dim)",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        <span>SOURCE CONTROL</span>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <span
            style={{
              fontSize: 10,
              color: "var(--text-dimmer)",
              background: "var(--bg-3)",
              borderRadius: 10,
              padding: "1px 6px",
              marginRight: 2,
            }}
          >
            {totalChanges}
          </span>
          <HeaderIconBtn title="Stage all" onClick={() => void stageAll()}>
            <PlusIcon />
          </HeaderIconBtn>
          <HeaderIconBtn title="Discard all changes" onClick={() => void discardAll()}>
            <UndoIcon />
          </HeaderIconBtn>
          <HeaderIconBtn title="Refresh" onClick={refresh}>
            <RefreshIcon />
          </HeaderIconBtn>
        </div>
      </div>

      {/* File list with staged/unstaged/untracked/outgoing groups */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {loading ? (
          <div
            style={{
              padding: "12px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {[70, 55, 65].map((w, i) => (
              <div
                key={i}
                style={{
                  height: 12,
                  width: `${w}%`,
                  background: "var(--bg-4)",
                  borderRadius: "var(--radius-sm)",
                }}
              />
            ))}
          </div>
        ) : data?.error ? (
          <div
            style={{
              padding: "12px 16px",
              fontSize: 11,
              color: "var(--red)",
              fontFamily: "var(--font)",
            }}
          >
            {data.error}
          </div>
        ) : totalChanges === 0 && outgoing.length === 0 ? (
          <div
            style={{
              padding: "12px 16px",
              fontSize: 11,
              color: "var(--text-dimmer)",
              fontFamily: "var(--font)",
            }}
          >
            Working tree clean.
          </div>
        ) : (
          <>
            {/* STAGED CHANGES */}
            {stagedFiles.length > 0 && (
              <div>
                <SectionHeader
                  label="STAGED CHANGES"
                  count={stagedFiles.length}
                  expanded={stagedExpanded}
                  onToggle={() => setStagedExpanded((v) => !v)}
                  actions={
                    <HeaderIconBtn title="Unstage all" onClick={() => void unstageAll()}>
                      <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>{"\u2212"}</span>
                    </HeaderIconBtn>
                  }
                />
                {stagedExpanded &&
                  stagedFiles.map((f) => (
                    <ChangedFileRow
                      key={`staged-${f.file}`}
                      f={f}
                      isStaged
                      isSelected={selectedPath === f.file}
                      busy={fileLoading === f.file}
                      onClick={() => handleFileClick(f.file)}
                      onStage={(e) => void stageFile(e, f.file)}
                      onUnstage={(e) => void unstageFile(e, f.file)}
                    />
                  ))}
              </div>
            )}

            {/* CHANGES (unstaged, tracked) */}
            {unstagedFiles.length > 0 && (
              <div>
                <SectionHeader
                  label="CHANGES"
                  count={unstagedFiles.length}
                  expanded={unstagedExpanded}
                  onToggle={() => setUnstagedExpanded((v) => !v)}
                  actions={
                    <>
                      <HeaderIconBtn title="Discard all" onClick={() => void discardAll()}>
                        <UndoIcon />
                      </HeaderIconBtn>
                      <HeaderIconBtn title="Stage all" onClick={() => void stageAll()}>
                        <PlusIcon />
                      </HeaderIconBtn>
                    </>
                  }
                />
                {unstagedExpanded &&
                  unstagedFiles.map((f) => (
                    <ChangedFileRow
                      key={`unstaged-${f.file}`}
                      f={f}
                      isStaged={false}
                      isSelected={selectedPath === f.file}
                      busy={fileLoading === f.file}
                      onClick={() => handleFileClick(f.file)}
                      onStage={(e) => void stageFile(e, f.file)}
                      onUnstage={(e) => void unstageFile(e, f.file)}
                      onDiscard={(e) => void discardFile(e, f.file)}
                    />
                  ))}
              </div>
            )}

            {/* UNTRACKED */}
            {untrackedFiles.length > 0 && (
              <div>
                <SectionHeader
                  label="UNTRACKED"
                  count={untrackedFiles.length}
                  expanded={untrackedExpanded}
                  onToggle={() => setUntrackedExpanded((v) => !v)}
                  actions={
                    <HeaderIconBtn
                      title="Stage all untracked"
                      onClick={() => {
                        fetchApi("/api/files/stage", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ paths: untrackedFiles.map((f) => f.file) }),
                        })
                          .then(() => load())
                          .catch(() => {});
                      }}
                    >
                      <PlusIcon />
                    </HeaderIconBtn>
                  }
                />
                {untrackedExpanded &&
                  untrackedFiles.map((f) => (
                    <ChangedFileRow
                      key={`untracked-${f.file}`}
                      f={f}
                      isStaged={false}
                      isSelected={selectedPath === f.file}
                      busy={fileLoading === f.file}
                      onClick={() => handleFileClick(f.file)}
                      onStage={(e) => void stageFile(e, f.file)}
                      onUnstage={(e) => void unstageFile(e, f.file)}
                    />
                  ))}
              </div>
            )}

            {/* OUTGOING CHANGES */}
            {outgoing.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <SectionHeader
                  label="OUTGOING"
                  count={outgoing.length}
                  expanded={outgoingExpanded}
                  onToggle={() => setOutgoingExpanded((v) => !v)}
                />
                {outgoingExpanded &&
                  outgoing.map((c) => (
                    <OutgoingCommitRow key={c.hash} commit={c} />
                  ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Commit form + actions */}
      <div
        style={{
          padding: "8px 10px",
          borderTop: "1px solid var(--border-dim)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          flexShrink: 0,
        }}
      >
        {statusMsg && (
          <div
            style={{
              fontSize: 10,
              fontFamily: "var(--font)",
              color: isErr ? "var(--red)" : "var(--accent)",
              padding: "2px 0",
            }}
          >
            {statusMsg}
          </div>
        )}
        <textarea
          placeholder="Commit message..."
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              void commit();
            }
          }}
          rows={3}
          style={{
            width: "100%",
            boxSizing: "border-box",
            resize: "vertical",
            minHeight: 40,
            fontFamily: "var(--font)",
            fontSize: 11,
            background: "var(--bg-3)",
            border: "1px solid var(--border-dim)",
            color: "var(--text)",
            padding: "6px 8px",
            borderRadius: "var(--radius)",
            outline: "none",
          }}
        />
        <button
          className="btn btn-primary"
          onClick={() => void commit()}
          disabled={committing || !commitMsg.trim() || stagedFiles.length === 0}
          style={{ width: "100%", fontSize: 11, justifyContent: "center" }}
          title={stagedFiles.length === 0 ? "Stage changes before committing" : undefined}
        >
          {committing
            ? "Committing..."
            : stagedFiles.length === 0
              ? "Commit (nothing staged)"
              : "Commit"}
        </button>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="btn"
            onClick={() => void push()}
            disabled={pushing}
            style={{ flex: 1, fontSize: 11, justifyContent: "center" }}
            title="Push to remote"
          >
            {pushing
              ? "Pushing..."
              : `\u2191 Push${data?.ahead ? ` (${data.ahead})` : ""}`}
          </button>
          <button
            className="btn"
            onClick={() => void pull()}
            disabled={pulling}
            style={{ flex: 1, fontSize: 11, justifyContent: "center" }}
            title="Pull from remote"
          >
            {pulling
              ? "Pulling..."
              : `\u2193 Pull${data?.behind ? ` (${data.behind})` : ""}`}
          </button>
        </div>

        {/* Create PR button -- only if gh CLI is available */}
        {ghAvailable && (
          <button
            className="btn"
            onClick={() => setPrDialogOpen(true)}
            style={{
              width: "100%",
              fontSize: 11,
              justifyContent: "center",
              gap: 6,
              display: "flex",
              alignItems: "center",
            }}
            title="Create a pull request on GitHub"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="currentColor"
              style={{ flexShrink: 0 }}
            >
              <path
                fillRule="evenodd"
                d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z"
              />
            </svg>
            Create PR
          </button>
        )}
      </div>
    </div>
  );
}
