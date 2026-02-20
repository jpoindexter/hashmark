import Link from "next/link";
import { Footer } from "@/components/landing/footer";

export const metadata = {
  title: "Pricing — Hashmark",
  description:
    "Simple pricing for AI context file generation. Free to start, Pro for unlimited repos and auto-sync.",
};

const PLANS = [
  {
    name: "FREE",
    price: "$0",
    period: "",
    description: "Try it out",
    features: [
      "1 connected repository",
      "Manual scan via web UI",
      "All 8 output formats",
      "Download all format files",
      "Basic intelligence dashboard",
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
      "Unlimited repositories",
      "Auto-sync via GitHub Action",
      "Full codebase intelligence dashboard",
      "Custom rules engine",
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
    description: "For teams — coming soon",
    features: [
      "Everything in Pro",
      "Shared team billing",
      "Priority support",
      "Early access to new features",
    ],
    cta: "> JOIN WAITLIST",
    href: "mailto:hello@theft.studio?subject=Hashmark%20Team%20Plan%20Waitlist",
    highlighted: false,
  },
];

const FEATURES = [
  { name: "Connected repositories", free: "1", pro: "Unlimited", team: "Unlimited" },
  { name: "Manual scan via web UI", free: true, pro: true, team: true },
  { name: "All 8 output formats", free: true, pro: true, team: true },
  { name: "Download format files", free: true, pro: true, team: true },
  { name: "Auto-sync (GitHub Action)", free: false, pro: true, team: true },
  { name: "Intelligence dashboard", free: "Basic", pro: "Full", team: "Full" },
  { name: "Custom rules", free: false, pro: true, team: true },
  { name: "Scan history + diffs", free: false, pro: true, team: true },
  { name: "Shared team billing", free: false, pro: false, team: true },
  { name: "Priority support", free: false, pro: false, team: true },
  { name: "Early access to new features", free: false, pro: false, team: true },
];

const FAQ = [
  {
    question: "What happens when I hit my repo limit?",
    answer:
      "On the Free plan, you can connect 1 repository. To connect more, upgrade to Pro for unlimited repos. Your existing data is preserved when you upgrade.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. Cancel anytime from your billing dashboard. You'll keep access until the end of your current billing period. No lock-in, no penalties.",
  },
  {
    question: "Do you store my source code?",
    answer:
      "No. We clone your repo to a temporary directory, run the scanner, generate context files, and immediately delete the clone. Only the scan results (metadata like component names, API routes, stats) and generated context files are stored.",
  },
  {
    question: "Which AI tools are supported?",
    answer:
      "Hashmark generates 8 formats covering all major AI coding tools: AGENTS.md (universal), CLAUDE.md (Claude Code), .cursorrules and .cursor/rules/*.mdc (Cursor), copilot-instructions.md (GitHub Copilot), .windsurfrules (Windsurf), GEMINI.md (Google Gemini CLI), and .clinerules (Cline/Roo Code).",
  },
  {
    question: "How does auto-sync work?",
    answer:
      "Pro and Team plans include a GitHub Action that runs on every push to your default branch. It scans your codebase and auto-commits updated context files — so your AI tools always have current, accurate context. Zero maintenance.",
  },
  {
    question: "What scanners do you use?",
    answer:
      "Hashmark runs 27 specialized scanners covering components, API routes, database models, design tokens, hooks, utilities, anti-patterns, complexity metrics, file structure, environment variables, and more. A typical scan of a 1,500-file codebase completes in 5-15 seconds.",
  },
];

function FeatureCell({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="type-body">{value}</span>;
  }
  if (value) {
    return <span className="type-body text-foreground">#</span>;
  }
  return <span className="type-body text-muted-foreground">—</span>;
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background font-mono text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 z-50 w-full border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-[var(--grid-6)]">
          <Link
            href="/"
            className="flex items-center gap-[var(--grid-2)] type-button"
          >
            <span className="text-xl text-foreground">#</span>
            <span>Hashmark</span>
          </Link>
          <div className="flex items-center gap-[var(--grid-6)]">
            <Link
              href="/#pricing"
              className="type-nav text-muted-foreground transition-colors hover:text-foreground"
            >
              PRICING
            </Link>
            <Link
              href="/login"
              className="border border-border px-[var(--grid-4)] py-[var(--grid-1)].5 type-button transition-colors hover:bg-muted hover:border-foreground"
            >
              {"> SIGN IN"}
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-[var(--grid-6)] pb-24 pt-28">
        {/* Header */}
        <div className="mb-16 text-center">
          <h1 className="type-h1 text-4xl">
            SIMPLE PRICING
          </h1>
          <p className="mt-[var(--grid-4)] text-lg text-muted-foreground">
            One price. All formats. Every scan.
          </p>
        </div>

        {/* Plan Cards */}
        <div className="mb-24 mono-grid-3 gap-[var(--grid-6)]">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col border p-[var(--grid-6)] ${
                plan.highlighted
                  ? "border-foreground bg-card"
                  : "border-border"
              }`}
            >
              <div className="mb-[var(--grid-6)]">
                <span className="type-label text-muted-foreground">
                  [{plan.name}]
                </span>
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
                  <li
                    key={feature}
                    className="flex items-start gap-[var(--grid-2)] type-body"
                  >
                    <span className="mt-0.5 text-foreground">#</span>
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

        {/* Feature Comparison Table */}
        <section className="mb-24">
          <h2 className="mb-[var(--grid-8)] text-center type-label text-muted-foreground">
            FEATURE COMPARISON
          </h2>
          <div className="overflow-x-auto">
            <table className="mono-table">
              <thead>
                <tr className="bg-muted">
                  <th className="type-label text-muted-foreground">FEATURE</th>
                  <th className="text-center type-label text-muted-foreground">FREE</th>
                  <th className="text-center type-label text-foreground">PRO</th>
                  <th className="text-center type-label text-muted-foreground">TEAM</th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((feature) => (
                  <tr key={feature.name}>
                    <td className="type-body">{feature.name}</td>
                    <td className="text-center"><FeatureCell value={feature.free} /></td>
                    <td className="text-center"><FeatureCell value={feature.pro} /></td>
                    <td className="text-center"><FeatureCell value={feature.team} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="mb-[var(--grid-8)] text-center type-label text-muted-foreground">
            FREQUENTLY ASKED QUESTIONS
          </h2>
          <div className="mono-stack-sm">
            {FAQ.map((item) => (
              <details
                key={item.question}
                className="mono-details"
              >
                <summary className="type-button">
                  {item.question}
                </summary>
                <div className="type-body text-muted-foreground">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
