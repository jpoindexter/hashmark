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
    <section id="how-it-works" className="border-t border-border px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-4 text-center text-3xl font-bold uppercase tracking-tight">
          HOW IT WORKS
        </h2>
        <p className="mb-16 text-center text-muted-foreground">
          Three steps. Then never think about it again.
        </p>

        <div className="grid gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.number}
              className="border border-border p-6 transition-colors hover:border-accent/50"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="text-3xl text-accent">{step.icon}</span>
                <span className="text-xs text-muted-foreground">
                  [{step.number}]
                </span>
              </div>
              <h3 className="mb-2 text-lg font-bold uppercase tracking-wider">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
