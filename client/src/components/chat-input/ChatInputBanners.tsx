import { X, AlertTriangle } from "lucide-react";

const CLOSE_BTN_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "none",
  border: "none",
  color: "var(--text-dimmer)",
  cursor: "pointer",
  flexShrink: 0,
  padding: 0,
};

interface AgentEntry {
  id: string;
  name: string;
  description?: string;
}

interface ChatInputBannersProps {
  contextWarning: string | null;
  streaming: boolean;
  pendingMessage: string | null;
  pendingDismissed: boolean;
  attachedImage: { name: string; dataUrl: string } | null;
  selectedAgent: AgentEntry | null;
  input: string;
  onDismissWarning: () => void;
  onDismissPending: () => void;
  onRemoveImage: () => void;
  onRemoveAgent: (cleaned: string) => void;
}

export function ChatInputBanners({
  contextWarning,
  streaming,
  pendingMessage,
  pendingDismissed,
  attachedImage,
  selectedAgent,
  input,
  onDismissWarning,
  onDismissPending,
  onRemoveImage,
  onRemoveAgent,
}: ChatInputBannersProps) {
  return (
    <>
      {contextWarning && !streaming && (
        <div className="flex-row gap-2" style={{
          padding: "6px 14px",
          fontSize: 11,
          fontFamily: "var(--font-ui)",
          color: "var(--yellow)",
          background: "rgba(234, 179, 8, 0.08)",
          borderBottom: "1px solid rgba(234, 179, 8, 0.2)",
        }}>
          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, color: "var(--text-dim)" }}>
            {contextWarning}
          </span>
          <button
            onClick={onDismissWarning}
            title="Dismiss"
            style={{ ...CLOSE_BTN_STYLE, width: 18, height: 18 }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {pendingMessage && !streaming && !pendingDismissed && (
        <div className="flex-row gap-2" style={{
          padding: "6px 14px",
          fontSize: 11,
          fontFamily: "var(--font-ui)",
          color: "var(--yellow)",
          background: "rgba(234, 179, 8, 0.06)",
          borderBottom: "1px solid rgba(234, 179, 8, 0.15)",
        }}>
          <span style={{ flexShrink: 0, fontSize: 13, lineHeight: 1 }}>!</span>
          <span style={{ flex: 1, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Unsent message will be included: {pendingMessage.slice(0, 60)}{pendingMessage.length > 60 ? "..." : ""}
          </span>
          <button
            onClick={onDismissPending}
            title="Dismiss"
            style={{ ...CLOSE_BTN_STYLE, width: 18, height: 18 }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {attachedImage && (
        <div className="flex-row gap-2" style={{
          padding: "8px 14px",
          borderBottom: "1px solid var(--border-dim)",
        }}>
          <img
            src={attachedImage.dataUrl}
            alt=""
            style={{
              height: 40,
              borderRadius: "var(--radius)",
              border: "1px solid var(--border-dim)",
              objectFit: "cover",
            }}
          />
          <span style={{
            fontSize: 11,
            color: "var(--text-dim)",
            fontFamily: "var(--font-ui)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}>
            {attachedImage.name}
          </span>
          <button
            onClick={onRemoveImage}
            title="Remove image"
            style={{ ...CLOSE_BTN_STYLE, width: 20, height: 20, borderRadius: "var(--radius-sm)" }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {selectedAgent && (
        <div className="flex-row gap-2" style={{
          padding: "6px 14px",
          borderBottom: "1px solid var(--border-dim)",
        }}>
          <span style={{ fontSize: 11, color: "var(--accent)", fontFamily: "var(--font)", fontWeight: 600 }}>
            @{selectedAgent.name}
          </span>
          {selectedAgent.description && (
            <span style={{ fontSize: 10, color: "var(--text-dimmer)" }}>
              {selectedAgent.description.slice(0, 50)}
            </span>
          )}
          <button
            onClick={() => onRemoveAgent(input.replace(/@\S+\s?/, ""))}
            title="Remove agent"
            style={{ ...CLOSE_BTN_STYLE, width: 16, height: 16, marginLeft: "auto" }}
          >
            <X size={10} />
          </button>
        </div>
      )}
    </>
  );
}
