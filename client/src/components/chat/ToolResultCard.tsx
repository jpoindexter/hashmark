import { useState, useCallback } from "react";
import { Copy } from "lucide-react";
import type { ToolResultBlockData } from "../ChatMessages";

function truncate(text: string, maxLines: number): { text: string; truncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { text, truncated: false };
  return { text: lines.slice(0, maxLines).join("\n"), truncated: true };
}

export default function ToolResultCard({ block }: { block: ToolResultBlockData }) {
  const [expanded, setExpanded] = useState(false);
  const raw = typeof block.content === "string" ? block.content : JSON.stringify(block.content, null, 2);

  if (!raw || raw.length < 2) return null;

  const maxLines = 8;
  const { text: preview, truncated } = truncate(raw, maxLines);
  const displayText = expanded ? raw : preview;
  const lineCount = raw.split("\n").length;

  return (
    <div style={{
      margin: "4px 0",
      background: block.isError ? "rgba(248,81,73,0.05)" : "var(--bg-3)",
      border: `1px solid ${block.isError ? "rgba(248,81,73,0.2)" : "var(--border-dim)"}`,
      borderRadius: "var(--radius)",
      overflow: "hidden",
      fontSize: 11,
      fontFamily: "var(--font)",
      position: "relative",
    }}>
      <button
        className="btn-icon"
        title="Copy output"
        onClick={() => navigator.clipboard.writeText(raw)}
        style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, zIndex: 1 }}
      >
        <Copy size={10} />
      </button>
      <div style={{
        padding: "6px 8px",
        color: block.isError ? "var(--red)" : "var(--text-dim)",
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: expanded ? "none" : 180,
        overflow: "hidden",
      }}>
        {displayText}
      </div>
      {truncated && (
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            display: "block",
            width: "100%",
            padding: "3px 8px",
            fontSize: 10,
            fontFamily: "var(--font)",
            color: "var(--text-dimmer)",
            background: "var(--bg-2)",
            border: "none",
            borderTop: "1px solid var(--border-dim)",
            cursor: "pointer",
            textAlign: "left",
          }}
          className="hoverable"
        >
          {expanded ? "collapse" : `${lineCount - maxLines} more lines`}
        </button>
      )}
    </div>
  );
}
