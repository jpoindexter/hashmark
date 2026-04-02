import { useState, useEffect } from "react";
import { fetchApi } from "../../lib/api";
import {
  PICKER_CONTAINER_STYLE,
  PICKER_GROUP_LABEL_STYLE,
  pickerRowStyle,
  usePicker,
} from "./picker-shared";
import { PickerFooter } from "./PickerFooter";

export interface SlashCommand {
  name: string;
  description: string;
  argHint?: string;
  category: "claude" | "studio" | "mode";
  action?: () => void;
}

export const BUILTIN_COMMANDS: SlashCommand[] = [
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

export const CATEGORY_LABEL: Record<SlashCommand["category"], string> = {
  claude: "Claude",
  mode:   "Mode",
  studio: "Studio",
};

export function useSlashCommands(onNewSession: () => void, onTogglePlan: () => void, onToggleThink: () => void) {
  const [customCmds, setCustomCmds] = useState<SlashCommand[]>([]);

  useEffect(() => {
    fetchApi("/api/agents")
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

export function SlashPicker({
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

  const { activeIdx, setActiveIdx, listRef } = usePicker(query, filtered, onSelect, onDismiss);

  if (filtered.length === 0) return null;

  const grouped = filtered.reduce<Record<string, SlashCommand[]>>((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  let globalIdx = 0;

  return (
    <div ref={listRef} className="dropdown-animate" style={{ ...PICKER_CONTAINER_STYLE, maxHeight: 320 }}>
      {Object.entries(grouped).map(([cat, cmds]) => (
        <div key={cat}>
          <div style={PICKER_GROUP_LABEL_STYLE}>
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
                style={{ ...pickerRowStyle(isActive), gap: 10, padding: "6px 12px" }}
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
      <PickerFooter />
    </div>
  );
}
