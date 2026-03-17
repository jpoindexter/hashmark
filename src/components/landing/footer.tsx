export function Footer() {
  return (
    <footer className="border-t-2 border-foreground px-[var(--grid-6)] py-[var(--grid-16)]">
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-1 gap-[var(--grid-12)] sm:grid-cols-3">

          {/* Col 1: Wordmark + tagline */}
          <div className="flex flex-col gap-[var(--grid-4)]">
            <span className="type-h3 text-foreground"># HASHMARK</span>
            <p className="type-body text-muted-foreground">
              One scan. Every format.
            </p>
          </div>

          {/* Col 2: Navigation links */}
          <div className="flex flex-col gap-[var(--grid-3)]">
            <p className="type-label text-muted-foreground tracking-widest mb-[var(--grid-2)]">
              LINKS
            </p>
            <a
              href="https://github.com/jpoindexter/hashmark"
              target="_blank"
              rel="noopener noreferrer"
              className="type-body text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://github.com/jpoindexter/hashmark#cli"
              target="_blank"
              rel="noopener noreferrer"
              className="type-body text-muted-foreground hover:text-foreground transition-colors"
            >
              CLI
            </a>
            <a
              href="#pricing"
              className="type-body text-muted-foreground hover:text-foreground transition-colors"
            >
              Pricing
            </a>
            <a
              href="https://theft.studio"
              target="_blank"
              rel="noopener noreferrer"
              className="type-body text-muted-foreground hover:text-foreground transition-colors"
            >
              theft.studio
            </a>
          </div>

          {/* Col 3: Copyright */}
          <div className="flex flex-col justify-end gap-[var(--grid-2)]">
            <p className="type-caption text-muted-foreground">
              &copy; {new Date().getFullYear()} theft.studio
            </p>
            <p className="type-caption text-muted-foreground">
              Built by{" "}
              <a
                href="https://theft.studio"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:underline underline-offset-4"
              >
                theft.studio
              </a>
            </p>
          </div>

        </div>
      </div>
    </footer>
  );
}
