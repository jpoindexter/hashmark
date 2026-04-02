import { fmtTime, fmtTokens } from "../../lib/format";
import type { Message } from "./types";
import AssistantContent from "./AssistantContent";

function AvatarBadge({ role }: { role: "user" | "assistant" }) {
  const isUser = role === "user";
  return (
    <div style={{
      width: "28px", height: "28px",
      background: isUser ? "var(--bg-3)" : "var(--accent-bg)",
      border: `1px solid ${isUser ? "var(--border)" : "var(--accent)"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "9px", color: isUser ? "var(--text-dim)" : "var(--accent)",
      flexShrink: 0, fontFamily: "var(--font)", letterSpacing: "0.05em",
      fontWeight: 600,
    }}>
      {isUser ? "YOU" : "AI"}
    </div>
  );
}

export { AvatarBadge };

export default function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex", gap: "12px", alignItems: "flex-start",
      flexDirection: isUser ? "row-reverse" : "row",
    }}>
      <AvatarBadge role={msg.role} />
      <div style={{ flex: 1, maxWidth: "85%" }}>
        {isUser ? (
          <div style={{
            background: "var(--bg-3)", border: "1px solid var(--border)",
            padding: "8px 12px", fontSize: "12px", color: "var(--text)",
            lineHeight: "1.6", whiteSpace: "pre-wrap", fontFamily: "var(--font)",
          }}>
            {msg.content}
          </div>
        ) : (
          <div style={{ fontSize: "12px", color: "var(--text)", lineHeight: "1.6", fontFamily: "var(--font)" }}>
            <AssistantContent text={msg.content} />
          </div>
        )}
        <div style={{
          marginTop: "4px", fontSize: "10px", color: "var(--text-dimmer)",
          display: "flex", gap: "8px", justifyContent: isUser ? "flex-end" : "flex-start",
        }}>
          <span>{fmtTime(msg.created_at)}</span>
          {msg.output_tokens != null && msg.output_tokens > 0 && (
            <span>{fmtTokens(msg.output_tokens)} tok</span>
          )}
        </div>
      </div>
    </div>
  );
}
