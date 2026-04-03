import { useState } from "react";
import { Brain } from "lucide-react";

interface ThinkingBlockProps {
  content: string;
  id: string;
}

export default function ThinkingBlock({ content, id }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const preview = content.length > 80
    ? content.slice(0, 80).trimEnd() + "..."
    : content;

  return (
    <div
      data-thinking-id={id}
      style={{ padding: "4px 0", cursor: "pointer", userSelect: "none" }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Brain size={16} style={{ color: "var(--yellow)", flexShrink: 0 }} />
        <span style={{
          color: "var(--yellow)",
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
        }}>
          Thinking
        </span>
        {!expanded && (
          <span style={{
            color: "var(--text-dimmer)",
            fontSize: 12,
            fontFamily: "var(--font)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {preview}
          </span>
        )}
      </div>

      <div className="collapsible-content" data-open={expanded}>
        <div style={{
          paddingLeft: 24,
          paddingTop: 4,
          fontSize: 12,
          fontFamily: "var(--font)",
          color: "var(--text-dim)",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}>
          {content}
        </div>
      </div>
    </div>
  );
}
