import { useRef, useCallback, useState } from "react";
import { Copy, RotateCcw, Pencil } from "lucide-react";
import { AssistantContent } from "./AssistantContent";
import PlanReviewGate from "./PlanReviewGate";
import { fmtTime, fmtTokens } from "../../lib/format";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
}

export type { Message };

function fmtDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

export { fmtDuration };


export const ASSISTANT_CONTENT_STYLE: React.CSSProperties = {
  fontSize: 14,
  color: "var(--text)",
  lineHeight: 1.6,
};

const TIMESTAMP_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: "var(--text-dimmer)",
  transition: "opacity 0.15s",
  userSelect: "none",
};

function UserBubble({ msg, onContextMenu, showRetry, onRetry }: {
  msg: Message;
  onContextMenu: (e: React.MouseEvent) => void;
  showRetry?: boolean;
  onRetry?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={onContextMenu}
    >
      <div style={{ maxWidth: "85%" }}>
        <div style={{
          background: "var(--bg-3)",
          border: `1px solid ${showRetry ? "var(--red)" : "var(--border-dim)"}`,
          borderRadius: "var(--radius-lg)",
          padding: "10px 14px",
          fontSize: 14,
          color: "var(--text)",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
        }}>
          {msg.content}
        </div>
      </div>
      {showRetry && onRetry && <RetryButton onClick={onRetry} />}
      <div style={{
        display: "flex", alignItems: "center", gap: 4, marginTop: 4,
        opacity: hovered ? 1 : 0, transition: "opacity 0.1s",
      }}>
        <span style={{ fontSize: 10, color: "var(--text-dimmer)" }}>{fmtTime(msg.created_at)}</span>
        <CopyButton text={msg.content} />
      </div>
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginTop: 8,
    }}>
      <div style={{
        fontSize: 11,
        color: "var(--red, #f85149)",
        fontFamily: "var(--font-ui)",
      }}>
        Stream failed
      </div>
      <button
        onClick={onClick}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 10px",
          fontSize: 11,
          fontFamily: "var(--font-ui)",
          fontWeight: 600,
          color: "var(--accent)",
          background: "var(--accent-bg, rgba(63,185,80,0.1))",
          border: "1px solid var(--accent)",
          borderRadius: 4,
          cursor: "pointer",
          transition: "background 0.1s",
        }}
        className="hoverable-strong"
      >
        Retry
      </button>
    </div>
  );
}

function HoverActions({ children }: { children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "relative" }}
    >
      {children}
      {hovered && (
        <div style={{
          position: "absolute", top: -12, right: 0,
          display: "flex", gap: 2, background: "var(--bg-2)",
          border: "1px solid var(--border-dim)", borderRadius: "var(--radius)",
          padding: "2px 4px", zIndex: 10,
        }}>
          {/* Action buttons are rendered as children in the parent */}
        </div>
      )}
    </div>
  );
}

function ActionBar({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  if (!visible) return null;
  return (
    <div style={{
      display: "flex", gap: 2, marginTop: 4,
      opacity: 0.7, transition: "opacity 0.1s",
    }}>
      {children}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const copied = useRef(false);
  const iconRef = useRef<HTMLButtonElement>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      copied.current = true;
      if (iconRef.current) iconRef.current.dataset.copied = "true";
      setTimeout(() => {
        copied.current = false;
        if (iconRef.current) iconRef.current.dataset.copied = "false";
      }, 1500);
    });
  }, [text]);

  return (
    <button
      ref={iconRef}
      onClick={handleCopy}
      className="btn-icon"
      title="Copy response"
      style={{ width: 18, height: 18 }}
    >
      <Copy size={11} />
    </button>
  );
}

function AssistantBubble({ msg, onContextMenu, showRetry, onRetry, responseTime }: {
  msg: Message;
  onContextMenu: (e: React.MouseEvent) => void;
  showRetry?: boolean;
  onRetry?: () => void;
  responseTime?: number;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={onContextMenu}
    >
      <div style={{
        ...ASSISTANT_CONTENT_STYLE,
        animation: "fadeIn 0.2s ease forwards",
      }}>
        <AssistantContent text={msg.content} />
      </div>
      {showRetry && onRetry && <RetryButton onClick={onRetry} />}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        marginTop: 6, fontSize: 10, color: "var(--text-dimmer)", userSelect: "none",
        opacity: hovered ? 1 : 0.5, transition: "opacity 0.1s",
      }}>
        <span>{fmtTime(msg.created_at)}</span>
        {responseTime != null && <span>{fmtDuration(responseTime)}</span>}
        {msg.output_tokens != null && msg.output_tokens > 0 && (
          <span>{fmtTokens(msg.output_tokens)} tok</span>
        )}
        <CopyButton text={msg.content} />
      </div>
    </div>
  );
}

export default function MessageBubble({ msg, showPlanGate, onContextMenu, showRetry, onRetry, showUserRetry, responseTime }: {
  msg: Message;
  showPlanGate: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  showRetry?: boolean;
  onRetry?: () => void;
  showUserRetry?: boolean;
  responseTime?: number;
}) {
  if (msg.role === "user") return <UserBubble msg={msg} onContextMenu={onContextMenu} showRetry={showUserRetry} onRetry={onRetry} />;
  return (
    <div>
      <AssistantBubble msg={msg} onContextMenu={onContextMenu} showRetry={showRetry} onRetry={onRetry} responseTime={responseTime} />
      {showPlanGate && <PlanReviewGate planText={msg.content} />}
    </div>
  );
}
