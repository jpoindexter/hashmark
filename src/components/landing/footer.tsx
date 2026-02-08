export function Footer() {
  return (
    <footer className="border-t border-border px-6 py-12">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="text-accent text-xl">#</span>
          <span className="text-sm font-bold uppercase tracking-wider">
            Hashmark
          </span>
        </div>

        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <a
            href="https://github.com/jpoindexter/hashmark"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/@jpoindexter/agent-smith"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            CLI
          </a>
          <a
            href="https://theft.studio"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            theft.studio
          </a>
        </div>

        <p className="text-xs text-muted-foreground">
          {new Date().getFullYear()} theft.studio
        </p>
      </div>
    </footer>
  );
}
