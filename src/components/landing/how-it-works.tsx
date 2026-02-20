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
    <section id="how-it-works" className="border-t border-border px-[var(--grid-6)] py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-[var(--grid-4)] text-center type-h2">
          HOW IT WORKS
        </h2>
        <p className="mb-16 text-center text-muted-foreground">
          Three steps. Then never think about it again.
        </p>

        <div className="mono-grid-3 gap-[var(--grid-8)]">
          {steps.map((step) => (
            <div
              key={step.number}
              className="border border-border p-[var(--grid-6)] transition-colors hover:border-foreground hover:bg-muted"
            >
              <div className="mb-[var(--grid-4)] flex items-center gap-[var(--grid-3)]">
                <span className="text-3xl text-foreground">{step.icon}</span>
                <span className="type-label text-muted-foreground">
                  [{step.number}]
                </span>
              </div>
              <h3 className="mb-[var(--grid-2)] type-h3">
                {step.title}
              </h3>
              <p className="type-body text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
