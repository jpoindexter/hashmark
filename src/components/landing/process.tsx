import { FadeUp } from "./motion-wrapper";

const steps = [
  {
    number: "01",
    title: "Connect",
    body: "Link your GitHub repo with one-click OAuth. We never clone your code — we read it in-place with read-only access.",
    detail: "Private repos supported. Revoke anytime.",
  },
  {
    number: "02",
    title: "Scan",
    body: "27 specialized scanners analyze your real codebase — APIs, auth flows, data models, component patterns, test conventions, dependency graph.",
    detail: "~30 seconds for most repos.",
  },
  {
    number: "03",
    title: "Ship",
    body: "Specialized agent files are committed directly to your repo. Tailored to your exact stack, not a generic template.",
    detail: "Install the GitHub Action to re-run on every push.",
  },
];

export function ProcessSection() {
  return (
    <section className="py-24">
      <div className="max-w-6xl mx-auto px-6 lg:px-12">

        <div className="text-center mb-20 scroll-reveal">
          <div className="inline-flex mb-6">
            <span
              style={{
                fontFamily: "var(--font-montserrat), sans-serif",
                fontSize: "10px",
                letterSpacing: "0.15em",
                fontWeight: 600,
                textTransform: "uppercase" as const,
                color: "rgba(26,26,26,0.55)",
                background: "rgba(255,255,255,0.7)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: "1px solid rgba(232,228,217,0.8)",
                borderRadius: "9999px",
                padding: "5px 14px",
              }}
            >
              The workflow
            </span>
          </div>
          <h2
            style={{
              fontFamily: "var(--font-montserrat), sans-serif",
              fontSize: "clamp(32px, 4vw, 48px)",
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              color: "#1A1A1A",
            }}
          >
            Three steps to{" "}
            <em
              style={{
                fontFamily: "var(--font-crimson), Georgia, serif",
                fontStyle: "italic",
                fontWeight: 500,
                fontSize: "1.12em",
              }}
            >
              agent clarity.
            </em>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <FadeUp key={step.number} delay={i * 0.12}>
            <div
              className="insight-card p-10"
              style={{
                borderRadius: "1.5rem",
                background: "rgba(255,255,255,0.72)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                border: "1px solid rgba(255,255,255,0.6)",
                boxShadow: "0 8px 30px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-montserrat), sans-serif",
                  fontSize: "11px",
                  letterSpacing: "0.2em",
                  fontWeight: 800,
                  color: "rgba(147,197,253,0.8)",
                  marginBottom: "24px",
                }}
              >
                {step.number}
              </div>

              <h3
                style={{
                  fontFamily: "var(--font-montserrat), sans-serif",
                  fontSize: "22px",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "#1A1A1A",
                  marginBottom: "12px",
                }}
              >
                {step.title}
              </h3>

              <p
                style={{
                  fontFamily: "var(--font-montserrat), sans-serif",
                  fontSize: "14px",
                  lineHeight: 1.7,
                  color: "rgba(26,26,26,0.55)",
                  marginBottom: "20px",
                }}
              >
                {step.body}
              </p>

              <p
                style={{
                  fontFamily: "var(--font-montserrat), sans-serif",
                  fontSize: "11px",
                  letterSpacing: "0.08em",
                  color: "rgba(26,26,26,0.35)",
                }}
              >
                {step.detail}
              </p>
            </div>
            </FadeUp>
          ))}
        </div>

      </div>
    </section>
  );
}
