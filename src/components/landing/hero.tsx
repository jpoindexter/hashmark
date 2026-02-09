export function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-14">
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        {/* Giant # symbol */}
        <div className="mb-8 text-[12rem] font-bold leading-none text-foreground/10 select-none">
          #
        </div>

        <h1 className="mb-4 type-h1 sm:text-5xl md:text-6xl">
          HASHMARK
        </h1>

        <p className="mb-2 text-xl font-medium">
          One scan. Every format. Always in sync.
        </p>

        <p className="mb-10 max-w-xl mx-auto text-muted-foreground leading-relaxed">
          Your codebase generates AI context files for every coding tool —
          AGENTS.md, CLAUDE.md, .cursorrules, and more. Connected repos stay in
          sync automatically via GitHub Action.
        </p>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="/login"
            className="inline-flex items-center gap-2 border border-foreground bg-foreground px-8 py-3 type-button text-background transition-colors hover:bg-foreground/90"
          >
            {"> GET STARTED"}
          </a>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 border border-border px-8 py-3 type-button text-foreground transition-colors hover:border-foreground hover:bg-muted"
          >
            {"> HOW IT WORKS"}
          </a>
        </div>

        {/* Terminal preview */}
        <div className="mt-16 mx-auto max-w-lg text-left">
          <div className="border border-border">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2">
              <div className="h-3 w-3 border border-border" />
              <div className="h-3 w-3 border border-border" />
              <div className="h-3 w-3 border border-border" />
              <span className="ml-2 type-caption text-muted-foreground">
                hashmark
              </span>
            </div>
            <div className="p-4 type-body leading-relaxed">
              <p className="text-muted-foreground">$ hashmark scan</p>
              <p className="mt-2">
                {"✓"} Found 279 components
              </p>
              <p>
                {"✓"} Found 46 API routes
              </p>
              <p>
                {"✓"} Found 28 database models
              </p>
              <p>
                {"✓"} Detected 6 code patterns
              </p>
              <p>
                {"✓"} Analyzed complexity hotspots
              </p>
              <p className="mt-2">
                {"✓"} Generated 7 files:
              </p>
              <p className="text-muted-foreground pl-4">
                AGENTS.md, CLAUDE.md, .cursorrules,
              </p>
              <p className="text-muted-foreground pl-4">
                .cursor/rules/project.mdc,
              </p>
              <p className="text-muted-foreground pl-4">
                copilot-instructions.md,
              </p>
              <p className="text-muted-foreground pl-4">
                .windsurfrules, gemini.md
              </p>
              <p className="mt-2">
                {"✓"} Auto-committed to main
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
