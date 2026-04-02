import { ArrowUp, Square, Plus, Mic } from "lucide-react";
import { ModelPickerDropdown } from "./ModelPicker";

const ICON_BTN_BASE: React.CSSProperties = {
  width: 28,
  height: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
  cursor: "pointer",
  flexShrink: 0,
};

function dimBorderHover(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.borderColor = "var(--border)";
  e.currentTarget.style.color = "var(--text-dim)";
}

function dimBorderUnhover(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.borderColor = "var(--border-dim)";
  e.currentTarget.style.color = "var(--text-dimmer)";
}

interface ChatBottomBarProps {
  selectedModel: string;
  thinking: boolean;
  planMode: boolean;
  terminalCwd?: string;
  streaming: boolean;
  hasText: boolean;
  listening: boolean;
  speechAvailable: boolean;
  onNewSession: () => void;
  onSend: () => void;
  onStop: () => void;
  onToggleVoice: () => void;
  onInjectTerminalCwd: () => void;
}

export function ChatBottomBar({
  selectedModel,
  thinking,
  planMode,
  terminalCwd,
  streaming,
  hasText,
  listening,
  speechAvailable,
  onNewSession,
  onSend,
  onStop,
  onToggleVoice,
  onInjectTerminalCwd,
}: ChatBottomBarProps) {
  return (
    <div className="flex-between gap-2" style={{
      padding: "4px 14px 10px",
    }}>
      <div className="flex-row gap-1">
        <ModelPickerDropdown selectedModel={selectedModel} thinking={thinking} planMode={planMode} />
        {terminalCwd && (
          <button
            className="hoverable flex-row gap-1"
            onClick={onInjectTerminalCwd}
            title={`Inject terminal path: ${terminalCwd}`}
            style={{
              padding: "2px 6px", background: "none", border: "none", borderRadius: 4,
              color: "var(--text-dimmer)", fontSize: 11,
              fontFamily: "var(--font-ui)",
              cursor: "pointer", whiteSpace: "nowrap",
              maxWidth: 160, overflow: "hidden",
            }}
          >
            <span style={{ fontSize: 12, lineHeight: 1 }}>&#x2293;</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {terminalCwd.split("/").pop() || terminalCwd}
            </span>
          </button>
        )}
      </div>

      <div className="flex-row gap-2">
        <button
          onClick={onNewSession}
          title="New conversation"
          style={{
            ...ICON_BTN_BASE,
            background: "none",
            border: "1px solid var(--border-dim)",
            color: "var(--text-dimmer)",
            transition: "border-color 0.1s, color 0.1s",
          }}
          onMouseEnter={dimBorderHover}
          onMouseLeave={dimBorderUnhover}
        >
          <Plus size={14} />
        </button>

        {speechAvailable && (
          <button
            onClick={onToggleVoice}
            title={listening ? "Stop recording" : "Voice input"}
            style={{
              ...ICON_BTN_BASE,
              background: listening ? "rgba(239, 68, 68, 0.15)" : "none",
              border: listening ? "1px solid var(--red)" : "1px solid var(--border-dim)",
              color: listening ? "var(--red)" : "var(--text-dimmer)",
              transition: "border-color 0.1s, color 0.1s, background 0.1s",
              animation: listening ? "pulse 1.5s ease-in-out infinite" : "none",
            }}
            onMouseEnter={e => { if (!listening) dimBorderHover(e); }}
            onMouseLeave={e => { if (!listening) dimBorderUnhover(e); }}
          >
            <Mic size={14} />
          </button>
        )}

        <div style={{ width: 28, height: 28, flexShrink: 0 }}>
          {streaming ? (
            <button
              onClick={onStop}
              title="Stop generation"
              style={{
                ...ICON_BTN_BASE,
                background: "var(--red-bg)",
                border: "1px solid var(--red)",
                color: "var(--red)",
                transition: "background-color 0.15s ease",
              }}
            >
              <Square size={11} />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!hasText}
              title="Send (⌘↵)"
              style={{
                ...ICON_BTN_BASE,
                background: hasText ? "var(--text)" : "var(--surface-input)",
                border: "none",
                color: hasText ? "var(--bg)" : "var(--text-dimmer)",
                cursor: hasText ? "pointer" : "default",
                transition: "background-color 0.15s ease, color 0.15s ease",
              }}
            >
              <ArrowUp size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
