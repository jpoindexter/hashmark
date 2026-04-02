import { useState, useEffect, useMemo } from "react";
import ThinkingBlock from "./ThinkingBlock";
import ToolCallSummary, { FileBadge, getReadFilePath, categorize } from "./ToolSummary";
import { ASSISTANT_CONTENT_STYLE, fmtDuration } from "./MessageBubbles";
import ToolResultCard from "./ToolResultCard";
import { EditPreview } from "./EditPreview";
import { AssistantContent } from "./AssistantContent";
import type { StreamingState, ContentBlock, ToolUseBlockData } from "../ChatMessages";
import { fmtTokens } from "../../lib/format";

export { type StreamingState, type ContentBlock };

export const CURSOR_STYLE: React.CSSProperties = {
  display: "inline-block",
  width: 7,
  height: 13,
  background: "var(--accent)",
  verticalAlign: "text-bottom",
  marginLeft: 2,
  animation: "cursor-blink 1s step-end infinite",
};

function toolAccentColor(tool: string): string {
  const name = tool.toLowerCase();
  if (["write", "edit", "create", "multiedit"].includes(name)) return "var(--accent)";
  if (["bash", "shell"].includes(name)) return "var(--yellow)";
  if (["read", "glob", "grep"].includes(name)) return "var(--blue)";
  return "var(--text-dimmer)";
}

function primaryArg(tool: string, input: Record<string, unknown>): string {
  const name = tool.toLowerCase();
  if (name === "bash" || name === "shell") return String(input.command ?? input.cmd ?? "");
  if (name === "read") return String(input.file_path ?? input.path ?? "");
  if (name === "glob" || name === "grep") return String(input.pattern ?? "");
  const path = input.file_path ?? input.path ?? input.new_file_path ?? "";
  if (path) return String(path);
  for (const v of Object.values(input)) {
    if (typeof v === "string") return v;
  }
  return "";
}

export function ToolUseBlock({ block }: { block: ToolUseBlockData }) {
  const accent = toolAccentColor(block.tool);
  const arg = primaryArg(block.tool, block.input);
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      background: "var(--bg-3)",
      border: "1px solid var(--border-dim)",
      borderLeft: `2px solid ${accent}`,
      borderRadius: "var(--radius-sm, 4px)",
      padding: "4px 8px",
      fontSize: 11,
      fontFamily: "var(--font)",
      margin: "4px 0",
      lineHeight: 1.4,
    }}>
      <span style={{ color: accent, fontWeight: 600, flexShrink: 0 }}>[{block.tool}]</span>
      {arg && (
        <span style={{
          color: "var(--text-dim)",
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

function CostLine({ cost, usage, responseTime }: { cost?: number; usage?: { input_tokens: number; output_tokens: number }; responseTime?: number }) {
  if (!cost && !usage && !responseTime) return null;
  const parts: string[] = [];
  if (responseTime != null) parts.push(fmtDuration(responseTime));
  if (cost != null) parts.push(`$${cost.toFixed(4)}`);
  if (usage) parts.push(`${fmtTokens(usage.input_tokens)}in / ${fmtTokens(usage.output_tokens)}out`);
  return (
    <div style={{
      fontSize: 10,
      color: "var(--text-dimmer)",
      fontFamily: "var(--font)",
      marginTop: 6,
      paddingLeft: 14,
      userSelect: "none",
    }}>
      {parts.join(" · ")}
    </div>
  );
}

type StreamSegment =
  | { kind: "node"; key: number; node: React.ReactNode }
  | { kind: "tool_group"; key: number; blocks: ToolUseBlockData[]; startIdx: number };

export function segmentBlocks(blocks: ContentBlock[]): StreamSegment[] {
  const segments: StreamSegment[] = [];
  let segKey = 0;
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    if (block.type === "tool_use") {
      const startIdx = i;
      const toolBlocks: ToolUseBlockData[] = [];
      while (i < blocks.length && blocks[i].type === "tool_use") {
        toolBlocks.push(blocks[i] as ToolUseBlockData);
        i++;
      }
      segments.push({ kind: "tool_group", key: segKey++, blocks: toolBlocks, startIdx });
      continue;
    }

    if (block.type === "text") {
      if (block.text) {
        segments.push({ kind: "node", key: segKey++, node: <AssistantContent text={block.text} /> });
      }
      i++;
      continue;
    }

    if (block.type === "tool_result") {
      segments.push({
        kind: "node",
        key: segKey++,
        node: <ToolResultCard block={block} />,
      });
      i++;
      continue;
    }

    if (block.type === "progress") {
      segments.push({
        kind: "node",
        key: segKey++,
        node: (
          <div style={{
            fontSize: 11,
            color: "var(--text-dimmer)",
            fontFamily: "var(--font)",
            margin: "2px 0",
            fontStyle: "italic",
          }}>
            {block.text}
          </div>
        ),
      });
      i++;
      continue;
    }

    if (block.type === "thinking") {
      segments.push({
        kind: "node",
        key: segKey++,
        node: <ThinkingBlock content={block.content} id={block.id ?? String(i)} />,
      });
      i++;
      continue;
    }

    i++;
  }

  return segments;
}

function StreamingTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - startTime);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startTime), 100);
    return () => clearInterval(id);
  }, [startTime]);
  return <span>{fmtDuration(elapsed)}</span>;
}

export default function StreamingBubble({ state, legacyText, streamStartTime }: { state?: StreamingState; legacyText: string; streamStartTime?: number }) {
  const hasBlocks = state && state.blocks.length > 0;

  const segments = useMemo(
    () => (hasBlocks ? segmentBlocks(state.blocks) : []),
    [hasBlocks, state?.blocks]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <div style={{
        ...ASSISTANT_CONTENT_STYLE,
        borderLeft: "2px solid var(--accent)",
        width: "100%",
      }}>
        {hasBlocks ? (
          <>
            {segments.map((seg) => {
              if (seg.kind === "node") {
                return <div key={seg.key}>{seg.node}</div>;
              }
              if (seg.blocks.length === 1) {
                const b = seg.blocks[0];
                const isRead = categorize(b.tool) === "Read";
                const isEdit = ["edit", "write", "multiedit"].includes(b.tool.toLowerCase());
                const fp = isRead ? getReadFilePath(b.input) : null;
                return (
                  <div key={seg.key}>
                    <ToolUseBlock block={b} />
                    {fp && (
                      <div style={{ paddingLeft: 2, marginTop: 2, marginBottom: 4 }}>
                        <FileBadge filePath={fp} />
                      </div>
                    )}
                    {isEdit && <EditPreview block={b} />}
                  </div>
                );
              }
              return (
                <ToolCallSummary
                  key={seg.key}
                  groups={seg.blocks.map((b) => ({
                    block: b,
                    node: <ToolUseBlock block={b} />,
                  }))}
                />
              );
            })}
            <span style={CURSOR_STYLE} />
          </>
        ) : legacyText ? (
          <>
            <AssistantContent text={legacyText} />
            <span style={CURSOR_STYLE} />
          </>
        ) : (
          <div style={{ display: "flex", gap: 4, alignItems: "center", paddingTop: 4 }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                width: 5,
                height: 5,
                background: "var(--accent)",
                borderRadius: "50%",
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        )}
      </div>

      {state && (state.cost != null || state.usage != null) ? (
        <CostLine cost={state.cost} usage={state.usage} />
      ) : (
        <div style={{ display: "flex", gap: 8, fontSize: 10, color: "var(--text-dimmer)", marginTop: 3, paddingLeft: 14, userSelect: "none" }}>
          <span>typing...</span>
          {streamStartTime != null && <StreamingTimer startTime={streamStartTime} />}
        </div>
      )}
    </div>
  );
}
