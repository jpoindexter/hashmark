export function CliSection() {
  return (
    <section className="border-t border-border px-6 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="mb-4 type-h2">
          TRY THE CLI FREE
        </h2>
        <p className="mb-8 text-muted-foreground">
          Generate AGENTS.md locally with one command. No account needed.
        </p>

        <div className="mx-auto max-w-md mono-pre text-left">
          <code className="type-body">
            <span className="text-muted-foreground">$</span>{" "}
            npx hashmark
          </code>
        </div>

        <p className="mt-6 type-caption text-muted-foreground">
          Want all 7 formats + auto-sync?{" "}
          <a href="/login" className="text-foreground hover:underline">
            Sign up for Hashmark
          </a>
        </p>
      </div>
    </section>
  );
}
