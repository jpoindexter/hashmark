import { useState, useRef } from "react";
import { ToolIcon } from "./ToolRenderers";
import { ToolOutput } from "./ToolOutput";

interface TimelineGroupProps {
  tools: Array<{ name: string; input?: Record<string, unknown>; result?: string; isError?: boolean }>;
  elapsed?: number;
}

function formatLabel(name: string, input?: Record<string, unknown>): string {
  if (!input) return name;
  switch (name) {
    case "bash":  return `$ ${String(input.command ?? "").slice(0, 70)}`;
    case "read":  return `read ${String(input.file_path ?? "")}`;
    case "write": return `write ${String(input.file_path ?? "")}`;
    case "edit":  return `edit ${String(input.file_path ?? "")}`;
    case "glob":  return `glob ${String(input.pattern ?? "")}`;
    case "grep":  return `grep ${String(input.pattern ?? "")}`;
    default:      return name;
  }
}

export function TimelineGroup({ tools, elapsed }: TimelineGroupProps) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const hasError = tools.some(t => t.isError);
  const label = tools.length === 1
    ? formatLabel(tools[0].name, tools[0].input)
    : `${tools.length} tool calls`;

  const elapsedLabel = elapsed != null
    ? elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(1)}s`
    : null;

  const firstToolName = tools[0]?.name ?? "";
  const iconColor = hasError ? "var(--red)" : "var(--text-muted)";

  return (
    <div style={{ marginBottom: 6 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none", marginBottom: 0 }}
      >
        <span style={{ flex: 1, height: 1, background: "var(--border)", display: "block" }} />
        <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
          <ToolIcon name={firstToolName} color={iconColor} />
        </span>
        <span style={{
          fontSize: 10, color: hasError ? "var(--red)" : "var(--text-muted)",
          whiteSpace: "nowrap", flexShrink: 0, fontFamily: "var(--font-mono)",
        }}>
          {hasError ? "error in tools" : `worked${elapsedLabel ? ` for ${elapsedLabel}` : ""}`}
          {tools.length > 1 ? ` · ${tools.length} calls` : ` · ${label}`}
        </span>
        <span style={{ flex: 1, height: 1, background: "var(--border)", display: "block" }} />
      </div>
      <div
        ref={contentRef}
        style={{
          overflow: "hidden",
          maxHeight: open ? (contentRef.current?.scrollHeight ?? 2000) : 0,
          transition: "max-height 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div style={{ paddingTop: 4, paddingLeft: 2 }}>
          {tools.map((t, i) => (
            <ToolOutput key={i} name={t.name} input={t.input} result={t.result} isError={t.isError} />
          ))}
        </div>
      </div>
    </div>
  );
}
