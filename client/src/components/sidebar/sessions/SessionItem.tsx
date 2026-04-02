import { useRef } from "react";
import type { ChatSession } from "./types.ts";

interface SessionItemProps {
  session: ChatSession;
  shortcut?: string;
  active: boolean;
  onClick: () => void;
  isStreaming: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
}

export default function SessionItem({
  session,
  shortcut,
  active,
  onClick,
  isStreaming,
  onContextMenu,
}: SessionItemProps) {
  const shortcutRef = useRef<HTMLSpanElement>(null);
  const title = session.title || "Untitled";

  const dotColor = isStreaming
    ? "var(--yellow)"
    : active
    ? "var(--accent)"
    : "var(--text-dimmer)";

  const dotShadow = isStreaming ? "0 0 4px var(--yellow)" : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      onContextMenu={onContextMenu}
      className={active ? undefined : "hoverable"}
      onMouseEnter={() => {
        if (shortcutRef.current && shortcut) shortcutRef.current.style.visibility = "visible";
      }}
      onMouseLeave={() => {
        if (shortcutRef.current && !active) shortcutRef.current.style.visibility = "hidden";
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 22,
        padding: "0 8px 0 28px",
        cursor: "pointer",
        background: active ? "var(--active-bg)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <span style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: dotColor,
        flexShrink: 0,
        boxShadow: dotShadow,
        animation: isStreaming ? "session-dot-pulse 1.5s ease-in-out infinite" : undefined,
      }} />
      <span style={{
        flex: 1,
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? "var(--text)" : "var(--text-dim)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        lineHeight: "22px",
      }}>
        {title}
      </span>
      {shortcut && (
        <span
          ref={shortcutRef}
          style={{
            fontSize: 10,
            color: "var(--text-dimmer)",
            flexShrink: 0,
            visibility: active ? "visible" : "hidden",
          }}
        >
          {shortcut}
        </span>
      )}
    </div>
  );
}
