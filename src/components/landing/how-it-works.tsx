const steps = [
  {
    number: "01",
    title: "CONNECT",
    description:
      "Sign in with GitHub and select your repos. One click, done.",
    icon: "→",
  },
  {
    number: "02",
    title: "SCAN",
    description:
      "27 scanners analyze your codebase — components, APIs, patterns, database, complexity, and more.",
    icon: "#",
  },
  {
    number: "03",
    title: "SYNC",
    description:
      "Every format auto-generated and auto-committed via GitHub Action on every push. Zero friction.",
    icon: "↻",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b-2 border-foreground px-[var(--grid-6)] py-[var(--grid-16)]">
      <div className="mx-auto max-w-5xl">
        {/* Section index label */}
        <p className="type-label text-muted-foreground tracking-widest mb-[var(--grid-4)]">
          &mdash; PROCESS
        </p>

        <div className="flex flex-col gap-[var(--grid-2)] mb-[var(--grid-16)] sm:flex-row sm:items-end sm:justify-between">
          <h2 className="type-h2">
            HOW IT WORKS
          </h2>
          <p className="type-body text-muted-foreground sm:text-right max-w-xs">
            Three steps. Then never think about it again.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3">
          {steps.map((step, i) => (
            <div
              key={step.number}
              className={[
                "flex flex-col p-[var(--grid-8)] border border-border transition-colors hover:border-foreground hover:bg-muted",
                i < steps.length - 1 ? "sm:border-r-0" : "",
              ].join(" ")}
            >
              {/* Large faded number */}
              <span className="type-h1 text-foreground/20 leading-none mb-[var(--grid-4)] select-none" aria-hidden="true">
                {step.number}
              </span>

              {/* Icon symbol */}
              <span className="type-h2 text-foreground mb-[var(--grid-4)]" aria-hidden="true">
                {step.icon}
              </span>

              {/* Title */}
              <h3 className="type-h3 mb-[var(--grid-3)]">
                {step.title}
              </h3>

              {/* Description */}
              <p className="type-body text-muted-foreground flex-1">
                {step.description}
              </p>

              {/* Bottom link */}
              <a
                href="#"
                className="mt-[var(--grid-8)] type-label text-muted-foreground hover:text-foreground transition-colors tracking-widest"
              >
                VIEW DETAILS &rarr;
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
