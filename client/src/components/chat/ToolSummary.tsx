import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

interface ToolUseBlockData {
  type: "tool_use";
  tool: string;
  input: Record<string, unknown>;
}

interface ToolCallGroup {
  block: ToolUseBlockData;
  node: React.ReactNode;
}

interface ToolCallSummaryProps {
  groups: ToolCallGroup[];
}

// Map tool name to a canonical category for counting
function categorize(tool: string): string {
  const name = tool.toLowerCase();
  if (name === "read") return "Read";
  if (name === "write") return "Write";
  if (name === "edit" || name === "multiedit") return "Edit";
  if (name === "bash" || name === "shell") return "Bash";
  if (name === "glob") return "Glob";
  if (name === "grep") return "Grep";
  return tool;
}

// Build a one-line summary like "Read 3 files, Edited 2 files, Ran 1 command"
function buildSummaryLine(groups: ToolCallGroup[]): string {
  const counts: Record<string, number> = {};
  for (const g of groups) {
    const cat = categorize(g.block.tool);
    counts[cat] = (counts[cat] ?? 0) + 1;
  }

  const parts: string[] = [];
  if (counts.Read) parts.push(`Read ${counts.Read} file${counts.Read !== 1 ? "s" : ""}`);
  if (counts.Edit) parts.push(`Edited ${counts.Edit} file${counts.Edit !== 1 ? "s" : ""}`);
  if (counts.Write) parts.push(`Wrote ${counts.Write} file${counts.Write !== 1 ? "s" : ""}`);
  if (counts.Bash) parts.push(`Ran ${counts.Bash} command${counts.Bash !== 1 ? "s" : ""}`);
  if (counts.Glob) parts.push(`Glob ${counts.Glob} search${counts.Glob !== 1 ? "es" : ""}`);
  if (counts.Grep) parts.push(`Grep ${counts.Grep} search${counts.Grep !== 1 ? "es" : ""}`);

  // Any remaining uncategorized tools
  for (const [cat, count] of Object.entries(counts)) {
    if (!["Read", "Edit", "Write", "Bash", "Glob", "Grep"].includes(cat)) {
      parts.push(`${cat} x${count}`);
    }
  }

  return parts.join(", ");
}

const FILE_EXT_COLORS: Record<string, string> = {
  ts: "var(--blue, #388bfd)",
  tsx: "var(--blue, #388bfd)",
  js: "var(--yellow, #d29922)",
  jsx: "var(--yellow, #d29922)",
  py: "var(--yellow, #d29922)",
  rs: "var(--orange, #db6d28)",
  go: "var(--blue, #388bfd)",
  md: "var(--text-dimmer)",
  json: "var(--accent, #3fb950)",
  yaml: "var(--accent, #3fb950)",
  yml: "var(--accent, #3fb950)",
  toml: "var(--accent, #3fb950)",
  css: "var(--purple, #a371f7)",
  html: "var(--red, #f85149)",
  sql: "var(--blue, #388bfd)",
  sh: "var(--yellow, #d29922)",
  bash: "var(--yellow, #d29922)",
  prisma: "var(--purple, #a371f7)",
};

function getFileColor(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return FILE_EXT_COLORS[ext] ?? "var(--text-dimmer)";
}

function getFileName(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

function FileBadge({ filePath }: { filePath: string }) {
  const color = getFileColor(filePath);
  const name = getFileName(filePath);

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        window.dispatchEvent(
          new CustomEvent("studio:open-file", { detail: { path: filePath } })
        );
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "var(--bg-3)",
        border: "1px solid var(--border-dim)",
        fontSize: 11,
        padding: "2px 8px",
        fontFamily: "var(--font)",
        cursor: "pointer",
        lineHeight: 1.4,
        maxWidth: 220,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        transition: "border-color 0.1s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = color;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-dim)";
      }}
      title={filePath}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      <span style={{ color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis" }}>
        {name}
      </span>
    </span>
  );
}

// Extract file path from a Read tool call's input
function getReadFilePath(input: Record<string, unknown>): string | null {
  const raw = input.file_path ?? input.path;
  if (typeof raw === "string" && raw.length > 0) return raw;
  return null;
}

export default function ToolCallSummary({ groups }: ToolCallSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  if (groups.length === 0) return null;

  const totalLabel = `${groups.length} tool call${groups.length !== 1 ? "s" : ""}`;
  const summaryLine = buildSummaryLine(groups);

  // Collect file badges for Read calls
  const readPaths: string[] = [];
  for (const g of groups) {
    if (categorize(g.block.tool) === "Read") {
      const fp = getReadFilePath(g.block.input);
      if (fp) readPaths.push(fp);
    }
  }

  return (
    <div style={{ margin: "4px 0" }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          userSelect: "none",
          fontSize: 11,
          color: "var(--text-dimmer)",
          border: "1px solid var(--border-dim)",
          borderRadius: "var(--radius)",
          padding: "6px 10px",
          fontFamily: "var(--font)",
          transition: "border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--border-dim)";
        }}
      >
        {expanded ? (
          <ChevronDown
            size={12}
            style={{ color: "var(--text-dimmer)", flexShrink: 0 }}
          />
        ) : (
          <ChevronRight
            size={12}
            style={{ color: "var(--text-dimmer)", flexShrink: 0 }}
          />
        )}
        <span style={{ fontWeight: 600 }}>{totalLabel}</span>
        {!expanded && summaryLine && (
          <>
            <span style={{ color: "var(--border)" }}>|</span>
            <span>{summaryLine}</span>
          </>
        )}
      </div>

      {/* File badges for Read calls (always visible when collapsed) */}
      {!expanded && readPaths.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            marginTop: 6,
            paddingLeft: 2,
          }}
        >
          {readPaths.map((fp, i) => (
            <FileBadge key={i} filePath={fp} />
          ))}
        </div>
      )}

      {/* Expanded: individual tool calls */}
      {expanded && (
        <div style={{ paddingLeft: 4, paddingTop: 4 }}>
          {groups.map((g, i) => (
            <div key={i}>{g.node}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// Re-export FileBadge for use in streaming file-read rendering
export { FileBadge, getReadFilePath, categorize };
