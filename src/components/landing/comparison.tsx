import { FadeUp } from "./motion-wrapper";

const rows = [
  {
    label: "Agent context",
    without: "Generic system prompts written by hand",
    with: "Real architecture, real patterns, committed to your repo",
  },
  {
    label: "Format support",
    without: "Manual config per tool, maintained separately",
    with: "7 formats from one scan, always in sync",
  },
  {
    label: "Freshness",
    without: "Goes stale the moment code changes",
    with: "Updated automatically on every push",
  },
  {
    label: "Depth",
    without: "Surface-level descriptions you wrote yourself",
    with: "27 scanners: APIs, auth, models, dependencies, patterns",
  },
  {
    label: "Setup",
    without: "Hours of writing documentation that nobody reads",
    with: "30 seconds with hashmark",
  },
  {
    label: "Cost",
    without: "Your time",
    with: "Free forever, open source",
  },
];

export function ComparisonSection() {
  return (
    <section className="py-24">
      <div className="max-w-6xl mx-auto px-6 lg:px-12">

        <FadeUp className="text-center mb-16">
          <div className="inline-flex mb-6">
            <span
              style={{
                fontFamily: "var(--font-montserrat), sans-serif",
                fontSize: "10px",
                letterSpacing: "0.15em",
                fontWeight: 600,
                textTransform: "uppercase",
                color: "rgba(26,26,26,0.55)",
                background: "rgba(255,255,255,0.7)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: "1px solid rgba(232,228,217,0.8)",
                borderRadius: "9999px",
                padding: "5px 14px",
              }}
            >
              Before &amp; after
            </span>
          </div>
          <h2
            style={{
              fontFamily: "var(--font-montserrat), sans-serif",
              fontSize: "clamp(30px, 4vw, 44px)",
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              color: "#1A1A1A",
            }}
          >
            What changes when your agents{" "}
            <em
              style={{
                fontFamily: "var(--font-crimson), Georgia, serif",
                fontStyle: "italic",
                fontWeight: 500,
                fontSize: "1.12em",
              }}
            >
              actually know your codebase.
            </em>
          </h2>
        </FadeUp>

        <FadeUp delay={0.1}>
        <div
          className="scroll-reveal overflow-hidden"
          style={{
            borderRadius: "1.5rem",
            border: "1px solid rgba(255,255,255,0.6)",
            background: "rgba(255,255,255,0.72)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.04)",
          }}
        >
          {/* Table header */}
          <div
            className="grid grid-cols-3"
            style={{ borderBottom: "1px solid rgba(232,228,217,0.6)" }}
          >
            <div className="px-8 py-5" />
            <div
              className="px-8 py-5"
              style={{ borderLeft: "1px solid rgba(232,228,217,0.6)" }}
            >
              <span
                style={{
                  fontFamily: "var(--font-montserrat), sans-serif",
                  fontSize: "10px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  color: "rgba(26,26,26,0.3)",
                }}
              >
                Without Hashmark
              </span>
            </div>
            <div
              className="px-8 py-5"
              style={{ borderLeft: "1px solid rgba(232,228,217,0.6)", background: "rgba(240,249,255,0.3)" }}
            >
              <span
                style={{
                  fontFamily: "var(--font-montserrat), sans-serif",
                  fontSize: "10px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  color: "#7DD3FC",
                }}
              >
                With Hashmark
              </span>
            </div>
          </div>

          {/* Rows */}
          {rows.map((row, i) => (
            <div
              key={row.label}
              className="grid grid-cols-3"
              style={{
                borderTop: i === 0 ? "none" : "1px solid rgba(242,239,233,0.5)",
              }}
            >
              <div className="px-8 py-6">
                <span
                  style={{
                    fontFamily: "var(--font-montserrat), sans-serif",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: "rgba(26,26,26,0.5)",
                  }}
                >
                  {row.label}
                </span>
              </div>
              <div
                className="px-8 py-6"
                style={{ borderLeft: "1px solid rgba(232,228,217,0.4)" }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-crimson), Georgia, serif",
                    fontSize: "16px",
                    fontStyle: "italic",
                    lineHeight: 1.7,
                    color: "rgba(26,26,26,0.58)",
                  }}
                >
                  {row.without}
                </p>
              </div>
              <div
                className="px-8 py-6"
                style={{ borderLeft: "1px solid rgba(232,228,217,0.4)", background: "rgba(240,249,255,0.2)" }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-crimson), Georgia, serif",
                    fontSize: "16px",
                    fontStyle: "italic",
                    lineHeight: 1.7,
                    color: "rgba(26,26,26,0.75)",
                  }}
                >
                  {row.with}
                </p>
              </div>
            </div>
          ))}
        </div>
        </FadeUp>

      </div>
    </section>
  );
}
