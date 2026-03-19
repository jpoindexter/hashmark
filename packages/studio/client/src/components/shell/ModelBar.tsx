import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import {
  Sparkles,
  Brain,
  ClipboardList,
  Check,
  Circle,
  ExternalLink,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface DetectedProvider {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
  path?: string;
}

interface ModelEntry {
  id: string;
  label: string;
  note?: string;
}

interface ProviderGroup {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
  models: ModelEntry[];
}

// ── Static model registry per provider ───────────────────────────────────────

const PROVIDER_MODELS: Record<string, ModelEntry[]> = {
  claude: [
    { id: "claude-opus-4-6", label: "Opus 4.6", note: "1M ctx" },
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6", note: "default" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", note: "fast" },
  ],
  codex: [
    { id: "o3", label: "o3", note: "reasoning" },
    { id: "o3-mini", label: "o3 mini", note: "fast" },
    { id: "gpt-4o", label: "GPT-4o" },
  ],
  gemini: [
    { id: "gemini-2.0-flash", label: "2.0 Flash", note: "fast" },
    { id: "gemini-1.5-pro", label: "1.5 Pro" },
  ],
  aider: [
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  ],
  amp:   [{ id: "amp-default", label: "Default" }],
  goose: [{ id: "goose-default", label: "Default" }],
  copilot: [{ id: "copilot-default", label: "Default" }],
};

// Install instructions for tools that aren't found
const INSTALL_URLS: Record<string, string> = {
  claude:  "https://docs.anthropic.com/en/docs/claude-code",
  codex:   "https://github.com/openai/codex",
  gemini:  "https://github.com/google-gemini/gemini-cli",
  aider:   "https://aider.chat/docs/install.html",
  amp:     "https://github.com/amphitheatre-app/amp",
  goose:   "https://github.com/block/goose",
  copilot: "https://githubnext.com/projects/copilot-cli",
};

// ── Props ────────────────────────────────────────────────────────────────────

interface ModelBarProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  thinking: boolean;
  onToggleThinking: () => void;
  planMode: boolean;
  onTogglePlan: () => void;
}

// ── Toggle button (Thinking / Plan) ──────────────────────────────────────────

function ToggleButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const color = active
    ? "var(--accent)"
    : hovered
      ? "var(--text-dim)"
      : "var(--text-dimmer)";

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${active ? "Disable" : "Enable"} ${label}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 6px",
        border: "none",
        background: active ? "var(--accent-bg)" : "none",
        borderRadius: "var(--radius-sm)",
        color,
        fontSize: 11,
        fontFamily: "var(--font-ui)",
        cursor: "pointer",
        transition: "color 0.1s ease, background 0.1s ease",
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ── Installed dot indicator ──────────────────────────────────────────────────

function InstalledDot({ installed }: { installed: boolean }) {
  return (
    <Circle
      size={6}
      fill={installed ? "var(--accent)" : "var(--text-dimmer)"}
      stroke="none"
      style={{ flexShrink: 0, opacity: installed ? 1 : 0.4 }}
    />
  );
}

// ── Provider section header ──────────────────────────────────────────────────

function ProviderHeader({
  group,
}: {
  group: ProviderGroup;
}) {
  return (
    <div
      style={{
        padding: "6px 12px 3px",
        fontSize: 10,
        fontWeight: 600,
        color: "var(--text-dimmer)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        userSelect: "none",
        fontFamily: "var(--font-ui)",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <InstalledDot installed={group.installed} />
      <span>{group.name}</span>
      {group.version && (
        <span style={{ fontWeight: 400, fontSize: 9, opacity: 0.6 }}>
          v{group.version}
        </span>
      )}
    </div>
  );
}

// ── Model row ────────────────────────────────────────────────────────────────

function ModelRow({
  label,
  note,
  isSelected,
  isHighlighted,
  disabled,
  onSelect,
  onMouseEnter,
}: {
  label: string;
  note?: string;
  isSelected: boolean;
  isHighlighted: boolean;
  disabled: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <button
      role="option"
      aria-selected={isSelected}
      onClick={disabled ? undefined : onSelect}
      onMouseEnter={onMouseEnter}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "7px 12px 7px 24px",
        background: isHighlighted ? "rgba(255,255,255,0.05)" : "none",
        border: "none",
        borderLeft: isSelected
          ? "2px solid var(--accent)"
          : "2px solid transparent",
        color: disabled
          ? "var(--text-dimmer)"
          : isSelected
            ? "var(--accent)"
            : "var(--text-dim)",
        fontFamily: "var(--font-ui)",
        fontSize: 12,
        cursor: disabled ? "default" : "pointer",
        textAlign: "left",
        transition: "background 0.1s ease",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>{label}</span>
        {note && (
          <span style={{ color: "var(--text-dimmer)", fontSize: 10 }}>
            {note}
          </span>
        )}
      </span>
      {isSelected && <Check size={12} style={{ flexShrink: 0 }} />}
    </button>
  );
}

// ── Not-installed row with install link ──────────────────────────────────────

function InstallRow({ providerId, name }: { providerId: string; name: string }) {
  const url = INSTALL_URLS[providerId];
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        padding: "5px 12px 5px 24px",
        fontSize: 10,
        color: "var(--text-dimmer)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span style={{ opacity: 0.6 }}>
        {name} not installed
      </span>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            fontSize: 9,
            color: hovered ? "var(--accent)" : "var(--text-dimmer)",
            textDecoration: "none",
            transition: "color 0.1s ease",
          }}
        >
          <span>Install</span>
          <ExternalLink size={8} />
        </a>
      )}
    </div>
  );
}

// ── Model dropdown with provider grouping ────────────────────────────────────

function ModelDropdown({
  selected,
  onSelect,
  groups,
}: {
  selected: string;
  onSelect: (id: string) => void;
  groups: ProviderGroup[];
}) {
  // Build a flat list of selectable items for keyboard nav
  const selectableItems = groups.flatMap((g) =>
    g.installed ? g.models.map((m) => m.id) : [],
  );

  const [highlightedIndex, setHighlightedIndex] = useState(() =>
    Math.max(0, selectableItems.indexOf(selected)),
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, selectableItems.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = selectableItems[highlightedIndex];
        if (item) onSelect(item);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onSelect(selected);
        return;
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [highlightedIndex, onSelect, selected, selectableItems]);

  // Track which flat index we're at as we render groups
  let flatIdx = 0;

  return (
    <div
      className="dropdown-animate"
      role="listbox"
      aria-label="Select model"
      style={{
        position: "absolute",
        bottom: "calc(100% + 4px)",
        left: 0,
        zIndex: 100,
        background: "var(--bg-3)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        minWidth: 220,
        maxHeight: 400,
        overflowY: "auto",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.5)",
      }}
    >
      {groups.map((group, gi) => (
        <div key={group.id}>
          {gi > 0 && (
            <div style={{ borderTop: "1px solid var(--border-dim)" }} />
          )}

          <ProviderHeader group={group} />

          {group.installed ? (
            group.models.map((m) => {
              const idx = flatIdx++;
              return (
                <ModelRow
                  key={m.id}
                  label={m.label}
                  note={m.note}
                  isSelected={m.id === selected}
                  isHighlighted={idx === highlightedIndex}
                  disabled={false}
                  onSelect={() => onSelect(m.id)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                />
              );
            })
          ) : (
            <InstallRow providerId={group.id} name={group.name} />
          )}
        </div>
      ))}

      <div
        style={{
          padding: "4px 12px 6px",
          fontSize: 10,
          color: "var(--text-dimmer)",
          borderTop: "1px solid var(--border-dim)",
          display: "flex",
          gap: 10,
          fontFamily: "var(--font-ui)",
        }}
      >
        <span>up/down navigate</span>
        <span>enter select</span>
      </div>
    </div>
  );
}

// ── Model selector trigger ───────────────────────────────────────────────────

function ModelSelector({
  selectedModel,
  onModelChange,
  groups,
}: {
  selectedModel: string;
  onModelChange: (model: string) => void;
  groups: ProviderGroup[];
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Find current model label across all groups
  const currentModel = groups
    .flatMap((g) => g.models)
    .find((m) => m.id === selectedModel);
  const currentLabel = currentModel?.label ?? "Sonnet 4.6";

  // Find which provider owns the selected model
  const currentProvider = groups.find((g) =>
    g.models.some((m) => m.id === selectedModel),
  );

  const color = hovered ? "var(--text-dim)" : "var(--text-dimmer)";

  const handleSelect = useCallback(
    (id: string) => {
      onModelChange(id);
      setOpen(false);
    },
    [onModelChange],
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title="Switch model"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 6px",
          border: "none",
          background: "none",
          borderRadius: "var(--radius-sm)",
          color,
          fontSize: 11,
          fontFamily: "var(--font-ui)",
          cursor: "pointer",
          transition: "color 0.1s ease",
          whiteSpace: "nowrap",
        }}
      >
        <Sparkles size={14} />
        {currentProvider && currentProvider.id !== "claude" && (
          <span style={{ color: "var(--accent)", fontSize: 10 }}>
            {currentProvider.name}
          </span>
        )}
        <span>{currentLabel}</span>
      </button>

      {open && (
        <ModelDropdown
          selected={selectedModel}
          onSelect={handleSelect}
          groups={groups}
        />
      )}
    </div>
  );
}

// ── Container styles ─────────────────────────────────────────────────────────

const containerStyle: CSSProperties = {
  height: 32,
  background: "var(--bg-2)",
  borderTop: "1px solid var(--border-dim)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  paddingLeft: 8,
  paddingRight: 8,
  flexShrink: 0,
};

// ── Build provider groups from detection results ─────────────────────────────

function buildGroups(detected: DetectedProvider[]): ProviderGroup[] {
  // Always include Claude first (it's the primary provider)
  const claudeGroup: ProviderGroup = {
    id: "claude",
    name: "Claude",
    installed: true,
    models: PROVIDER_MODELS.claude,
  };

  // Check if Claude was detected with a version
  const claudeDetected = detected.find((d) => d.id === "claude");
  if (claudeDetected?.version) claudeGroup.version = claudeDetected.version;
  if (claudeDetected) claudeGroup.installed = claudeDetected.installed;

  const groups: ProviderGroup[] = [claudeGroup];

  // Add detected CLI tools (skip claude, already handled)
  for (const d of detected) {
    if (d.id === "claude") continue;
    const models = PROVIDER_MODELS[d.id] ?? [];
    groups.push({
      id: d.id,
      name: d.name,
      installed: d.installed,
      version: d.version,
      models,
    });
  }

  // Sort: installed first, then alphabetical
  groups.sort((a, b) => {
    if (a.id === "claude") return -1;
    if (b.id === "claude") return 1;
    if (a.installed !== b.installed) return a.installed ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return groups;
}

// ── ModelBar ──────────────────────────────────────────────────────────────────

export default function ModelBar({
  selectedModel,
  onModelChange,
  thinking,
  onToggleThinking,
  planMode,
  onTogglePlan,
}: ModelBarProps) {
  const [groups, setGroups] = useState<ProviderGroup[]>(() => [
    {
      id: "claude",
      name: "Claude",
      installed: true,
      models: PROVIDER_MODELS.claude,
    },
  ]);

  useEffect(() => {
    fetch("/api/providers/detect")
      .then((r) => r.json())
      .then((data: { providers: DetectedProvider[] }) => {
        setGroups(buildGroups(data.providers));
      })
      .catch(() => {
        // Detection failed -- keep Claude-only fallback
      });
  }, []);

  return (
    <div style={containerStyle}>
      {/* Left: model selector + toggles */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <ModelSelector
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          groups={groups}
        />

        <ToggleButton
          icon={<Brain size={14} />}
          label="Thinking"
          active={thinking}
          onClick={onToggleThinking}
        />

        <ToggleButton
          icon={<ClipboardList size={14} />}
          label="Plan"
          active={planMode}
          onClick={onTogglePlan}
        />
      </div>

      {/* Right: spacer (send button is in ChatInputBar) */}
      <div />
    </div>
  );
}
