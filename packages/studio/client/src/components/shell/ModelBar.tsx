import { useState, useEffect, useRef, type CSSProperties } from "react";
import {
  Sparkles,
  Brain,
  ClipboardList,
  Check,
} from "lucide-react";

// ─── Model registry ──────────────────────────────────────────────────────────

const MODELS = [
  { id: "claude-opus-4-6", label: "Opus 4.6", note: "1M ctx" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", note: "default" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", note: "fast" },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface ModelBarProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  thinking: boolean;
  onToggleThinking: () => void;
  planMode: boolean;
  onTogglePlan: () => void;
}

// ─── Toggle button (Thinking / Plan) ─────────────────────────────────────────

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

// ─── Model dropdown ──────────────────────────────────────────────────────────

function ModelDropdown({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(100% + 4px)",
        left: 0,
        zIndex: 100,
        background: "var(--bg-3)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        minWidth: 200,
        boxShadow: "0 -4px 20px rgba(0,0,0,0.5)",
        overflow: "hidden",
      }}
    >
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
        }}
      >
        Claude
      </div>
      {MODELS.map((m) => (
        <ModelRow
          key={m.id}
          label={m.label}
          note={m.note}
          isSelected={m.id === selected}
          onSelect={() => onSelect(m.id)}
        />
      ))}
    </div>
  );
}

function ModelRow({
  label,
  note,
  isSelected,
  onSelect,
}: {
  label: string;
  note: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "7px 12px",
        background: hovered ? "rgba(255,255,255,0.05)" : "none",
        border: "none",
        borderLeft: isSelected
          ? "2px solid var(--accent)"
          : "2px solid transparent",
        color: isSelected ? "var(--accent)" : "var(--text-dim)",
        fontFamily: "var(--font-ui)",
        fontSize: 12,
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.1s ease",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>{label}</span>
        <span style={{ color: "var(--text-dimmer)", fontSize: 10 }}>
          {note}
        </span>
      </span>
      {isSelected && <Check size={12} style={{ flexShrink: 0 }} />}
    </button>
  );
}

// ─── Model selector trigger ──────────────────────────────────────────────────

function ModelSelector({
  selectedModel,
  onModelChange,
}: {
  selectedModel: string;
  onModelChange: (model: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
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

  const current = MODELS.find((m) => m.id === selectedModel) ?? MODELS[1];
  const color = hovered ? "var(--text-dim)" : "var(--text-dimmer)";

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
        <span>{current.label}</span>
      </button>

      {open && (
        <ModelDropdown
          selected={selectedModel}
          onSelect={(id) => {
            onModelChange(id);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Container styles ────────────────────────────────────────────────────────

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

// ─── ModelBar ────────────────────────────────────────────────────────────────

export default function ModelBar({
  selectedModel,
  onModelChange,
  thinking,
  onToggleThinking,
  planMode,
  onTogglePlan,
}: ModelBarProps) {
  return (
    <div style={containerStyle}>
      {/* Left: model selector + toggles */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <ModelSelector
          selectedModel={selectedModel}
          onModelChange={onModelChange}
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
