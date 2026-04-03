/**
 * Per-tool renderers matching Conductor's CollapsibleRow pattern.
 * Each tool type gets its own icon, label format, and content renderer.
 */

import { useState } from "react";
import { Terminal, FileText, Pencil, Search, Globe, Brain, FilePlus, Wrench, ChevronRight, ChevronDown, Copy } from "lucide-react";

interface ToolRenderProps {
  tool: string;
  input: Record<string, unknown>;
  pending?: boolean;
}

function shortenPath(p: string): string {
  const parts = p.split("/");
  return parts.length <= 2 ? p : ".../" + parts.slice(-2).join("/");
}

function fileName(p: string): string {
  return p.split("/").pop() || p;
}

/** Conductor-style FileBadge */
function FileBadge({ path }: { path: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: "var(--muted)", borderRadius: 100, padding: "1px 8px 1px 5px",
      fontSize: 12, color: "var(--text-dim)", maxWidth: 200,
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}>
      <FileText size={11} style={{ flexShrink: 0 }} />
      {fileName(path)}
    </span>
  );
}

/** CollapsibleRow -- the primary tool card wrapper */
export function CollapsibleToolCard({ tool, input, pending, children }: ToolRenderProps & { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const hasContent = !!children;
  const renderer = TOOL_RENDERERS[tool.toLowerCase()] ?? defaultRenderer;
  const { icon, left, right } = renderer(input, pending);

  return (
    <div style={{ margin: "2px 0" }}>
      <div
        onClick={() => hasContent && setOpen(v => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "4px 6px", margin: "0 -6px",
          borderRadius: 4, cursor: hasContent ? "pointer" : "default",
          fontSize: 13, lineHeight: 1.5,
          transition: "background 0.1s",
        }}
        className={hasContent ? "hoverable" : undefined}
      >
        <span style={{ display: "flex", flexShrink: 0, color: "var(--text-dimmer)" }}>{icon}</span>
        <span style={{
          color: "var(--text)", fontWeight: 500,
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
        {right && <span style={{ display: "flex", alignItems: "center" }}>{right}</span>}
        {hasContent && !pending && (
          <span style={{ color: "var(--text-dimmer)", display: "flex" }}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
      </div>
      {open && children && (
        <div style={{ marginTop: 4, marginLeft: 28 }}>
          {children}
        </div>
      )}
    </div>
  );
}

interface ToolRendererResult {
  icon: React.ReactNode;
  left: string;
  right?: React.ReactNode;
}

type ToolRenderer = (input: Record<string, unknown>, pending?: boolean) => ToolRendererResult;

const bashRenderer: ToolRenderer = (input, pending) => {
  const cmd = String(input.command ?? input.cmd ?? "");
  const preview = cmd.length > 60 ? cmd.slice(0, 60) + "..." : cmd;
  return {
    icon: <Terminal size={14} />,
    left: pending ? "Running..." : "Bash",
    right: cmd ? (
      <span style={{ fontFamily: "var(--font)", fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>
        {preview}
      </span>
    ) : undefined,
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
  return {
    icon: <Pencil size={14} />,
    left: pending ? "Editing..." : "Edit",
    right: path ? <FileBadge path={path} /> : undefined,
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
  return {
    icon: <Search size={14} />,
    left: pending ? "Searching..." : `grep for '${pattern}'`,
    right: path ? (
      <span style={{ fontSize: 12, color: "var(--text-dimmer)" }}>{shortenPath(path)}</span>
    ) : undefined,
  };
};

const globRenderer: ToolRenderer = (input, pending) => {
  const pattern = String(input.pattern ?? "");
  return {
    icon: <Search size={14} />,
    left: pending ? "Searching..." : `glob '${pattern}'`,
  };
};

const thinkingRenderer: ToolRenderer = (_input, pending) => ({
  icon: <Brain size={14} style={{ color: "var(--purple)" }} />,
  left: pending ? "Thinking..." : "Thinking",
});

const defaultRenderer: ToolRenderer = (input, pending) => ({
  icon: <Wrench size={14} />,
  left: pending ? "Running..." : "Tool",
});

const TOOL_RENDERERS: Record<string, ToolRenderer> = {
  bash: bashRenderer,
  shell: bashRenderer,
  read: readRenderer,
  edit: editRenderer,
  multiedit: editRenderer,
  write: writeRenderer,
  glob: globRenderer,
  grep: grepRenderer,
  thinking: thinkingRenderer,
  agent: (_input, pending) => ({
    icon: <Globe size={14} style={{ color: "var(--blue)" }} />,
    left: pending ? "Running agent..." : "Agent",
  }),
  webfetch: (_input, pending) => ({
    icon: <Globe size={14} />,
    left: pending ? "Fetching..." : "Fetch",
  }),
  websearch: (_input, pending) => ({
    icon: <Globe size={14} />,
    left: pending ? "Searching..." : "Search",
  }),
};
