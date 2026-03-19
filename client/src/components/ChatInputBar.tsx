import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowUp, Square, Plus, X, ImageIcon, Mic } from "lucide-react";

// ─── Slash command registry ───────────────────────────────────────────────────

interface SlashCommand {
  name: string;
  description: string;
  argHint?: string;
  category: "claude" | "studio" | "mode";
  action?: () => void;
}

const BUILTIN_COMMANDS: SlashCommand[] = [
  { name: "compact",    description: "Compact conversation to save context",       category: "claude" },
  { name: "clear",      description: "Clear conversation context",                 category: "claude" },
  { name: "help",       description: "Show available commands",                    category: "claude" },
  { name: "init",       description: "Initialize or update CLAUDE.md",            category: "claude" },
  { name: "debug",      description: "Troubleshoot the current session",           category: "claude" },
  { name: "review",     description: "Review recent code changes",                 category: "claude" },
  { name: "commit",     description: "Commit staged changes with a message",       category: "claude" },
  { name: "simplify",   description: "Review and simplify recently changed code",  category: "claude" },
  { name: "batch",      description: "Orchestrate large-scale parallel changes",   argHint: "<instruction>", category: "claude" },
  { name: "plan",       description: "Toggle plan mode — respond with a plan, no code", category: "mode" },
  { name: "think",      description: "Toggle extended thinking",                   category: "mode" },
  { name: "new",        description: "Start a new chat session",                   category: "studio" },
  { name: "checkpoint", description: "Save a checkpoint of the current session",   category: "studio" },
  { name: "scan",       description: "Trigger a codebase scan",                    category: "studio" },
];

const CATEGORY_LABEL: Record<SlashCommand["category"], string> = {
  claude: "Claude",
  mode:   "Mode",
  studio: "Studio",
};

function useSlashCommands(onNewSession: () => void, onTogglePlan: () => void, onToggleThink: () => void) {
  const [customCmds, setCustomCmds] = useState<SlashCommand[]>([]);

  useEffect(() => {
    fetch("/api/agents")
      .then(r => r.json())
      .then((d: { agents?: Array<{ id: string; name: string; description: string }> }) => {
        const agents = d.agents ?? [];
        setCustomCmds(agents.map(a => ({
          name: a.id,
          description: a.description || a.name,
          category: "studio" as const,
        })));
      })
      .catch(() => {});
  }, []);

  return [
    ...BUILTIN_COMMANDS.map(cmd => {
      if (cmd.name === "new")   return { ...cmd, action: onNewSession };
      if (cmd.name === "plan")  return { ...cmd, action: onTogglePlan };
      if (cmd.name === "think") return { ...cmd, action: onToggleThink };
      return cmd;
    }),
    ...customCmds,
  ];
}

// ─── Slash picker ─────────────────────────────────────────────────────────────

function SlashPicker({
  query, commands, onSelect, onDismiss,
}: {
  query: string;
  commands: SlashCommand[];
  onSelect: (cmd: SlashCommand) => void;
  onDismiss: () => void;
}) {
  const q = query.slice(1).toLowerCase();
  const filtered = q
    ? commands.filter(c => c.name.startsWith(q) || c.description.toLowerCase().includes(q))
    : commands;

  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setActiveIdx(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector("[data-active='true']") as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape")    { e.preventDefault(); onDismiss(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Tab" || e.key === "Enter") {
        if (filtered.length === 0) return;
        e.preventDefault();
        onSelect(filtered[activeIdx]);
      }
    };
    window.addEventListener("keydown", h, { capture: true });
    return () => window.removeEventListener("keydown", h, { capture: true });
  }, [filtered, activeIdx, onSelect, onDismiss]);

  if (filtered.length === 0) return null;

  const grouped = filtered.reduce<Record<string, SlashCommand[]>>((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  let globalIdx = 0;

  return (
    <div
      ref={listRef}
      className="dropdown-animate"
      style={{
        position: "absolute",
        bottom: "calc(100% + 6px)",
        left: 0,
        right: 0,
        background: "var(--bg-3)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.6)",
        zIndex: 500,
        maxHeight: 320,
        overflow: "auto",
      }}
    >
      {Object.entries(grouped).map(([cat, cmds]) => (
        <div key={cat}>
          <div style={{
            padding: "6px 12px 3px",
            fontSize: 10,
            fontWeight: 600,
            color: "var(--text-dimmer)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            userSelect: "none",
            fontFamily: "var(--font-ui)",
          }}>
            {CATEGORY_LABEL[cat as SlashCommand["category"]] ?? cat}
          </div>
          {cmds.map(cmd => {
            const idx = globalIdx++;
            const isActive = idx === activeIdx;
            return (
              <div
                key={cmd.name}
                data-active={isActive}
                onClick={() => onSelect(cmd)}
                onMouseEnter={() => setActiveIdx(idx)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 12px",
                  cursor: "pointer",
                  background: isActive ? "var(--accent-bg)" : "transparent",
                  borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  transition: "background 0.05s",
                }}
              >
                <span style={{
                  fontFamily: "var(--font)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: isActive ? "var(--accent)" : "var(--text-dim)",
                  minWidth: 90,
                  flexShrink: 0,
                }}>
                  /{cmd.name}
                  {cmd.argHint && (
                    <span style={{ color: "var(--text-dimmer)", fontWeight: 400 }}> {cmd.argHint}</span>
                  )}
                </span>
                <span style={{
                  fontSize: 12,
                  color: "var(--text-dimmer)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: "var(--font-ui)",
                }}>
                  {cmd.description}
                </span>
              </div>
            );
          })}
        </div>
      ))}
      <div style={{
        padding: "4px 12px 6px",
        fontSize: 10,
        color: "var(--text-dimmer)",
        borderTop: "1px solid var(--border-dim)",
        display: "flex",
        gap: 10,
        fontFamily: "var(--font-ui)",
      }}>
        <span>↑↓ navigate</span>
        <span>↵ / Tab select</span>
        <span>Esc dismiss</span>
      </div>
    </div>
  );
}

// ─── @mention file picker ─────────────────────────────────────────────────────

interface FileEntry {
  name: string;
  path: string;
  ext?: string;
}

function useMentionFiles() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  useEffect(() => {
    fetch("/api/files/list")
      .then(r => r.json())
      .then((d: { files?: FileEntry[] }) => setFiles(d.files ?? []))
      .catch(() => {});
  }, []);
  return files;
}

function MentionPicker({
  query, files, onSelect, onDismiss,
}: {
  query: string;
  files: FileEntry[];
  onSelect: (file: FileEntry) => void;
  onDismiss: () => void;
}) {
  const q = query.toLowerCase();
  const filtered = q
    ? files.filter(f => f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))
    : files.slice(0, 20);

  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setActiveIdx(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector("[data-active='true']") as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape")    { e.preventDefault(); onDismiss(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Tab" || e.key === "Enter") {
        if (filtered.length === 0) return;
        e.preventDefault();
        onSelect(filtered[activeIdx]);
      }
    };
    window.addEventListener("keydown", h, { capture: true });
    return () => window.removeEventListener("keydown", h, { capture: true });
  }, [filtered, activeIdx, onSelect, onDismiss]);

  if (filtered.length === 0) return null;

  const EXT_COLORS: Record<string, string> = {
    ts: "var(--blue)", tsx: "var(--blue)", js: "var(--yellow)", jsx: "var(--yellow)",
    py: "var(--accent)", go: "#00add8", rs: "#dea584", md: "var(--text-dim)",
    json: "var(--text-dim)", css: "#264de4", html: "#e34c26",
  };

  return (
    <div
      ref={listRef}
      style={{
        position: "absolute",
        bottom: "calc(100% + 6px)",
        left: 0,
        right: 0,
        background: "var(--bg-3)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.6)",
        zIndex: 500,
        maxHeight: 280,
        overflow: "auto",
      }}
    >
      <div style={{
        padding: "6px 12px 3px",
        fontSize: 10,
        fontWeight: 600,
        color: "var(--text-dimmer)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        userSelect: "none",
        fontFamily: "var(--font-ui)",
      }}>
        Files
      </div>
      {filtered.map((file, idx) => {
        const isActive = idx === activeIdx;
        const color = file.ext ? (EXT_COLORS[file.ext] ?? "var(--text-dimmer)") : "var(--text-dimmer)";
        const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/") + 1) : "";
        return (
          <div
            key={file.path}
            data-active={isActive}
            onClick={() => onSelect(file)}
            onMouseEnter={() => setActiveIdx(idx)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 12px",
              cursor: "pointer",
              background: isActive ? "var(--accent-bg)" : "transparent",
              borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "background 0.05s",
            }}
          >
            <span style={{ fontFamily: "var(--font)", fontSize: 10, fontWeight: 700, color, minWidth: 22, textAlign: "center", flexShrink: 0 }}>
              {file.ext ? file.ext.toUpperCase().slice(0, 2) : "  "}
            </span>
            <span style={{ fontFamily: "var(--font)", fontSize: 12, color: isActive ? "var(--text)" : "var(--text-dim)", flexShrink: 0 }}>
              {file.name}
            </span>
            {dir && (
              <span style={{ fontFamily: "var(--font)", fontSize: 11, color: "var(--text-dimmer)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {dir}
              </span>
            )}
          </div>
        );
      })}
      <div style={{
        padding: "4px 12px 6px",
        fontSize: 10,
        color: "var(--text-dimmer)",
        borderTop: "1px solid var(--border-dim)",
        display: "flex",
        gap: 10,
        fontFamily: "var(--font-ui)",
      }}>
        <span>↑↓ navigate</span>
        <span>↵ / Tab select</span>
        <span>Esc dismiss</span>
      </div>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function getAtQuery(val: string, cursorPos: number): string | null {
  const before = val.slice(0, cursorPos);
  const atIdx = before.lastIndexOf("@");
  if (atIdx === -1) return null;
  const segment = before.slice(atIdx + 1);
  if (segment.includes(" ") || segment.includes("\n")) return null;
  return segment;
}

// ─── Agent suggestion chip ────────────────────────────────────────────────────

interface AgentSuggestion {
  id: string;
  name: string;
  description: string;
  score: number;
  reason: string;
}

function useAgentSuggestion(query: string, currentFile?: string) {
  const [suggestion, setSuggestion] = useState<AgentSuggestion | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const trimmed = query.trim();
    if (!trimmed || trimmed.startsWith("/")) {
      setSuggestion(null);
      return;
    }
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams({ q: trimmed });
      if (currentFile) params.set("file", currentFile);
      fetch(`/api/agents/route?${params}`)
        .then(r => { if (!r.ok) return; return r.json(); })
        .then((d: { suggestions?: AgentSuggestion[] } | undefined) => {
          if (!d) return;
          const top = d.suggestions?.[0];
          setSuggestion(top && top.score > 0.3 ? top : null);
        })
        .catch(() => setSuggestion(null));
    }, 500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, currentFile]);

  return suggestion;
}

function AgentChip({
  suggestion, onApply, onDismiss,
}: {
  suggestion: AgentSuggestion;
  onApply: (id: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "3px 8px 3px 6px",
      background: "var(--bg-2)",
      border: "1px solid var(--border-dim)",
      borderRadius: 4,
      fontSize: 10,
      fontFamily: "var(--font-ui)",
      color: "var(--text-dimmer)",
      marginBottom: 6,
      width: "fit-content",
      userSelect: "none",
    }}>
      <span style={{ color: "var(--accent)", fontSize: 11, lineHeight: 1 }}>⚡</span>
      <span>Try:</span>
      <button
        onClick={() => onApply(suggestion.id)}
        title={suggestion.description || suggestion.reason}
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          color: "var(--accent)", fontFamily: "inherit", fontSize: 10, fontWeight: 600,
        }}
      >
        {suggestion.name}
      </button>
      <span>for this task</span>
      <button
        onClick={onDismiss}
        style={{
          background: "none", border: "none", padding: "0 0 0 2px", cursor: "pointer",
          color: "var(--text-dimmer)", fontFamily: "inherit", fontSize: 11, lineHeight: 1,
        }}
        title="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  title: string;
  status: "idle" | "streaming";
}

interface ChatInputBarProps {
  sessionId: string | null;
  onNewSession: () => void;
  onSessionCreated?: (sessionId: string) => void;
  onStreamText: (text: string) => void;
  onStreamingChange: (streaming: boolean) => void;
  streaming: boolean;
  terminalCwd?: string;
  currentFile?: string;
  modelName?: string;
  selectedModel?: string;
  thinking?: boolean;
  planMode?: boolean;
}

// ─── Auto model routing ───────────────────────────────────────────────────────

const DEFAULT_MODEL = "claude-sonnet-4-6";

const AUTO_MODEL_LABELS: Record<string, string> = {
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-opus-4-6": "Opus 4.6",
};

function resolveAutoModel(message: string): string {
  const len = message.trim().length;
  if (len < 100) return "claude-haiku-4-5-20251001";
  if (len < 500) return "claude-sonnet-4-6";
  return "claude-opus-4-6";
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChatInputBar({
  sessionId, onNewSession, onSessionCreated, onStreamText, onStreamingChange,
  streaming, terminalCwd, currentFile,
  selectedModel = DEFAULT_MODEL, thinking = false, planMode = false,
}: ChatInputBarProps) {
  const [input, setInput] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [chipDismissed, setChipDismissed] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [attachedImage, setAttachedImage] = useState<{ name: string; dataUrl: string } | null>(null);
  const [listening, setListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const retryCountRef = useRef(0);
  const lastSentMessageRef = useRef<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const agentSuggestion = useAgentSuggestion(input, currentFile);
  const slashCommands = useSlashCommands(
    onNewSession,
    () => window.dispatchEvent(new CustomEvent("studio:toggle-plan")),
    () => window.dispatchEvent(new CustomEvent("studio:toggle-thinking")),
  );
  const mentionFiles = useMentionFiles();

  // Check for pending (unsent) messages from a previous failed turn
  useEffect(() => {
    if (!sessionId || streaming) {
      setPendingMessage(null);
      return;
    }
    fetch(`/api/sessions/${sessionId}/pending`)
      .then(r => r.json())
      .then((d: { hasPending: boolean; message: string | null }) => {
        setPendingMessage(d.hasPending ? d.message : null);
      })
      .catch(() => setPendingMessage(null));
  }, [sessionId, streaming]);

  // Listen for suggestion clicks from EmptyState
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail?.text;
      if (text) {
        setInput(text);
        requestAnimationFrame(() => {
          textareaRef.current?.focus();
          const ta = textareaRef.current;
          if (ta) { ta.style.height = "auto"; ta.style.height = `${Math.min(ta.scrollHeight, 20 * 6)}px`; }
        });
      }
    };
    window.addEventListener("studio:suggest", handler);
    return () => window.removeEventListener("studio:suggest", handler);
  }, []);

  const injectTerminalCwd = useCallback(() => {
    if (!terminalCwd) return;
    const snippet = `\n\n[Terminal cwd: ${terminalCwd}]`;
    setInput(prev => prev + snippet);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, LINE_HEIGHT * MAX_ROWS)}px`;
    });
  }, [terminalCwd]);

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

  const toggleVoiceInput = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening]);

  // Listen for manual retry requests from ChatMessages
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string }>).detail;
      if (detail?.text) {
        retryCountRef.current = 0;
        lastSentMessageRef.current = detail.text;
        void sendMessageWithText(detail.text);
      }
    };
    window.addEventListener("studio:retry-message", handler);
    return () => window.removeEventListener("studio:retry-message", handler);
  }, [sessionId, selectedModel, thinking, planMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup retry timer on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // ⌘L focus shortcut
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "l") { e.preventDefault(); textareaRef.current?.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const isSlashTrigger = (val: string) => val.startsWith("/") && !val.includes(" ");

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    setSlashOpen(isSlashTrigger(val));
    const cursor = e.target.selectionStart ?? val.length;
    const aq = getAtQuery(val, cursor);
    setAtQuery(aq !== null ? aq : null);
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
    const hasArgs = cmd.argHint;
    if (hasArgs) {
      setInput(`/${cmd.name} `);
      requestAnimationFrame(() => textareaRef.current?.focus());
    } else {
      setInput(`/${cmd.name}`);
      requestAnimationFrame(() => void sendMessageWithText(`/${cmd.name}`));
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
    const before = input.slice(0, cursor);
    const atIdx = before.lastIndexOf("@");
    const after = input.slice(cursor);
    const newVal = `${input.slice(0, atIdx)}@${file.path} ${after}`;
    setInput(newVal);
    requestAnimationFrame(() => {
      if (!ta) return;
      const pos = atIdx + file.path.length + 2;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  }, [input]);

  const sendMessage = async () => {
    if ((!input.trim() && !attachedImage) || streaming) return;
    // Fresh user-initiated send resets retry counter
    retryCountRef.current = 0;
    return sendMessageWithText();
  };

  const scheduleAutoRetry = useCallback((messageText: string) => {
    const count = retryCountRef.current;
    if (count >= 2) {
      // Max auto-retries reached, show manual retry button
      window.dispatchEvent(new CustomEvent("studio:stream-failed", {
        detail: { lastUserMessage: messageText },
      }));
      window.dispatchEvent(new CustomEvent("studio:toast", {
        detail: { message: "Stream failed after 2 retries. Use the Retry button to try again.", type: "error" },
      }));
      return;
    }
    retryCountRef.current = count + 1;
    const attempt = retryCountRef.current;
    window.dispatchEvent(new CustomEvent("studio:toast", {
      detail: { message: `Stream error. Retrying (${attempt}/2)...`, type: "error" },
    }));
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      void sendMessageWithText(messageText);
    }, 2000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessageWithText = async (overrideText?: string) => {
    const raw = overrideText ?? input.trim();
    // Append image reference when an image is attached
    const text = attachedImage
      ? `${raw}\n\n[Image attached: ${attachedImage.name}]`
      : raw;
    if ((!raw && !attachedImage) || streaming) return;

    // Track last sent message for retry
    lastSentMessageRef.current = text;

    let sid = sessionId;
    if (!sid) {
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error("Session creation failed");
        const data = await res.json() as { session: Session };
        sid = data.session.id;
        onSessionCreated?.(sid);
      } catch {
        window.dispatchEvent(new CustomEvent("studio:toast", { detail: { message: "Failed to create session", type: "error" } }));
        return;
      }
    }

    onStreamingChange(true);
    onStreamText("");

    // Resolve auto-routing: pick model based on message complexity
    let resolvedModel = selectedModel;
    if (selectedModel === "auto") {
      resolvedModel = resolveAutoModel(text);
      const label = AUTO_MODEL_LABELS[resolvedModel] ?? resolvedModel;
      window.dispatchEvent(new CustomEvent("studio:toast", {
        detail: { message: `Auto-routed to ${label}`, type: "info" },
      }));
    }

    const globalSystemPrompt = (localStorage.getItem("studio:system_prompt") ?? "").trim();
    let systemPrompt = globalSystemPrompt;
    if (thinking) systemPrompt += "\n\nUse extended thinking before responding.";
    if (planMode)  systemPrompt += "\n\nEnter plan mode: respond with a structured plan only, do not write code.";

    let res: Response;
    try {
      res = await fetch(`/api/sessions/${sid}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          model: resolvedModel,
          thinking,
          planMode,
          ...(systemPrompt.trim() && { systemPrompt: systemPrompt.trim() }),
        }),
      });
    } catch {
      // Network error -- trigger auto-retry
      onStreamingChange(false);
      scheduleAutoRetry(text);
      return;
    }

    if (!res.ok || !res.body) {
      onStreamingChange(false);
      // 5xx errors trigger auto-retry, 4xx show immediate error
      if (res.status >= 500) {
        scheduleAutoRetry(text);
      } else {
        window.dispatchEvent(new CustomEvent("studio:toast", { detail: { message: `Failed to send message (${res.status})`, type: "error" } }));
      }
      return;
    }

    // Clear input and attachment only after confirmed successful response
    if (!overrideText) {
      setInput("");
      setAttachedImage(null);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let assembled = "";

    abortRef.current = () => {
      reader.cancel().catch(() => {});
      fetch(`/api/sessions/${sid}/interrupt`, { method: "POST" }).catch(() => {});
    };

    let streamCompleted = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { streamCompleted = true; break; }
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const rawLine = line.slice(6).trim();
          if (!rawLine) continue;
          try {
            const evt = JSON.parse(rawLine) as { type: string; text?: string };
            if (evt.type === "text" && evt.text) {
              assembled += evt.text;
              onStreamText(assembled);
            }
          } catch {
            console.warn("Failed to parse SSE event:", rawLine);
          }
        }
      }
    } catch {
      // SSE disconnect mid-stream -- trigger auto-retry
      onStreamingChange(false);
      scheduleAutoRetry(text);
      return;
    } finally {
      abortRef.current = null;
      if (streamCompleted) {
        // Successful completion -- reset retry counter
        retryCountRef.current = 0;
        onStreamingChange(false);
        onStreamText("");
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void sendMessage(); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
  };

  const LINE_HEIGHT = 20;
  const MAX_ROWS = 6;
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
        background: "var(--bg-2)",
        borderTop: "1px solid var(--border-dim)",
      }}>
        {/* Popups */}
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
              onSelect={selectMentionFile}
              onDismiss={() => setAtQuery(null)}
            />
          </div>
        )}

        {/* Agent chip -- sits just above the input */}
        {agentSuggestion && !chipDismissed && !slashOpen && atQuery === null && (
          <div style={{ padding: "8px 14px 0" }}>
            <AgentChip
              suggestion={agentSuggestion}
              onApply={applyAgentSuggestion}
              onDismiss={() => setChipDismissed(true)}
            />
          </div>
        )}

        {/* Pending message warning -- unsent message from a crashed turn */}
        {pendingMessage && !streaming && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
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
              onClick={() => setPendingMessage(null)}
              title="Dismiss"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 18,
                height: 18,
                background: "none",
                border: "none",
                color: "var(--text-dimmer)",
                cursor: "pointer",
                flexShrink: 0,
                fontSize: 13,
                lineHeight: 1,
                padding: 0,
              }}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Image attachment preview */}
        {attachedImage && (
          <div style={{
            padding: "8px 14px",
            display: "flex",
            alignItems: "center",
            gap: 8,
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
              onClick={() => setAttachedImage(null)}
              title="Remove image"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 20,
                height: 20,
                background: "none",
                border: "none",
                color: "var(--text-dimmer)",
                cursor: "pointer",
                borderRadius: "var(--radius-sm)",
                flexShrink: 0,
              }}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Textarea row */}
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          padding: "12px 14px 4px",
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
            placeholder="Ask to make changes, @mention files, run /commands"
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
          {/* ⌘L hint — right side of textarea row */}
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

        {/* Bottom action row */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 14px 10px",
          gap: 8,
        }}>
          {/* Left: terminal cwd context */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {terminalCwd && (
              <button
                onClick={injectTerminalCwd}
                title={`Inject terminal path: ${terminalCwd}`}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "2px 6px", background: "none", border: "none", borderRadius: 4,
                  color: "var(--text-dimmer)", fontSize: 11,
                  fontFamily: "var(--font-ui)",
                  cursor: "pointer", transition: "color 0.1s", whiteSpace: "nowrap",
                  maxWidth: 160, overflow: "hidden",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)"; }}
              >
                <span style={{ fontSize: 12, lineHeight: 1 }}>&#x2293;</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {terminalCwd.split("/").pop() || terminalCwd}
                </span>
              </button>
            )}
          </div>

          {/* Right: + button + stop/send */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* + (new session / attachments) */}
            <button
              onClick={onNewSession}
              title="New conversation"
              style={{
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "1px solid var(--border-dim)",
                borderRadius: 6,
                color: "var(--text-dimmer)",
                cursor: "pointer",
                transition: "border-color 0.1s, color 0.1s",
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-dim)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)";
              }}
            >
              <Plus size={14} />
            </button>

            {/* Voice input */}
            <button
              onClick={toggleVoiceInput}
              title="Voice input"
              style={{
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: listening ? "rgba(239, 68, 68, 0.15)" : "none",
                border: listening ? "1px solid var(--red)" : "1px solid var(--border-dim)",
                borderRadius: 6,
                color: listening ? "var(--red)" : "var(--text-dimmer)",
                cursor: "pointer",
                transition: "border-color 0.1s, color 0.1s, background 0.1s",
                flexShrink: 0,
                animation: listening ? "pulse 1.5s ease-in-out infinite" : "none",
              }}
              onMouseEnter={e => {
                if (!listening) {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)";
                }
              }}
              onMouseLeave={e => {
                if (!listening) {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-dim)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)";
                }
              }}
            >
              <Mic size={14} />
            </button>

            {/* Stop / Send -- fixed-size container prevents layout shift */}
            <div style={{ width: 28, height: 28, flexShrink: 0 }}>
              {streaming ? (
                <button
                  onClick={() => abortRef.current?.()}
                  title="Stop generation"
                  style={{
                    width: 28,
                    height: 28,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--red-bg)",
                    border: "1px solid var(--red)",
                    borderRadius: 6,
                    color: "var(--red)",
                    cursor: "pointer",
                    transition: "background-color 0.15s ease",
                  }}
                >
                  <Square size={11} />
                </button>
              ) : (
                <button
                  onClick={() => void sendMessage()}
                  disabled={!hasText}
                  title="Send (⌘↵)"
                  style={{
                    width: 28,
                    height: 28,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: hasText ? "var(--text)" : "var(--surface-input)",
                    border: "none",
                    borderRadius: 6,
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
