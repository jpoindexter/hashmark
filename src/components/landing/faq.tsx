import { FadeUp } from "./motion-wrapper";

const faqs = [
  {
    q: "What exactly does Hashmark generate?",
    a: "Hashmark generates agent instruction files — the kind that go in AGENTS.md, CLAUDE.md, .cursorrules, and similar formats. These files tell your AI coding tools how your project is structured: what APIs exist, how auth works, what patterns you follow, what packages you use, and where things live. Instead of writing these by hand, Hashmark reads your real code and writes them for you.",
  },
  {
    q: "How is this different from just pasting my codebase into a prompt?",
    a: "Three ways. First, Hashmark interprets intent — it doesn't just list files, it understands that this function is an auth guard, this schema is your payment model, this component is your design system's button. Second, it generates role-specific files — your frontend agent and your security reviewer get different context. Third, it stays current — files are committed and re-generated on every push, not a snapshot you took six months ago.",
  },
  {
    q: "Does Hashmark store my code?",
    a: "No. We use read-only GitHub OAuth to analyze your repository in-place. We don't clone, store, or train on your code. The generated files live in your repo — we just write them.",
  },
  {
    q: "What's the GitHub Action for?",
    a: "It re-runs Hashmark automatically on every push. Without it, you'd have to remember to run hashmark manually whenever your architecture changes. With it, your AGENTS.md is always up to date — automatically committed alongside your real code changes.",
  },
  {
    q: "What AI tools does it support?",
    a: "AGENTS.md works with 20+ tools including Cursor, GitHub Copilot, Gemini CLI, Zed, and any tool that reads a top-level AGENTS.md. We also generate dedicated files for Claude Code (CLAUDE.md), Cursor (.cursor/rules/), Copilot (copilot-instructions.md), Windsurf (.windsurfrules), and Gemini (gemini.md). New formats are added continuously.",
  },
  {
    q: "Can I customize what gets generated?",
    a: "Yes. You can add custom rules that get injected into the generated files, configure which sections are included, and exclude paths or file types from scanning. The GitHub integration also lets you configure per-repo settings.",
  },
  {
    q: "Is it really free?",
    a: "The CLI is free and open source — run hashmark in any repo, no account needed. The GitHub integration (auto-commits, multiple repos, custom rules, scan history) has a free tier and paid plans. We don't believe in paywalling the core functionality.",
  },
  {
    q: "How long does a scan take?",
    a: "Most repos scan in under 30 seconds. Larger monorepos with 500+ files can take up to 2 minutes. Scans run in parallel across the 27 scanners, so repo size matters less than you'd expect.",
  },
];

export function FaqSection() {
  return (
    <section className="py-24">
      <div className="max-w-4xl mx-auto px-6 lg:px-12">

        <FadeUp className="text-center mb-16">
          <h2
            style={{
              fontFamily: "var(--font-montserrat), sans-serif",
              fontSize: "clamp(28px, 3.5vw, 40px)",
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              color: "#1A1A1A",
            }}
          >
            Common{" "}
            <em
              style={{
                fontFamily: "var(--font-crimson), Georgia, serif",
                fontStyle: "italic",
                fontWeight: 500,
                fontSize: "1.12em",
              }}
            >
              questions.
            </em>
          </h2>
        </FadeUp>

        <FadeUp delay={0.1} className="space-y-0">
          {faqs.map((faq, i) => (
            <details
              key={i}
              style={{ borderTop: "1px solid rgba(232,228,217,0.6)" }}
            >
              <summary
                className="flex items-center justify-between py-6 gap-4"
                style={{ userSelect: "none" }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-montserrat), sans-serif",
                    fontSize: "15px",
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    color: "#1A1A1A",
                    lineHeight: 1.4,
                  }}
                >
                  {faq.q}
                </span>
                <span
                  className="faq-icon flex-shrink-0 flex items-center justify-center"
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    border: "1px solid rgba(232,228,217,0.8)",
                    background: "white",
                    color: "rgba(26,26,26,0.4)",
                    fontSize: "18px",
                    lineHeight: 1,
                  }}
                >
                  +
                </span>
              </summary>

              <div className="pb-6">
                <p
                  style={{
                    fontFamily: "var(--font-crimson), Georgia, serif",
                    fontSize: "18px",
                    fontStyle: "italic",
                    lineHeight: 1.8,
                    color: "rgba(26,26,26,0.58)",
                    maxWidth: "680px",
                  }}
                >
                  {faq.a}
                </p>
              </div>
            </details>
          ))}
          <div style={{ borderTop: "1px solid rgba(232,228,217,0.6)" }} />
        </FadeUp>

      </div>
    </section>
  );
}
