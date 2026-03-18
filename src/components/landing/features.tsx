import { FadeUp } from "./motion-wrapper";
import { FEATURES } from "./feature-data";

export function FeaturesSection() {
  return (
    <section className="py-16">
      <div className="max-w-6xl mx-auto px-6 lg:px-12 space-y-32">
        {FEATURES.map((feature, i) => (
          <FadeUp key={feature.eyebrow}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              {/* Visual — alternates sides */}
              <div className={i % 2 === 1 ? "lg:order-2" : "lg:order-1"}>
                <div style={{
                  borderRadius: "1.5rem",
                  background: "rgba(255,255,255,0.72)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  border: "1px solid rgba(255,255,255,0.6)",
                  boxShadow: "0 8px 30px rgba(0,0,0,0.04)",
                  padding: "40px 32px",
                }}>
                  {feature.visual}
                </div>
              </div>

              {/* Copy */}
              <div className={`space-y-6 ${i % 2 === 1 ? "lg:order-1" : "lg:order-2"}`}>
                <div>
                  <span style={{
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
                    display: "inline-block",
                  }}>
                    {feature.eyebrow}
                  </span>
                </div>

                <h2 style={{
                  fontFamily: "var(--font-montserrat), sans-serif",
                  fontSize: "clamp(26px, 3vw, 36px)",
                  fontWeight: 700,
                  lineHeight: 1.2,
                  letterSpacing: "-0.03em",
                  color: "#1A1A1A",
                }}>
                  {feature.title}
                  <br />
                  <em style={{
                    fontFamily: "var(--font-crimson), Georgia, serif",
                    fontStyle: "italic",
                    fontWeight: 500,
                    fontSize: "1.12em",
                  }}>
                    {feature.titleItalic}
                  </em>
                </h2>

                <p style={{
                  fontFamily: "var(--font-crimson), Georgia, serif",
                  fontSize: "18px",
                  lineHeight: 1.7,
                  color: "rgba(26,26,26,0.58)",
                }}>
                  {feature.body}
                </p>

                <ul className="space-y-3 pt-1">
                  {feature.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-4">
                      <div
                        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5"
                        style={{ background: "#F0F9FF" }}
                      >
                        <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="#93C5FD" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3.5 3.5L13 4" />
                        </svg>
                      </div>
                      <span style={{
                        fontFamily: "var(--font-montserrat), sans-serif",
                        fontSize: "13px",
                        letterSpacing: "0.02em",
                        color: "rgba(26,26,26,0.7)",
                        lineHeight: 1.6,
                      }}>
                        {b}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </FadeUp>
        ))}
      </div>
    </section>
  );
}
