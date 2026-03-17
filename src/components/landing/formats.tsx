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
    <section className="border-b-2 border-foreground px-[var(--grid-6)] py-[var(--grid-20)]">
      <div className="mx-auto max-w-5xl">
        {/* Section index label */}
        <p className="type-label text-muted-foreground tracking-widest mb-[var(--grid-4)]">
          &mdash; FORMATS
        </p>

        <div className="flex flex-col gap-[var(--grid-2)] mb-[var(--grid-16)] sm:flex-row sm:items-end sm:justify-between">
          <h2 className="type-h2">
            EVERY FORMAT
          </h2>
          <p className="type-body text-muted-foreground sm:text-right max-w-xs">
            One scan generates context files for every AI coding tool.
          </p>
        </div>

        <table className="mono-table w-full">
          <thead>
            <tr className="border-t-2 border-foreground">
              <th className="type-label text-muted-foreground text-left py-[var(--grid-3)] pr-[var(--grid-8)]">
                FILE
              </th>
              <th className="type-label text-muted-foreground text-left py-[var(--grid-3)]">
                AI TOOL
              </th>
            </tr>
          </thead>
          <tbody>
            {formats.map((format) => (
              <tr
                key={format.file}
                className={[
                  "border-t border-border transition-colors hover:bg-muted",
                  format.universal ? "text-foreground" : "",
                ].join(" ")}
              >
                <td className={["py-[var(--grid-4)] pr-[var(--grid-8)]", format.universal ? "type-body font-bold" : "type-body"].join(" ")}>
                  <code className={format.universal ? "font-bold" : ""}>{format.file}</code>
                </td>
                <td className={["py-[var(--grid-4)]", format.universal ? "type-body font-bold" : "type-body text-muted-foreground"].join(" ")}>
                  {format.tool}
                  {format.universal && (
                    <span className="ml-[var(--grid-3)] border border-foreground px-[var(--grid-2)] py-[var(--grid-1)] type-label text-foreground">
                      UNIVERSAL
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-[var(--grid-8)] type-caption text-muted-foreground">
          {"// All generated from a single scan. All kept in sync automatically."}
        </p>
      </div>
    </section>
  );
}
