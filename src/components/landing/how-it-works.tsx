import { FadeUp } from "./motion-wrapper";

const insightCards = [
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="#93C5FD" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
      </svg>
    ),
    title: "Semantic Understanding",
    body: "Move beyond file-dumping. Our 27 scanners interpret the intent behind your architecture — APIs, auth flows, data models, dependencies.",
    offset: false,
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="#93C5FD" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    title: "Role-Aware Generation",
    body: "Every agent file is specialized for its role. Your frontend agent knows your component patterns. Your security reviewer knows your auth flows.",
    offset: true,
  },
];

export function HowItWorks() {
  return (
    <section className="py-24" id="how-it-works">
      <div className="max-w-6xl mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">

          {/* Cards */}
          <div className="order-2 lg:order-1 grid grid-cols-1 gap-6">
            {insightCards.map((card, i) => (
              <FadeUp key={card.title} delay={i * 0.12} className={card.offset ? "lg:ml-12" : ""}>
              <div
                className="insight-card p-8"
                style={{
                  borderRadius: "1.5rem",
                  background: "rgba(255,255,255,0.72)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  border: "1px solid rgba(255,255,255,0.6)",
                  boxShadow: "0 8px 30px rgba(0,0,0,0.04)",
                }}
              >
                <div className="mb-4">{card.icon}</div>
                <h3
                  className="mb-3"
                  style={{
                    fontFamily: "var(--font-montserrat), sans-serif",
                    fontSize: "18px",
                    fontWeight: 500,
                    color: "#1A1A1A",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {card.title}
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-montserrat), sans-serif",
                    fontSize: "14px",
                    lineHeight: 1.7,
                    color: "rgba(26,26,26,0.55)",
                  }}
                >
                  {card.body}
                </p>
              </div>
              </FadeUp>
            ))}
          </div>

          {/* Copy */}
          <FadeUp className="order-1 lg:order-2 space-y-6">
            <h2
              style={{
                fontFamily: "var(--font-montserrat), sans-serif",
                fontSize: "clamp(32px, 4vw, 42px)",
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: "-0.03em",
                color: "#1A1A1A",
              }}
            >
              Sophistication through{" "}
              <br />
              <em
                style={{
                  fontFamily: "var(--font-crimson), Georgia, serif",
                  fontStyle: "italic",
                  fontWeight: 400,
                  fontSize: "1.1em",
                }}
              >
                Total Awareness.
              </em>
            </h2>

            <p
              style={{
                fontFamily: "var(--font-montserrat), sans-serif",
                fontSize: "16px",
                lineHeight: 1.75,
                color: "rgba(26,26,26,0.55)",
              }}
            >
              We deploy 27 specialized scanners — not to dump your codebase, but
              to understand it. Components, APIs, database models, auth flows,
              and dependencies are woven into a cohesive picture of your
              technical estate.
            </p>

            <ul className="space-y-4 pt-2">
              {[
                "Connect your GitHub repo — one-click OAuth",
                "27 scanners map your real architecture",
                "Context files committed on every push",
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-4">
                  <div
                    className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                    style={{ background: "#F0F9FF" }}
                  >
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="#93C5FD" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3.5 3.5L13 4" />
                    </svg>
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-montserrat), sans-serif",
                      fontSize: "13px",
                      letterSpacing: "0.05em",
                      color: "rgba(26,26,26,0.8)",
                    }}
                  >
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </FadeUp>

        </div>
      </div>
    </section>
  );
}
