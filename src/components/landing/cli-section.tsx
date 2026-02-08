export function CliSection() {
  return (
    <section className="border-t border-border px-6 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="mb-4 text-3xl font-bold uppercase tracking-tight">
          TRY THE CLI FREE
        </h2>
        <p className="mb-8 text-muted-foreground">
          Generate AGENTS.md locally with one command. No account needed.
        </p>

        <div className="mx-auto max-w-md border border-border bg-muted/50 px-6 py-4 text-left">
          <code className="text-sm">
            <span className="text-muted-foreground">$</span>{" "}
            <span className="text-accent">npx</span> @jpoindexter/agent-smith
          </code>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          Want all 7 formats + auto-sync?{" "}
          <a href="/login" className="text-accent hover:underline">
            Sign up for Hashmark
          </a>
        </p>
      </div>
    </section>
  );
}
