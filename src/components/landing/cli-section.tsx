export function CliSection() {
  return (
    <section className="border-b-2 border-foreground px-[var(--grid-6)] py-[var(--grid-16)]">
      <div className="mx-auto max-w-5xl">
        {/* Section index label */}
        <p className="type-label text-muted-foreground tracking-widest mb-[var(--grid-4)]">
          &mdash; CLI
        </p>

        <div className="flex flex-col gap-[var(--grid-2)] mb-[var(--grid-16)] sm:flex-row sm:items-end sm:justify-between">
          <h2 className="type-h2">
            TRY THE CLI FREE
          </h2>
          <p className="type-body text-muted-foreground sm:text-right max-w-xs">
            Generate AGENTS.md locally with one command. No account needed.
          </p>
        </div>

        <div className="max-w-xl">
          {/* Try it now label */}
          <p className="type-label text-muted-foreground tracking-widest mb-[var(--grid-3)]">
            {"// TRY IT NOW"}
          </p>

          {/* Command block */}
          <div className="border-2 border-foreground">
            <div className="flex items-center gap-[var(--grid-2)] border-b border-border px-[var(--grid-4)] py-[var(--grid-2)]">
              <div className="h-2 w-2 border border-border" />
              <div className="h-2 w-2 border border-border" />
              <div className="h-2 w-2 border border-border" />
              <span className="ml-[var(--grid-2)] type-caption text-muted-foreground tracking-widest">
                TERMINAL
              </span>
            </div>
            <div className="mono-pre px-[var(--grid-6)] py-[var(--grid-4)]">
              <code className="type-body">
                <span className="text-muted-foreground">$</span>{" "}
                npx hashmark
              </code>
            </div>
          </div>

          <p className="mt-[var(--grid-6)] type-caption text-muted-foreground">
            Want all 7 formats + auto-sync?{" "}
            <a href="/login" className="text-foreground hover:underline underline-offset-4">
              Sign up for Hashmark &rarr;
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
