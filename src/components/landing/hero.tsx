"use client";

import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number, number, number, number], delay: i * 0.1 },
  }),
};

export function Hero() {
  return (
    <section className="relative pt-16 pb-32">
      {/* Background gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(to bottom, #C8D8E4 0%, #D8E6EE 25%, #E8EFF4 55%, #FDFCF9 100%)",
        }}
      />

      {/* Clouds */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Cloud 1 — large, left */}
        <div className="cloud-a absolute" style={{ top: "8%", left: "2%", filter: "blur(10px)" }}>
          <div style={{ position: "absolute", left: 0,   top: 50, width: 200, height: 80,  borderRadius: "50%", background: "rgba(255,255,255,0.9)" }} />
          <div style={{ position: "absolute", left: 80,  top: 10, width: 200, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.95)" }} />
          <div style={{ position: "absolute", left: 210, top: 30, width: 170, height: 85,  borderRadius: "50%", background: "rgba(255,255,255,0.9)" }} />
          <div style={{ position: "absolute", left: 330, top: 50, width: 130, height: 65,  borderRadius: "50%", background: "rgba(255,255,255,0.8)" }} />
        </div>

        {/* Cloud 2 — medium, right */}
        <div className="cloud-b absolute" style={{ top: "5%", right: "5%", filter: "blur(8px)" }}>
          <div style={{ position: "absolute", left: 0,   top: 35, width: 160, height: 65,  borderRadius: "50%", background: "rgba(255,255,255,0.85)" }} />
          <div style={{ position: "absolute", left: 60,  top: 5,  width: 180, height: 85,  borderRadius: "50%", background: "rgba(255,255,255,0.9)" }} />
          <div style={{ position: "absolute", left: 190, top: 25, width: 140, height: 68,  borderRadius: "50%", background: "rgba(255,255,255,0.8)" }} />
        </div>

        {/* Cloud 3 — small, center */}
        <div className="cloud-c absolute" style={{ top: "3%", left: "42%", filter: "blur(12px)" }}>
          <div style={{ position: "absolute", left: 0,   top: 20, width: 130, height: 55,  borderRadius: "50%", background: "rgba(255,255,255,0.75)" }} />
          <div style={{ position: "absolute", left: 50,  top: 0,  width: 140, height: 65,  borderRadius: "50%", background: "rgba(255,255,255,0.8)" }} />
          <div style={{ position: "absolute", left: 150, top: 18, width: 110, height: 52,  borderRadius: "50%", background: "rgba(255,255,255,0.7)" }} />
        </div>

        {/* Cloud 4 — wispy high */}
        <div className="cloud-b absolute" style={{ top: "1%", left: "22%", filter: "blur(14px)" }}>
          <div style={{ position: "absolute", left: 0,  top: 8,  width: 150, height: 45, borderRadius: "50%", background: "rgba(255,255,255,0.6)" }} />
          <div style={{ position: "absolute", left: 60, top: 0,  width: 130, height: 50, borderRadius: "50%", background: "rgba(255,255,255,0.65)" }} />
        </div>
      </div>
      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">

        {/* Eyebrow badge */}
        <motion.div
          className="inline-flex items-center px-4 py-1.5 mb-10 rounded-full"
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={0}
          style={{
            background: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(232,228,217,0.8)",
            fontFamily: "var(--font-montserrat), sans-serif",
            fontSize: "10px",
            letterSpacing: "0.15em",
            fontWeight: 600,
            color: "rgba(26,26,26,0.4)",
            textTransform: "uppercase",
          }}
        >
          GitHub sync · Every format · Auto-commits on push
        </motion.div>

        {/* Main headline */}
        <motion.h1
          className="mb-8 text-foreground"
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={1}
          style={{
            fontFamily: "var(--font-montserrat), sans-serif",
            fontSize: "clamp(48px, 7vw, 72px)",
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.04em",
            textShadow: "0 2px 20px rgba(253,252,249,0.6)",
          }}
        >
          Code is the text,{" "}
          <br />
          <em
            style={{
              fontFamily: "var(--font-crimson), Georgia, serif",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "1.12em",
            }}
          >
            Context
          </em>{" "}
          is the story.
        </motion.h1>

        {/* Subhead */}
        <motion.p
          className="max-w-xl mx-auto mb-12 leading-relaxed"
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={2}
          style={{
            fontFamily: "var(--font-crimson), Georgia, serif",
            fontSize: "clamp(18px, 2.5vw, 22px)",
            fontStyle: "italic",
            lineHeight: 1.65,
            color: "rgba(26,26,26,0.58)",
          }}
        >
          Your AI agents don&apos;t read documentation. They read instructions.
          Hashmark scans your real code and generates a complete agent structure —
          tailored to your stack, committed on every push.
        </motion.p>

        {/* CTAs */}
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={3}
        >
          <a
            href="/login"
            className="w-full sm:w-auto px-10 py-4 rounded-full text-background transition-all"
            style={{
              fontFamily: "var(--font-montserrat), sans-serif",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              background: "var(--foreground)",
              boxShadow: "0 20px 40px rgba(26,26,26,0.12)",
            }}
          >
            Connect your repo
          </a>
          <a
            href="https://github.com/jpoindexter/hashmark"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-10 py-4 rounded-full transition-all flex items-center justify-center gap-2"
            style={{
              fontFamily: "var(--font-montserrat), sans-serif",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase" as const,
              background: "white",
              border: "1px solid rgba(26,26,26,0.12)",
              color: "var(--foreground)",
            }}
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor" style={{ opacity: 0.6 }}>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Star on GitHub
          </a>
        </motion.div>

        {/* File tree visualization */}
        <motion.div
          className="relative w-full overflow-hidden"
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={4}
          style={{
            borderRadius: "2rem",
            background: "rgba(255,255,255,0.72)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.6)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.04)",
          }}
        >
          <div className="grid grid-cols-5">
            {/* File tree */}
            <div
              className="col-span-2 p-6"
              style={{ borderRight: "1px solid rgba(232,228,217,0.5)" }}
            >
              <p style={{ fontFamily: "var(--font-montserrat), sans-serif", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(26,26,26,0.3)", marginBottom: "16px" }}>
                Generated output
              </p>
              {[
                { name: "AGENTS.md",                indent: 0, active: false },
                { name: "CLAUDE.md",                indent: 0, active: true  },
                { name: ".cursorrules",             indent: 0, active: false },
                { name: ".cursor/",                 indent: 0, active: false, dir: true },
                { name: "rules/hashmark.mdc",       indent: 1, active: false },
                { name: "copilot-instructions.md",  indent: 0, active: false },
                { name: ".windsurfrules",           indent: 0, active: false },
                { name: "gemini.md",                indent: 0, active: false },
              ].map((f) => (
                <div
                  key={f.name}
                  className="flex items-center gap-2 py-1 px-2 rounded"
                  style={{
                    marginLeft: f.indent * 16,
                    background: f.active ? "rgba(186,230,253,0.2)" : "transparent",
                  }}
                >
                  <span style={{ color: f.dir ? "var(--color-sky-300, #93C5FD)" : "rgba(26,26,26,0.3)", fontSize: "10px", flexShrink: 0 }}>
                    {f.dir ? "▶" : "·"}
                  </span>
                  <code style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: "12px",
                    color: f.active ? "var(--foreground)" : "rgba(26,26,26,0.5)",
                    fontWeight: f.active ? 600 : 400,
                  }}>
                    {f.name}
                  </code>
                </div>
              ))}
            </div>

            {/* File preview */}
            <div className="col-span-3 p-6">
              <div className="flex items-center gap-2 mb-4">
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(147,197,253,0.6)" }} />
                <code style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: "11px", color: "rgba(26,26,26,0.4)" }}>
                  CLAUDE.md
                </code>
              </div>
              {[
                { text: "# Project Instructions",           color: "var(--foreground)",           bold: true  },
                { text: "",                                 color: "",                  bold: false },
                { text: "## Stack",                         color: "rgba(26,26,26,0.7)", bold: true  },
                { text: "Next.js 16 · TypeScript · Supabase", color: "rgba(26,26,26,0.5)", bold: false },
                { text: "",                                 color: "",                  bold: false },
                { text: "## API Routes",                    color: "rgba(26,26,26,0.7)", bold: true  },
                { text: "POST /api/scan/:repoId   (auth)",  color: "rgba(26,26,26,0.45)", bold: false },
                { text: "GET  /api/repos           (auth)",  color: "rgba(26,26,26,0.45)", bold: false },
                { text: "POST /api/billing/webhook",        color: "rgba(26,26,26,0.45)", bold: false },
                { text: "",                                 color: "",                  bold: false },
                { text: "## Architecture",                  color: "rgba(26,26,26,0.7)", bold: true  },
                { text: "Route groups: (marketing) (dashboard)", color: "rgba(26,26,26,0.45)", bold: false },
              ].map((line, i) => (
                <div key={i} style={{ height: "20px", display: "flex", alignItems: "center" }}>
                  <code style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: "11px",
                    color: line.color,
                    fontWeight: line.bold ? 600 : 400,
                    whiteSpace: "nowrap",
                  }}>
                    {line.text}
                  </code>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

      </div>
    </section>
  );
}
