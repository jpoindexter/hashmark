export function Hero() {
  return (
    <section className="relative min-h-screen border-b-2 border-foreground pt-14">
      {/* Stats bar */}
      <div className="border-b border-border px-[var(--grid-6)] py-[var(--grid-3)]">
        <div className="mx-auto max-w-5xl">
          <span className="type-label text-muted-foreground tracking-widest">
            {"// 27 SCANNERS"} &nbsp;&middot;&nbsp; 7 FORMATS &nbsp;&middot;&nbsp; ZERO FRICTION
          </span>
        </div>
      </div>

      {/* Split editorial layout */}
      <div className="mx-auto max-w-5xl px-[var(--grid-6)]">
        <div className="grid grid-cols-1 lg:grid-cols-5 lg:gap-0">

          {/* LEFT: 2/5 — identity + copy + CTAs */}
          <div className="lg:col-span-2 flex flex-col justify-center py-[var(--grid-16)] lg:border-r-2 lg:border-foreground lg:pr-[var(--grid-8)]">
            {/* Decorative # watermark */}
            <div className="text-9xl font-bold leading-none text-foreground/5 select-none mb-[var(--grid-4)]" aria-hidden="true">
              #
            </div>

            <h1 className="type-h1 mb-[var(--grid-4)]">
              HASHMARK
            </h1>

            <p className="type-h3 text-foreground mb-[var(--grid-4)]">
              One scan.<br />Every format.<br />Always in sync.
            </p>

            <p className="type-body text-muted-foreground mb-[var(--grid-10)] leading-relaxed">
              Your codebase generates AI context files for every coding tool —
              AGENTS.md, CLAUDE.md, .cursorrules, and more. Connected repos stay
              in sync automatically via GitHub Action.
            </p>

            <div className="flex flex-col gap-[var(--grid-3)] sm:flex-row">
              <a
                href="/login"
                className="inline-flex items-center gap-[var(--grid-2)] border-2 border-foreground bg-foreground px-[var(--grid-6)] py-[var(--grid-3)] type-button text-background transition-colors hover:bg-transparent hover:text-foreground"
              >
                {"> GET STARTED"}
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-[var(--grid-2)] border border-border px-[var(--grid-6)] py-[var(--grid-3)] type-button text-foreground transition-colors hover:border-foreground hover:bg-muted"
              >
                {"> HOW IT WORKS"}
              </a>
            </div>
          </div>

          {/* RIGHT: 3/5 — Terminal widget, full height */}
          <div className="lg:col-span-3 flex items-stretch py-[var(--grid-8)] lg:pl-[var(--grid-8)]">
            <div className="w-full border-2 border-foreground flex flex-col">
              {/* Terminal chrome */}
              <div className="flex items-center gap-[var(--grid-2)] border-b-2 border-foreground px-[var(--grid-4)] py-[var(--grid-3)]">
                <div className="h-3 w-3 border border-border" />
                <div className="h-3 w-3 border border-border" />
                <div className="h-3 w-3 border border-border" />
                <span className="ml-[var(--grid-2)] type-caption text-muted-foreground tracking-widest">
                  HASHMARK — bash — 80x28
                </span>
              </div>

              {/* Terminal body */}
              <div className="flex-1 p-[var(--grid-6)] type-body leading-loose">
                <p className="text-muted-foreground">$ hashmark scan --repo ./my-app</p>
                <p className="mt-[var(--grid-3)] text-muted-foreground">Scanning repository...</p>

                <p className="mt-[var(--grid-3)]">
                  <span className="text-emerald-500">&#10003;</span> Discovered 143 source files
                </p>
                <p>
                  <span className="text-emerald-500">&#10003;</span> Found 279 components
                </p>
                <p>
                  <span className="text-emerald-500">&#10003;</span> Found 46 API routes
                </p>
                <p>
                  <span className="text-emerald-500">&#10003;</span> Found 28 database models
                </p>
                <p>
                  <span className="text-emerald-500">&#10003;</span> Detected 6 code patterns
                </p>
                <p>
                  <span className="text-emerald-500">&#10003;</span> Analyzed complexity hotspots
                </p>
                <p>
                  <span className="text-emerald-500">&#10003;</span> Extracted 33 custom rules
                </p>
                <p>
                  <span className="text-emerald-500">&#10003;</span> Mapped import graph (2,418 edges)
                </p>

                <p className="mt-[var(--grid-4)]">
                  <span className="text-emerald-500">&#10003;</span> Generated 7 files:
                </p>
                <p className="text-muted-foreground pl-[var(--grid-4)]">
                  AGENTS.md &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;4,218 tokens
                </p>
                <p className="text-muted-foreground pl-[var(--grid-4)]">
                  CLAUDE.md &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3,901 tokens
                </p>
                <p className="text-muted-foreground pl-[var(--grid-4)]">
                  .cursorrules &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2,744 tokens
                </p>
                <p className="text-muted-foreground pl-[var(--grid-4)]">
                  .cursor/rules/*.mdc &nbsp;2,611 tokens
                </p>
                <p className="text-muted-foreground pl-[var(--grid-4)]">
                  copilot-instructions &nbsp;2,119 tokens
                </p>
                <p className="text-muted-foreground pl-[var(--grid-4)]">
                  .windsurfrules &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;1,988 tokens
                </p>
                <p className="text-muted-foreground pl-[var(--grid-4)]">
                  gemini.md &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;1,847 tokens
                </p>

                <p className="mt-[var(--grid-4)]">
                  <span className="text-emerald-500">&#10003;</span> Auto-committed to main [a3f9c12]
                </p>

                <p className="mt-[var(--grid-3)] text-muted-foreground">
                  Done in 4.2s. Next sync on push.
                </p>
                <p className="mt-[var(--grid-2)] text-muted-foreground">$ <span className="animate-pulse">&#9646;</span></p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
