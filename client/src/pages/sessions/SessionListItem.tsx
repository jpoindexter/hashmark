import { useRef } from "react";
import { Trash2, Check, X } from "lucide-react";
import { timeAgo } from "../../lib/format";
import type { Session } from "./types";
import { providerColor, tokenBarColor } from "./types";

interface SessionListItemProps {
  s: Session;
  isActive: boolean;
  sPct: number;
  isDelConfirm: boolean;
  onSelect: () => void;
  onDeleteRequest: (e: React.MouseEvent) => void;
  onDeleteConfirm: (e: React.MouseEvent) => void;
  onDeleteCancel: (e: React.MouseEvent) => void;
}

export default function SessionListItem({
  s, isActive, sPct, isDelConfirm,
  onSelect, onDeleteRequest, onDeleteConfirm, onDeleteCancel,
}: SessionListItemProps) {
  const trashBtnRef = useRef<HTMLButtonElement>(null);
  const barColor = tokenBarColor(sPct);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={isActive ? "true" : undefined}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      className={isActive ? "" : "hoverable"}
      onMouseEnter={() => {
        if (trashBtnRef.current) trashBtnRef.current.style.visibility = "visible";
      }}
      onMouseLeave={() => {
        if (!isActive && trashBtnRef.current) trashBtnRef.current.style.visibility = "hidden";
      }}
      style={{
        padding: "9px 10px 9px 12px",
        cursor: "pointer",
        background: isActive ? "var(--accent-bg)" : "transparent",
        borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
        borderBottom: "1px solid var(--border-dim)",
        transition: "background 0.1s",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0 }}>
        <div style={{
          width: "6px", height: "6px", borderRadius: "50%",
          background: providerColor(s.model),
          flexShrink: 0,
        }} />
        <div style={{
          fontSize: "11px",
          color: isActive ? "var(--text)" : "var(--text-dim)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}>
          {s.title}
        </div>

        {isDelConfirm ? (
          <div style={{ display: "flex", gap: "3px", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onDeleteConfirm}
              title="Confirm delete"
              style={{
                background: "rgba(248,81,73,0.15)", border: "1px solid var(--red)",
                color: "var(--red)", cursor: "pointer", borderRadius: "var(--radius-sm)",
                padding: "2px 5px", fontSize: "10px", display: "flex", alignItems: "center",
              }}
            >
              <Check size={10} />
            </button>
            <button
              onClick={onDeleteCancel}
              style={{
                background: "none", border: "1px solid var(--border)",
                color: "var(--text-dimmer)", cursor: "pointer", borderRadius: "var(--radius-sm)",
                padding: "2px 5px", fontSize: "10px", display: "flex", alignItems: "center",
              }}
            >
              <X size={10} />
            </button>
          </div>
        ) : (
          <button
            ref={trashBtnRef}
            onClick={onDeleteRequest}
            title="Delete mission"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-dimmer)", display: "flex", alignItems: "center",
              padding: "1px", flexShrink: 0, borderRadius: "var(--radius-sm)",
              visibility: isActive ? "visible" : "hidden",
            }}
            className="hoverable"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      <div style={{ marginTop: "5px", display: "flex", alignItems: "center", gap: "6px" }}>
        <div style={{
          flex: 1, height: "2px",
          background: "var(--bg-4)",
          borderRadius: "1px",
          overflow: "hidden",
        }}>
          <div style={{
            width: `${sPct}%`,
            height: "100%",
            background: barColor,
            borderRadius: "1px",
          }} />
        </div>
        <span style={{ fontSize: "10px", color: "var(--text-dimmer)", whiteSpace: "nowrap" }}>
          {s.message_count ?? 0} msgs
        </span>
        <span style={{ fontSize: "10px", color: "var(--text-dimmer)", whiteSpace: "nowrap" }}>
          {timeAgo(s.updated_at)}
        </span>
        {s.status === "streaming" && (
          <span style={{ color: "var(--accent)", fontSize: "10px" }}>● live</span>
        )}
      </div>
    </div>
  );
}
