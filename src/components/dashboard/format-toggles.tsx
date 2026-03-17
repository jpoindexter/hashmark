"use client";

import { useState, useTransition } from "react";
import { updateEnabledFormats } from "@/app/(dashboard)/dashboard/[repoId]/actions";
import { Button, Input } from "@fabrk/components";

export const ALL_FORMATS = [
  { id: "agents-md",      label: "AGENTS.md",                       tool: "Universal (Cursor, Copilot, Gemini, 20+)" },
  { id: "claude-md",      label: "CLAUDE.md",                       tool: "Claude Code" },
  { id: "cursorrules",    label: ".cursorrules",                     tool: "Cursor (legacy)" },
  { id: "cursor-mdc",     label: ".cursor/rules/",                  tool: "Cursor (MDC)" },
  { id: "copilot-md",     label: ".github/copilot-instructions.md", tool: "GitHub Copilot" },
  { id: "windsurf-rules", label: ".windsurfrules",                  tool: "Windsurf" },
  { id: "gemini-md",      label: "GEMINI.md",                       tool: "Google Gemini CLI" },
  { id: "cline-rules",    label: ".clinerules",                     tool: "Cline / Roo Code" },
] as const;

export function FormatToggles({
  repoId,
  enabledFormats,
}: {
  repoId: string;
  enabledFormats: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    enabledFormats.length > 0
      ? new Set(enabledFormats)
      : new Set(ALL_FORMATS.map((f) => f.id))
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    const chosen = [...selected];
    // All selected = store empty (new formats auto-include in future)
    const toStore = chosen.length === ALL_FORMATS.length ? [] : chosen;
    startTransition(async () => {
      try {
        await updateEnabledFormats(repoId, toStore);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save format preferences");
      }
    });
  }

  return (
    <div className="mono-box bg-card space-y-[var(--grid-4)]">
      <p className="type-caption text-muted-foreground">
        Choose which context files to generate on each scan. Deselecting formats you don&apos;t use keeps your repo clean.
      </p>
      <div className="space-y-[var(--grid-2)]">
        {ALL_FORMATS.map((fmt) => (
          <label
            key={fmt.id}
            className="flex items-center gap-[var(--grid-3)] cursor-pointer"
          >
            <Input
              type="checkbox"
              checked={selected.has(fmt.id)}
              onChange={() => toggle(fmt.id)}
              className="accent-accent"
              aria-label={`Enable ${fmt.label}`}
            />
            <span className="flex-1 min-w-0">
              <span className="type-label text-foreground font-mono">{fmt.label}</span>
              <span className="ml-[var(--grid-2)] type-caption text-muted-foreground">{fmt.tool}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-[var(--grid-3)]">
        <Button
          onClick={handleSave}
          disabled={isPending}
          className="border border-border bg-background px-[var(--grid-4)] py-[var(--grid-2)] type-nav text-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {isPending ? "SAVING..." : "> SAVE FORMATS"}
        </Button>
        {saved && <p className="type-caption text-accent" role="status">Saved. Takes effect on next scan.</p>}
        {error && <p className="type-caption text-destructive" role="alert">{error}</p>}
      </div>
    </div>
  );
}
