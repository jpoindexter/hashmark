const formats = [
  { file: "AGENTS.md", tool: "Cursor, Copilot, Gemini, Zed, 20+", universal: true },
  { file: "CLAUDE.md", tool: "Claude Code", universal: false },
  { file: ".cursor/rules/*.mdc", tool: "Cursor (new format)", universal: false },
  { file: ".cursorrules", tool: "Cursor (legacy)", universal: false },
  { file: "copilot-instructions.md", tool: "GitHub Copilot", universal: false },
  { file: ".windsurfrules", tool: "Windsurf", universal: false },
  { file: "gemini.md", tool: "Gemini CLI", universal: false },
];

export function Formats() {
  return (
    <section className="border-t border-border px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-4 text-center text-3xl font-bold uppercase tracking-tight">
          EVERY FORMAT
        </h2>
        <p className="mb-16 text-center text-muted-foreground">
          One scan generates context files for every AI coding tool.
        </p>

        <div className="border border-border">
          {/* Header */}
          <div className="grid grid-cols-2 border-b border-border bg-muted/50 px-6 py-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              FILE
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              AI TOOL
            </span>
          </div>

          {/* Rows */}
          {formats.map((format, i) => (
            <div
              key={format.file}
              className={`grid grid-cols-2 px-6 py-3 ${
                i < formats.length - 1 ? "border-b border-border" : ""
              } hover:bg-muted/30 transition-colors`}
            >
              <span className="text-sm">
                <code className="text-accent">{format.file}</code>
              </span>
              <span className="text-sm text-muted-foreground">
                {format.tool}
                {format.universal && (
                  <span className="ml-2 border border-accent/30 px-1.5 py-0.5 text-[10px] uppercase text-accent">
                    UNIVERSAL
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          All generated from a single scan. All kept in sync automatically.
        </p>
      </div>
    </section>
  );
}
