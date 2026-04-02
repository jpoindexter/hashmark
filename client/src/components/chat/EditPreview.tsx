import { useState } from "react";
import type { ToolUseBlockData } from "../ChatMessages";

function isEditTool(tool: string): boolean {
  const name = tool.toLowerCase();
  return name === "edit" || name === "multiedit";
}

function isWriteTool(tool: string): boolean {
  return tool.toLowerCase() === "write";
}

function getFilePath(input: Record<string, unknown>): string {
  return String(input.file_path ?? input.path ?? input.new_file_path ?? "");
}

function shortPath(path: string): string {
  const parts = path.split("/");
  return parts.length > 3 ? ".../" + parts.slice(-3).join("/") : path;
}

export function EditPreview({ block }: { block: ToolUseBlockData }) {
  const [expanded, setExpanded] = useState(false);

  if (!isEditTool(block.tool) && !isWriteTool(block.tool)) return null;

  const filePath = getFilePath(block.input);
  const oldStr = String(block.input.old_string ?? "");
  const newStr = String(block.input.new_string ?? block.input.content ?? "");

  if (!oldStr && !newStr) return null;

  const isWrite = isWriteTool(block.tool);
  const preview = isWrite
    ? newStr.split("\n").slice(0, 5).join("\n")
    : null;

  return (
    <div style={{
      margin: "2px 0 4px",
      background: "var(--bg-3)",
      border: "1px solid var(--border-dim)",
      borderRadius: "var(--radius)",
      overflow: "hidden",
      fontSize: 11,
      fontFamily: "var(--font)",
    }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="hoverable"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          width: "100%", padding: "4px 8px",
          background: "none", border: "none", cursor: "pointer",
          fontSize: 10, fontFamily: "var(--font)",
          color: "var(--text-dimmer)", textAlign: "left",
        }}
      >
        <span style={{ color: "var(--accent)" }}>{expanded ? "▾" : "▸"}</span>
        <span>{isWrite ? "write" : "edit"}</span>
        <span style={{ color: "var(--text-dim)" }}>{shortPath(filePath)}</span>
        {!isWrite && oldStr && (
          <span style={{ marginLeft: "auto", color: "var(--text-dimmer)" }}>
            <span style={{ color: "var(--red)" }}>-{oldStr.split("\n").length}</span>
            {" "}
            <span style={{ color: "var(--accent)" }}>+{newStr.split("\n").length}</span>
          </span>
        )}
      </button>

      {/* Diff content */}
      {expanded && !isWrite && oldStr && (
        <div style={{
          borderTop: "1px solid var(--border-dim)",
          maxHeight: 300,
          overflowY: "auto",
        }}>
          {oldStr.split("\n").map((line, i) => (
            <div key={`old-${i}`} style={{
              padding: "0 8px",
              background: "rgba(248,81,73,0.06)",
              color: "var(--red)",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}>
              <span style={{ userSelect: "none", color: "var(--text-dimmer)", marginRight: 8 }}>-</span>
              {line}
            </div>
          ))}
          {newStr.split("\n").map((line, i) => (
            <div key={`new-${i}`} style={{
              padding: "0 8px",
              background: "rgba(63,185,80,0.06)",
              color: "var(--accent)",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}>
              <span style={{ userSelect: "none", color: "var(--text-dimmer)", marginRight: 8 }}>+</span>
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Write preview */}
      {expanded && isWrite && preview && (
        <div style={{
          borderTop: "1px solid var(--border-dim)",
          padding: "4px 8px",
          color: "var(--text-dim)",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          maxHeight: 200,
          overflowY: "auto",
        }}>
          {preview}
          {newStr.split("\n").length > 5 && (
            <div style={{ color: "var(--text-dimmer)", fontStyle: "italic", marginTop: 4 }}>
              ...{newStr.split("\n").length - 5} more lines
            </div>
          )}
        </div>
      )}
    </div>
  );
}
