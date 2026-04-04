/**
 * Per-tool renderers matching Conductor's CollapsibleRow pattern exactly.
 * - Plus/Minus icon swap on hover (replaces tool icon)
 * - Right content in font-mono text-xs max-w-[400px]
 * - Expanded content with bg-accent p-3 rounded-md border
 * - ToolError with destructive styling
 */

import { useState } from "react";
import { Terminal, FileText, Pencil, Search, Globe, Brain, FilePlus, Wrench, Plus, Minus, CircleX } from "lucide-react";

interface ToolRenderProps {
  tool: string;
  input: Record<string, unknown>;
  pending?: boolean;
  error?: string;
  result?: string;
}

function fileName(p: string): string {
  return p.split("/").pop() || p;
}

/** Conductor-style FileBadge -- pill with file icon */
function FileBadge({ path }: { path: string }) {
  return (
    <span className="filebadge" onClick={(e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent("studio:open-file", { detail: { path } }));
    }} style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: "var(--muted)", borderRadius: 100, padding: "1px 8px 1px 5px",
      fontSize: 11, fontFamily: "var(--font)", fontWeight: 500,
      color: "var(--text-dim)", maxWidth: 200, cursor: "pointer",
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      transition: "background 0.1s",
    }}>
      <FileText size={10} style={{ flexShrink: 0 }} />
      {fileName(path)}
    </span>
  );
}

/** DiffStats badge -- green +N / red -N */
function DiffStats({ added, removed }: { added?: number; removed?: number }) {
  if (!added && !removed) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      border: "1px solid var(--border)", borderRadius: 3,
      padding: "1px 6px", fontSize: 10, fontFamily: "var(--font)", fontWeight: 500,
      flexShrink: 0,
    }}>
      {(added ?? 0) > 0 && <span style={{ color: "var(--git-green)" }}>+{added}</span>}
      {(removed ?? 0) > 0 && <span style={{ color: "var(--git-red)" }}>-{removed}</span>}
    </span>
  );
}

/** Expanded content wrapper -- matches Conductor's bg-accent p-3 rounded-md */
function ExpandedContent({ children, isCode }: { children: React.ReactNode; isCode?: boolean }) {
  return (
    <div style={{
      marginTop: 8, marginLeft: 28,
      fontFamily: "var(--font)", fontSize: 12, fontWeight: 500,
      whiteSpace: "pre-wrap", wordBreak: "break-word",
      color: "var(--text-dim)",
      background: isCode ? "var(--accent-bg)" : "var(--bg-3)",
      padding: 12, borderRadius: "var(--radius)", border: "1px solid var(--border-dim)",
      maxHeight: 400, overflow: "auto",
      lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}

/** Error display for failed tool calls */
function ToolError({ message }: { message: string }) {
  return (
    <div style={{
      marginTop: 8, marginLeft: 28,
      fontFamily: "var(--font)", fontSize: 12, fontWeight: 500,
      whiteSpace: "pre-wrap", wordBreak: "break-word",
      color: "var(--destructive)",
      background: "hsl(0 91% 71% / 0.1)",
      padding: 12, borderRadius: "var(--radius)",
      border: "1px solid hsl(0 91% 71% / 0.2)",
    }}>
      {message}
    </div>
  );
}

/** CollapsibleRow -- the primary tool card wrapper matching Conductor exactly */
export function CollapsibleToolCard({ tool, input, pending, error, result, children }: ToolRenderProps & { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hasContent = !!(children || result);
  const renderer = TOOL_RENDERERS[tool.toLowerCase()] ?? defaultRenderer;
  const { icon, left, right } = renderer(input, pending);

  return (
    <div style={{ margin: "1px 0" }}>
      {/* Header row */}
      <div
        onClick={() => hasContent && !pending && setOpen(v => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "4px 6px", margin: "0 -6px",
          borderRadius: 4,
          cursor: hasContent && !pending ? "pointer" : "default",
          fontSize: 13, lineHeight: 1.5,
          maxWidth: "100%",
          background: hovered && hasContent ? "var(--muted)" : "transparent",
          transition: "background 0.1s",
        }}
      >
        {/* Icon: swap to Plus/Minus on hover when collapsible */}
        <span style={{ display: "flex", flexShrink: 0, width: 14, height: 14, alignItems: "center", justifyContent: "center", color: "var(--text-dimmer)" }}>
          {hovered && hasContent && !pending ? (
            open ? <Minus size={12} /> : <Plus size={12} />
          ) : icon}
        </span>

        {/* Left: tool name/description */}
        <span style={{
          fontSize: 13, color: "var(--text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          ...(pending ? {
            background: "linear-gradient(90deg, var(--text) 40%, var(--text-dimmer) 50%, var(--text) 60%)",
            backgroundSize: "200% 100%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animation: "text-shimmer 1.5s ease-in-out infinite",
          } : {}),
        }}>
          {left}
        </span>

        {/* Right: file badge, stats, command preview -- shown when collapsed */}
        {right && (!open || true) && (
          <span style={{
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: "var(--font)", fontWeight: 500, fontSize: 12,
            color: "var(--text-dimmer)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            maxWidth: 400, flexShrink: 1, minWidth: 0,
          }}>
            {right}
          </span>
        )}
      </div>

      {/* Expanded content */}
      {open && !pending && (
        <>
          {children}
          {result && !children && <ExpandedContent isCode>{result}</ExpandedContent>}
        </>
      )}

      {/* Error */}
      {error && <ToolError message={error} />}
    </div>
  );
}

// ── Tool renderer definitions ─────────────────────────────────────────────────

interface ToolRendererResult {
  icon: React.ReactNode;
  left: string;
  right?: React.ReactNode;
}

type ToolRenderer = (input: Record<string, unknown>, pending?: boolean) => ToolRendererResult;

const bashRenderer: ToolRenderer = (input, pending) => {
  const cmd = String(input.command ?? input.cmd ?? "");
  const desc = String(input.description ?? "");
  return {
    icon: <Terminal size={14} />,
    left: pending ? "Running..." : desc || "Bash",
    right: cmd ? <span>{cmd.length > 80 ? cmd.slice(0, 80) + "..." : cmd}</span> : undefined,
  };
};

const readRenderer: ToolRenderer = (input, pending) => {
  const path = String(input.file_path ?? input.path ?? "");
  const limit = Number(input.limit) || 0;
  const label = pending ? "Reading..." : limit ? `Read ${limit} lines` : "Read";
  return {
    icon: <FileText size={14} />,
    left: label,
    right: path ? <FileBadge path={path} /> : undefined,
  };
};

const editRenderer: ToolRenderer = (input, pending) => {
  const path = String(input.file_path ?? input.path ?? "");
  const oldStr = String(input.old_string ?? "");
  const newStr = String(input.new_string ?? "");
  const added = newStr.split("\n").length;
  const removed = oldStr.split("\n").length;
  return {
    icon: <Pencil size={14} />,
    left: pending ? "Editing..." : "Edit",
    right: (
      <>
        {path && <FileBadge path={path} />}
        {!pending && oldStr && <DiffStats added={added} removed={removed} />}
      </>
    ),
  };
};

const writeRenderer: ToolRenderer = (input, pending) => {
  const path = String(input.file_path ?? input.path ?? "");
  return {
    icon: <FilePlus size={14} />,
    left: pending ? "Writing..." : "Write",
    right: path ? <FileBadge path={path} /> : undefined,
  };
};

const grepRenderer: ToolRenderer = (input, pending) => {
  const pattern = String(input.pattern ?? "");
  const path = input.path ? String(input.path) : undefined;
  const include = input.include ? String(input.include) : undefined;
  let label = pending ? "Searching..." : `grep for '${pattern}'`;
  if (path) label += ` in ${fileName(path)}`;
  if (include) label += ` (${include})`;
  return { icon: <Search size={14} />, left: label };
};

const globRenderer: ToolRenderer = (input, pending) => ({
  icon: <Search size={14} />,
  left: pending ? "Searching..." : `glob '${String(input.pattern ?? "")}'`,
});

const thinkingRenderer: ToolRenderer = (input, pending) => ({
  icon: <Brain size={14} style={{ color: "var(--purple)" }} />,
  left: pending ? "Thinking..." : "Thinking",
  right: !pending && input.text ? (
    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {String(input.text).slice(0, 60)}
    </span>
  ) : undefined,
});

const defaultRenderer: ToolRenderer = (_input, pending) => ({
  icon: <Wrench size={14} />,
  left: pending ? "Running..." : "Tool",
});

const TOOL_RENDERERS: Record<string, ToolRenderer> = {
  bash: bashRenderer, shell: bashRenderer,
  read: readRenderer,
  edit: editRenderer, multiedit: editRenderer,
  write: writeRenderer,
  glob: globRenderer, grep: grepRenderer,
  thinking: thinkingRenderer,
  agent: (_i, p) => ({ icon: <Globe size={14} style={{ color: "var(--blue)" }} />, left: p ? "Running agent..." : "Agent" }),
  webfetch: (_i, p) => ({ icon: <Globe size={14} />, left: p ? "Fetching..." : "Fetch" }),
  websearch: (_i, p) => ({ icon: <Globe size={14} />, left: p ? "Searching..." : "Search" }),
};

export { FileBadge, DiffStats, ExpandedContent, ToolError };
