import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Send, Square } from "lucide-react";
import ProviderSelector from "./ProviderSelector.tsx";

// ─── Slash command registry ───────────────────────────────────────────────────

interface SlashCommand {
  name: string;
  description: string;
  argHint?: string;
  category: "claude" | "studio" | "mode";
  /** If set, run this action instead of sending the command text */
  action?: () => void;
}

const BUILTIN_COMMANDS: SlashCommand[] = [
  // Claude CLI pass-throughs
  { name: "compact",  description: "Compact conversation to save context",    category: "claude" },
  { name: "clear",    description: "Clear conversation context",              category: "claude" },
  { name: "help",     description: "Show available commands",                 category: "claude" },
  { name: "init",     description: "Initialize or update CLAUDE.md",         category: "claude" },
  { name: "debug",    description: "Troubleshoot the current session",        category: "claude" },
  { name: "review",   description: "Review recent code changes",              category: "claude" },
  { name: "commit",   description: "Commit staged changes with a message",    category: "claude" },
  { name: "simplify", description: "Review and simplify recently changed code", category: "claude" },
  { name: "batch",    description: "Orchestrate large-scale parallel changes", argHint: "<instruction>", category: "claude" },
  // Mode toggles (inserted as system context)
  { name: "plan",     description: "Toggle plan mode — respond with a plan, no code", category: "mode" },
  { name: "think",    description: "Toggle extended thinking",                category: "mode" },
  // Studio actions
  { name: "new",      description: "Start a new chat session",               category: "studio" },
  { name: "checkpoint", description: "Save a checkpoint of the current session", category: "studio" },
  { name: "scan",     description: "Trigger a codebase scan",                category: "studio" },
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
      if (cmd.name === "new") return { ...cmd, action: onNewSession };
      if (cmd.name === "plan") return { ...cmd, action: onTogglePlan };
      if (cmd.name === "think") return { ...cmd, action: onToggleThink };
      return cmd;
    }),
    ...customCmds,
  ];
}

// ─── Inline slash picker ──────────────────────────────────────────────────────

function SlashPicker({
  query,
  commands,
  onSelect,
  onDismiss,
}: {
  query: string;
  commands: SlashCommand[];
  onSelect: (cmd: SlashCommand) => void;
  onDismiss: () => void;
}) {
  const q = query.slice(1).toLowerCase(); // strip leading "/"
  const filtered = q
    ? commands.filter(c => c.name.startsWith(q) || c.description.toLowerCase().includes(q))
    : commands;

  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setActiveIdx(0); }, [query]);

  // Scroll active into view
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

  // Group by category
  const grouped = filtered.reduce<Record<string, SlashCommand[]>>((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  let globalIdx = 0;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(100% + 4px)",
        left: 0,
        right: 0,
        background: "var(--bg-3)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 -8px 24px rgba(0,0,0,0.5)",
        zIndex: 500,
        maxHeight: 320,
        overflow: "auto",
      }}
      ref={listRef}
    >
      {Object.entries(grouped).map(([cat, cmds]) => (
        <div key={cat}>
          <div style={{
            padding: "5px 12px 2px",
            fontSize: 10,
            fontWeight: 600,
            color: "var(--text-dimmer)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            userSelect: "none",
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
  query,
  files,
  onSelect,
  onDismiss,
}: {
  query: string;           // everything after "@"
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
        bottom: "calc(100% + 4px)",
        left: 0,
        right: 0,
        background: "var(--bg-3)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 -8px 24px rgba(0,0,0,0.5)",
        zIndex: 500,
        maxHeight: 280,
        overflow: "auto",
      }}
    >
      <div style={{ padding: "4px 12px 2px", fontSize: 10, fontWeight: 600, color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.08em", userSelect: "none" }}>
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
      <div style={{ padding: "4px 12px 6px", fontSize: 10, color: "var(--text-dimmer)", borderTop: "1px solid var(--border-dim)", display: "flex", gap: 10 }}>
        <span>↑↓ navigate</span>
        <span>↵ / Tab select</span>
        <span>Esc dismiss</span>
      </div>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Find the @word the cursor is currently inside, returns null if not in an @mention */
function getAtQuery(val: string, cursorPos: number): string | null {
  const before = val.slice(0, cursorPos);
  const atIdx = before.lastIndexOf("@");
  if (atIdx === -1) return null;
  // There must be no space between @ and cursor
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
        .then(r => r.json())
        .then((d: { suggestions?: AgentSuggestion[] }) => {
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
  suggestion,
  onApply,
  onDismiss,
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
      fontFamily: "var(--font)",
      color: "var(--text-dimmer)",
      marginBottom: 4,
      width: "fit-content",
      userSelect: "none",
    }}>
      <span style={{ color: "var(--accent)", fontSize: 11, lineHeight: 1 }}>⚡</span>
      <span>Try:</span>
      <button
        onClick={() => onApply(suggestion.id)}
        title={suggestion.description || suggestion.reason}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "var(--accent)",
          fontFamily: "var(--font)",
          fontSize: 10,
          fontWeight: 600,
        }}
      >
        {suggestion.name}
      </button>
      <span>for this task</span>
      <button
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          padding: "0 0 0 2px",
          cursor: "pointer",
          color: "var(--text-dimmer)",
          fontFamily: "var(--font)",
          fontSize: 11,
          lineHeight: 1,
        }}
        title="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// ─── ──────────────────────────────────────────────────────────────────────────

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
}

const MODELS = [
  { id: "claude-opus-4-6",           label: "Opus 4.6",   note: "1M ctx" },
  { id: "claude-sonnet-4-6",         label: "Sonnet 4.6", note: "default" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5",  note: "fast" },
];

function persist(key: string, val: unknown) {
  try { localStorage.setItem(`studio_${key}`, JSON.stringify(val)); } catch {}
}
function restore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`studio_${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function ModelPill({ selected, onChange }: { selected: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODELS.find(m => m.id === selected) ?? MODELS[1];

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "3px 8px", background: "none", border: "none", borderRadius: 4,
          color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-ui)",
          cursor: "pointer", transition: "background 0.1s, color 0.1s", whiteSpace: "nowrap",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)"; }}
      >
        <span style={{ color: "var(--accent)", fontSize: 13 }}>✸</span>
        {current.label}
      </button>

      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 4px)", left: 0, zIndex: 300,
          background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
          minWidth: 180, boxShadow: "0 -4px 16px rgba(0,0,0,0.4)", overflow: "hidden",
        }}>
          {MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => { onChange(m.id); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "7px 12px", background: "none", border: "none",
                borderLeft: m.id === selected ? "2px solid var(--accent)" : "2px solid transparent",
                color: m.id === selected ? "var(--accent)" : "var(--text-dim)",
                fontFamily: "var(--font)", fontSize: 12, cursor: "pointer", textAlign: "left",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "none"}
            >
              <span>{m.label}</span>
              <span style={{ color: "var(--text-dimmer)", fontSize: 10 }}>{m.note}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolbarToggle({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "3px 8px",
        background: active ? "var(--accent-bg)" : "none",
        border: "none", borderRadius: 4,
        color: active ? "var(--accent)" : "var(--text-dimmer)",
        fontSize: 11, fontFamily: "var(--font-ui)",
        cursor: "pointer", transition: "background 0.1s, color 0.1s", whiteSpace: "nowrap",
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = "none";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)";
        }
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export default function ChatInputBar({
  sessionId, onNewSession, onSessionCreated, onStreamText, onStreamingChange, streaming, terminalCwd, currentFile,
}: ChatInputBarProps) {
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(() => restore("model", "claude-sonnet-4-6"));
  const [thinking, setThinking] = useState(() => restore("thinking", false));
  const [planMode, setPlanMode] = useState(() => restore("plan_mode", false));
  const [slashOpen, setSlashOpen] = useState(false);
  const [atQuery, setAtQuery] = useState<string | null>(null); // null = closed
  const [chipDismissed, setChipDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const agentSuggestion = useAgentSuggestion(input, currentFile);

  const slashCommands = useSlashCommands(onNewSession, () => setPlanMode(v => !v), () => setThinking(v => !v));
  const mentionFiles = useMentionFiles();

  const injectTerminalCwd = useCallback(() => {
    if (!terminalCwd) return;
    const snippet = `\n\n[Terminal cwd: ${terminalCwd}]`;
    setInput(prev => prev + snippet);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
    });
  }, [terminalCwd]);

  useEffect(() => persist("model", selectedModel), [selectedModel]);
  useEffect(() => persist("thinking", thinking), [thinking]);
  useEffect(() => persist("plan_mode", planMode), [planMode]);

  // Show slash picker when input looks like a command (starts with "/" with no space yet)
  const isSlashTrigger = (val: string) => val.startsWith("/") && !val.includes(" ");

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    // Slash picker
    setSlashOpen(isSlashTrigger(val));
    // @mention picker — check cursor position
    const cursor = e.target.selectionStart ?? val.length;
    const aq = getAtQuery(val, cursor);
    setAtQuery(aq !== null ? aq : null);
    // Reset chip dismiss when user types new content
    if (chipDismissed) setChipDismissed(false);
  };

  const selectSlashCommand = useCallback((cmd: SlashCommand) => {
    setSlashOpen(false);
    if (cmd.action) {
      // Studio action — run it, clear the input
      cmd.action();
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      return;
    }
    if (cmd.category === "mode") {
      // These are handled by action above, but as a fallback just clear
      setInput("");
      return;
    }
    // Claude CLI pass-through: set input to the command text so user can add args or just send
    const hasArgs = cmd.argHint;
    if (hasArgs) {
      setInput(`/${cmd.name} `);
      requestAnimationFrame(() => textareaRef.current?.focus());
    } else {
      setInput(`/${cmd.name}`);
      // Send immediately for no-arg commands
      requestAnimationFrame(() => void sendMessageWithText(`/${cmd.name}`));
    }
  }, [streaming]); // sendMessageWithText closes over streaming

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
    // Replace "@<query>" with "@<path> "
    const before = input.slice(0, cursor);
    const atIdx = before.lastIndexOf("@");
    const after = input.slice(cursor);
    const newVal = `${input.slice(0, atIdx)}@${file.path} ${after}`;
    setInput(newVal);
    // Move cursor after the inserted mention
    requestAnimationFrame(() => {
      if (!ta) return;
      const pos = atIdx + file.path.length + 2; // "@" + path + " "
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  }, [input]);

  // ⌘L focus shortcut
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "l") { e.preventDefault(); textareaRef.current?.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    return sendMessageWithText();
  };

  const sendMessageWithText = async (overrideText?: string) => {
    const text = overrideText ?? input.trim();
    if (!text || streaming) return;
    if (!overrideText) {
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }

    let sid = sessionId;
    if (!sid) {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json() as { session: Session };
      sid = data.session.id;
      onSessionCreated?.(sid);
    }

    onStreamingChange(true);
    onStreamText("");

    let systemPrompt = "";
    if (thinking) systemPrompt += "\n\nUse extended thinking before responding.";
    if (planMode) systemPrompt += "\n\nEnter plan mode: respond with a structured plan only, do not write code.";

    const res = await fetch(`/api/sessions/${sid}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        model: selectedModel,
        ...(systemPrompt.trim() && { systemPrompt: systemPrompt.trim() }),
      }),
    });

    if (!res.ok || !res.body) { onStreamingChange(false); return; }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let assembled = "";

    abortRef.current = () => {
      reader.cancel().catch(() => {});
      fetch(`/api/sessions/${sid}/interrupt`, { method: "POST" }).catch(() => {});
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const evt = JSON.parse(raw) as { type: string; text?: string };
            if (evt.type === "text" && evt.text) {
              assembled += evt.text;
              onStreamText(assembled);
            }
          } catch {}
        }
      }
    } finally {
      abortRef.current = null;
      onStreamingChange(false);
      onStreamText("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); setPlanMode(v => !v); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  return (
    <div style={{ background: "var(--bg)", borderTop: "1px solid var(--border-dim)", flexShrink: 0, padding: "12px 16px 10px" }}>
      <div style={{ position: "relative" }}>
        {slashOpen && (
          <SlashPicker
            query={input}
            commands={slashCommands}
            onSelect={selectSlashCommand}
            onDismiss={() => setSlashOpen(false)}
          />
        )}
        {!slashOpen && atQuery !== null && (
          <MentionPicker
            query={atQuery}
            files={mentionFiles}
            onSelect={selectMentionFile}
            onDismiss={() => setAtQuery(null)}
          />
        )}
        {agentSuggestion && !chipDismissed && !slashOpen && atQuery === null && (
          <AgentChip
            suggestion={agentSuggestion}
            onApply={applyAgentSuggestion}
            onDismiss={() => setChipDismissed(true)}
          />
        )}
      <div
        style={{
          background: "var(--bg-2)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", overflow: "hidden", transition: "border-color 0.15s",
        }}
        onFocusCapture={e => (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent-border)"}
        onBlurCapture={e => (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"}
      >
        {/* Textarea */}
        <div style={{ padding: "10px 14px 2px" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={streaming ? "" : "Ask to make changes, @mention files, run /commands"}
            disabled={streaming}
            rows={1}
            style={{
              width: "100%", background: "none", border: "none", outline: "none",
              color: "var(--text)", fontSize: 13, fontFamily: "var(--font)",
              resize: "none", maxHeight: 140, overflowY: "auto", lineHeight: 1.5, display: "block",
            }}
          />
        </div>

        {/* Streaming line */}
        {streaming && (
          <div style={{ padding: "0 14px 6px", fontSize: 11, color: "var(--accent)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animation: "stream-pulse 1s ease-in-out infinite" }} />
            Claude is responding...
          </div>
        )}

        {/* Toolbar */}
        <div style={{
          display: "flex", alignItems: "center", padding: "4px 6px 6px", gap: 0,
          borderTop: "1px solid var(--border-dim)",
        }}>
          <ProviderSelector />
          <ToolbarToggle active={thinking} onClick={() => setThinking(v => !v)} icon={<span style={{ fontSize: 13, lineHeight: 1 }}>◐</span>} label="Thinking" />
          <ToolbarToggle active={planMode} onClick={() => setPlanMode(v => !v)} icon={<span style={{ fontSize: 11, lineHeight: 1 }}>▦</span>} label="Plan" />
          {terminalCwd && (
            <button
              onClick={injectTerminalCwd}
              title={`Inject terminal path: ${terminalCwd}`}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "3px 8px", background: "none", border: "none", borderRadius: 4,
                color: "var(--text-dimmer)", fontSize: 11, fontFamily: "var(--font-ui)",
                cursor: "pointer", transition: "background 0.1s, color 0.1s", whiteSpace: "nowrap",
                maxWidth: 180, overflow: "hidden",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "none";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)";
              }}
            >
              <span style={{ fontSize: 12, lineHeight: 1 }}>⊡</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {terminalCwd.split("/").pop() || terminalCwd}
              </span>
            </button>
          )}

          <div style={{ flex: 1 }} />

          {!streaming && !input && (
            <span style={{ fontSize: 10, color: "var(--text-dimmer)", marginRight: 8, opacity: 0.4 }}>⌘L to focus</span>
          )}

          {/* New */}
          <button
            onClick={onNewSession}
            title="New conversation"
            style={{
              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              background: "none", border: "none", borderRadius: 4,
              color: "var(--text-dimmer)", cursor: "pointer", transition: "background 0.1s, color 0.1s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dimmer)"; }}
          >
            <Plus size={14} />
          </button>

          {/* Stop / Send */}
          {streaming ? (
            <button
              onClick={() => abortRef.current?.()}
              title="Stop"
              style={{
                width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                background: "var(--red-bg)", border: "none", borderRadius: 4,
                color: "var(--red)", cursor: "pointer",
              }}
            >
              <Square size={12} />
            </button>
          ) : (
            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim()}
              title="Send (Enter)"
              style={{
                width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                background: input.trim() ? "var(--accent)" : "rgba(255,255,255,0.06)",
                border: "none", borderRadius: 4,
                color: input.trim() ? "#000" : "var(--text-dimmer)",
                cursor: input.trim() ? "pointer" : "default",
                transition: "all 0.15s",
              }}
            >
              <Send size={12} />
            </button>
          )}
        </div>
      </div>
      </div>{/* end position:relative wrapper */}

      <style>{`@keyframes stream-pulse { 0%,100%{opacity:.4;transform:scale(.8)} 50%{opacity:1;transform:scale(1.2)} }`}</style>
    </div>
  );
}
