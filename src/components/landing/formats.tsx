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
    <section className="border-t border-border px-[var(--grid-6)] py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-[var(--grid-4)] text-center type-h2">
          EVERY FORMAT
        </h2>
        <p className="mb-16 text-center text-muted-foreground">
          One scan generates context files for every AI coding tool.
        </p>

        <table className="mono-table">
          <thead>
            <tr>
              <th className="type-label text-muted-foreground">FILE</th>
              <th className="type-label text-muted-foreground">AI TOOL</th>
            </tr>
          </thead>
          <tbody>
            {formats.map((format) => (
              <tr key={format.file} className="transition-colors hover:bg-muted">
                <td className="type-body">
                  <code className="font-bold">{format.file}</code>
                </td>
                <td className="type-body text-muted-foreground">
                  {format.tool}
                  {format.universal && (
                    <span className="ml-2 border border-foreground px-[var(--grid-1)].5 py-0.5 type-label text-foreground">
                      UNIVERSAL
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-[var(--grid-6)] text-center type-caption text-muted-foreground">
          All generated from a single scan. All kept in sync automatically.
        </p>
      </div>
    </section>
  );
}
