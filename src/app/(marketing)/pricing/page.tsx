import Link from "next/link";
import { Footer } from "@/components/landing/footer";
import { PLANS, FEATURE_ROWS, FAQ_ITEMS, CheckIcon, FeatureCell } from "@/components/landing/pricing-helpers";

export const metadata = {
  title: "Pricing — Hashmark",
  description:
    "Simple pricing for AI context file generation. Free to start, Pro for unlimited repos and auto-sync.",
};

const TH = {
  fontFamily: "var(--font-montserrat), sans-serif",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
};

export default function PricingPage() {
  return (
    <div
      className="marketing-page min-h-screen"
      style={{ fontFamily: "var(--font-crimson), Georgia, serif", backgroundColor: "var(--background)", color: "var(--foreground)" }}
    >
      {/* Nav */}
      <nav
        className="fixed top-0 w-full z-50"
        style={{ backgroundColor: "rgba(var(--background-rgb, 253,252,249),0.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(26,26,26,0.06)" }}
      >
        <div className="max-w-6xl mx-auto px-6 lg:px-12">
          <div className="flex justify-between items-center h-12">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-6 h-6 flex items-center justify-center rounded-md bg-foreground text-background flex-shrink-0">
                <span className="font-bold text-xs leading-none" style={{ fontFamily: "var(--font-montserrat), sans-serif" }}>#</span>
              </div>
              <span className="text-sm font-semibold tracking-tight" style={{ fontFamily: "var(--font-montserrat), sans-serif" }}>Hashmark</span>
            </Link>
            <Link
              href="/login"
              className="px-4 py-1.5 rounded-full text-xs transition-all hover:bg-foreground hover:text-background"
              style={{ fontFamily: "var(--font-montserrat), sans-serif", border: "1px solid rgba(26,26,26,0.15)" }}
            >
              Connect repo
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 lg:px-12 pt-28 pb-24">
        {/* Header */}
        <div className="text-center mb-20">
          <p className="text-xs tracking-widest uppercase mb-4" style={{ fontFamily: "var(--font-montserrat), sans-serif", color: "rgba(26,26,26,0.4)" }}>
            Pricing
          </p>
          <h1 className="text-5xl font-light tracking-tight mb-4" style={{ letterSpacing: "-0.02em" }}>
            Simple, honest pricing
          </h1>
          <p className="text-lg" style={{ color: "rgba(26,26,26,0.55)" }}>
            Free to start. Pay when you need auto-sync.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-24">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className="flex flex-col p-8"
              style={{
                background: plan.highlighted ? "var(--foreground)" : "white",
                color: plan.highlighted ? "var(--background)" : "var(--foreground)",
                border: plan.highlighted ? "none" : "1px solid rgba(26,26,26,0.1)",
              }}
            >
              <div className="mb-6">
                <p className="text-xs tracking-widest uppercase mb-3" style={{ fontFamily: "var(--font-montserrat), sans-serif", color: plan.highlighted ? "rgba(253,252,249,0.5)" : "rgba(26,26,26,0.4)" }}>
                  {plan.name}
                </p>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl font-light">{plan.price}</span>
                  <span className="text-sm" style={{ color: plan.highlighted ? "rgba(253,252,249,0.5)" : "rgba(26,26,26,0.4)" }}>{plan.period}</span>
                </div>
                <p className="text-sm" style={{ color: plan.highlighted ? "rgba(253,252,249,0.6)" : "rgba(26,26,26,0.5)" }}>
                  {plan.description}
                </p>
              </div>

              <ul className="flex-1 space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <CheckIcon inverted={plan.highlighted} />
                    <span style={{ color: plan.highlighted ? "rgba(253,252,249,0.85)" : "rgba(26,26,26,0.8)" }}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <a
                href={plan.href}
                className="block w-full py-3 text-center text-sm transition-all"
                style={{
                  fontFamily: "var(--font-montserrat), sans-serif",
                  fontWeight: 500,
                  letterSpacing: "0.05em",
                  background: plan.highlighted ? "var(--background)" : "transparent",
                  color: "var(--foreground)",
                  border: plan.highlighted ? "none" : "1px solid rgba(26,26,26,0.2)",
                }}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>

        {/* Feature comparison */}
        <section className="mb-24">
          <p className="text-xs tracking-widest uppercase text-center mb-10" style={{ fontFamily: "var(--font-montserrat), sans-serif", color: "rgba(26,26,26,0.35)" }}>
            Feature comparison
          </p>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(26,26,26,0.08)" }}>
                  <th className="text-left py-3 pr-8" style={{ ...TH, color: "rgba(26,26,26,0.4)", width: "50%" }}>Feature</th>
                  <th className="text-center py-3 px-4" style={{ ...TH, color: "rgba(26,26,26,0.4)" }}>Free</th>
                  <th className="text-center py-3 px-4" style={{ ...TH, color: "var(--foreground)" }}>Pro</th>
                  <th className="text-center py-3 px-4" style={{ ...TH, color: "rgba(26,26,26,0.4)" }}>Team</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_ROWS.map((row) => (
                  <tr key={row.name} style={{ borderBottom: "1px solid rgba(26,26,26,0.05)" }}>
                    <td className="py-3 pr-8 text-sm" style={{ color: "rgba(26,26,26,0.7)" }}>{row.name}</td>
                    <td className="py-3 px-4 text-center"><FeatureCell value={row.free} /></td>
                    <td className="py-3 px-4 text-center"><FeatureCell value={row.pro} /></td>
                    <td className="py-3 px-4 text-center"><FeatureCell value={row.team} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section>
          <p className="text-xs tracking-widest uppercase text-center mb-10" style={{ fontFamily: "var(--font-montserrat), sans-serif", color: "rgba(26,26,26,0.35)" }}>
            Questions
          </p>
          <div className="max-w-2xl mx-auto space-y-0">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} style={{ borderBottom: "1px solid rgba(26,26,26,0.08)" }}>
                <summary className="py-5 text-base cursor-pointer flex items-center justify-between list-none" style={{ fontWeight: 400 }}>
                  {item.q}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="faq-chevron flex-shrink-0 ml-4" style={{ color: "rgba(26,26,26,0.35)" }}>
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <div className="pb-5 text-base leading-relaxed" style={{ color: "rgba(26,26,26,0.55)" }}>
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="mt-20 text-center">
          <p className="text-lg mb-6" style={{ color: "rgba(26,26,26,0.55)" }}>
            Ready to keep your AI tools in sync?
          </p>
          <Link
            href="/login"
            className="inline-block px-8 py-3 text-sm transition-all hover:opacity-80"
            style={{ fontFamily: "var(--font-montserrat), sans-serif", fontWeight: 500, letterSpacing: "0.05em", background: "var(--foreground)", color: "var(--background)" }}
          >
            Connect your first repo — free
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
