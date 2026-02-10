const plans = [
  {
    name: "FREE",
    price: "$0",
    period: "",
    description: "Try it out",
    features: [
      "1 connected repo",
      "Manual scan via web UI",
      "Download all 7 formats",
      "Basic dashboard",
    ],
    cta: "> GET STARTED",
    href: "/login",
    highlighted: false,
  },
  {
    name: "PRO",
    price: "$19",
    period: "/mo",
    description: "For individuals",
    features: [
      "Unlimited repos",
      "Auto-sync via GitHub Action",
      "Full codebase intelligence dashboard",
      "Custom rules",
      "Scan history with diffs",
    ],
    cta: "> UPGRADE TO PRO",
    href: "/login",
    highlighted: true,
  },
  {
    name: "TEAM",
    price: "$29",
    period: "/seat/mo",
    description: "For teams",
    features: [
      "Everything in Pro",
      "Org-wide rules across all repos",
      "Team dashboard (all repos in one view)",
      "Invite team members",
      "Shared custom rules library",
    ],
    cta: "> CONTACT US",
    href: "mailto:hello@theft.studio",
    highlighted: false,
  },
];

export function PricingTable() {
  return (
    <section id="pricing" className="border-t border-border px-[var(--grid-6)] py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-[var(--grid-4)] text-center type-h2">
          PRICING
        </h2>
        <p className="mb-16 text-center text-muted-foreground">
          Free to start. Pay when you need auto-sync.
        </p>

        <div className="mono-grid-3 gap-[var(--grid-6)]">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col border p-[var(--grid-6)] ${
                plan.highlighted
                  ? "border-foreground bg-card"
                  : "border-border"
              }`}
            >
              <div className="mb-[var(--grid-6)]">
                <div className="flex items-baseline gap-[var(--grid-1)]">
                  <span className="type-label text-muted-foreground">
                    [{plan.name}]
                  </span>
                </div>
                <div className="mt-[var(--grid-2)] flex items-baseline gap-[var(--grid-1)]">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="type-caption text-muted-foreground">
                    {plan.period}
                  </span>
                </div>
                <p className="mt-[var(--grid-1)] type-body text-muted-foreground">
                  {plan.description}
                </p>
              </div>

              <ul className="mb-[var(--grid-8)] flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-[var(--grid-2)] type-body">
                    <span className="mt-0.5">{"#"}</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <a
                href={plan.href}
                className={`block w-full py-[var(--grid-2)].5 text-center type-button transition-colors ${
                  plan.highlighted
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "border border-border hover:border-foreground hover:bg-muted"
                }`}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
