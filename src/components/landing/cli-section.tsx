"use client";

import { useState } from "react";

export function CliSection() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText("hashmark");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="py-32" id="cli">
      <div className="max-w-3xl mx-auto px-6 text-center space-y-10">

        <div className="space-y-5">
          <h2
            style={{
              fontFamily: "var(--font-montserrat), sans-serif",
              fontSize: "clamp(36px, 5vw, 52px)",
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              color: "var(--foreground)",
            }}
          >
            Your agents deserve{" "}
            <em
              style={{
                fontFamily: "var(--font-crimson), Georgia, serif",
                fontStyle: "italic",
                fontWeight: 400,
                fontSize: "1.05em",
              }}
            >
              real context.
            </em>
          </h2>
          <p
            style={{
              fontFamily: "var(--font-montserrat), sans-serif",
              fontSize: "16px",
              lineHeight: 1.6,
              color: "rgba(26,26,26,0.5)",
            }}
          >
            Connect your repo. Every push regenerates your agent files automatically.
          </p>
        </div>

        {/* Primary CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="/login"
            className="w-full sm:w-auto px-10 py-4 rounded-full transition-all"
            style={{
              fontFamily: "var(--font-montserrat), sans-serif",
              fontSize: "13px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
              background: "var(--foreground)",
              color: "var(--background)",
              boxShadow: "0 20px 40px rgba(26,26,26,0.14)",
            }}
          >
            Connect your repo →
          </a>
          <a
            href="https://github.com/jpoindexter/hashmark"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-10 py-4 rounded-full transition-all flex items-center justify-center gap-2"
            style={{
              fontFamily: "var(--font-montserrat), sans-serif",
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
              background: "white",
              color: "var(--foreground)",
              border: "1px solid rgba(26,26,26,0.1)",
            }}
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor" style={{ opacity: 0.5 }}>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            View on GitHub
          </a>
        </div>

        {/* Local CLI secondary note */}
        <div className="pt-2">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-3 opacity-40 hover:opacity-70 transition-opacity"
          >
            <span style={{ fontFamily: "var(--font-montserrat), sans-serif", fontSize: "10px", letterSpacing: "0.12em", color: "var(--foreground)" }}>
              OR RUN LOCALLY:
            </span>
            <code style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: "12px", color: "var(--foreground)" }}>
              <span style={{ opacity: 0.4 }}>$ </span>hashmark
            </code>
            <span style={{ fontFamily: "var(--font-montserrat), sans-serif", fontSize: "10px", letterSpacing: "0.08em", color: "var(--foreground)" }}>
              {copied ? "copied!" : "copy"}
            </span>
          </button>
        </div>

        {/* Tool logos */}
        <div className="pt-8 flex flex-wrap items-center justify-center gap-8 opacity-25">
          {["Claude Code", "Cursor", "Copilot", "Windsurf"].map((name) => (
            <span
              key={name}
              style={{
                fontFamily: "var(--font-montserrat), sans-serif",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: "var(--foreground)",
              }}
            >
              {name}
            </span>
          ))}
        </div>

      </div>
    </section>
  );
}
