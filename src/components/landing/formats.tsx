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
        <h2 className="mb-4 text-center type-h2">
          EVERY FORMAT
        </h2>
        <p className="mb-16 text-center text-muted-foreground">
          One scan generates context files for every AI coding tool.
        </p>

        <div className="border border-border">
          {/* Header */}
          <div className="grid grid-cols-2 border-b border-border px-6 py-3">
            <span className="type-label text-muted-foreground">
              FILE
            </span>
            <span className="type-label text-muted-foreground">
              AI TOOL
            </span>
          </div>

          {/* Rows */}
          {formats.map((format, i) => (
            <div
              key={format.file}
              className={`grid grid-cols-2 px-6 py-3 ${
                i < formats.length - 1 ? "border-b border-border" : ""
              } hover:bg-muted transition-colors`}
            >
              <span className="type-body">
                <code className="font-bold">{format.file}</code>
              </span>
              <span className="type-body text-muted-foreground">
                {format.tool}
                {format.universal && (
                  <span className="ml-2 border border-foreground px-1.5 py-0.5 type-label text-foreground">
                    UNIVERSAL
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center type-caption text-muted-foreground">
          All generated from a single scan. All kept in sync automatically.
        </p>
      </div>
    </section>
  );
}
