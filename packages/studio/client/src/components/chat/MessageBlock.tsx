import type { MessagePart } from "../../types/messages";
import ThinkingBlock from "./ThinkingBlock";
import { Wrench, Bot, RefreshCw } from "lucide-react";

// Inline tool call row -- wrench icon + tool name
function ToolUseInline({ name, input }: { name: string; input: Record<string, unknown> }) {
  const arg = extractPrimaryArg(name, input);
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "3px 0",
      fontSize: 12,
      fontFamily: "var(--font)",
    }}>
      <Wrench size={14} style={{ color: "var(--text-dimmer)", flexShrink: 0 }} />
      <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>{name}</span>
      {arg && (
        <span style={{
          color: "var(--text-dimmer)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {arg}
        </span>
      )}
    </div>
  );
}

// Inline agent dispatch row -- bot icon + description
function AgentRow({ description }: { description: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "3px 0",
      fontSize: 12,
      fontFamily: "var(--font)",
    }}>
      <Bot size={14} style={{ color: "var(--blue)", flexShrink: 0 }} />
      <span style={{ color: "var(--text-dim)" }}>{description}</span>
    </div>
  );
}

// Inline skill activation row -- refresh icon + name + badge
function SkillRow({ name }: { name: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "3px 0",
      fontSize: 12,
      fontFamily: "var(--font)",
    }}>
      <RefreshCw size={14} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
      <span style={{ color: "var(--text-dim)" }}>{name}</span>
      <span style={{
        fontSize: 9,
        fontWeight: 600,
        color: "var(--accent)",
        background: "var(--accent-bg)",
        padding: "1px 5px",
        borderRadius: 3,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}>
        activated
      </span>
    </div>
  );
}

// Pull the most relevant argument from tool input for display
function extractPrimaryArg(tool: string, input: Record<string, unknown>): string {
  const name = tool.toLowerCase();
  if (name === "bash" || name === "shell") return String(input.command ?? input.cmd ?? "");
  if (name === "read") return String(input.file_path ?? input.path ?? "");
  if (name === "glob" || name === "grep") return String(input.pattern ?? "");
  const path = input.file_path ?? input.path ?? input.new_file_path;
  if (path) return String(path);
  for (const v of Object.values(input)) {
    if (typeof v === "string") return v;
  }
  return "";
}

export default function MessageBlock({ part }: { part: MessagePart }) {
  switch (part.type) {
    case "thinking":
      return <ThinkingBlock content={part.content} id={part.id} />;
    case "tool_use":
      return <ToolUseInline name={part.name} input={part.input} />;
    case "text":
      // Text is handled by the parent's AssistantContent
      return null;
    case "progress":
      return (
        <div style={{
          color: "var(--text-dimmer)",
          fontStyle: "italic",
          fontSize: 12,
          padding: "2px 0",
          fontFamily: "var(--font)",
        }}>
          {part.text}
        </div>
      );
    case "error":
      return (
        <div style={{
          color: "var(--red)",
          fontSize: 12,
          padding: "4px 0",
          fontFamily: "var(--font)",
        }}>
          {part.message}
        </div>
      );
    case "agent":
      return <AgentRow description={part.description} />;
    case "skill":
      return <SkillRow name={part.name} />;
    default:
      return null;
  }
}
