import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface ToolSummaryProps {
  toolCount: number;
  messageCount: number;
  children?: React.ReactNode;
}

export default function ToolSummary({ toolCount, messageCount, children }: ToolSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  const parts: string[] = [];
  if (toolCount > 0) parts.push(`${toolCount} tool call${toolCount !== 1 ? "s" : ""}`);
  if (messageCount > 0) parts.push(`${messageCount} message${messageCount !== 1 ? "s" : ""}`);
  const label = parts.join(", ") || "No activity";

  return (
    <div style={{ padding: "2px 0" }}>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <ChevronDown
          size={14}
          style={{
            color: "var(--text-dimmer)",
            flexShrink: 0,
            transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 0.15s ease",
          }}
        />
        <span style={{
          color: "var(--text-dimmer)",
          fontSize: 11,
          fontFamily: "var(--font)",
        }}>
          {label}
        </span>
      </div>

      {expanded && children && (
        <div style={{ paddingLeft: 18, paddingTop: 4 }}>
          {children}
        </div>
      )}
    </div>
  );
}
