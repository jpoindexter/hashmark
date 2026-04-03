import { useRef } from "react";
import { timeAgo } from "../../lib/format";
import { FolderIcon } from "./ActionCard";
import type { Workspace } from "./types";
import { truncatePath } from "./types";

interface DropdownWorkspaceRowProps {
  ws: Workspace;
  isActive: boolean;
  switching: boolean;
  focused: boolean;
  itemRef: (el: HTMLButtonElement | null) => void;
  onSwitch: () => void;
  onRemove: (e: React.MouseEvent) => void;
}

export default function DropdownWorkspaceRow({
  ws,
  isActive,
  switching,
  focused,
  itemRef,
  onSwitch,
  onRemove,
}: DropdownWorkspaceRowProps) {
  const switchBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        background: focused ? "var(--accent-bg)" : "transparent",
        borderBottom: "1px solid var(--border-dim)",
        transition: "background 0.1s",
        cursor: isActive ? "default" : "pointer",
      }}
      className="hoverable"
      onMouseEnter={() => {
        if (!isActive && switchBtnRef.current) switchBtnRef.current.style.visibility = "visible";
      }}
      onMouseLeave={() => {
        if (!isActive && switchBtnRef.current) switchBtnRef.current.style.visibility = focused ? "visible" : "hidden";
      }}
    >
      <div style={{ color: isActive ? "var(--accent)" : "var(--text-dimmer)", flexShrink: 0 }}>
        <FolderIcon size={12} color={isActive ? "var(--accent)" : "var(--text-dimmer)"} />
      </div>

      <button
        ref={itemRef}
        onClick={onSwitch}
        disabled={isActive || switching}
        tabIndex={0}
        style={{
          flex: 1,
          minWidth: 0,
          background: "none",
          border: "none",
          padding: 0,
          cursor: isActive ? "default" : "pointer",
          textAlign: "left",
          outline: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 11,
            fontWeight: isActive ? 700 : 500,
            color: isActive ? "var(--accent)" : "var(--text)",
            fontFamily: "var(--font)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {ws.name}
          </span>
          {isActive && (
            <span style={{
              fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
              color: "var(--accent)", opacity: 0.7,
            }}>
              ACTIVE
            </span>
          )}
        </div>
        <div style={{
          fontSize: 10,
          color: "var(--text-dimmer)",
          fontFamily: "var(--font)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {truncatePath(ws.path, 32)}
        </div>
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {ws.last_opened > 0 && (
          <span style={{ fontSize: 9, color: "var(--text-dimmer)", whiteSpace: "nowrap" }}>
            {timeAgo(ws.last_opened)}
          </span>
        )}

        {!isActive && (
          <button
            ref={switchBtnRef}
            onClick={(e) => { e.stopPropagation(); onSwitch(); }}
            disabled={switching}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              color: switching ? "var(--text-dimmer)" : "var(--accent)",
              fontFamily: "var(--font)",
              fontSize: 10,
              padding: "2px 7px",
              cursor: switching ? "default" : "pointer",
              borderRadius: "var(--radius)",
              whiteSpace: "nowrap",
              letterSpacing: "0.04em",
              transition: "border-color 0.1s, color 0.1s",
              visibility: focused ? "visible" : "hidden",
            }}
          >
            {switching ? "…" : "Switch"}
          </button>
        )}

        <button
          onClick={onRemove}
          title="Remove from list"
          style={{
            background: "none",
            border: "none",
            color: "var(--text-dimmer)",
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: "0 2px",
            opacity: focused ? 0.7 : 0,
            transition: "opacity 0.1s",
          }}
          className="hoverable"
        >
          ×
        </button>
      </div>
    </div>
  );
}
