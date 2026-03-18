import { FadeUp } from "./motion-wrapper";

const formats = [
  { file: "AGENTS.md",                tool: "Universal — Cursor, Copilot, Gemini, Zed, 20+", status: "Universal", active: true },
  { file: "CLAUDE.md",                tool: "Claude Code",                                    status: "Active",    active: true },
  { file: ".cursor/rules/*.mdc",      tool: "Cursor (new format)",                            status: "Active",    active: true },
  { file: ".cursorrules",             tool: "Cursor (legacy)",                                status: "Active",    active: true },
  { file: "copilot-instructions.md",  tool: "GitHub Copilot",                                 status: "Active",    active: true },
  { file: ".windsurfrules",           tool: "Windsurf",                                        status: "Active",    active: true },
  { file: "gemini.md",                tool: "Gemini CLI",                                      status: "Active",    active: true },
];

export function Formats() {
  return (
    <section className="py-24" id="formats">
      <div className="max-w-6xl mx-auto px-6 lg:px-12">
        <FadeUp>
        <div
          className="relative overflow-hidden"
          style={{
            borderRadius: "2.5rem",
            background: "rgba(255,255,255,0.72)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.6)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.04)",
            padding: "clamp(40px, 6vw, 80px)",
          }}
        >
          {/* Corner glow */}
          <div
            className="absolute top-0 right-0 w-64 h-64 -mr-32 -mt-32 rounded-full opacity-50 pointer-events-none"
            style={{ background: "#F0F9FF", filter: "blur(80px)" }}
          />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-16 items-start">

            {/* Left copy */}
            <div className="lg:col-span-2 space-y-6">
              <h2
                style={{
                  fontFamily: "var(--font-montserrat), sans-serif",
                  fontSize: "clamp(30px, 4vw, 40px)",
                  fontWeight: 700,
                  lineHeight: 1.2,
                  letterSpacing: "-0.03em",
                  color: "#1A1A1A",
                }}
              >
                Elegance in{" "}
                <br />
                <em
                  style={{
                    fontFamily: "var(--font-crimson), Georgia, serif",
                    fontStyle: "italic",
                    fontWeight: 500,
                    fontSize: "1.12em",
                  }}
                >
                  Communication.
                </em>
              </h2>

              <p
                style={{
                  fontFamily: "var(--font-crimson), Georgia, serif",
                  fontSize: "18px",
                  lineHeight: 1.7,
                  color: "rgba(26,26,26,0.58)",
                }}
              >
                One scan. Seven formats. Intelligence shared in the language each
                tool natively speaks — auto-committed on every push via GitHub
                Action.
              </p>

              <div className="pt-4 space-y-4">
                {["Single scan, all outputs", "Auto-committed on every push", "AGENTS.md works with 20+ tools"].map((item) => (
                  <div key={item} className="flex items-center gap-4">
                    <div
                      className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
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
                  </div>
                ))}
              </div>
            </div>

            {/* Right table */}
            <div className="lg:col-span-3">
              <div
                className="overflow-hidden"
                style={{
                  borderRadius: "1rem",
                  background: "rgba(253,252,249,0.5)",
                  border: "1px solid rgba(232,228,217,0.5)",
                }}
              >
                <table className="w-full text-left">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(232,228,217,0.5)" }}>
                      <th
                        className="px-6 py-4"
                        style={{
                          fontFamily: "var(--font-montserrat), sans-serif",
                          fontSize: "10px",
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          fontWeight: 600,
                          color: "rgba(26,26,26,0.3)",
                        }}
                      >
                        File
                      </th>
                      <th
                        className="px-6 py-4"
                        style={{
                          fontFamily: "var(--font-montserrat), sans-serif",
                          fontSize: "10px",
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          fontWeight: 600,
                          color: "rgba(26,26,26,0.3)",
                        }}
                      >
                        AI Tool
                      </th>
                      <th
                        className="px-6 py-4 text-right"
                        style={{
                          fontFamily: "var(--font-montserrat), sans-serif",
                          fontSize: "10px",
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          fontWeight: 600,
                          color: "rgba(26,26,26,0.3)",
                        }}
                      >
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {formats.map((fmt, i) => (
                      <tr
                        key={fmt.file}
                        style={{ borderTop: i === 0 ? "none" : "1px solid rgba(242,239,233,0.5)" }}
                      >
                        <td className="px-6 py-4">
                          <code
                            style={{
                              fontFamily: "var(--font-geist-mono), monospace",
                              fontSize: "13px",
                              color: fmt.status === "Universal" ? "#1A1A1A" : "rgba(26,26,26,0.65)",
                              fontWeight: fmt.status === "Universal" ? 600 : 400,
                            }}
                          >
                            {fmt.file}
                          </code>
                        </td>
                        <td
                          className="px-6 py-4"
                          style={{
                            fontFamily: "var(--font-crimson), Georgia, serif",
                            fontSize: "16px",
                            fontStyle: "italic",
                            lineHeight: 1.7,
                            color: "rgba(26,26,26,0.58)",
                          }}
                        >
                          {fmt.tool}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{
                              fontFamily: "var(--font-montserrat), sans-serif",
                              letterSpacing: "0.05em",
                              background: fmt.status === "Universal" ? "#F0F9FF" : "#F9F7F2",
                              color: fmt.status === "Universal" ? "#7DD3FC" : "rgba(26,26,26,0.35)",
                            }}
                          >
                            {fmt.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        </FadeUp>
      </div>
    </section>
  );
}
