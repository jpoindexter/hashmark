import { useState, useEffect, useRef, useCallback } from "react";
import { fetchApi } from "../lib/api";
import type { SlashCommand } from "./chat-input/SlashPicker";
import { useSlashCommands, SlashPicker } from "./chat-input/SlashPicker";
import type { FileEntry, AgentEntry } from "./chat-input/MentionPicker";
import { useMentionFiles, useMentionAgents, MentionPicker, getAtQuery } from "./chat-input/MentionPicker";
import { useAgentSuggestion, AgentChip } from "./chat-input/AgentChip";
import { useStreamChat } from "./chat-input/useStreamChat";
import { useVoiceInput } from "./chat-input/useVoiceInput";
import { ChatBottomBar } from "./chat-input/ChatBottomBar";
import { ChatInputBanners } from "./chat-input/ChatInputBanners";

interface ChatInputBarProps {
  sessionId: string | null;
  hasMessages?: boolean;
  onNewSession: () => void;
  onSessionCreated?: (sessionId: string) => void;
  onStreamText: (text: string) => void;
  onStreamingState?: (state: import("./ChatMessages").StreamingState | null) => void;
  onStreamingChange: (streaming: boolean) => void;
  streaming: boolean;
  terminalCwd?: string;
  currentFile?: string;
  selectedModel?: string;
  thinking?: boolean;
  planMode?: boolean;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";

const LINE_HEIGHT = 20;
const MAX_ROWS = 6;

export default function ChatInputBar({
  sessionId, hasMessages = false, onNewSession, onSessionCreated, onStreamText, onStreamingState, onStreamingChange,
  streaming, terminalCwd, currentFile,
  selectedModel = DEFAULT_MODEL, thinking = false, planMode = false,
}: ChatInputBarProps) {
  const [input, setInput] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [chipDismissed, setChipDismissed] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [pendingDismissed, setPendingDismissed] = useState(false);
  const skipContextRef = useRef(false);
  const [attachedImage, setAttachedImage] = useState<{ name: string; dataUrl: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [contextWarning, setContextWarning] = useState<string | null>(null);
  const lastWarningPctRef = useRef(0);

  const agentSuggestion = useAgentSuggestion(input, currentFile);
  const slashCommands = useSlashCommands(
    onNewSession,
    () => window.dispatchEvent(new CustomEvent("studio:toggle-plan")),
    () => window.dispatchEvent(new CustomEvent("studio:toggle-thinking")),
  );
  const mentionFiles = useMentionFiles();
  const mentionAgents = useMentionAgents();
  const [selectedAgent, setSelectedAgent] = useState<AgentEntry | null>(null);

  const clearInput = useCallback(() => {
    setInput("");
    setAttachedImage(null);
    setSelectedAgent(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, []);

  const { sendMessageWithText, abortRef, retryCountRef, lastSentMessageRef, retryTimerRef } = useStreamChat({
    sessionId,
    selectedModel,
    thinking,
    planMode,
    selectedAgent,
    skipContextRef,
    onStreamText,
    onStreamingState,
    onStreamingChange,
    onSessionCreated,
    onSent: () => { setPendingMessage(null); setPendingDismissed(true); },
    onClearInput: clearInput,
    onWarning: (msg) => setContextWarning(msg),
    lastWarningPctRef,
  });

  const { listening, speechAvailable, toggleVoiceInput } = useVoiceInput({
    input,
    onTranscript: (text) => setInput(text),
  });

  useEffect(() => {
    setPendingDismissed(false);
    if (!sessionId) {
      setPendingMessage(null);
      return;
    }

    try {
      const raw = sessionStorage.getItem(`studio:prefill:${sessionId}`);
      if (raw) {
        sessionStorage.removeItem(`studio:prefill:${sessionId}`);
        const { prompt, model, attachContext } = JSON.parse(raw) as { prompt: string; model: string; attachContext?: boolean };
        setInput(prompt);
        skipContextRef.current = attachContext === false;
        window.dispatchEvent(new CustomEvent("studio:settings-change", { detail: { key: "selectedModel", value: model } }));
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    } catch { /* noop */ }

    fetchApi(`/api/sessions/${sessionId}/pending`)
      .then(r => r.json())
      .then((d: { hasPending: boolean; message: string | null }) => {
        setPendingMessage(d.hasPending ? d.message : null);
      })
      .catch(() => setPendingMessage(null));
  }, [sessionId]);

  useEffect(() => {
    setContextWarning(null);
    lastWarningPctRef.current = 0;
  }, [sessionId]);

  const resizeTextarea = useCallback(() => {
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, LINE_HEIGHT * MAX_ROWS)}px`;
    });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail?.text;
      if (text) {
        setInput(text);
        resizeTextarea();
      }
    };
    window.addEventListener("studio:suggest", handler);
    return () => window.removeEventListener("studio:suggest", handler);
  }, [resizeTextarea]);

  const injectTerminalCwd = useCallback(() => {
    if (!terminalCwd) return;
    setInput(prev => prev + `\n\n[Terminal cwd: ${terminalCwd}]`);
    resizeTextarea();
  }, [terminalCwd, resizeTextarea]);

  const handleImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setAttachedImage({ name: file.name, dataUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImageFile(file);
        return;
      }
    }
  }, [handleImageFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      handleImageFile(file);
    }
  }, [handleImageFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const sendRef = useRef(sendMessageWithText);
  sendRef.current = sendMessageWithText;
  const attachedImageRef = useRef(attachedImage);
  attachedImageRef.current = attachedImage;

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string }>).detail;
      if (detail?.text) {
        retryCountRef.current = 0;
        lastSentMessageRef.current = detail.text;
        void sendRef.current(detail.text, attachedImageRef.current);
      }
    };
    window.addEventListener("studio:retry-message", handler);
    return () => window.removeEventListener("studio:retry-message", handler);
  }, [retryCountRef, lastSentMessageRef]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "l") { e.preventDefault(); textareaRef.current?.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    setSlashOpen(val.startsWith("/") && !val.includes(" "));
    const cursor = e.target.selectionStart ?? val.length;
    setAtQuery(getAtQuery(val, cursor));
    if (chipDismissed) setChipDismissed(false);
  };

  const selectSlashCommand = useCallback((cmd: SlashCommand) => {
    setSlashOpen(false);
    if (cmd.action) {
      cmd.action();
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      return;
    }
    if (cmd.category === "mode") {
      setInput("");
      return;
    }
    if (cmd.argHint) {
      setInput(`/${cmd.name} `);
      requestAnimationFrame(() => textareaRef.current?.focus());
    } else {
      setInput(`/${cmd.name}`);
      requestAnimationFrame(() => void sendMessageWithText(`/${cmd.name}`, null));
    }
  }, [streaming]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyAgentSuggestion = useCallback((agentId: string) => {
    const mention = `@${agentId}`;
    setInput(prev => prev ? `${prev.trimEnd()} ${mention} ` : `${mention} `);
    setChipDismissed(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const selectMentionFile = useCallback((file: FileEntry) => {
    setAtQuery(null);
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? input.length;
    const atIdx = input.slice(0, cursor).lastIndexOf("@");
    const newVal = `${input.slice(0, atIdx)}@${file.path} ${input.slice(cursor)}`;
    setInput(newVal);
    const pos = atIdx + file.path.length + 2;
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(pos, pos); });
  }, [input]);

  const sendMessage = async () => {
    if ((!input.trim() && !attachedImage) || streaming) return;
    const trimmed = input.trim();

    // Shell mode: ! prefix sends command directly to terminal
    if (trimmed.startsWith("!")) {
      const cmd = trimmed.slice(1).trim();
      if (cmd) {
        window.dispatchEvent(new CustomEvent("studio:terminal-paste", { detail: cmd + "\n" }));
        window.dispatchEvent(new CustomEvent("studio:toggle-terminal")); // ensure terminal is visible
      }
      clearInput();
      return;
    }

    retryCountRef.current = 0;
    return sendMessageWithText(trimmed, attachedImage);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void sendMessage(); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, LINE_HEIGHT * MAX_ROWS)}px`;
  };

  const hasText = input.trim().length > 0 || attachedImage !== null;

  return (
    <div style={{
      background: "var(--bg)",
      flexShrink: 0,
    }}>
      <div style={{ width: "100%" }}>
      <div style={{
        position: "relative",
        background: "var(--composer-background)",
        borderTop: "1px solid var(--border-dim)",
        borderRadius: "12px 12px 0 0",
      }}>
        {slashOpen && (
          <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, padding: "0 14px" }}>
            <SlashPicker
              query={input}
              commands={slashCommands}
              onSelect={selectSlashCommand}
              onDismiss={() => setSlashOpen(false)}
            />
          </div>
        )}
        {!slashOpen && atQuery !== null && (
          <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, padding: "0 14px" }}>
            <MentionPicker
              query={atQuery}
              files={mentionFiles}
              agents={mentionAgents}
              onSelect={selectMentionFile}
              onSelectAgent={(agent) => {
                setSelectedAgent(agent);
                const before = input.slice(0, input.lastIndexOf("@"));
                setInput(`${before}@${agent.name} `);
                setAtQuery(null);
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
              onDismiss={() => setAtQuery(null)}
            />
          </div>
        )}

        {agentSuggestion && !chipDismissed && !slashOpen && atQuery === null && (
          <div style={{ padding: "8px 14px 0" }}>
            <AgentChip
              suggestion={agentSuggestion}
              onApply={applyAgentSuggestion}
              onDismiss={() => setChipDismissed(true)}
            />
          </div>
        )}

        <ChatInputBanners
          contextWarning={contextWarning}
          streaming={streaming}
          pendingMessage={pendingMessage}
          pendingDismissed={pendingDismissed}
          attachedImage={attachedImage}
          selectedAgent={selectedAgent}
          input={input}
          onDismissWarning={() => setContextWarning(null)}
          onDismissPending={() => { setPendingMessage(null); setPendingDismissed(true); }}
          onRemoveImage={() => setAttachedImage(null)}
          onRemoveAgent={(cleaned) => { setSelectedAgent(null); setInput(cleaned); }}
        />

        <div style={{
          display: "flex",
          alignItems: "flex-start",
          padding: "10px 14px 4px",
          gap: 8,
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            placeholder={hasMessages || streaming ? "Follow up..." : "Ask a question, @mention files, /commands"}
            disabled={streaming}
            rows={1}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              color: "var(--text)",
              fontSize: 13,
              fontFamily: "var(--font-ui)",
              resize: "none",
              maxHeight: `${LINE_HEIGHT * MAX_ROWS}px`,
              overflowY: "auto",
              lineHeight: `${LINE_HEIGHT}px`,
              display: "block",
              padding: 0,
            }}
          />
          {!streaming && !hasText && (
            <span style={{
              fontSize: 11,
              color: "var(--text-dimmer)",
              fontFamily: "var(--font-ui)",
              whiteSpace: "nowrap",
              marginTop: 1,
              userSelect: "none",
              flexShrink: 0,
            }}>
              ⌘L to focus
            </span>
          )}
        </div>

        <ChatBottomBar
          selectedModel={selectedModel}
          thinking={thinking}
          planMode={planMode}
          terminalCwd={terminalCwd}
          streaming={streaming}
          hasText={hasText}
          listening={listening}
          speechAvailable={speechAvailable}
          onNewSession={onNewSession}
          onSend={() => void sendMessage()}
          onStop={() => abortRef.current?.()}
          onToggleVoice={toggleVoiceInput}
          onInjectTerminalCwd={injectTerminalCwd}
        />
      </div>
      </div>

      <style>{`
        textarea::placeholder {
          color: var(--text-dimmer);
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
