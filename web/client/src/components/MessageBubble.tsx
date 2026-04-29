import { useState, useRef } from "react";
import { ToolOutput } from "./ToolOutput";
import { TimelineGroup } from "./TimelineGroup";
import { ToolGroup } from "./ToolGroup";
import type { ToolGroupEntry } from "./ToolGroup";
import { Markdown } from "./Markdown";
import type { Block, Message } from "../types";

// ── Context tool grouping ───────────────────────────────────────────────────

const CONTEXT_TOOLS = new Set(["read", "glob", "grep", "ls"]);

function isContextTool(b: Block): boolean {
  return b.type === "tool_use" && CONTEXT_TOOLS.has((b.name ?? "").toLowerCase());
}

export type ViewMode = "verbose" | "normal" | "summary";

function renderBlockGroups(blocks: Block[], viewMode: ViewMode = "verbose"): React.ReactNode[] {
  // Build a map of tool_use id → tool_result so we can join them at render time
  const resultMap = new Map<string, { content: string; isError: boolean }>();
  for (const b of blocks) {
    if (b.type === "tool_result" && b.id) {
      resultMap.set(b.id, {
        content: typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? ""),
        isError: b.isError ?? false,
      });
    }
  }

  const result: React.ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === "tool_result") { i++; continue; } // already consumed via resultMap
    if (b.type === "tool_use") {
      const toolBlocks: Block[] = [];
      while (i < blocks.length && blocks[i].type === "tool_use") {
        toolBlocks.push(blocks[i++]);
      }
      if (viewMode === "summary") continue;
      const withResults: ToolGroupEntry[] = toolBlocks.map(t => {
        const r = t.id ? resultMap.get(t.id) : undefined;
        return { name: t.name ?? "", input: t.input as Record<string, unknown>, result: r?.content, isError: r?.isError, isPending: false };
      });
      result.push(<ToolGroup key={`tg-${i}`} entries={withResults} />);
    } else {
      result.push(<RenderBlock key={i} block={b} />);
      i++;
    }
  }
  return result;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const wordCount = text.split(/\s+/).length;
  const approxSec = Math.max(1, Math.round(wordCount / 50));
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          fontSize: 11, color: "var(--text-muted)", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6, userSelect: "none",
          padding: "2px 0",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <path d="M6 1.5C3.515 1.5 1.5 3.515 1.5 6c0 1.38.625 2.614 1.612 3.445A1.5 1.5 0 004.5 10.5h3a1.5 1.5 0 001.388-.055C9.875 9.614 10.5 8.38 10.5 7a1 1 0 00-1-1H9V4.5A3 3 0 006 1.5z" stroke="currentColor" strokeWidth="1.1"/>
        </svg>
        Thought for ~{approxSec}s
        <span style={{ opacity: 0.5, marginLeft: 2, transition: "transform 150ms", display: "inline-block", transform: open ? "rotate(90deg)" : "none" }}>▸</span>
      </div>
      <div
        ref={contentRef}
        style={{
          overflow: "hidden",
          maxHeight: open ? (contentRef.current?.scrollHeight ?? 400) : 0,
          transition: "max-height 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div style={{
          marginTop: 6, padding: "8px 12px",
          background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)",
          borderLeft: "2px solid var(--border-focus)",
          fontSize: 11, color: "var(--text-muted)", fontStyle: "italic",
          whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: 300, overflow: "auto",
        }}>
          {text}
        </div>
      </div>
    </div>
  );
}

export function MsgCtxItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{ padding: "6px 14px", fontSize: 12, cursor: "pointer", color: danger ? "var(--red)" : "var(--text-dim)" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {label}
    </div>
  );
}

function RenderBlock({ block }: { block: Block }) {
  if (block.type === "compaction") {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 0", margin: "4px 0",
        color: "var(--text-muted)", fontSize: 11,
      }}>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <span>↻ {block.text ?? "Context compacted"}</span>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
    );
  }
  if (block.type === "text" && block.text) {
    return (
      <div style={{ marginBottom: 4, lineHeight: 1.65 }}>
        <Markdown text={block.text} />
      </div>
    );
  }
  if (block.type === "thinking" && block.text) {
    return <ThinkingBlock text={block.text} />;
  }
  if (block.type === "tool_use") {
    return <ToolOutput name={block.name ?? ""} input={block.input} idx={0} />;
  }
  return null;
}

// ── MessageBubble ───────────────────────────────────────────────────────────

export function MessageBubble({ message, viewMode = "verbose", onContextMenu, onFork, onRewind }: {
  message: Message;
  viewMode?: ViewMode;
  onContextMenu?: (e: React.MouseEvent) => void;
  onFork?: (messageId: string) => void;
  onRewind?: (messageId: string) => void;
}) {
  const isUser = message.role === "user";
  const blocks = message.blocks ?? [];
  const [copied, setCopied] = useState(false);
  const [forking, setForking] = useState(false);
  const [rewinding, setRewinding] = useState(false);

  const handleCopy = () => {
    const text = blocks.filter(b => b.type === "text" && b.text).map(b => b.text).join("\n\n") || message.content;
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleFork = () => {
    if (forking) return;
    setForking(true);
    onFork?.(message.id);
    setTimeout(() => setForking(false), 1500);
  };

  const handleRewind = () => {
    if (rewinding) return;
    setRewinding(true);
    onRewind?.(message.id);
    setTimeout(() => setRewinding(false), 2000);
  };

  return (
    <div
      style={{
        marginBottom: 16, display: "flex", flexDirection: "column",
        alignItems: "flex-start", width: "100%",
        animation: "gc-fade-in 0.45s cubic-bezier(0.16, 1, 0.3, 1) both",
        contentVisibility: "auto",
        containIntrinsicSize: "auto 200px",
      } as React.CSSProperties}
      onContextMenu={onContextMenu}
    >
      {isUser ? (
        /* User message: full-width card, aligned right (Cursor .composer-human-message) */
        <div style={{
          alignSelf: "flex-end",
          width: "100%",
          background: "var(--bg-elevated)",
          border: "1px solid color-mix(in srgb, var(--text) 12%, transparent)",
          borderRadius: 8,
          boxSizing: "border-box",
          padding: "10px 14px",
          position: "relative",
        }}>
          {message.bookmarked && (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="var(--accent)" style={{ position: "absolute", top: 8, right: 8, flexShrink: 0 }} title="Bookmarked">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          )}
          {blocks.length > 0
            ? <div>{renderBlockGroups(blocks, viewMode)}</div>
            : <span style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{message.content}</span>
          }
        </div>
      ) : (
        /* Assistant message: no bubble, full width */
        <div style={{ width: "100%" }}>
          {message.bookmarked && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4, paddingInline: 2 }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="var(--accent)" style={{ flexShrink: 0 }} title="Bookmarked">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
          )}
          {blocks.length > 0
            ? <div style={{ lineHeight: 1.65 }}>{renderBlockGroups(blocks, viewMode)}</div>
            : <div style={{ lineHeight: 1.65 }}><Markdown text={message.content} /></div>
          }
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, paddingInline: 2 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", opacity: 0.6 }} title={new Date(message.created_at).toLocaleString()}>
              {new Date(message.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              {message.duration_ms != null && ` · ${message.duration_ms < 1000 ? `${message.duration_ms}ms` : `${(message.duration_ms / 1000).toFixed(1)}s`}`}
            </span>
            <button
              onClick={handleCopy}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 4px", fontSize: 10, color: copied ? "var(--green)" : "var(--text-muted)", transition: "color 100ms", opacity: 0.7 }}
              onMouseEnter={e => { if (!copied) { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.opacity = "1"; } }}
              onMouseLeave={e => { if (!copied) { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.opacity = "0.7"; } }}
            >{copied ? "Copied!" : "Copy"}</button>
            {onFork && (
              <button
                onClick={handleFork}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 4px", fontSize: 10, color: forking ? "var(--green)" : "var(--text-muted)", transition: "color 100ms", opacity: 0.7 }}
                onMouseEnter={e => { if (!forking) { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.opacity = "1"; } }}
                onMouseLeave={e => { if (!forking) { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.opacity = "0.7"; } }}
              >{forking ? "Forked!" : "Fork"}</button>
            )}
            {onRewind && (
              <button
                onClick={handleRewind}
                title="Rewind to before this turn (git reset --hard)"
                style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 4px", fontSize: 10, color: rewinding ? "var(--orange)" : "var(--text-muted)", transition: "color 100ms", opacity: 0.7 }}
                onMouseEnter={e => { if (!rewinding) { e.currentTarget.style.color = "var(--orange)"; e.currentTarget.style.opacity = "1"; } }}
                onMouseLeave={e => { if (!rewinding) { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.opacity = "0.7"; } }}
              >{rewinding ? "Rewinding…" : "Rewind"}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
