import { useRef } from "react";
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

const USER_AVATAR_STYLE: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: "50%",
  background: "var(--bg-4)",
  border: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 9,
  color: "var(--text-dim)",
  flexShrink: 0,
  fontFamily: "var(--font)",
  fontWeight: 600,
  letterSpacing: "0.05em",
  marginTop: 2,
};

export const ASSISTANT_CONTENT_STYLE: React.CSSProperties = {
  paddingLeft: 12,
  fontSize: 13,
  color: "var(--text)",
  lineHeight: 1.6,
  fontFamily: "var(--font-ui)",
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
  const timestampRef = useRef<HTMLDivElement>(null);
  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}
      onMouseEnter={() => { if (timestampRef.current) timestampRef.current.style.opacity = "1"; }}
      onMouseLeave={() => { if (timestampRef.current) timestampRef.current.style.opacity = "0"; }}
      onContextMenu={onContextMenu}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, maxWidth: "80%" }}>
        <div style={{ flex: 1 }}>
          <div style={{
            background: "var(--bg-4)",
            border: `1px solid ${showRetry ? "var(--red, #f85149)" : "var(--border)"}`,
            padding: "8px 12px 8px 14px",
            fontSize: 13,
            color: "var(--text)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            fontFamily: "var(--font-ui)",
          }}>
            {msg.content}
          </div>
        </div>
        <div style={USER_AVATAR_STYLE}>U</div>
      </div>
      {showRetry && onRetry && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginRight: 30, marginTop: 4 }}>
          <RetryButton onClick={onRetry} />
        </div>
      )}
      <div ref={timestampRef} style={{ ...TIMESTAMP_STYLE, marginTop: 3, marginRight: 30, opacity: 0 }}>
        {fmtTime(msg.created_at)}
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
      paddingLeft: 14,
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

function AssistantBubble({ msg, onContextMenu, showRetry, onRetry, responseTime }: {
  msg: Message;
  onContextMenu: (e: React.MouseEvent) => void;
  showRetry?: boolean;
  onRetry?: () => void;
  responseTime?: number;
}) {
  const timestampRef = useRef<HTMLDivElement>(null);
  return (
    <div
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}
      onMouseEnter={() => { if (timestampRef.current && responseTime == null) timestampRef.current.style.opacity = "1"; }}
      onMouseLeave={() => { if (timestampRef.current && responseTime == null) timestampRef.current.style.opacity = "0"; }}
      onContextMenu={onContextMenu}
    >
      <div style={{
        ...ASSISTANT_CONTENT_STYLE,
        borderLeft: `2px solid ${showRetry ? "var(--red, #f85149)" : "var(--accent)"}`,
        animation: "fadeIn 0.2s ease forwards",
      }}>
        <AssistantContent text={msg.content} />
      </div>
      {showRetry && onRetry && <RetryButton onClick={onRetry} />}
      <div ref={timestampRef} style={{ ...TIMESTAMP_STYLE, display: "flex", gap: 8, marginTop: 3, paddingLeft: 14, opacity: responseTime != null ? 1 : 0 }}>
        <span>{fmtTime(msg.created_at)}</span>
        {responseTime != null && (
          <span>{fmtDuration(responseTime)}</span>
        )}
        {msg.output_tokens != null && msg.output_tokens > 0 && (
          <span>{fmtTokens(msg.output_tokens)} tok</span>
        )}
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
