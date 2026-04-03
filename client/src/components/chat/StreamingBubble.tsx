import { useState, useEffect, useMemo } from "react";
import { FileText, Terminal, Pencil, Search, Globe, Bot, Wrench, FilePlus } from "lucide-react";
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

function toolIcon(tool: string): React.ReactNode {
  const name = tool.toLowerCase();
  const s = 13;
  if (name === "read") return <FileText size={s} />;
  if (name === "write") return <FilePlus size={s} />;
  if (name === "edit" || name === "multiedit") return <Pencil size={s} />;
  if (name === "bash" || name === "shell") return <Terminal size={s} />;
  if (name === "glob" || name === "grep") return <Search size={s} />;
  if (name === "agent") return <Bot size={s} />;
  if (name === "webfetch" || name === "websearch") return <Globe size={s} />;
  if (name === "toolsearch") return <Wrench size={s} />;
  return <Wrench size={s} />;
}

function toolColor(tool: string): string {
  const name = tool.toLowerCase();
  if (name === "read") return "var(--blue)";
  if (name === "write") return "var(--green)";
  if (name === "edit" || name === "multiedit") return "var(--yellow)";
  if (name === "bash" || name === "shell") return "var(--orange)";
  if (name === "glob" || name === "grep") return "var(--text-dim)";
  if (name === "agent") return "var(--purple)";
  return "var(--text-dimmer)";
}

function toolLabel(tool: string): string {
  const name = tool.toLowerCase();
  if (name === "read") return "Read";
  if (name === "write") return "Write";
  if (name === "edit") return "Edit";
  if (name === "multiedit") return "MultiEdit";
  if (name === "bash" || name === "shell") return "Bash";
  if (name === "glob") return "Glob";
  if (name === "grep") return "Grep";
  if (name === "agent") return "Agent";
  if (name === "webfetch") return "Fetch";
  if (name === "websearch") return "Search";
  if (name === "toolsearch") return "ToolSearch";
  return tool;
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

function shortenPath(p: string): string {
  const parts = p.split("/");
  if (parts.length <= 3) return p;
  return ".../" + parts.slice(-2).join("/");
}

export function ToolUseBlock({ block, pending }: { block: ToolUseBlockData; pending?: boolean }) {
  const color = toolColor(block.tool);
  const arg = primaryArg(block.tool, block.input);
  const lbl = toolLabel(block.tool);
  const isBash = ["bash", "shell"].includes(block.tool.toLowerCase());

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      margin: "3px 0",
      fontSize: 13,
      lineHeight: 1.4,
      background: "var(--bg-3)",
      borderLeft: `2px solid ${color}`,
      borderRadius: "var(--radius)",
    }}>
      <span style={{ color, flexShrink: 0, display: "flex" }}>{toolIcon(block.tool)}</span>
      <span style={{
        fontWeight: 500, color: "var(--text)", flexShrink: 0,
        ...(pending ? {
          background: `linear-gradient(90deg, var(--text) 40%, var(--text-dimmer) 50%, var(--text) 60%)`,
          backgroundSize: "200% 100%",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          animation: "text-shimmer 1.5s ease-in-out infinite",
        } : {}),
      }}>{lbl}</span>
      {arg && (
        <span style={{
          color: "var(--text-dim)",
          fontFamily: "var(--font)",
          fontSize: 12,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}>
          {isBash ? arg : shortenPath(arg)}
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
      marginTop: 6,
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

  // Find the last tool_use block index that has no matching tool_result (= still running)
  const pendingToolIds = useMemo(() => {
    if (!hasBlocks) return new Set<string>();
    const resultIds = new Set<string>();
    const useIds: string[] = [];
    for (const b of state.blocks) {
      if (b.type === "tool_result") resultIds.add(b.toolUseId);
      if (b.type === "tool_use" && b.toolUseId) useIds.push(b.toolUseId);
    }
    return new Set(useIds.filter(id => !resultIds.has(id)));
  }, [hasBlocks, state?.blocks]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <div style={{
        ...ASSISTANT_CONTENT_STYLE,
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
                const isPending = !!(b.toolUseId && pendingToolIds.has(b.toolUseId));
                return (
                  <div key={seg.key}>
                    <ToolUseBlock block={b} pending={isPending} />
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
          <span style={{
            fontSize: 13, fontWeight: 500,
            background: "linear-gradient(90deg, var(--text-dim) 40%, var(--text-dimmer) 50%, var(--text-dim) 60%)",
            backgroundSize: "200% 100%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animation: "text-shimmer 1.5s ease-in-out infinite",
          }}>
            Thinking...
          </span>
        )}
      </div>

      {state && (state.cost != null || state.usage != null) ? (
        <CostLine cost={state.cost} usage={state.usage} />
      ) : (
        <div style={{ display: "flex", gap: 8, fontSize: 10, color: "var(--text-dimmer)", marginTop: 3, userSelect: "none" }}>
          <span>typing...</span>
          {streamStartTime != null && <StreamingTimer startTime={streamStartTime} />}
        </div>
      )}
    </div>
  );
}
