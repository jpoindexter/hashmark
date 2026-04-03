import { X, Plus, CircleDot } from "lucide-react";
import type { SessionTab } from "../../hooks/useSessionTabs";

interface SessionTabsProps {
  tabs: SessionTab[];
  activeId: string | null;
  streaming: boolean;
  streamingSessionId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export default function SessionTabs({
  tabs, activeId, streaming, streamingSessionId, onSelect, onClose, onNew,
}: SessionTabsProps) {
  if (tabs.length === 0) return null;

  return (
    <div style={{
      display: "flex",
      alignItems: "stretch",
      height: 40,
      borderBottom: "1px solid var(--border-dim)",
      background: "var(--bg-2)",
      flexShrink: 0,
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex",
        alignItems: "stretch",
        flex: 1,
        overflow: "hidden",
      }}>
        {tabs.map(tab => {
          const active = tab.id === activeId;
          const isStreaming = tab.id === streamingSessionId && streaming;
          return (
            <div
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "0 12px",
                fontSize: 12,
                cursor: "pointer",
                color: active ? "var(--text)" : "var(--text-dim)",
                background: active ? "var(--bg-2)" : "transparent",
                borderRight: "1px solid var(--border-dim)",
                maxWidth: 180,
                minWidth: 0,
                position: "relative",
                userSelect: "none",
              }}
            >
              {isStreaming && (
                <span style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: "var(--green)",
                  animation: "pulse 1.5s ease-in-out infinite",
                  flexShrink: 0,
                }} />
              )}
              <span style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}>
                {tab.title || "New Session"}
              </span>
              {tabs.length > 1 && (
                <button
                  className="btn-icon"
                  onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                  style={{ width: 16, height: 16, flexShrink: 0, opacity: active ? 1 : 0.5 }}
                >
                  <X size={10} />
                </button>
              )}
              {active && (
                <div style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: "var(--accent)",
                }} />
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={onNew}
        className="btn-icon"
        title="New session"
        style={{ width: 34, height: 34, flexShrink: 0 }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
